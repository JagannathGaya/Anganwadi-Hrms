const STORAGE_KEY = 'hrms-auth';

export type Role = 'EMPLOYEE' | 'ADMIN';

export interface AuthState {
  token: string;
  employeeId: number;
  email: string;
  name: string;
  role: Role;
}

export function loadAuth(): AuthState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

export function saveAuth(s: AuthState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

const baseUrl = (): string =>
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = loadAuth();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (auth) headers.Authorization = `Bearer ${auth.token}`;

  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const msg = (body && (body.error || body.message)) || `request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export interface LoginResponse {
  token: string;
  employeeId: number;
  email: string;
  name: string;
  role: Role;
}

export interface ShiftRef {
  id: number;
  name: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  dailyHours: number | string;
}

export interface Shift extends ShiftRef {
  createdAt: string;
}

export interface Employee {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  monthlySalary: number | string;
  active: boolean;
  shift: ShiftRef | null;
  createdAt: string;
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

export interface Payslip {
  id: number;
  employeeId: number;
  month: string;
  totalHours: number | string;
  regularPay: number | string;
  overtimePay: number | string;
  grossPay: number | string;
  paid: boolean;
  /** Admin activation gate. Until true, the employee cannot view the slip. */
  released: boolean;
  generatedAt: string;
}

export interface DashboardTotals {
  activeEmployees: number;
  todaysCheckins: number;
  monthlyPayroll: number | string;
}

export interface TodayAttendance {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeEmail: string;
  checkInAt: string;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutAt: string | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
}

export interface EmployeeTodaySummary {
  employeeId: number;
  employeeName: string;
  employeeEmail: string;
  shift: ShiftRef | null;
  expectedHours: number | string;
  totalHours: number | string;
  sessions: number;
  openSession: boolean;
  shortfall: boolean;
  firstCheckIn: string;
  lastCheckOut: string | null;
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
}

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

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

export interface HolidayQuota {
  year: number;
  used: number;
  quota: number;
  remaining: number;
}
