import { FormEvent, useEffect, useState } from 'react';
import { api, Employee, Shift } from '../api/client';
import { fmtMoney } from '../lib/format';

const initials = (name: string) =>
  name.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';

export default function Employees() {
  const [items, setItems] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '',
    monthlySalary: '0',
    role: 'EMPLOYEE' as 'EMPLOYEE' | 'ADMIN',
    shiftId: '' as string,
  });
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(null);
    try {
      const [list, sl] = await Promise.all([
        api.get<Employee[]>(`/admin/employees${q ? `?q=${encodeURIComponent(q)}` : ''}`),
        api.get<Shift[]>('/shifts'),
      ]);
      setItems(list); setShifts(sl);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post<Employee>('/admin/employees', {
        ...form,
        monthlySalary: Number(form.monthlySalary),
        shiftId: form.shiftId ? Number(form.shiftId) : null,
      });
      setForm({ name: '', email: '', phone: '', password: '', monthlySalary: '0', role: 'EMPLOYEE', shiftId: '' });
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create failed');
    } finally {
      setCreating(false);
    }
  }

  async function patchSalary(id: number, salary: string) {
    try { await api.patch(`/admin/employees/${id}`, { monthlySalary: Number(salary) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'update failed'); }
  }

  async function patchShift(id: number, shiftId: string) {
    try {
      await api.patch(`/admin/employees/${id}`, { shiftId: shiftId ? Number(shiftId) : null });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'update failed'); }
  }

  async function deactivate(id: number) {
    if (!confirm('Deactivate this employee? They will no longer be able to sign in.')) return;
    try { await api.delete(`/admin/employees/${id}`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'delete failed'); }
  }

  return (
    <>
      <div className="page-header">
        <div className="titles">
          <h1>Employees</h1>
          <p>Manage accounts, monthly salary and assigned shift.</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => setShowCreate((v) => !v)}>
            <span className="btn-icon">+</span> New employee
          </button>
        </div>
      </div>

      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}

      {showCreate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <h3>Create employee</h3>
            <button className="btn ghost sm" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
          <div className="card-b">
            <form onSubmit={onCreate} className="form-row">
              <div className="field"><label>Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div className="field"><label>Email</label>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@anganwadi.local" />
              </div>
              <div className="field"><label>Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91…" />
              </div>
              <div className="field"><label>Password</label>
                <input required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="temporary" />
              </div>
              <div className="field" style={{ flex: '0 0 200px' }}><label>Monthly salary (₹)</label>
                <input type="number" step="1" min={0} value={form.monthlySalary}
                  onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} placeholder="e.g. 12000" />
              </div>
              <div className="field" style={{ flex: '0 0 200px' }}><label>Shift</label>
                <select value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
                  <option value="">— none —</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.startTime}–{s.endTime}, {Number(s.dailyHours).toFixed(2)}h)
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: '0 0 140px' }}><label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'EMPLOYEE' | 'ADMIN' })}>
                  <option value="EMPLOYEE">EMPLOYEE</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn" type="submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <h3>{items.length} {items.length === 1 ? 'employee' : 'employees'}</h3>
          <div className="row">
            <input
              placeholder="Search name or email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              style={{ width: 240, height: 34 }}
            />
            <button className="btn secondary sm" onClick={load}>Search</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th style={{ width: 220 }}>Shift</th>
                <th style={{ width: 220 }}>Monthly salary</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={6}>
                  <div className="empty">
                    <div className="empty-title">No employees match.</div>
                    <div>Try clearing the search or click "New employee" above.</div>
                  </div>
                </td></tr>
              )}
              {items.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(e.name)}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{e.name}</div>
                        <div className="muted">{e.email}{e.phone ? ` · ${e.phone}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${e.role === 'ADMIN' ? 'indigo' : 'gray'}`}>
                      <span className="dot" /> {e.role}
                    </span>
                  </td>
                  <td>
                    <select
                      defaultValue={e.shift?.id ?? ''}
                      onChange={(ev) => patchShift(e.id, ev.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">— none —</option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.startTime}–{s.endTime})
                        </option>
                      ))}
                    </select>
                    {e.shift && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        {Number(e.shift.dailyHours).toFixed(2)} h/day
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="field-inline">
                      <span className="muted">₹</span>
                      <input
                        type="number" step="1" min={0}
                        defaultValue={String(e.monthlySalary)}
                        onBlur={(ev) => patchSalary(e.id, ev.target.value)}
                        className="money"
                        style={{ height: 32, width: 130 }}
                      />
                      <span className="muted" style={{ fontSize: 11 }}>/month</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                      {fmtMoney(e.monthlySalary, 'INR')}
                    </div>
                  </td>
                  <td>
                    {e.active
                      ? <span className="badge green"><span className="dot" /> Active</span>
                      : <span className="badge red"><span className="dot" /> Inactive</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {e.active && (
                      <button className="btn ghost sm" onClick={() => deactivate(e.id)}>Deactivate</button>
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
