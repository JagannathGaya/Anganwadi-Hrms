import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, Attendance, Employee } from '../api/client';

// ── helpers ────────────────────────────────────────────────────────────
const currentMonthKey = () => new Date().toISOString().slice(0, 7);
const lastMonthKey = () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const monthRange = (ym: string): { from: string; to: string } => {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${ym}-01`,
    to:   `${ym}-${String(last).padStart(2, '0')}`,
  };
};
const isCurrentOrFutureMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1);
};

const fmtDur = (a: Attendance): string => {
  if (!a.checkOutAt) return '—';
  const ms = +new Date(a.checkOutAt) - +new Date(a.checkInAt);
  const m = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const durationMinutes = (a: Attendance): number => {
  if (!a.checkOutAt) return 0;
  const ms = +new Date(a.checkOutAt) - +new Date(a.checkInAt);
  return Math.max(0, Math.round(ms / 60000));
};

/** Convert an ISO timestamp to the value an HTML datetime-local input expects. */
const isoToLocalInput = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localInputToIso = (s: string): string => new Date(s).toISOString();

// ── component ──────────────────────────────────────────────────────────
export default function AttendancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [month, setMonth] = useState<string>(lastMonthKey());
  const [rows, setRows] = useState<Attendance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [completeBusy, setCompleteBusy]       = useState(false);
  const [fullSalaryBusy, setFullSalaryBusy]   = useState(false);

  // Inline edit state — only one row in edit mode at a time.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editIn, setEditIn]   = useState('');
  const [editOut, setEditOut] = useState('');
  const [rowBusy, setRowBusy] = useState<Record<number, 'save' | 'delete' | undefined>>({});

  useEffect(() => {
    api
      .get<Employee[]>('/admin/employees')
      .then((es) => {
        setEmployees(es);
        if (es.length > 0) setEmployeeId(es[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function load() {
    if (!employeeId) return;
    setError(null); setInfo(null); setLoading(true);
    setEditingId(null);
    try {
      const { from, to } = monthRange(month);
      const data = await api.get<Attendance[]>(
        `/admin/attendance?employee_id=${employeeId}&from=${from}&to=${to}`
      );
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(r: Attendance) {
    setEditingId(r.id);
    setEditIn(isoToLocalInput(r.checkInAt));
    setEditOut(r.checkOutAt ? isoToLocalInput(r.checkOutAt) : '');
  }
  function cancelEdit() {
    setEditingId(null);
    setEditIn(''); setEditOut('');
  }

  async function saveEdit(id: number) {
    setRowBusy((b) => ({ ...b, [id]: 'save' }));
    try {
      const body: Record<string, unknown> = {};
      body.checkInAt  = localInputToIso(editIn);
      if (editOut) {
        body.checkOutAt = localInputToIso(editOut);
      } else {
        body.clearCheckOut = true;
      }
      await api.patch(`/admin/attendance/${id}`, body);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'save failed');
    } finally {
      setRowBusy((b) => ({ ...b, [id]: undefined }));
    }
  }

  async function deleteRow(id: number) {
    if (!confirm('Delete this attendance entry? This cannot be undone.')) return;
    setRowBusy((b) => ({ ...b, [id]: 'delete' }));
    try {
      await api.delete(`/admin/attendance/${id}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setRowBusy((b) => ({ ...b, [id]: undefined }));
    }
  }

  async function completeMonth() {
    if (!employeeId) return;
    const empName = employees.find((e) => e.id === employeeId)?.name ?? `#${employeeId}`;
    if (!confirm(
      `Complete ${month} for ${empName}? This generates and releases their payslip — they'll be able to view it from the mobile app.`,
    )) return;
    setCompleteBusy(true); setError(null); setInfo(null);
    try {
      const res = await api.post<{ payslipId: number; released: boolean; grossPay: string }>(
        `/admin/attendance/complete?employee_id=${employeeId}&month=${month}`,
      );
      setInfo(`Month completed. Payslip #${res.payslipId} released — gross ₹${Number(res.grossPay).toFixed(2)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'complete failed');
    } finally {
      setCompleteBusy(false);
    }
  }

  async function completeMonthFullSalary() {
    if (!employeeId) return;
    const empName = employees.find((e) => e.id === employeeId)?.name ?? `#${employeeId}`;
    if (!confirm(
      `Complete ${month} for ${empName} with FULL salary?\n\n` +
      `This overrides the attendance-based calculation and pays the full monthly salary regardless of hours worked. ` +
      `Use only when paying in full is intentional — new hires, exception cases, etc.`,
    )) return;
    setFullSalaryBusy(true); setError(null); setInfo(null);
    try {
      const res = await api.post<{ payslipId: number; released: boolean; grossPay: string; fullSalary: boolean }>(
        `/admin/attendance/complete?employee_id=${employeeId}&month=${month}&full_salary=true`,
      );
      setInfo(
        `Full-salary payslip generated. Payslip #${res.payslipId} released — gross ₹${Number(res.grossPay).toFixed(2)} (full month, no proration).`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'complete failed');
    } finally {
      setFullSalaryBusy(false);
    }
  }

  // ── monthly aggregates ─────────────────────────────────────────────
  const totals = useMemo(() => {
    const closed = rows.filter((r) => r.checkOutAt);
    const open   = rows.filter((r) => !r.checkOutAt);
    const totalMin = closed.reduce((acc, r) => acc + durationMinutes(r), 0);
    const days = new Set(closed.map((r) => r.checkInAt.slice(0, 10))).size;
    return {
      total: rows.length,
      closed: closed.length,
      open: open.length,
      hours: Math.floor(totalMin / 60),
      mins:  totalMin % 60,
      days,
    };
  }, [rows]);

  const monthLocked = isCurrentOrFutureMonth(month);

  return (
    <>
      <div className="page-header">
        <div className="titles">
          <h1>Attendance</h1>
          <p>View, adjust and complete a full month of an employee's attendance.</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-b">
          <div className="form-row">
            <div className="field">
              <label>Employee</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(Number(e.target.value))}>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} · {e.email}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: '0 0 180px' }}>
              <label>Month</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={load} disabled={loading || !employeeId}>
                {loading ? 'Loading…' : 'Load month'}
              </button>
              <button
                className="btn secondary"
                onClick={completeMonth}
                disabled={completeBusy || fullSalaryBusy || !employeeId || monthLocked}
                title={monthLocked
                  ? "Current/future months can't be completed yet"
                  : 'Generate & release the payslip for this month (based on attendance)'}
              >
                {completeBusy ? 'Completing…' : 'Complete month'}
              </button>
              <button
                className="btn secondary"
                onClick={completeMonthFullSalary}
                disabled={completeBusy || fullSalaryBusy || !employeeId || monthLocked}
                title={monthLocked
                  ? "Current/future months can't be completed yet"
                  : 'Override attendance — pay the full monthly salary regardless of hours worked'}
                style={{ borderColor: 'var(--warning, #b45309)', color: 'var(--warning, #b45309)' }}
              >
                {fullSalaryBusy ? 'Completing…' : 'Complete with full salary'}
              </button>
            </div>
          </div>
          {error && <div className="alert error"   style={{ marginTop: 12 }}>{error}</div>}
          {info  && <div className="alert success" style={{ marginTop: 12 }}>{info}</div>}
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            Adjust check-in / check-out times row-by-row, or delete bad entries. When the month looks right,
            click <b>Complete month</b> to release the attendance-based payslip — or{' '}
            <b>Complete with full salary</b> to override the calculation and pay the full monthly amount.
          </p>
        </div>
      </div>

      {/* Monthly stat tiles */}
      {rows.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat blue">
            <div className="stat-top"><div className="stat-label">Total worked</div></div>
            <div className="stat-value money">
              {totals.hours}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>h</span> {totals.mins}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>m</span>
            </div>
          </div>
          <div className="stat green">
            <div className="stat-top"><div className="stat-label">Days present</div></div>
            <div className="stat-value money">{totals.days}</div>
          </div>
          <div className="stat amber">
            <div className="stat-top"><div className="stat-label">Sessions</div></div>
            <div className="stat-value money">{totals.closed}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/{totals.total}</span></div>
          </div>
          <div className="stat">
            <div className="stat-top"><div className="stat-label">Open / pending</div></div>
            <div className="stat-value money">{totals.open}</div>
          </div>
        </div>
      )}

      {/* Activity log */}
      <div className="card">
        <div className="card-h">
          <h3>Activity log</h3>
          <span className="hint">{rows.length} {rows.length === 1 ? 'entry' : 'entries'} · {month}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 180 }}>Check in</th>
                <th style={{ width: 180 }}>Check out</th>
                <th style={{ width: 100 }}>Duration</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ minWidth: 220, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5}>
                  <div className="empty">
                    <div className="empty-title">No attendance entries for {month}.</div>
                    <div>Pick an employee and a month, then click "Load month".</div>
                  </div>
                </td></tr>
              )}
              {rows.map((r) => {
                const editing = editingId === r.id;
                return (
                  <tr key={r.id}>
                    <td>
                      {editing ? (
                        <input
                          type="datetime-local"
                          value={editIn}
                          onChange={(e) => setEditIn(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      ) : (
                        new Date(r.checkInAt).toLocaleString('en-IN')
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          type="datetime-local"
                          value={editOut}
                          onChange={(e) => setEditOut(e.target.value)}
                          style={{ width: '100%' }}
                          placeholder="leave empty to re-open"
                        />
                      ) : (
                        r.checkOutAt ? new Date(r.checkOutAt).toLocaleString('en-IN') : '—'
                      )}
                    </td>
                    <td className="money">{fmtDur(r)}</td>
                    <td>
                      {r.checkOutAt
                        ? <span className="badge green"><span className="dot" /> Closed</span>
                        : <span className="badge amber"><span className="dot" /> Open</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {editing ? (
                          <>
                            <button
                              className="btn sm"
                              onClick={() => saveEdit(r.id)}
                              disabled={rowBusy[r.id] === 'save'}
                            >
                              {rowBusy[r.id] === 'save' ? 'Saving…' : 'Save'}
                            </button>
                            <button className="btn secondary sm" onClick={cancelEdit}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn secondary sm" onClick={() => startEdit(r)}>Edit</button>
                            <button
                              className="btn secondary sm"
                              onClick={() => deleteRow(r.id)}
                              disabled={rowBusy[r.id] === 'delete'}
                              style={{ color: 'var(--danger, #b91c1c)' }}
                            >
                              {rowBusy[r.id] === 'delete' ? 'Deleting…' : 'Delete'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
