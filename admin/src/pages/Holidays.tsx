import { FormEvent, useEffect, useState } from 'react';
import { api, Holiday, HolidayQuota } from '../api/client';
import { fmtDate } from '../lib/format';

export default function Holidays() {
  const year = new Date().getFullYear();
  const [items, setItems] = useState<Holiday[]>([]);
  const [quota, setQuota] = useState<HolidayQuota | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    name: '',
  });

  async function load() {
    setError(null);
    try {
      const [list, q] = await Promise.all([
        api.get<Holiday[]>(`/holidays?from=${year}-01-01&to=${year}-12-31`),
        api.get<HolidayQuota>(`/admin/holidays/quota?year=${year}`),
      ]);
      setItems(list);
      setQuota(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post<Holiday>('/admin/holidays', form);
      setForm({ date: new Date().toISOString().slice(0, 10), name: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'add failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm('Remove this holiday?')) return;
    try {
      await api.delete(`/admin/holidays/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'delete failed');
    }
  }

  const used = quota?.used ?? items.length;
  const cap  = quota?.quota ?? 24;
  const pct  = Math.min(100, Math.round((Number(used) / Math.max(1, cap)) * 100));

  return (
    <>
      <div className="page-header">
        <div className="titles">
          <h1>Holidays</h1>
          <p>Mark organisation-wide paid days off. Each is credited as the daily-hour baseline on payroll.</p>
        </div>
      </div>

      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>{year} quota</h3>
          <span className="hint">{used} of {cap} used</span>
        </div>
        <div className="card-b">
          <div style={{
            height: 8, borderRadius: 999, background: 'var(--surface-2)',
            border: '1px solid var(--border)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${pct}%`,
              height: '100%',
              background: pct >= 100 ? 'var(--danger)' : 'var(--primary)',
            }} />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
            Quota is enforced as a soft target — you can still add holidays beyond {cap}.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><h3>Add holiday</h3></div>
        <div className="card-b">
          <form onSubmit={add} className="form-row">
            <div className="field" style={{ flex: '0 0 200px' }}>
              <label>Date</label>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field"><label>Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Diwali" />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Adding…' : '+ Add holiday'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h3>{items.length} {items.length === 1 ? 'holiday' : 'holidays'}</h3></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 160 }}>Date</th>
                <th>Name</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={3}>
                  <div className="empty">
                    <div className="empty-title">No holidays for {year} yet.</div>
                    <div>Use the form above to add one.</div>
                  </div>
                </td></tr>
              )}
              {items.map((h) => (
                <tr key={h.id}>
                  <td>{fmtDate(h.date)}</td>
                  <td style={{ fontWeight: 500 }}>{h.name}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn ghost sm" onClick={() => remove(h.id)}>Remove</button>
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
