/**
 * Currency formatter — defaults to Indian Rupees with Indian digit grouping.
 * Pass an explicit currency code (e.g. "USD") to override.
 */
export const fmtMoney = (
  n: number | string | null | undefined,
  currency: string = 'INR',
  locale: string = 'en-IN'
) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

export const fmtHours = (n: number | string | null | undefined) =>
  `${(Number(n) || 0).toFixed(2)} h`;

export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' }) : '—';

export const fmtDateTime = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString('en-IN', {
        month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : '—';

export const days = (fromIso: string, toIso: string) => {
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
