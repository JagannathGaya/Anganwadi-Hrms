import { useEffect, useState } from 'react';
import {
  api,
  DashboardTotals,
  EmployeeTodaySummary,
  OrgConfig,
  TodayAttendance,
} from '../api/client';
import { fmtDuration, fmtMoney, fmtTime } from '../lib/format';

const initials = (name: string) =>
  name.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';

type FenceActionState =
  | { kind: 'idle' }
  | { kind: 'capturing' }      // browser is reading GPS
  | { kind: 'saving'; lat: number; lng: number; accuracy?: number }
  | { kind: 'saved'; lat: number; lng: number; accuracy?: number }
  | { kind: 'error'; message: string };

export default function Dashboard() {
  const [totals, setTotals]     = useState<DashboardTotals | null>(null);
  const [cfg, setCfg]           = useState<OrgConfig | null>(null);
  const [today, setToday]       = useState<TodayAttendance[] | null>(null);
  const [summary, setSummary]   = useState<EmployeeTodaySummary[] | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [fenceAction, setFenceAction] = useState<FenceActionState>({ kind: 'idle' });

  async function loadAll() {
    setError(null);
    try {
      const [t, c, day, sum] = await Promise.all([
        api.get<DashboardTotals>('/admin/dashboard'),
        api.get<OrgConfig>('/admin/config'),
        api.get<TodayAttendance[]>('/admin/attendance/today'),
        api.get<EmployeeTodaySummary[]>('/admin/attendance/today/summary'),
      ]);
      setTotals(t); setCfg(c); setToday(day); setSummary(sum);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  useEffect(() => { void loadAll(); }, []);

  /**
   * Capture the admin's current location via the browser, then PATCH the
   * org_config so the work-site geofence centre = that location. Keeps the
   * existing radius (or seeds 200m if none was set). Reloads `cfg` on success.
   */
  async function setFenceToCurrentLocation() {
    if (!('geolocation' in navigator)) {
      setFenceAction({ kind: 'error', message: 'Geolocation is not available in this browser.' });
      return;
    }
    setFenceAction({ kind: 'capturing' });

    // Step 1 — read browser GPS.
    const coords = await new Promise<{ lat: number; lng: number; accuracy?: number } | { error: string }>(
      (resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
          (err) => resolve({ error: err.message || 'Could not read location' }),
          { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 },
        );
      },
    );
    if ('error' in coords) {
      setFenceAction({ kind: 'error', message: coords.error });
      return;
    }

    // Step 2 — save to backend.
    setFenceAction({ kind: 'saving', lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy });
    try {
      const body = {
        geofenceLat: coords.lat,
        geofenceLng: coords.lng,
        geofenceRadiusM: cfg?.geofenceRadiusM ?? 200,
        dailyHours: Number(cfg?.dailyHours ?? 6),
        annualHolidayQuota: cfg?.annualHolidayQuota ?? 24,
        currency: cfg?.currency ?? 'INR',
      };
      const updated = await api.patch<OrgConfig>('/admin/config', body);
      setCfg(updated);
      setFenceAction({ kind: 'saved', lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy });
      // Clear the "saved" notice after a moment so the card looks normal again.
      setTimeout(() => setFenceAction({ kind: 'idle' }), 3500);
    } catch (e) {
      setFenceAction({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Failed to save geofence',
      });
    }
  }

  const currency = cfg?.currency ?? 'INR';
  const openCount   = (today ?? []).filter((r) => !r.checkOutAt).length;
  const closedCount = (today ?? []).length - openCount;
  const shortfallCount = (summary ?? []).filter((r) => r.shortfall).length;

  const todayStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <>
      <div className="page-header">
        <div className="titles">
          <h1>Dashboard</h1>
          <p>{todayStr} · live workforce snapshot</p>
        </div>
        <div className="page-actions">
          <button className="btn secondary sm" onClick={loadAll}>
            <RefreshIcon /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="stat-grid">
        <Tile color="blue" label="Active employees" icon={<UsersIcon />}
              foot={cfg?.annualHolidayQuota ? `${cfg.annualHolidayQuota} holidays/year quota` : undefined}>
          {totals ? totals.activeEmployees : <Spinner w={56} />}
        </Tile>
        <Tile color="green" label="Today's check-ins" icon={<CheckIcon />}
              foot={today ? `${openCount} still open · ${closedCount} closed` : undefined}>
          {totals ? totals.todaysCheckins : <Spinner w={56} />}
        </Tile>
        <Tile color="amber" label="Current month payroll" icon={<MoneyIcon />}
              foot="Sum of generated payslips this month">
          {totals
            ? <span className="money">{fmtMoney(totals.monthlyPayroll, currency)}</span>
            : <Spinner w={120} />}
        </Tile>
      </div>

      {summary && shortfallCount > 0 && (
        <div className="alert error" style={{ marginTop: 16 }}>
          <WarnIcon />
          <div>
            <strong>{shortfallCount}</strong>{' '}
            {shortfallCount === 1 ? 'employee has' : 'employees have'} ended their day below
            their shift target. See the rollup below.
          </div>
        </div>
      )}

      <div className="section-label">Today</div>

      <div className="card">
        <div className="card-h">
          <h3>Per-employee rollup
            {summary ? <span className="hint" style={{ marginLeft: 8 }}>· {summary.length} {summary.length === 1 ? 'person' : 'people'}</span> : null}
          </h3>
          <div className="row" style={{ gap: 6 }}>
            {summary && shortfallCount > 0 && (
              <span className="badge red"><span className="dot" /> {shortfallCount} short</span>
            )}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Shift</th>
                <th style={{ width: 200 }}>Worked / expected</th>
                <th style={{ width: 90 }}>Sessions</th>
                <th style={{ width: 90 }}>First in</th>
                <th style={{ width: 90 }}>Last out</th>
                <th style={{ width: 130 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {!summary && Array.from({ length: 2 }).map((_, i) => (
                <tr key={`s${i}`}>
                  <td><span className="skeleton" style={{ width: 200, height: 18 }} /></td>
                  <td><span className="skeleton" style={{ width: 120, height: 18 }} /></td>
                  <td><span className="skeleton" style={{ width: 100, height: 18 }} /></td>
                  <td><span className="skeleton" style={{ width: 50, height: 18 }} /></td>
                  <td><span className="skeleton" style={{ width: 60, height: 18 }} /></td>
                  <td><span className="skeleton" style={{ width: 60, height: 18 }} /></td>
                  <td><span className="skeleton" style={{ width: 80, height: 18 }} /></td>
                </tr>
              ))}
              {summary && summary.length === 0 && (
                <tr><td colSpan={7}>
                  <div className="empty">
                    <div className="empty-illust"><ClockIcon /></div>
                    <div className="empty-title">Quiet so far today.</div>
                    <div>Check-ins will populate this view in real time.</div>
                  </div>
                </td></tr>
              )}
              {summary && summary.map((r) => {
                const total = Number(r.totalHours);
                const expected = Number(r.expectedHours);
                const ratio = expected > 0 ? Math.min(1.05, total / expected) : 0;
                return (
                  <tr key={r.employeeId}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                          {initials(r.employeeName)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{r.employeeName}</div>
                          <div className="muted">{r.employeeEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {r.shift ? (
                        <>
                          <div style={{ fontWeight: 500 }}>{r.shift.name}</div>
                          <div className="muted">{r.shift.startTime}–{r.shift.endTime}</div>
                        </>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td>
                      <div className="money" style={{ fontWeight: 600 }}>
                        {total.toFixed(2)} <span className="muted">/ {expected.toFixed(2)} h</span>
                      </div>
                      <div className="progress" style={{ marginTop: 6 }}>
                        <div style={{
                          width: `${ratio * 100}%`,
                          background: r.shortfall ? 'var(--danger)' : (ratio >= 1 ? 'var(--success)' : 'var(--primary)'),
                        }} />
                      </div>
                    </td>
                    <td className="money">{r.sessions}</td>
                    <td className="money">{fmtTime(r.firstCheckIn)}</td>
                    <td className="money">{r.lastCheckOut ? fmtTime(r.lastCheckOut) : <span className="muted">—</span>}</td>
                    <td>
                      {r.shortfall
                        ? <span className="badge red"><span className="dot" /> Shortfall</span>
                        : r.openSession
                          ? <span className="badge amber"><span className="dot" /> On shift</span>
                          : <span className="badge green"><span className="dot" /> Met target</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h">
          <h3>
            All check-ins / check-outs
            {today ? <span className="hint" style={{ marginLeft: 8 }}>· {today.length} {today.length === 1 ? 'entry' : 'entries'}</span> : null}
          </h3>
          <div className="row" style={{ gap: 6 }}>
            {today && (
              <>
                <span className="badge amber"><span className="dot" /> {openCount} open</span>
                <span className="badge green"><span className="dot" /> {closedCount} closed</span>
              </>
            )}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th style={{ width: 110 }}>Check in</th>
                <th style={{ width: 110 }}>Check out</th>
                <th style={{ width: 110 }}>Duration</th>
                <th style={{ width: 100 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {today && today.length === 0 && (
                <tr><td colSpan={5}>
                  <div className="empty">
                    <div className="empty-illust"><ClockIcon /></div>
                    <div className="empty-title">No check-ins yet today.</div>
                  </div>
                </td></tr>
              )}
              {today && today.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                        {initials(r.employeeName)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.employeeName}</div>
                        <div className="muted">{r.employeeEmail}</div>
                      </div>
                    </div>
                  </td>
                  <td className="money">{fmtTime(r.checkInAt)}</td>
                  <td className="money">{r.checkOutAt ? fmtTime(r.checkOutAt) : <span className="muted">—</span>}</td>
                  <td className="money">{fmtDuration(r.checkInAt, r.checkOutAt)}</td>
                  <td>
                    {r.checkOutAt
                      ? <span className="badge green"><span className="dot" /> Closed</span>
                      : <span className="badge amber"><span className="dot" /> Open</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-label">Operating rules</div>

      <div className="card accent">
        <div className="card-h">
          <h3>Workspace configuration</h3>
          <span className="hint">{cfg?.updatedAt ? `Updated ${new Date(cfg.updatedAt).toLocaleString('en-IN')}` : ''}</span>
        </div>
        <div className="card-b">
          <div className="row" style={{ gap: 32, alignItems: 'flex-start' }}>
            <div className="kv">
              <div className="k">Daily hours</div>
              <div className="v money">{cfg ? `${Number(cfg.dailyHours).toFixed(2)} h` : '—'}</div>
            </div>
            <div className="kv">
              <div className="k">Currency</div>
              <div className="v">{cfg?.currency ?? 'INR'}</div>
            </div>
            <div className="kv">
              <div className="k">Holiday quota</div>
              <div className="v money">{cfg?.annualHolidayQuota ?? 24}</div>
            </div>
            <div className="kv" style={{ flex: 1, minWidth: 260 }}>
              <div className="k">Geofence</div>
              <div className="v" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {cfg?.geofenceLat != null
                  ? <span>{cfg.geofenceLat.toFixed(4)}, {cfg.geofenceLng?.toFixed(4)} · {cfg.geofenceRadiusM} m</span>
                  : <span className="muted">Not set</span>}
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={setFenceToCurrentLocation}
                  disabled={fenceAction.kind === 'capturing' || fenceAction.kind === 'saving'}
                  title="Capture your browser's location and use it as the work-site centre"
                >
                  <LocateIcon />
                  {fenceAction.kind === 'capturing' ? 'Capturing location…' :
                   fenceAction.kind === 'saving'    ? 'Saving…' :
                   cfg?.geofenceLat != null         ? 'Update to my location' :
                                                     'Set to my location'}
                </button>
              </div>
              {fenceAction.kind === 'saved' && (
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  ✓ Saved {fenceAction.lat.toFixed(5)}, {fenceAction.lng.toFixed(5)}
                  {fenceAction.accuracy ? ` · ±${Math.round(fenceAction.accuracy)} m` : ''}
                </div>
              )}
              {fenceAction.kind === 'error' && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--danger, #b91c1c)' }}>
                  {fenceAction.message}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function LocateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3" /><path d="M12 19v3" />
      <path d="M2 12h3" /><path d="M19 12h3" />
    </svg>
  );
}

function Tile({
  color, label, icon, foot, children,
}: {
  color: 'blue' | 'green' | 'amber';
  label: string;
  icon: React.ReactNode;
  foot?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`stat ${color}`}>
      <div className="stat-top">
        <div className="stat-label">{label}</div>
        <div className="stat-icon">{icon}</div>
      </div>
      <div className="stat-value">{children}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

function Spinner({ w }: { w: number }) {
  return <span className="skeleton" style={{ width: w, height: 28 }} />;
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function MoneyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12" /><path d="M6 8h12" /><path d="M9 13l5 8" />
      <path d="M6 13h3a4.5 4.5 0 0 0 0-9" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15A9 9 0 0 1 5.64 18.36L1 14" />
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2 }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
