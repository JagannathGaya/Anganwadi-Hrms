/**
 * Currency formatter — defaults to Indian Rupees with Indian digit grouping.
 * RN Hermes ships with full Intl since 0.74 — safe to use here.
 */
export const fmtMoney = (
  n: number | string | null | undefined,
  currency: string = 'INR',
  locale: string = 'en-IN'
) => {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(n) || 0);
  } catch {
    return `${currency} ${(Number(n) || 0).toFixed(2)}`;
  }
};

export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' }) : '—';

export const fmtDateTime = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString('en-IN', {
        month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : '—';

export const daysBetween = (fromIso: string, toIso: string) => {
  const ms = +new Date(toIso) - +new Date(fromIso);
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
};

export const fmtTime = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '—';

export const fmtDuration = (fromIso: string, toIso: string | null | undefined) => {
  const end = toIso ? +new Date(toIso) : Date.now();
  const m = Math.max(0, Math.round((end - +new Date(fromIso)) / 60_000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

/**
 * Format a "HH:mm" (or "HH:mm:ss") wall-clock string in 12-hour AM/PM form.
 *
 *   "09:00"    → "9:00 AM"
 *   "17:30"    → "5:30 PM"
 *   "00:15"    → "12:15 AM"
 *   "12:00"    → "12:00 PM"
 *
 * Returns "—" for null/empty input. If parsing fails the raw string is
 * returned so we don't silently swallow odd data.
 */
export const fmtShiftTime = (t: string | null | undefined): string => {
  if (!t) return '—';
  const parts = t.split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return t;
  const [hh, mm] = parts;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return t;
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
};

/**
 * Format a shift schedule as "start to end". Used wherever the UI shows a
 * shift window: "9:00 AM to 5:30 PM".
 */
export const fmtShiftRange = (
  start: string | null | undefined,
  end:   string | null | undefined,
): string => `${fmtShiftTime(start)} to ${fmtShiftTime(end)}`;
