import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, Employee, OrgConfig, Payslip } from '../api/client';
import { fmtMoney } from '../lib/format';

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function Payslips() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<Payslip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [currency, setCurrency] = useState<string>('INR');
  const [rowBusy, setRowBusy] = useState<Record<number, 'paid' | 'release' | undefined>>({});

  useEffect(() => {
    api.get<Employee[]>('/admin/employees').then(setEmployees).catch((e) => setError(e.message));
    api.get<OrgConfig>('/admin/config').then((c) => setCurrency(c.currency)).catch(() => {});
  }, []);

  async function load() {
    setError(null); setInfo(null); setLoading(true);
    const qs = new URLSearchParams({ month });
    if (employeeId) qs.set('employee_id', String(employeeId));
    try {
      const data = await api.get<Payslip[]>(`/admin/payslips?${qs.toString()}`);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }

  async function markPaid(id: number) {
    setRowBusy((b) => ({ ...b, [id]: 'paid' }));
    try { await api.post(`/admin/payslips/${id}/mark-paid`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
    finally { setRowBusy((b) => ({ ...b, [id]: undefined })); }
  }

  async function toggleReleased(id: number, next: boolean) {
    setRowBusy((b) => ({ ...b, [id]: 'release' }));
    try {
      await api.post(`/admin/payslips/${id}/release`, { released: next });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'failed');
    } finally {
      setRowBusy((b) => ({ ...b, [id]: undefined }));
    }
  }

  async function releaseAll() {
    if (!confirm(`Release every payslip for ${month}? Employees will be able to view them immediately.`)) return;
    setBulkBusy(true); setError(null); setInfo(null);
    try {
      const res = await api.post<{ month: string; released: number }>(
        `/admin/payslips/release-month?month=${month}`,
      );
      setInfo(`Released ${res.released} payslip${res.released === 1 ? '' : 's'} for ${res.month}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setBulkBusy(false);
    }
  }

  const empName = (id: number) => employees.find((e) => e.id === id)?.name ?? `#${id}`;

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        gross:    a.gross    + Number(r.grossPay),
        ot:       a.ot       + Number(r.overtimePay),
        hours:    a.hours    + Number(r.totalHours),
        paid:     a.paid     + (r.paid ? 1 : 0),
        released: a.released + (r.released ? 1 : 0),
      }),
      { gross: 0, ot: 0, hours: 0, paid: 0, released: 0 }
    );
  }, [rows]);

  const unreleasedCount = rows.length - totals.released;

  return (
    <>
      <div className="page-header">
        <div className="titles">
          <h1>Payslips</h1>
          <p>Generate, release, review and mark slips as paid for any month.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-b">
          <div className="form-row">
            <div className="field" style={{ flex: '0 0 180px' }}>
              <label>Month</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div className="field">
              <label>Employee</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— all employees —</option>
                {employees.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={load} disabled={loading}>
                {loading ? 'Loading…' : 'Load payslips'}
              </button>
              <button
                className="btn secondary"
                onClick={releaseAll}
                disabled={bulkBusy || rows.length === 0 || unreleasedCount === 0}
                title={
                  rows.length === 0          ? 'Load payslips first'
                  : unreleasedCount === 0    ? 'All payslips in this month are already released'
                                             : `Release ${unreleasedCount} unreleased payslip${unreleasedCount === 1 ? '' : 's'} for ${month}`
                }
              >
                {bulkBusy
                  ? 'Releasing…'
                  : unreleasedCount > 0
                    ? `Release all (${unreleasedCount})`
                    : 'All released ✓'}
              </button>
            </div>
          </div>
          {error && <div className="alert error" style={{ marginTop: 12 }}>{error}</div>}
          {info  && <div className="alert success" style={{ marginTop: 12 }}>{info}</div>}
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            Newly generated payslips start as <b>unreleased</b> — employees can't view them until you flip the
            switch. Marking a payslip <b>paid</b> also releases it automatically.
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat blue">
            <div className="stat-top"><div className="stat-label">Total gross</div></div>
            <div className="stat-value money">{fmtMoney(totals.gross, currency)}</div>
          </div>
          <div className="stat amber">
            <div className="stat-top"><div className="stat-label">Overtime portion</div></div>
            <div className="stat-value money">{fmtMoney(totals.ot, currency)}</div>
          </div>
          <div className="stat green">
            <div className="stat-top"><div className="stat-label">Released</div></div>
            <div className="stat-value money">{totals.released}/{rows.length}</div>
          </div>
          <div className="stat">
            <div className="stat-top"><div className="stat-label">Paid / pending</div></div>
            <div className="stat-value money">{totals.paid}/{rows.length - totals.paid}</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <h3>{rows.length} {rows.length === 1 ? 'slip' : 'slips'}</h3>
          <span className="hint">{month}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th style={{ width: 90 }}>Month</th>
                <th style={{ width: 80 }}>Hours</th>
                <th style={{ width: 120 }}>Regular</th>
                <th style={{ width: 120 }}>Overtime</th>
                <th style={{ width: 130 }}>Gross</th>
                <th style={{ width: 130 }}>Released</th>
                <th style={{ width: 100 }}>Paid</th>
                <th style={{ width: 180, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9}>
                  <div className="empty">
                    <div className="empty-title">No payslips yet for {month}.</div>
                    <div>Pick a month and click "Load payslips" — slips are generated on demand.</div>
                  </div>
                </td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><span style={{ fontWeight: 600 }}>{empName(r.employeeId)}</span></td>
                  <td className="muted">{r.month}</td>
                  <td className="money">{Number(r.totalHours).toFixed(2)}</td>
                  <td className="money">{fmtMoney(r.regularPay, currency)}</td>
                  <td className="money">{fmtMoney(r.overtimePay, currency)}</td>
                  <td className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.grossPay, currency)}</td>
                  <td>
                    {r.released
                      ? <span className="badge green"><span className="dot" /> Released</span>
                      : <span className="badge amber"><span className="dot" /> Held</span>}
                  </td>
                  <td>
                    {r.paid
                      ? <span className="badge green"><span className="dot" /> Paid</span>
                      : <span className="badge amber"><span className="dot" /> Pending</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                      {!r.released ? (
                        <button
                          className="btn sm"
                          onClick={() => toggleReleased(r.id, true)}
                          disabled={rowBusy[r.id] === 'release'}
                          title="Release this payslip so the employee can view it"
                        >
                          {rowBusy[r.id] === 'release' ? 'Releasing…' : 'Release'}
                        </button>
                      ) : !r.paid ? (
                        <button
                          className="btn secondary sm"
                          onClick={() => toggleReleased(r.id, false)}
                          disabled={rowBusy[r.id] === 'release'}
                          title="Revoke release — the employee will lose access until released again"
                        >
                          {rowBusy[r.id] === 'release' ? 'Working…' : 'Revoke'}
                        </button>
                      ) : null}
                      {!r.paid && (
                        <button
                          className="btn sm"
                          onClick={() => markPaid(r.id)}
                          disabled={rowBusy[r.id] === 'paid'}
                          title="Mark as paid (also releases if not already)"
                        >
                          {rowBusy[r.id] === 'paid' ? 'Marking…' : 'Mark paid'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
