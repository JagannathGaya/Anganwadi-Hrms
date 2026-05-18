import { FormEvent, useEffect, useState } from 'react';
import { api, Shift } from '../api/client';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const minutesToHours = (m: number) => (m / 60).toFixed(2);

export default function Shifts() {
  const [items, setItems] = useState<Shift[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', startTime: '09:00', endTime: '15:00', dailyHours: '6' });
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(null);
    try {
      setItems(await api.get<Shift[]>('/shifts'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  useEffect(() => { void load(); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!HHMM.test(form.startTime) || !HHMM.test(form.endTime)) {
      setError('Times must be HH:mm (24-hour).');
      return;
    }
    setCreating(true); setError(null);
    try {
      await api.post('/admin/shifts', { ...form, dailyHours: Number(form.dailyHours) });
      setForm({ name: '', startTime: '09:00', endTime: '15:00', dailyHours: '6' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: number) {
    if (!confirm('Delete this shift? Employees assigned to it will fall back to the org default.')) return;
    try { await api.delete(`/admin/shifts/${id}`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  // Auto-suggest dailyHours from start/end
  const span = HHMM.test(form.startTime) && HHMM.test(form.endTime)
    ? minutes(form.endTime) - minutes(form.startTime) : 0;

  return (
    <>
      <div className="page-header">
        <div className="titles">
          <h1>Shifts</h1>
          <p>Define the shift bands employees can be assigned to. Daily hours feed shortfall alerts.</p>
        </div>
      </div>

      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><h3>Add shift</h3></div>
        <div className="card-b">
          <form onSubmit={add} className="form-row">
            <div className="field"><label>Name</label>
              <input required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Evening shift" />
            </div>
            <div className="field" style={{ flex: '0 0 140px' }}><label>Start time</label>
              <input type="time" required value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div className="field" style={{ flex: '0 0 140px' }}><label>End time</label>
              <input type="time" required value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
            <div className="field" style={{ flex: '0 0 140px' }}><label>Daily hours</label>
              <input type="number" step="0.25" min={1} max={24}
                value={form.dailyHours}
                onChange={(e) => setForm({ ...form, dailyHours: e.target.value })} />
              {span > 0 && <span className="hint">span: {minutesToHours(span)} h</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn" type="submit" disabled={creating}>
                {creating ? 'Adding…' : '+ Add shift'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h3>{items.length} {items.length === 1 ? 'shift' : 'shifts'}</h3></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: 140 }}>Start</th>
                <th style={{ width: 140 }}>End</th>
                <th style={{ width: 140 }}>Daily hours</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={5}>
                  <div className="empty">
                    <div className="empty-title">No shifts yet.</div>
                    <div>Add one above so you can assign it to employees.</div>
                  </div>
                </td></tr>
              )}
              {items.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td className="money">{s.startTime}</td>
                  <td className="money">{s.endTime}</td>
                  <td className="money">{Number(s.dailyHours).toFixed(2)} h</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn ghost sm" onClick={() => remove(s.id)}>Delete</button>
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
