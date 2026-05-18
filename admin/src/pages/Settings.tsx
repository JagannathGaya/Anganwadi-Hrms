import { FormEvent, useEffect, useState } from 'react';
import { api, OrgConfig } from '../api/client';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'];

export default function Settings() {
  const [cfg, setCfg] = useState<OrgConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const [form, setForm] = useState({
    geofenceLat: '',
    geofenceLng: '',
    geofenceRadiusM: '200',
    dailyHours: '6.00',
    annualHolidayQuota: '24',
    currency: 'INR',
  });

  useEffect(() => {
    api
      .get<OrgConfig>('/admin/config')
      .then((c) => {
        setCfg(c);
        setForm({
          geofenceLat: c.geofenceLat?.toString() ?? '',
          geofenceLng: c.geofenceLng?.toString() ?? '',
          geofenceRadiusM: String(c.geofenceRadiusM ?? 200),
          dailyHours: String(c.dailyHours),
          annualHolidayQuota: String(c.annualHolidayQuota),
          currency: c.currency,
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  async function pickHere() {
    if (!navigator.geolocation) {
      setError('Geolocation API not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setForm((f) => ({
          ...f,
          geofenceLat: pos.coords.latitude.toFixed(6),
          geofenceLng: pos.coords.longitude.toFixed(6),
        })),
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body = {
        geofenceLat: form.geofenceLat ? Number(form.geofenceLat) : null,
        geofenceLng: form.geofenceLng ? Number(form.geofenceLng) : null,
        geofenceRadiusM: Number(form.geofenceRadiusM),
        dailyHours: Number(form.dailyHours),
        annualHolidayQuota: Number(form.annualHolidayQuota),
        currency: form.currency.trim().toUpperCase(),
      };
      const res = await api.patch<OrgConfig>('/admin/config', body);
      setCfg(res);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="titles">
          <h1>Settings</h1>
          <p>Configure the geofence, daily working hours, holiday quota, and currency.</p>
        </div>
      </div>

      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}
      {saved && <div className="alert success" style={{ marginBottom: 12 }}>Saved.</div>}

      <form onSubmit={save}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <h3>Work-site geofence</h3>
            <span className="hint">Employees can only check in/out within this radius of the centre point.</span>
          </div>
          <div className="card-b">
            <div className="form-row">
              <div className="field" style={{ flex: '0 0 220px' }}>
                <label>Centre latitude</label>
                <input
                  type="number" step="any"
                  placeholder="e.g. 12.971600"
                  value={form.geofenceLat}
                  onChange={(e) => setForm({ ...form, geofenceLat: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: '0 0 220px' }}>
                <label>Centre longitude</label>
                <input
                  type="number" step="any"
                  placeholder="e.g. 77.594600"
                  value={form.geofenceLng}
                  onChange={(e) => setForm({ ...form, geofenceLng: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: '0 0 160px' }}>
                <label>Radius (metres)</label>
                <input
                  type="number" min={20} max={20000}
                  value={form.geofenceRadiusM}
                  onChange={(e) => setForm({ ...form, geofenceRadiusM: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="button" className="btn secondary" onClick={pickHere}>
                  Use my current location
                </button>
              </div>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
              Leave latitude/longitude blank to disable geofencing entirely.
              {cfg?.geofenceLat != null && (
                <> Currently: <b>{cfg.geofenceLat.toFixed(4)}, {cfg.geofenceLng?.toFixed(4)}</b> · {cfg.geofenceRadiusM} m.</>
              )}
            </p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <h3>Working hours &amp; payroll</h3>
            <span className="hint">Per day. Hours above this earn an overtime bonus at 1.5× the equivalent hourly rate.</span>
          </div>
          <div className="card-b">
            <div className="form-row">
              <div className="field" style={{ flex: '0 0 200px' }}>
                <label>Daily hours</label>
                <input
                  type="number" step="0.25" min={1} max={24}
                  value={form.dailyHours}
                  onChange={(e) => setForm({ ...form, dailyHours: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: '0 0 200px' }}>
                <label>Annual holiday quota</label>
                <input
                  type="number" step="1" min={0} max={365}
                  value={form.annualHolidayQuota}
                  onChange={(e) => setForm({ ...form, annualHolidayQuota: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: '0 0 200px' }}>
                <label>Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <button className="btn lg" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </>
  );
}
