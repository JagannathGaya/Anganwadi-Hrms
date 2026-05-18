import { useEffect, useState } from 'react';
import { api, Employee, LeaveRequest, LeaveStatus } from '../api/client';
import { days, fmtDate, fmtDateTime } from '../lib/format';

const FILTERS: (LeaveStatus | 'ALL')[] = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];

export default function Leaves() {
  const [filter, setFilter] = useState<LeaveStatus | 'ALL'>('PENDING');
  const [items, setItems]   = useState<LeaveRequest[]>([]);
  const [employees, setEmps]= useState<Employee[]>([]);
  const [error, setError]   = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);

  async function load() {
    setError(null);
    try {
      const [list, emps] = await Promise.all([
        api.get<LeaveRequest[]>(`/admin/leaves${filter !== 'ALL' ? `?status=${filter}` : ''}`),
        api.get<Employee[]>('/admin/employees'),
      ]);
      setItems(list);
      setEmps(emps);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  async function decide(id: number, approve: boolean) {
    setDecidingId(id);
    try {
      await api.post(`/admin/leaves/${id}/decide`, { approve });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setDecidingId(null);
    }
  }

  const empName = (id: number) => employees.find((e) => e.id === id)?.name ?? `#${id}`;

  return (
    <>
      <div className="page-header">
        <div className="titles">
          <h1>Leaves</h1>
          <p>Review and decide leave applications submitted by employees.</p>
        </div>
      </div>

      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card">
        <div className="card-h">
          <h3>{items.length} {filter === 'ALL' ? 'requests' : filter.toLowerCase()}</h3>
          <div className="row" style={{ gap: 4 }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`btn sm ${filter === f ? '' : 'ghost'}`}
                style={{ minWidth: 90 }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>From</th>
                <th>To</th>
                <th style={{ width: 80 }}>Days</th>
                <th>Reason</th>
                <th>Applied</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={8}>
                  <div className="empty">
                    <div className="empty-title">No {filter === 'ALL' ? '' : filter.toLowerCase()} requests.</div>
                  </div>
                </td></tr>
              )}
              {items.map((lr) => (
                <tr key={lr.id}>
                  <td style={{ fontWeight: 600 }}>{empName(lr.employeeId)}</td>
                  <td>{fmtDate(lr.fromDate)}</td>
                  <td>{fmtDate(lr.toDate)}</td>
                  <td className="money">{days(lr.fromDate, lr.toDate)}</td>
                  <td className="muted" style={{ maxWidth: 280 }}>{lr.reason || '—'}</td>
                  <td className="muted">{fmtDateTime(lr.appliedAt)}</td>
                  <td>
                    {lr.status === 'PENDING'  && <span className="badge amber"><span className="dot" /> Pending</span>}
                    {lr.status === 'APPROVED' && <span className="badge green"><span className="dot" /> Approved</span>}
                    {lr.status === 'REJECTED' && <span className="badge red"><span className="dot" /> Rejected</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {lr.status === 'PENDING' && (
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          className="btn sm"
                          onClick={() => decide(lr.id, true)}
                          disabled={decidingId === lr.id}
                        >
                          Approve
                        </button>
                        <button
                          className="btn secondary sm"
                          onClick={() => decide(lr.id, false)}
                          disabled={decidingId === lr.id}
                        >
                          Reject
                        </button>
                      </div>
                    )}
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
