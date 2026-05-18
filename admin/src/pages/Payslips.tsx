import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, Employee, OrgConfig, Payslip, PayslipDetail } from '../api/client';
import { fmtMoney } from '../lib/format';

const currentMonth = () => new Date().toISOString().slice(0, 7);

type StatusFilter = 'all' | 'held' | 'released' | 'paid' | 'override';

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
  const [rowBusy, setRowBusy] = useState<Record<number, 'paid' | 'release' | 'revert' | undefined>>({});

  // New UX state — search, status filter, expanded detail rows
  const [query, setQuery]               = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId]     = useState<number | null>(null);
  const [detail, setDetail]             = useState<PayslipDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api.get<Employee[]>('/admin/employees').then(setEmployees).catch((e) => setError(e.message));
    api.get<OrgConfig>('/admin/config').then((c) => setCurrency(c.currency)).catch(() => {});
  }, []);

  async function load() {
    setError(null); setInfo(null); setLoading(true);
    setExpandedId(null); setDetail(null);
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

  async function revertOverride(id: number) {
    if (!confirm('Revert this full-salary override and recompute from attendance? The gross will be recalculated from actual check-ins.')) return;
    setRowBusy((b) => ({ ...b, [id]: 'revert' }));
    try {
      await api.post(`/admin/payslips/${id}/revert-override`);
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

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null); setDetail(null); return;
    }
    setExpandedId(id); setDetail(null); setDetailLoading(true);
    try {
      const d = await api.get<PayslipDetail>(`/admin/payslips/${id}/detail`);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'detail fetch failed');
    } finally {
      setDetailLoading(false);
    }
  }

  const empName = (id: number) => employees.find((e) => e.id === id)?.name ?? `#${id}`;
  const empEmail = (id: number) => employees.find((e) => e.id === id)?.email;

  // Filter pipeline: status chip → search box
  const filtered = useMemo(() => {
    let xs = rows;
    if (statusFilter !== 'all') {
      xs = xs.filter((r) => {
        switch (statusFilter) {
          case 'held':     return !r.released;
          case 'released': return r.released && !r.paid;
          case 'paid':     return r.paid;
          case 'override': return r.manualOverride;
        }
      });
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      xs = xs.filter((r) => {
        const name = empName(r.employeeId).toLowerCase();
        const email = (empEmail(r.employeeId) ?? '').toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }
    return xs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, statusFilter, query, employees]);

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        gross:    a.gross    + Number(r.grossPay),
        ot:       a.ot       + Number(r.overtimePay),
        hours:    a.hours    + Number(r.totalHours),
        paid:     a.paid     + (r.paid ? 1 : 0),
        released: a.released + (r.released ? 1 : 0),
        override: a.override + (r.manualOverride ? 1 : 0),
      }),
      { gross: 0, ot: 0, hours: 0, paid: 0, released: 0, override: 0 }
    );
  }, [rows]);

  const unreleasedCount = rows.length - totals.released;

  // Status chip counts so the chips show "(N)"
  const counts = useMemo(() => ({
    all:      rows.length,
    held:     rows.filter((r) => !r.released).length,
    released: rows.filter((r) =>  r.released && !r.paid).length,
    paid:     rows.filter((r) =>  r.paid).length,
    override: rows.filter((r) =>  r.manualOverride).length,
  }), [rows]);

  return (
    <>
      <div className="page-header">
        <div className="titles">
          <h1>Payslips</h1>
          <p>Generate, review, release, and mark slips as paid for any month.</p>
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
              <label>Employee (optional)</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— all employees —</option>
                {employees.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={load} disabled={loading}>
                {loading ? 'Loading…' : employeeId ? 'Generate / load' : 'Load all'}
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
            Pick a month to see all employees, or filter by a single employee. Selecting an employee
            <b> auto-generates</b> their payslip for that month if one doesn't exist yet — useful for
            back-dated months. Newly generated payslips start <b>held</b>; flip them to <b>released</b>
            so the employee can view from mobile.
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
        <div className="card-h" style={{ flexWrap: 'wrap', gap: 12 }}>
          <h3>{filtered.length} {filtered.length === 1 ? 'slip' : 'slips'}{rows.length !== filtered.length ? <span className="hint" style={{ marginLeft: 6 }}>of {rows.length}</span> : null}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="search"
              placeholder="Search by employee name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ minWidth: 240, padding: '6px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)' }}
            />
          </div>
        </div>

        {/* Status chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 12px' }}>
          {([
            ['all',      `All (${counts.all})`],
            ['held',     `Held (${counts.held})`],
            ['released', `Released (${counts.released})`],
            ['paid',     `Paid (${counts.paid})`],
            ['override', `Override (${counts.override})`],
          ] as [StatusFilter, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              className="btn sm"
              style={{
                background: statusFilter === k ? 'var(--color-accent, #2748a3)' : 'transparent',
                color:      statusFilter === k ? '#fff' : 'inherit',
                borderColor: statusFilter === k ? 'var(--color-accent, #2748a3)' : 'var(--color-border-tertiary)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Employee</th>
                <th style={{ width: 90 }}>Month</th>
                <th style={{ width: 80 }}>Hours</th>
                <th style={{ width: 130 }}>Gross</th>
                <th style={{ width: 160 }}>Status</th>
                <th style={{ width: 90 }}>Paid</th>
                <th style={{ width: 220, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8}>
                  <div className="empty">
                    <div className="empty-title">No payslips loaded.</div>
                    <div>Pick a month — and optionally a specific employee — then click the button.</div>
                  </div>
                </td></tr>
              )}
              {rows.length > 0 && filtered.length === 0 && (
                <tr><td colSpan={8}>
                  <div className="empty">
                    <div className="empty-title">No payslips match your filter.</div>
                    <div>Clear the search or pick a different status above.</div>
                  </div>
                </td></tr>
              )}
              {filtered.map((r) => {
                const isExpanded = expandedId === r.id;
                return (
                  <>
                    <tr
                      key={r.id}
                      style={{ cursor: 'pointer', background: isExpanded ? 'var(--color-background-secondary)' : undefined }}
                      onClick={() => toggleExpand(r.id)}
                    >
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        {isExpanded ? '▾' : '▸'}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{empName(r.employeeId)}</span>
                        <div className="muted" style={{ fontSize: 12 }}>{empEmail(r.employeeId)}</div>
                      </td>
                      <td className="muted">{r.month}</td>
                      <td className="money">{Number(r.totalHours).toFixed(2)}</td>
                      <td className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.grossPay, currency)}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {r.released
                            ? <span className="badge green"><span className="dot" /> Released</span>
                            : <span className="badge amber"><span className="dot" /> Held</span>}
                          {r.manualOverride && (
                            <span
                              className="badge"
                              style={{
                                background: 'var(--color-background-warning, #fef3c7)',
                                color: 'var(--color-text-warning, #b45309)',
                                border: '0.5px solid var(--color-border-warning, #fde68a)',
                              }}
                              title="Admin set this payslip with full salary, overriding the attendance math"
                            >
                              Full-salary
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {r.paid
                          ? <span className="badge green"><span className="dot" /> Paid</span>
                          : <span className="badge amber"><span className="dot" /> Pending</span>}
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
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
                          {r.manualOverride && !r.paid && (
                            <button
                              className="btn secondary sm"
                              onClick={() => revertOverride(r.id)}
                              disabled={rowBusy[r.id] === 'revert'}
                              title="Undo the full-salary override and recompute from attendance"
                            >
                              {rowBusy[r.id] === 'revert' ? 'Reverting…' : 'Revert'}
                            </button>
                          )}
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
                    {isExpanded && (
                      <tr key={`${r.id}-detail`}>
                        <td colSpan={8} style={{ padding: 0, background: 'var(--color-background-secondary)' }}>
                          <DetailPanel
                            detail={detail}
                            loading={detailLoading}
                            currency={currency}
                            disabled={r.paid}
                            onSaved={async () => { await load(); }}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── Detail panel (expandable row) ─────────────────────────────────────
function DetailPanel({
  detail, loading, currency, disabled, onSaved,
}: {
  detail: PayslipDetail | null;
  loading: boolean;
  currency: string;
  disabled?: boolean;        // payslip is paid → adjustments locked
  onSaved: () => Promise<void>;
}) {
  if (loading) {
    return <div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading detail…</div>;
  }
  if (!detail) {
    return <div style={{ padding: 20, color: 'var(--text-muted)' }}>No detail available.</div>;
  }
  return (
    <div style={{ padding: 16, display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {/* Hours */}
        <div>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Hours</div>
          <KV k="Regular"  v={`${Number(detail.regularHours).toFixed(2)} h`} />
          <KV k="Overtime" v={`${Number(detail.overtimeHours).toFixed(2)} h`} />
          <KV k="Total"    v={`${Number(detail.totalHours).toFixed(2)} h`} bold />
          <KV k="Expected" v={`${Number(detail.expectedHours).toFixed(2)} h`} />
          <KV k="Avg/day worked" v={`${Number(detail.averageDailyHours).toFixed(2)} h`} />
        </div>

        {/* Pay breakdown */}
        <div>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Pay</div>
          <KV k="Regular"     v={fmtMoney(detail.regularPay,  currency)} />
          <KV k="Overtime"    v={fmtMoney(detail.overtimePay, currency)} />
          {Number(detail.bonusAmount) > 0 && (
            <KV k={detail.bonusNote ? `Bonus · ${detail.bonusNote}` : 'Bonus'} v={`+${fmtMoney(detail.bonusAmount, currency)}`} />
          )}
          {detail.manualOvertimePay != null && (
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Auto OT was {fmtMoney(detail.autoOvertimePay, currency)} — overridden by admin
            </div>
          )}
          <KV k="Gross"       v={fmtMoney(detail.grossPay, currency)} bold />
          <KV k={detail.deductionNote ? `Deductions · ${detail.deductionNote}` : 'Deductions'} v={`−${fmtMoney(detail.deductions, currency)}`} />
          <KV k="Net pay"     v={fmtMoney(detail.netPay,   currency)} bold />
        </div>

        {/* Calendar split + rates */}
        <div>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Days in {detail.periodLabel}</div>
          <KV k="Worked"  v={String(detail.daysWorked)} />
          <KV k="Leave"   v={String(detail.daysOnLeave)} />
          <KV k="Holiday" v={String(detail.daysHoliday)} />
          <KV k="Absent"  v={String(detail.daysAbsent)} />
          <KV k="Total"   v={String(detail.daysInMonth)} bold />
          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Rates</div>
            <KV k="Monthly" v={fmtMoney(detail.monthlySalary, currency)} />
            <KV k="Daily"   v={fmtMoney(detail.dailyRate,     currency)} />
            <KV k="Hourly"  v={fmtMoney(detail.hourlyRate,    currency)} />
          </div>
        </div>
      </div>

      {/* Adjustments form */}
      <AdjustmentsForm
        detail={detail}
        currency={currency}
        disabled={disabled}
        onSaved={onSaved}
      />
    </div>
  );
}

// ── Adjustments form ─────────────────────────────────────────────────
function AdjustmentsForm({
  detail, currency, disabled, onSaved,
}: {
  detail: PayslipDetail;
  currency: string;
  disabled?: boolean;
  onSaved: () => Promise<void>;
}) {
  const [manualOt,      setManualOt]      = useState<string>(detail.manualOvertimePay != null ? String(detail.manualOvertimePay) : '');
  const [bonusAmount,   setBonusAmount]   = useState<string>(Number(detail.bonusAmount) > 0 ? String(detail.bonusAmount) : '');
  const [bonusNote,     setBonusNote]     = useState<string>(detail.bonusNote ?? '');
  const [deductions,    setDeductions]    = useState<string>(Number(detail.deductions) > 0 ? String(detail.deductions) : '');
  const [deductionNote, setDeductionNote] = useState<string>(detail.deductionNote ?? '');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  async function save(clearOvertimeOverride: boolean = false) {
    setSaving(true); setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (clearOvertimeOverride) {
        body.clearManualOvertime = true;
      } else if (manualOt.trim() !== '') {
        const n = Number(manualOt);
        if (Number.isNaN(n) || n < 0) throw new ApiError(400, 'Manual overtime must be a non-negative number');
        body.manualOvertimePay = n;
      } else if (detail.manualOvertimePay != null) {
        // Field cleared → request to clear the server-side override too.
        body.clearManualOvertime = true;
      }

      if (bonusAmount.trim() !== '') {
        const n = Number(bonusAmount);
        if (Number.isNaN(n) || n < 0) throw new ApiError(400, 'Bonus must be a non-negative number');
        body.bonusAmount = n;
      } else {
        body.bonusAmount = 0;
      }
      body.bonusNote = bonusNote;

      if (deductions.trim() !== '') {
        const n = Number(deductions);
        if (Number.isNaN(n) || n < 0) throw new ApiError(400, 'Deductions must be a non-negative number');
        body.deductions = n;
      } else {
        body.deductions = 0;
      }
      body.deductionNote = deductionNote;

      await api.patch(`/admin/payslips/${detail.id}/adjustments`, body);
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  const isDirty =
    manualOt      !== (detail.manualOvertimePay != null ? String(detail.manualOvertimePay) : '') ||
    bonusAmount   !== (Number(detail.bonusAmount) > 0 ? String(detail.bonusAmount) : '') ||
    bonusNote     !== (detail.bonusNote ?? '') ||
    deductions    !== (Number(detail.deductions) > 0 ? String(detail.deductions) : '') ||
    deductionNote !== (detail.deductionNote ?? '');

  return (
    <div style={{
      background: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-tertiary)',
      borderRadius: 10,
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Manual adjustments</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            Override overtime, add bonuses, or apply deductions. {disabled ? <b>Locked — payslip already marked paid.</b> : null}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {detail.manualOvertimePay != null && !disabled && (
            <button
              className="btn secondary sm"
              onClick={() => { setManualOt(''); void save(true); }}
              disabled={saving}
              title="Clear the overtime override and revert to attendance-computed value"
            >
              Clear OT override
            </button>
          )}
          <button
            className="btn sm"
            onClick={() => save(false)}
            disabled={saving || disabled || !isDirty}
          >
            {saving ? 'Saving…' : 'Save adjustments'}
          </button>
        </div>
      </div>

      {error && <div className="alert error" style={{ marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div className="field">
          <label>Manual overtime ({currency})</label>
          <input
            type="number" step="0.01" min={0}
            value={manualOt}
            onChange={(e) => setManualOt(e.target.value)}
            placeholder={`auto: ${Number(detail.autoOvertimePay).toFixed(2)}`}
            disabled={disabled}
          />
          <p className="muted" style={{ fontSize: 11, marginTop: 4, marginBottom: 0 }}>
            Leave empty to use the attendance-based value
            {' '}({fmtMoney(detail.autoOvertimePay, currency)}).
          </p>
        </div>

        <div className="field">
          <label>Bonus ({currency})</label>
          <input
            type="number" step="0.01" min={0}
            value={bonusAmount}
            onChange={(e) => setBonusAmount(e.target.value)}
            placeholder="0.00"
            disabled={disabled}
          />
          <input
            type="text"
            value={bonusNote}
            onChange={(e) => setBonusNote(e.target.value)}
            placeholder="Reason — e.g. Diwali bonus"
            maxLength={200}
            disabled={disabled}
            style={{ marginTop: 6 }}
          />
        </div>

        <div className="field">
          <label>Deductions ({currency})</label>
          <input
            type="number" step="0.01" min={0}
            value={deductions}
            onChange={(e) => setDeductions(e.target.value)}
            placeholder="0.00"
            disabled={disabled}
          />
          <input
            type="text"
            value={deductionNote}
            onChange={(e) => setDeductionNote(e.target.value)}
            placeholder="Breakdown — e.g. Tax 1000; PF 500"
            maxLength={500}
            disabled={disabled}
            style={{ marginTop: 6 }}
          />
        </div>
      </div>
    </div>
  );
}

function KV({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ fontVariant: 'tabular-nums', fontWeight: bold ? 600 : 500 }}>{v}</span>
    </div>
  );
}
