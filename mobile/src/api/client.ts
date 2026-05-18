import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = 'hrms-auth';

// =============================================================================
// JWT utilities
// -----------------------------------------------------------------------------
// We decode the JWT payload locally only to read the `exp` claim — not for
// validation. The backend is the only authority on whether a token is valid;
// this is purely so we can avoid making requests we know will 401.
// =============================================================================

function base64UrlDecode(input: string): string {
  // Pad and convert URL-safe base64 → standard base64
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  try {
    // React Native provides global atob in Hermes 0.71+.
    return typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  } catch {
    return '';
  }
}

function decodeJwtExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const json = base64UrlDecode(parts[1]);
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string, skewMs = 30_000): boolean {
  const expMs = decodeJwtExp(token);
  if (!expMs) return false; // unknown — treat as not expired; backend will tell us.
  return Date.now() + skewMs >= expMs;
}

// =============================================================================
// API base URL
// -----------------------------------------------------------------------------
// Change this when you move dev machines or deploy. To switch between targets:
//   - Physical device   → your dev machine's LAN IP (e.g. 192.168.x.x:8080)
//   - Android emulator  → http://10.0.2.2:8080
//   - iOS simulator     → http://localhost:8080
//
// Find your LAN IP on macOS with:  ipconfig getifaddr en0
// Make sure the backend is bound to all interfaces:
//   ./mvnw spring-boot:run -Dspring-boot.run.arguments=--server.address=0.0.0.0
// =============================================================================
const DEV_LAN_API_URL = 'http://192.168.10.240:8080';

// Optionally let react-native-config override (if you ever wire it up properly).
// Wrapped in try/catch so a missing native module never breaks the app.
let CONFIG_API_BASE_URL: string | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Config = require('react-native-config').default;
  CONFIG_API_BASE_URL = Config?.API_BASE_URL;
} catch {
  // react-native-config not linked — that's fine, we'll use DEV_LAN_API_URL.
}

export type Role = 'EMPLOYEE' | 'ADMIN';

export interface AuthState {
  token: string;
  employeeId: number;
  email: string;
  name: string;
  role: Role;
}

let cached: AuthState | null = null;

// Subscribers fired when the user is forcibly signed out (token expired, or
// the server returned 401 to an authenticated request). App.tsx subscribes so
// it can reset the navigator back to the Login screen without each screen
// having to handle 401 individually.
type AuthListener = (reason: 'expired' | 'unauthorized' | 'manual') => void;
const authListeners = new Set<AuthListener>();

export function onAuthChange(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => { authListeners.delete(listener); };
}

function emitAuthChange(reason: 'expired' | 'unauthorized' | 'manual'): void {
  authListeners.forEach((l) => {
    try { l(reason); } catch (err) { console.warn('[auth] listener threw', err); }
  });
}

export async function loadAuth(): Promise<AuthState | null> {
  if (cached) {
    // If the token has expired since we last loaded, treat as logged out.
    if (isTokenExpired(cached.token)) {
      await clearAuth('expired');
      return null;
    }
    return cached;
  }
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthState;
    if (!parsed?.token) {
      // Bad shape on disk — drop it.
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (isTokenExpired(parsed.token)) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    cached = parsed;
    return cached;
  } catch {
    // Corrupted JSON — wipe it.
    await AsyncStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export async function saveAuth(s: AuthState): Promise<void> {
  cached = s;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export async function clearAuth(reason: 'expired' | 'unauthorized' | 'manual' = 'manual'): Promise<void> {
  cached = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
  emitAuthChange(reason);
}

const baseUrl = (): string => {
  // 1. Honor an explicit override from react-native-config if it's linked.
  if (CONFIG_API_BASE_URL) return CONFIG_API_BASE_URL;
  // 2. Otherwise use the hardcoded LAN URL — works on physical devices on the
  //    same Wi-Fi as the dev machine. (Update DEV_LAN_API_URL above as needed.)
  return DEV_LAN_API_URL;
};

/** Exposed so screens can build full URLs (e.g. /payslip/print) for Linking. */
export const getApiBaseUrl = (): string => baseUrl();

// Tiny one-time log so it's obvious in Metro which URL the app is hitting.
const _resolvedBaseUrl = baseUrl();
console.log('[client] API base URL =', _resolvedBaseUrl, 'platform =', Platform.OS);

/**
 * ApiError is thrown for every failure path so callers can rely on a single
 * error type. `status` semantics:
 *   - 0   → request never reached the server (offline, DNS, timeout, abort)
 *   - 408 → request timed out
 *   - 1xx-5xx → HTTP status from the server
 */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Skip auth loading for the login endpoint — otherwise loadAuth() can clear
  // a stale token and emit an "expired" event right as the user is trying to
  // sign in again, which is unnecessary noise.
  const isAuthEndpoint = path.startsWith('/auth/');
  const auth = isAuthEndpoint ? null : await loadAuth();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (auth) headers.Authorization = `Bearer ${auth.token}`;

  const url = `${baseUrl()}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (err) {
    // fetch() only rejects for network-level problems (no connection, DNS,
    // abort, certificate, etc.). Normalize all of these into ApiError.
    const aborted =
      (err as { name?: string })?.name === 'AbortError' ||
      controller.signal.aborted;
    if (aborted) {
      throw new ApiError(408, `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Check your connection and try again.`);
    }
    const reason = err instanceof Error ? err.message : String(err);
    console.warn('[api] network failure', url, reason);
    throw new ApiError(
      0,
      "Can't reach the server. Make sure you're online and your dev machine is reachable.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // Server returned non-JSON (e.g. an HTML error page). Don't crash — surface
      // a meaningful error instead.
      if (!res.ok) {
        throw new ApiError(res.status, `Server returned ${res.status} (${text.slice(0, 120)})`);
      }
      throw new ApiError(res.status, 'Server returned an unexpected response.');
    }
  }

  if (!res.ok) {
    const errObj = body as { error?: string; message?: string } | undefined;
    const msg = errObj?.error || errObj?.message || `Request failed (${res.status})`;
    // If a request that was *supposed* to be authenticated comes back 401, the
    // server is telling us the token is no longer valid. Wipe the stored auth
    // and fire the listener so the app can route back to Login.
    if (res.status === 401 && !isAuthEndpoint && auth) {
      void clearAuth('unauthorized');
    }
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
};

export interface ShiftRef {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  dailyHours: number | string;
}

export interface Me {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  monthlySalary: number | string;
  active: boolean;
  shift: ShiftRef | null;
  createdAt: string;
  // Enriched (new server fields — optional so older shapes still work)
  employeeCode?: string;
  tenureMonths?: number;
  shiftSchedule?: string | null;
}

export type Punctuality = 'ON_TIME' | 'LATE' | 'EARLY' | 'NO_SHIFT';
export type NextAction  = 'CHECK_IN' | 'CHECK_OUT' | 'DONE' | 'NO_SHIFT';

export interface TodaySummary {
  shift: ShiftRef | null;
  expectedHours: number | string;
  /** Sum of CLOSED sessions today — the "banked" number. */
  totalHours: number | string;
  /** Live elapsed time of the open session (server-capped). */
  inProgressHours: number | string;
  /** totalHours + inProgressHours. */
  liveTotalHours: number | string;
  sessions: number;
  openSession: boolean;
  shortfall: boolean;
  alert: string | null;
  log: Attendance[];

  // Shift schedule (computed) — ISO strings
  expectedCheckInAt?: string | null;
  expectedCheckOutAt?: string | null;

  // Punctuality (computed) — null when there's no shift
  lateMinutes?: number | null;
  overtimeMinutes?: number | null;
  punctuality?: Punctuality;
  nextAction?: NextAction;

  // Enriched session log (each entry includes per-session punctuality)
  dtoLog?: AttendanceDto[];
}

export interface Attendance {
  id: number;
  employeeId: number;
  checkInAt: string;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutAt: string | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
}

/**
 * Enriched attendance payload returned by /attendance/checkin, /checkout,
 * and inside TodaySummary.dtoLog. Wraps Attendance with the shift schedule
 * and the punctuality math the backend already did for us.
 */
export interface AttendanceDto {
  id: number;
  employeeId: number;
  checkInAt: string;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutAt: string | null;
  checkOutLat: number | null;
  checkOutLng: number | null;

  shift: ShiftRef | null;
  expectedCheckInAt: string | null;
  expectedCheckOutAt: string | null;

  lateMinutes: number | null;
  overtimeMinutes: number | null;
  earlyCheckoutMinutes: number | null;
  punctuality: Punctuality;
  state: 'OPEN' | 'CLOSED';
  workedMinutes: number;
}

export interface Payslip {
  id: number;
  employeeId: number;
  month: string;
  totalHours: number | string;
  regularPay: number | string;
  overtimePay: number | string;
  grossPay: number | string;
  paid: boolean;
  generatedAt: string;
}

/**
 * Rich payslip detail returned by GET /payslip.
 *
 * Includes the calendar breakdown, daily/hourly pay rates, deductions
 * placeholder, and net pay. The flat fields from `Payslip` are a strict
 * subset so legacy callers still work.
 */
export interface PayslipDetail {
  id: number;
  employeeId: number;
  month: string;                 // YYYY-MM
  periodLabel: string;           // e.g. "August 2024"

  totalHours: number | string;
  regularHours: number | string;
  overtimeHours: number | string;
  expectedHours: number | string;

  regularPay: number | string;
  /** Effective overtime — manualOvertimePay when set, else autoOvertimePay. */
  overtimePay: number | string;
  /** What attendance produced. Always present. */
  autoOvertimePay?: number | string;
  /** Admin override of overtime; null when not set. */
  manualOvertimePay?: number | string | null;
  bonusAmount?: number | string;
  bonusNote?: string | null;
  grossPay: number | string;
  deductions: number | string;
  deductionNote?: string | null;
  netPay: number | string;

  monthlySalary: number | string;
  dailyRate: number | string;
  hourlyRate: number | string;

  daysInMonth: number;
  daysWorked: number;
  daysOnLeave: number;
  daysHoliday: number;
  daysAbsent: number;

  averageDailyHours: number | string;

  currency: string;
  status: 'PAID' | 'PENDING';
  generatedAt: string;
}

export interface OrgConfig {
  id: number;
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadiusM: number | null;
  dailyHours: number | string;
  annualHolidayQuota: number;
  currency: string;
  updatedAt: string;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  createdAt: string;
  // Enriched server fields
  weekday?: string;
  daysUntil?: number;
  upcoming?: boolean;
}

// ── Monthly attendance view ──────────────────────────────────────────
export type DayState =
  | 'PRESENT'
  | 'PARTIAL'
  | 'ABSENT'
  | 'LEAVE'
  | 'HOLIDAY'
  | 'WEEKEND'
  | 'FUTURE';

export interface DayEntry {
  date: string;                // YYYY-MM-DD
  state: DayState;
  workedHours: number | string;
  expectedHours: number | string;
  sessions: number;
  lateMinutes: number | null;
  overtimeMinutes: number | null;
  firstCheckInAt: string | null;     // HH:mm
  lastCheckOutAt: string | null;     // HH:mm
  note: string | null;
}

export interface MonthAttendance {
  month: string;               // YYYY-MM
  days: DayEntry[];
  totalHours: number | string;
  expectedHours: number | string;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  holidayDays: number;
  lateDays: number;
  overtimeMinutes: number;
}

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveDetail {
  id: number;
  employeeId: number;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  appliedAt: string;
  decidedAt: string | null;
  decidedBy: number | null;
  canCancel: boolean;
  inPast: boolean;
}

export interface LeaveBalance {
  year: number;
  quota: number;
  approvedDays: number;
  pendingDays: number;
  availableDays: number;
}

export interface LeaveRequest {
  id: number;
  employeeId: number;
  fromDate: string;
  toDate: string;
  reason: string | null;
  status: LeaveStatus;
  appliedAt: string;
  decidedAt: string | null;
  decidedBy: number | null;
}
