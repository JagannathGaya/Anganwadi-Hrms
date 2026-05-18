import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import { api, ApiError, getApiBaseUrl, loadAuth, PayslipDetail } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, shadow, spacing } from '../theme/tokens';
import { fmtMoney } from '../lib/format';
import { showToast } from '../lib/toast';

type Props = NativeStackScreenProps<RootStackParamList, 'Payslip'>;

// ── helpers ────────────────────────────────────────────────────────────
const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
};
const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return monthKey(new Date(y, m - 2, 1));
};
const nextMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return monthKey(new Date(y, m, 1));
};
/** Returns true when ym is the current calendar month OR any future month. */
const isCurrentOrFutureMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1);
};
/** Default month for the picker: last completed month (current month minus 1). */
const lastCompletedMonth = () => {
  const d = new Date();
  d.setDate(1);            // avoid month-overflow on dates like the 31st
  d.setMonth(d.getMonth() - 1);
  return monthKey(d);
};

// ── screen ─────────────────────────────────────────────────────────────
export default function PayslipScreen({ navigation }: Props) {
  // Payslips are only available after a month has ENDED. We default the picker
  // to the last completed month so users don't immediately hit the
  // "month-in-progress" error on first arrival.
  const [month, setMonth]     = useState<string>(lastCompletedMonth());
  const [slip, setSlip]       = useState<PayslipDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  // True when the 409 is specifically "salary not set" → friendly empty state.
  const [salaryMissing, setSalaryMissing] = useState(false);
  // True when the 409 is specifically "admin hasn't released yet" → toast +
  // friendly empty state.
  const [notReleased, setNotReleased] = useState(false);
  // True when the 409 is "month not finished yet" → toast + friendly state.
  const [monthInProgress, setMonthInProgress] = useState(false);
  // Separate flag for pull-to-refresh so the existing slip stays visible
  // while a background refetch is happening.
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (ym: string, opts?: { silent?: boolean }) => {
    setLoading(true);
    setError(null);
    setSalaryMissing(false);
    setNotReleased(false);
    setMonthInProgress(false);
    // Show a "working on it" toast as soon as the user taps Generate so the
    // tap registers immediately. `silent` skips it for the auto-fetch on
    // initial focus so users don't get a toast they didn't ask for.
    if (!opts?.silent) {
      showToast('Generating payslip…');
    }
    try {
      const res = await api.get<PayslipDetail>(`/payslip?month=${ym}`);
      setSlip(res);
      if (!opts?.silent) {
        showToast(`Payslip ready for ${res.periodLabel}`);
      }
    } catch (e) {
      setSlip(null);
      // Three different 409 cases come back from the server — sniff the
      // message text to pick the right friendly UI.
      if (e instanceof ApiError && e.status === 409) {
        const msg = e.message || '';
        if (/after the month|still in progress|will be available/i.test(msg)) {
          setMonthInProgress(true);
          setError(msg);
          if (!opts?.silent) {
            showToast('Payslip is available only after the month ends', true);
          }
        } else if (/activated|released/i.test(msg)) {
          setNotReleased(true);
          setError(msg);
          if (!opts?.silent) {
            showToast("You cannot generate the payslip now — admin hasn't activated it.", true);
          }
        } else if (/salary/i.test(msg)) {
          setSalaryMissing(true);
          setError(msg);
          if (!opts?.silent) showToast('Salary not set yet', true);
        } else {
          setError(msg);
          if (!opts?.silent) showToast('Could not generate payslip');
        }
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load payslip');
        if (!opts?.silent) showToast('Could not generate payslip');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch every time the screen is focused so admin updates (e.g. "complete
  // with full salary") are reflected without the user having to tap Generate.
  // `silent: true` skips the toast so navigating back here doesn't spam the
  // notification area.
  useFocusEffect(useCallback(() => {
    void load(month, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, month]));

  // Pull-to-refresh handler — re-runs load while keeping the existing slip
  // on screen so the UI doesn't flash empty mid-refresh.
  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(month, { silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [load, month]);

  /**
   * Open the server-rendered printable payslip in the system browser. The
   * page auto-fires the OS print/save-as-PDF dialog on load, so the user
   * sees the save sheet immediately — no extra taps once they're in the
   * browser.
   *
   * We intentionally skip `Linking.canOpenURL` here: on Android API 30+ it
   * frequently returns false for http(s) URLs due to package-visibility
   * restrictions, even though the browser CAN open them. Just call
   * `openURL` and trust the OS.
   */
  const onDownload = useCallback(async () => {
    try {
      const auth = await loadAuth();
      if (!auth) {
        showToast('Sign in again to download');
        return;
      }
      // Token in query because Linking.openURL navigates without headers.
      // Allowed only for /payslip/print by JwtAuthFilter. `?download=1`
      // tells the server to auto-trigger window.print() once the page loads.
      const url =
        `${getApiBaseUrl()}/payslip/print` +
        `?month=${encodeURIComponent(month)}` +
        `&token=${encodeURIComponent(auth.token)}` +
        `&download=1`;
      showToast('Opening payslip — choose Save as PDF…', true);
      await Linking.openURL(url);
    } catch (e) {
      console.warn('[payslip] download failed', e);
      showToast('Could not open the payslip. Try again from a browser.');
    }
  }, [month]);

  // When the user picks a different month, clear the displayed slip so the
  // Generate button reappears as the next obvious action.
  const onMonthChange = (next: string) => {
    setMonth(next);
    setSlip(null);
    setError(null);
    setSalaryMissing(false);
    setNotReleased(false);
    setMonthInProgress(false);
  };

  // Working-days breakdown for the colored bar
  const dayBreakdown = useMemo(() => {
    if (!slip) return null;
    const total = slip.daysInMonth || 1;
    return [
      { key: 'worked',  value: slip.daysWorked,  pct: (slip.daysWorked  / total) * 100, color: colors.success,  label: 'Worked' },
      { key: 'leave',   value: slip.daysOnLeave, pct: (slip.daysOnLeave / total) * 100, color: colors.info,      label: 'Leave' },
      { key: 'holiday', value: slip.daysHoliday, pct: (slip.daysHoliday / total) * 100, color: colors.primary,   label: 'Holiday' },
      { key: 'absent',  value: slip.daysAbsent,  pct: (slip.daysAbsent  / total) * 100, color: colors.danger,    label: 'Absent' },
    ];
  }, [slip]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl + spacing.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* ── Navy hero ─────────────────────────────────────────── */}
        <View style={s.hero}>
          <View style={[s.heroBlob, s.heroBlob1]} pointerEvents="none" />
          <View style={[s.heroBlob, s.heroBlob2]} pointerEvents="none" />

          <View style={s.heroBar}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={8}
              android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 20 }}
              style={s.iconBtn}
            >
              <Text style={s.iconBtnText}>‹</Text>
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={s.heroTitle}>My payslip</Text>
              <Text style={s.heroSub}>{slip?.periodLabel ?? monthLabel(month)}</Text>
            </View>
            <View style={s.iconBtn} />
          </View>

          {/* Month switcher */}
          <View style={s.monthSwitch}>
            <Pressable
              onPress={() => onMonthChange(prevMonth(month))}
              hitSlop={6}
              android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 18 }}
              style={s.monthArrow}
            >
              <Text style={s.monthArrowText}>‹</Text>
            </Pressable>
            <Text style={s.monthLabel}>{monthLabel(month)}</Text>
            <Pressable
              onPress={() => onMonthChange(nextMonth(month))}
              disabled={isCurrentOrFutureMonth(nextMonth(month))}
              hitSlop={6}
              android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 18 }}
              style={[s.monthArrow, isCurrentOrFutureMonth(nextMonth(month)) && { opacity: 0.35 }]}
            >
              <Text style={s.monthArrowText}>›</Text>
            </Pressable>
          </View>

          {/* Gross pay headline */}
          {slip && (
            <View style={s.headlineBlock}>
              <Text style={s.headlineEyebrow}>GROSS PAY</Text>
              <Text style={s.headlineAmount}>{fmtMoney(slip.grossPay, slip.currency)}</Text>
              <View style={[
                s.statusPill,
                slip.status === 'PAID' ? s.statusPaid : s.statusPending,
              ]}>
                <View style={[
                  s.statusDot,
                  { backgroundColor: slip.status === 'PAID' ? '#6ee7b7' : '#fcd34d' },
                ]} />
                <Text style={[
                  s.statusText,
                  { color: slip.status === 'PAID' ? '#6ee7b7' : '#fcd34d' },
                ]}>
                  {slip.status}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Body ──────────────────────────────────────────────── */}
        <View style={s.body}>
          {/* Primary action — always visible at the top of the body so the
              user is never confused about how to generate / refresh. */}
          <Pressable
            onPress={() => load(month)}
            disabled={loading}
            android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
            style={({ pressed }) => [
              s.generateBtn,
              loading && { opacity: 0.7 },
              pressed && !loading && { transform: [{ translateY: 1 }] },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.generateBtnText}>
                {slip ? '⟳  Regenerate payslip' : '+  Generate payslip'}
              </Text>
            )}
          </Pressable>

          {monthInProgress ? (
            <View style={s.salaryMissingCard}>
              <View style={[s.salaryMissingIcon, { backgroundColor: '#fef3c7' }]}>
                <Text style={[s.salaryMissingIconText, { color: '#b45309' }]}>◴</Text>
              </View>
              <Text style={s.salaryMissingTitle}>Month still in progress</Text>
              <Text style={s.salaryMissingBody}>
                Payslips are generated on a monthly basis. {monthLabel(month)} is still in progress, so the
                payslip will only be available after the month ends.
              </Text>
              <View style={[s.salaryMissingHint, { backgroundColor: '#fef3c7' }]}>
                <Text style={[s.salaryMissingHintK, { color: '#b45309' }]}>Try this instead</Text>
                <Text style={s.salaryMissingHintV}>
                  Tap the ‹ arrow above to view your last completed month.
                </Text>
              </View>
            </View>
          ) : notReleased ? (
            <View style={s.salaryMissingCard}>
              <View style={[s.salaryMissingIcon, { backgroundColor: colors.primary50 }]}>
                <Text style={[s.salaryMissingIconText, { color: colors.primary }]}>◴</Text>
              </View>
              <Text style={s.salaryMissingTitle}>Payslip not activated yet</Text>
              <Text style={s.salaryMissingBody}>
                Your payslip for {month && month.split('-').reverse().join('/').slice(0, 5)} hasn't been
                released by your administrator yet. You'll be able to generate it once they activate this month's payroll.
              </Text>
              <View style={[s.salaryMissingHint, { backgroundColor: colors.primary50 }]}>
                <Text style={[s.salaryMissingHintK, { color: colors.primary }]}>What to ask for</Text>
                <Text style={s.salaryMissingHintV}>
                  "Please release this month's payslips in the admin dashboard."
                </Text>
              </View>
            </View>
          ) : salaryMissing ? (
            <View style={s.salaryMissingCard}>
              <View style={s.salaryMissingIcon}>
                <Text style={s.salaryMissingIconText}>!</Text>
              </View>
              <Text style={s.salaryMissingTitle}>Salary not set yet</Text>
              <Text style={s.salaryMissingBody}>
                Your monthly salary hasn't been configured. Please contact your administrator —
                once they set it, you'll be able to generate payslips from here.
              </Text>
              <View style={s.salaryMissingHint}>
                <Text style={s.salaryMissingHintK}>What to ask for</Text>
                <Text style={s.salaryMissingHintV}>
                  "Please set my monthly salary in the admin dashboard."
                </Text>
              </View>
            </View>
          ) : error ? (
            <View style={[s.card, { backgroundColor: colors.danger50, borderColor: '#fecaca' }]}>
              <Text style={{ color: colors.danger700, fontWeight: '700' }}>{error}</Text>
              <Pressable
                onPress={() => load(month)}
                android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                style={({ pressed }) => [
                  s.retryBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={s.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : slip ? (
            <>
              {/* ── Net pay card ──────────────────────────────── */}
              <View style={s.netCard}>
                <View style={[s.netBlob]} pointerEvents="none" />
                <View>
                  <Text style={s.netEyebrow}>NET PAY</Text>
                  <Text style={s.netAmount}>{fmtMoney(slip.netPay, slip.currency)}</Text>
                </View>
                <View style={s.netDivider} />
                <View style={s.netSubRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.netSubK}>GROSS</Text>
                    <Text style={s.netSubV}>{fmtMoney(slip.grossPay, slip.currency)}</Text>
                  </View>
                  <View style={s.netVertDiv} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.netSubK}>DEDUCTIONS</Text>
                    <Text style={s.netSubV}>−{fmtMoney(slip.deductions, slip.currency)}</Text>
                  </View>
                </View>
              </View>

              {/* ── Earnings card ───────────────────────────── */}
              <View style={s.card}>
                <View style={s.cardHead}>
                  <Text style={s.cardEyebrow}>EARNINGS</Text>
                  <Text style={s.cardLink}>{Number(slip.totalHours).toFixed(2)}h total</Text>
                </View>
                <LineItem
                  dotColor={colors.info}
                  label="Regular pay"
                  hint={`${Number(slip.regularHours).toFixed(2)}h @ ${fmtMoney(slip.hourlyRate, slip.currency)}/h`}
                  amount={fmtMoney(slip.regularPay, slip.currency)}
                />
                <View style={s.lineDivider} />
                <LineItem
                  dotColor={colors.warning}
                  label={slip.manualOvertimePay != null ? 'Overtime pay (admin set)' : 'Overtime pay'}
                  hint={
                    slip.manualOvertimePay != null
                      ? 'Manually set by admin'
                      : `${Number(slip.overtimeHours).toFixed(2)}h @ 1.5×`
                  }
                  amount={fmtMoney(slip.overtimePay, slip.currency)}
                />
                {Number(slip.bonusAmount ?? 0) > 0 && (
                  <>
                    <View style={s.lineDivider} />
                    <LineItem
                      dotColor={colors.success}
                      label={slip.bonusNote ? `Bonus · ${slip.bonusNote}` : 'Bonus'}
                      hint="Added by admin"
                      amount={`+${fmtMoney(slip.bonusAmount ?? 0, slip.currency)}`}
                    />
                  </>
                )}
                <View style={s.lineTotalDivider} />
                <View style={s.lineTotalRow}>
                  <Text style={s.lineTotalLabel}>Gross earnings</Text>
                  <Text style={s.lineTotalAmount}>{fmtMoney(slip.grossPay, slip.currency)}</Text>
                </View>
              </View>

              {/* ── Deductions card ─────────────────────────── */}
              <View style={s.card}>
                <View style={s.cardHead}>
                  <Text style={s.cardEyebrow}>DEDUCTIONS</Text>
                  <Text style={s.cardLink}>Configured by admin</Text>
                </View>
                {Number(slip.deductions) > 0 ? (
                  <>
                    <LineItem
                      dotColor={colors.danger}
                      label={slip.deductionNote ? slip.deductionNote : 'Deductions'}
                      hint="Total subtractions from gross"
                      amount={`−${fmtMoney(slip.deductions, slip.currency)}`}
                    />
                  </>
                ) : (
                  <View style={s.emptyHint}>
                    <Text style={s.emptyHintTitle}>No deductions this month</Text>
                    <Text style={s.emptyHintSub}>
                      Tax, PF and loan recoveries will appear here when your admin enables them.
                    </Text>
                  </View>
                )}
                <View style={s.lineTotalDivider} />
                <View style={s.lineTotalRow}>
                  <Text style={s.lineTotalLabel}>Total deductions</Text>
                  <Text style={s.lineTotalAmount}>−{fmtMoney(slip.deductions, slip.currency)}</Text>
                </View>
              </View>

              {/* ── Working days breakdown ──────────────────── */}
              <View style={s.card}>
                <View style={s.cardHead}>
                  <Text style={s.cardEyebrow}>WORKING DAYS</Text>
                  <Text style={s.cardLink}>{slip.daysInMonth} days in {monthLabel(slip.month).split(' ')[0]}</Text>
                </View>

                {/* Stacked bar */}
                <View style={s.stackedBar}>
                  {dayBreakdown?.map((seg) => (
                    seg.pct > 0 ? (
                      <View
                        key={seg.key}
                        style={{
                          width: `${seg.pct}%`,
                          height: '100%',
                          backgroundColor: seg.color,
                        }}
                      />
                    ) : null
                  ))}
                </View>

                {/* Legend rows */}
                <View style={s.dayLegendRow}>
                  {dayBreakdown?.map((seg) => (
                    <View key={seg.key} style={s.dayLegendItem}>
                      <View style={[s.dayLegendDot, { backgroundColor: seg.color }]} />
                      <Text style={s.dayLegendLabel}>{seg.label}</Text>
                      <Text style={s.dayLegendValue}>{seg.value}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* ── Rate card ───────────────────────────────── */}
              <View style={s.card}>
                <View style={s.cardHead}>
                  <Text style={s.cardEyebrow}>YOUR PAY RATES</Text>
                </View>
                <View style={s.rateRow}>
                  <View style={s.rateCol}>
                    <Text style={s.rateK}>MONTHLY</Text>
                    <Text style={s.rateV}>{fmtMoney(slip.monthlySalary, slip.currency)}</Text>
                  </View>
                  <View style={s.rateVertDiv} />
                  <View style={s.rateCol}>
                    <Text style={s.rateK}>DAILY</Text>
                    <Text style={s.rateV}>{fmtMoney(slip.dailyRate, slip.currency)}</Text>
                  </View>
                  <View style={s.rateVertDiv} />
                  <View style={s.rateCol}>
                    <Text style={s.rateK}>HOURLY</Text>
                    <Text style={s.rateV}>{fmtMoney(slip.hourlyRate, slip.currency)}</Text>
                  </View>
                </View>
                <Text style={s.rateNote}>
                  Computed as monthly ÷ {slip.daysInMonth} days, then ÷ {Number(slip.expectedHours).toFixed(0) === '0' ? 6 : Math.round(Number(slip.expectedHours) / slip.daysInMonth)} hours per day.
                </Text>
              </View>

              {/* ── Download button ─────────────────────────── */}
              <Pressable
                onPress={onDownload}
                android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
                style={({ pressed }) => [
                  s.downloadBtn,
                  pressed && { transform: [{ translateY: 1 }] },
                ]}
              >
                <Text style={s.downloadBtnText}>↓  Download payslip</Text>
              </Pressable>
              <Text style={s.downloadHint}>
                Opens in your browser. Tap "Save / Print PDF" there to keep a copy.
              </Text>

              {/* ── Meta footer ─────────────────────────────── */}
              <View style={s.meta}>
                <Text style={s.metaText}>
                  Generated {new Date(slip.generatedAt).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
                <Text style={s.metaText}>·</Text>
                <Text style={s.metaText}>Payslip #{slip.id}</Text>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────
function LineItem({
  dotColor, label, hint, amount,
}: { dotColor: string; label: string; hint: string; amount: string }) {
  return (
    <View style={s.lineItem}>
      <View style={[s.lineDot, { backgroundColor: dotColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.lineLabel}>{label}</Text>
        <Text style={s.lineHint}>{hint}</Text>
      </View>
      <Text style={s.lineAmount}>{amount}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Hero
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 70,
    overflow: 'hidden',
  },
  heroBlob: { position: 'absolute', borderRadius: 9999 },
  heroBlob1: { width: 220, height: 220, backgroundColor: '#2748a3', opacity: 0.55, top: -100, right: -80 },
  heroBlob2: { width: 160, height: 160, backgroundColor: '#2c5cb8', opacity: 0.32, bottom: -80, left: -40 },
  heroBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: -2 },
  heroTitle: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  heroSub: { color: 'rgba(255,255,255,0.78)', fontSize: 11.5, marginTop: 2, fontWeight: '600' },

  monthSwitch: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  monthArrow: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  monthArrowText: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: -2 },
  monthLabel: {
    color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: -0.2,
    minWidth: 150, textAlign: 'center',
  },

  headlineBlock: {
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: 8,
  },
  headlineEyebrow: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1.3 },
  headlineAmount: {
    color: '#fff',
    fontSize: 36, fontWeight: '800', letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 999, borderWidth: 0.5,
  },
  statusPaid:    { backgroundColor: 'rgba(52,211,153,0.18)', borderColor: 'rgba(110,231,183,0.35)' },
  statusPending: { backgroundColor: 'rgba(245,158,11,0.20)', borderColor: 'rgba(252,211,77,0.35)' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

  // Body
  body: { paddingHorizontal: spacing.lg, marginTop: -spacing.xxl, gap: spacing.md },

  // Net pay card (highlight)
  netCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
    overflow: 'hidden',
  },
  netBlob: {
    position: 'absolute',
    width: 180, height: 180,
    backgroundColor: colors.primary50,
    opacity: 0.6,
    borderRadius: 90,
    top: -90, right: -60,
  },
  netEyebrow: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1.3 },
  netAmount: {
    fontSize: 30, fontWeight: '800', color: colors.text,
    marginTop: 4, letterSpacing: -0.6, fontVariant: ['tabular-nums'],
  },
  netDivider: { height: 0.5, backgroundColor: colors.border, marginVertical: spacing.md },
  netSubRow: { flexDirection: 'row', alignItems: 'center' },
  netVertDiv: { width: 0.5, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: spacing.md },
  netSubK: { fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.6 },
  netSubV: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2, fontVariant: ['tabular-nums'] },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  cardHead: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardEyebrow: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1.3 },
  cardLink:    { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },

  // Line items
  lineItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  lineDot:  { width: 10, height: 10, borderRadius: 5 },
  lineLabel: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  lineHint:  { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  lineAmount: { fontSize: 14, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  lineDivider: { height: 0.5, backgroundColor: colors.border, marginVertical: 4 },
  lineTotalDivider: { height: 0.5, backgroundColor: colors.border, marginTop: spacing.md, marginBottom: spacing.sm },
  lineTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineTotalLabel: { fontSize: 14, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  lineTotalAmount: { fontSize: 16, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },

  // Empty hint inside deductions
  emptyHint: {
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'flex-start',
    gap: 4,
  },
  emptyHintTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  emptyHintSub: { fontSize: 11.5, color: colors.textMuted, lineHeight: 17 },

  // Working-days bar
  stackedBar: {
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  dayLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dayLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexBasis: '46%',
    flexGrow: 1,
    paddingVertical: 4,
  },
  dayLegendDot: { width: 8, height: 8, borderRadius: 4 },
  dayLegendLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '700', flex: 1 },
  dayLegendValue: { fontSize: 13, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },

  // Rate card
  rateRow: { flexDirection: 'row', alignItems: 'center' },
  rateCol: { flex: 1, alignItems: 'flex-start' },
  rateVertDiv: { width: 0.5, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: 8 },
  rateK: { fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  rateV: { fontSize: 14.5, fontWeight: '800', color: colors.text, marginTop: 2, fontVariant: ['tabular-nums'] },
  rateNote: { fontSize: 11.5, color: colors.textMuted, marginTop: spacing.md, lineHeight: 17 },

  // Meta
  meta: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: spacing.md },
  metaText: { fontSize: 11, color: colors.textSoft, fontWeight: '600' },

  // Retry
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.danger700,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  retryText: { color: colors.danger700, fontWeight: '800', fontSize: 13 },

  // Primary action (Generate / Regenerate) — sky blue accent
  generateBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.info,           // sky / cyan blue
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.info,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.32,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  generateBtnText: {
    color: '#fff',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Empty state when no slip is loaded
  emptyTitle: { fontSize: 14, fontWeight: '800', color: colors.text, letterSpacing: -0.1 },
  emptySub: { fontSize: 12, color: colors.textMuted, marginTop: 4, textAlign: 'center' },

  // Download payslip button
  downloadBtn: {
    marginTop: spacing.md,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.30,
        shadowRadius: 20,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  downloadBtnText: {
    color: '#fff',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  downloadHint: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11.5,
    marginTop: 8,
    fontWeight: '500',
    paddingHorizontal: spacing.md,
    lineHeight: 16,
  },

  // Salary-not-set friendly state
  salaryMissingCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: '#fde68a',
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.card,
  },
  salaryMissingIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fef3c7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  salaryMissingIconText: { color: '#b45309', fontSize: 28, fontWeight: '900' },
  salaryMissingTitle: {
    fontSize: 16, fontWeight: '800', color: colors.text,
    letterSpacing: -0.2, marginBottom: 6,
  },
  salaryMissingBody: {
    fontSize: 13, color: colors.textMuted, textAlign: 'center',
    lineHeight: 19, marginBottom: spacing.lg, paddingHorizontal: spacing.sm,
  },
  salaryMissingHint: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    padding: spacing.md,
    width: '100%',
    gap: 4,
  },
  salaryMissingHintK: {
    fontSize: 10.5, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.4,
  },
  salaryMissingHintV: {
    fontSize: 12.5, color: colors.text, fontStyle: 'italic', lineHeight: 17,
  },
});
