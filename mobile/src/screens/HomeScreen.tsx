import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

import {
  api,
  AuthState,
  clearAuth,
  Holiday,
  LeaveRequest,
  loadAuth,
  Me,
  OrgConfig,
  TodaySummary,
} from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, shadow, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

// ── small helpers ────────────────────────────────────────────────────
const greeting = (h = new Date().getHours()) =>
  h < 5  ? 'Working late' :
  h < 12 ? 'Good morning' :
  h < 17 ? 'Good afternoon' :
           'Good evening';

const fmtClockHM = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const fmtDayLabel = (d = new Date()) =>
  d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

const fmtClock12 = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const initials = (n: string) =>
  (n || '?').split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';

const dayMonth = (iso: string) => {
  const d = new Date(iso);
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: d.toLocaleString('en-IN', { month: 'short' }).toUpperCase(),
    weekday: d.toLocaleString('en-IN', { weekday: 'long' }),
  };
};

const daysFromToday = (iso: string) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((+new Date(iso) - +t) / 86_400_000);
};

const daysBetween = (a: string, b: string) =>
  Math.max(1, Math.round((+new Date(b) - +new Date(a)) / 86_400_000) + 1);

// Sum of approved+pending leave days for the current calendar year.
const leavesTakenThisYear = (list: LeaveRequest[]): number => {
  const y = new Date().getFullYear();
  return list
    .filter((l) => l.status !== 'REJECTED')
    .filter((l) => new Date(l.fromDate).getFullYear() === y)
    .reduce((acc, l) => acc + daysBetween(l.fromDate, l.toDate), 0);
};

// Sum of the "between-sessions" gaps as break time (in minutes).
const breakMinutes = (log: TodaySummary['log'] | undefined): number => {
  if (!log || log.length < 2) return 0;
  const asc = [...log].reverse(); // server returns DESC
  let breakMs = 0;
  for (let i = 1; i < asc.length; i++) {
    const prev = asc[i - 1];
    if (!prev.checkOutAt) continue;
    const gap = +new Date(asc[i].checkInAt) - +new Date(prev.checkOutAt);
    if (gap > 0) breakMs += gap;
  }
  return Math.round(breakMs / 60_000);
};

// ── screen ───────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: Props) {
  const [auth, setAuth]         = useState<AuthState | null>(null);
  const [me, setMe]             = useState<Me | null>(null);
  const [cfg, setCfg]           = useState<OrgConfig | null>(null);
  const [summary, setSummary]   = useState<TodaySummary | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves]     = useState<LeaveRequest[]>([]);
  const [now, setNow]           = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  // Live clock + a 30s session ticker that re-runs the live-total memo.
  const [tick, setTick]         = useState(0);

  const reload = useCallback(async () => {
    try { setSummary(await api.get<TodaySummary>('/attendance/today/summary')); }
    catch { setSummary(null); }
  }, []);

  // Pulls every piece of data this screen renders. Used both on focus and by
  // pull-to-refresh.
  const reloadAll = useCallback(async () => {
    await Promise.allSettled([
      loadAuth().then(setAuth),
      api.get<Me>('/me').then(setMe).catch(() => {}),
      api.get<OrgConfig>('/config').then(setCfg).catch(() => {}),
      api.get<Holiday[]>('/holidays').then(setHolidays).catch(() => setHolidays([])),
      api.get<LeaveRequest[]>('/leaves').then(setLeaves).catch(() => setLeaves([])),
      reload(),
    ]);
  }, [reload]);

  useFocusEffect(useCallback(() => { void reloadAll(); }, [reloadAll]));

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await reloadAll(); }
    finally { setRefreshing(false); }
  }, [reloadAll]);

  // Clock — tick once a second for the headline time.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Working-hours ticker — only while a session is open.
  useEffect(() => {
    if (!summary?.openSession) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [summary?.openSession]);

  const openSession = summary?.log?.find((r) => !r.checkOutAt);

  // Live total hours: banked closed-session total + live elapsed of open session,
  // capped at 16h (matching the server-side cap).
  const liveTotal = useMemo(() => {
    if (!summary) return 0;
    const banked = Number(summary.totalHours ?? 0);
    if (!openSession) return banked;
    const elapsedSecs = Math.max(0, (Date.now() - +new Date(openSession.checkInAt)) / 1000);
    return banked + Math.min(elapsedSecs, 16 * 3600) / 3600;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, openSession, tick]);

  const expected = Number(summary?.expectedHours ?? cfg?.dailyHours ?? 6);
  const progressPct = expected > 0 ? Math.min(100, (liveTotal / expected) * 100) : 0;

  // Compose "Working since 09:15 · 4h 27m" or similar.
  const workingSinceLabel = useMemo(() => {
    if (!openSession) return summary?.sessions ? 'Shift closed for today' : 'Not checked in yet';
    const elapsedMin = Math.max(0, Math.round((Date.now() - +new Date(openSession.checkInAt)) / 60_000));
    const h = Math.floor(elapsedMin / 60);
    const m = elapsedMin % 60;
    return `Working since ${fmtClock12(openSession.checkInAt)}  ·  ${h}h ${m}m`;
  }, [openSession, tick, summary?.sessions]);

  // Status pill: prioritize punctuality from the backend when available,
  // then fall back to session-based labels.
  const status = (() => {
    if (!summary)           return { label: 'Loading', tone: 'gray' };
    if (openSession) {
      // We're on shift — show lateness if known.
      if (summary.punctuality === 'LATE' && summary.lateMinutes != null) {
        return { label: `Late ${summary.lateMinutes}m`, tone: 'amber' };
      }
      return { label: 'Present', tone: 'green' };
    }
    if (summary.shortfall)  return { label: 'Shortfall', tone: 'red' };
    if (summary.sessions && (summary.overtimeMinutes ?? 0) > 0) {
      const h = Math.floor((summary.overtimeMinutes ?? 0) / 60);
      const m = (summary.overtimeMinutes ?? 0) % 60;
      return { label: `OT ${h}h ${m}m`, tone: 'cyan' };
    }
    if (summary.sessions && liveTotal >= expected) return { label: 'Met target', tone: 'green' };
    if (summary.sessions)   return { label: 'Closed', tone: 'cyan' };
    return { label: 'Absent', tone: 'gray' };
  })();

  // Activity timeline rows (oldest first for natural reading order).
  const timelineRows = useMemo(() => {
    const log = summary?.log ?? [];
    const asc = [...log].reverse();
    const rows: { kind: 'in' | 'out'; iso: string; idx: number }[] = [];
    asc.forEach((r, i) => {
      rows.push({ kind: 'in', iso: r.checkInAt, idx: i + 1 });
      if (r.checkOutAt) rows.push({ kind: 'out', iso: r.checkOutAt, idx: i + 1 });
    });
    return rows;
  }, [summary?.log]);

  // Leave balance — single honest "Annual leave" bar plus a couple of derived
  // chips. (The backend doesn't categorize leaves, so the 3-bar mockup
  // collapses to one bar with real data here.)
  const yearLeaves     = leaves.filter((l) => new Date(l.fromDate).getFullYear() === new Date().getFullYear());
  const approvedDays   = leavesTakenThisYear(yearLeaves.filter((l) => l.status === 'APPROVED'));
  const pendingDays    = leavesTakenThisYear(yearLeaves.filter((l) => l.status === 'PENDING'));
  const annualQuota    = cfg?.annualHolidayQuota ?? 24;
  const availableDays  = Math.max(0, annualQuota - approvedDays - pendingDays);

  // Upcoming holidays — first 3 from today onward.
  const upcomingHolidays = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return holidays
      .filter((h) => new Date(h.date) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3);
  }, [holidays]);

  // Activity metrics — worked, break, sessions.
  const workedMin   = Math.round(liveTotal * 60);
  const workedH     = Math.floor(workedMin / 60);
  const workedM     = workedMin % 60;
  const breakMin    = breakMinutes(summary?.log);

  async function logout() {
    await clearAuth();
    navigation.replace('Login');
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor="#fff"
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        {/* ── Header ────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials(auth?.name ?? '?')}</Text>
            </View>
            <View>
              <Text style={s.greetEyebrow}>{greeting().toUpperCase()}</Text>
              <Text style={s.greetName} numberOfLines={1}>{auth?.name ?? 'Welcome'}</Text>
            </View>
          </View>
          <Pressable
            onPress={logout}
            hitSlop={8}
            android_ripple={{ color: 'rgba(0,0,0,0.04)', borderless: true, radius: 19 }}
            style={s.bellBtn}
            accessibilityLabel="Sign out"
          >
            <Text style={s.bellIcon}>◔</Text>
            <View style={s.bellDot} />
          </Pressable>
        </View>

        <Text style={s.dateLine}>{fmtDayLabel(now)}</Text>

        {/* ── Navy attendance hero card ────────────────────────── */}
        <View style={s.heroWrap}>
          <View style={s.heroCard}>
            {/* Decorative blobs */}
            <View style={[s.heroBlob, s.heroBlob1]} pointerEvents="none" />
            <View style={[s.heroBlob, s.heroBlob2]} pointerEvents="none" />

            <View style={s.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.heroEyebrow}>TODAY'S SHIFT</Text>
                <Text style={s.heroClock}>{fmtClockHM(now)}</Text>
                <Text style={s.heroCaption}>{workingSinceLabel}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <View style={[s.statusPill, statusPillStyle(status.tone as any)]}>
                  {status.tone === 'green' && openSession ? <PulseDot /> : <View style={[s.staticDot, statusDotStyle(status.tone as any)]} />}
                  <Text style={[s.statusText, statusTextStyle(status.tone as any)]}>{status.label}</Text>
                </View>
                <Text style={s.heroTarget}>{expected.toFixed(0)}h target</Text>
              </View>
            </View>

            <View style={s.heroProgress}>
              <View style={[s.heroProgressFill, { width: `${progressPct}%` }]} />
            </View>

            <View style={s.heroActions}>
              <Pressable
                onPress={() => navigation.navigate('CheckIn')}
                disabled={!!openSession}
                android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
                style={({ pressed }) => [
                  s.heroBtn,
                  s.heroBtnGhost,
                  !!openSession && { opacity: 0.5 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={s.heroBtnGhostText}>↵  Check in</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate('CheckOut')}
                disabled={!openSession}
                android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                style={({ pressed }) => [
                  s.heroBtn,
                  s.heroBtnSolid,
                  !openSession && { opacity: 0.6 },
                  pressed && { opacity: 0.92 },
                ]}
              >
                <Text style={s.heroBtnSolidText}>↩  Check out</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Quick actions ─────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Quick actions</Text>
            <Text style={s.sectionHint}>Tap to open</Text>
          </View>
          <View style={s.tileGrid}>
            <Tile icon="✓" tone="navy"   title="Attendance" sub={`${summary?.sessions ?? 0} today`}      onPress={() => navigation.navigate('Attendance')} />
            <Tile icon="✈" tone="amber"  title="Leave"      sub={`${availableDays} left`}                   onPress={() => navigation.navigate('Leaves')} />
            <Tile icon="₹" tone="teal"   title="Payslip"    sub="Tap to view"                              onPress={() => navigation.navigate('Payslip')} />
            <Tile icon="🎁" tone="pink"  title="Holidays"   sub={`${upcomingHolidays.length} upcoming`}    onPress={() => navigation.navigate('Holidays')} />
            <Tile icon="◉" tone="gray"   title="Profile"    sub="View"                                    onPress={() => navigation.navigate('Profile')} />
          </View>
        </View>

        {/* ── Today's activity ──────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>Today's activity</Text>
              <Pressable onPress={() => navigation.navigate('Attendance')} hitSlop={8}>
                <Text style={s.cardLink}>See all</Text>
              </Pressable>
            </View>

            <View style={s.metricRow}>
              <Metric label="Worked" value={`${workedH}`} unit={`h ${workedM}m`} />
              <Metric label="Break"  value={`${breakMin}`} unit="m" />
              <Metric label="Sessions" value={`${summary?.sessions ?? 0}`} unit="" />
            </View>

            {timelineRows.length > 0 ? (
              <View style={s.timeline}>
                <View style={s.timelineRail} />
                {timelineRows.map((r, i) => (
                  <View key={i} style={s.timelineItem}>
                    <View style={[
                      s.timelineDot,
                      { backgroundColor: r.kind === 'in' ? colors.primary : colors.success },
                    ]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.timelineTitle}>
                        {r.kind === 'in' ? 'Checked in' : 'Checked out'}
                      </Text>
                      <Text style={s.timelineSub}>
                        {fmtClock12(r.iso)}  ·  Session {r.idx}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={s.empty}>
                <Text style={s.emptyTitle}>No activity yet today</Text>
                <Text style={s.emptySub}>Tap Check in above to start your shift.</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Leave balance ─────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>Leave balance</Text>
              <Pressable onPress={() => navigation.navigate('Leaves')} hitSlop={8}>
                <Text style={s.cardLink}>History</Text>
              </Pressable>
            </View>

            <View style={s.balanceChips}>
              <BalanceChip label="Approved" value={approvedDays}   tone="teal" />
              <BalanceChip label="Pending"  value={pendingDays}    tone="amber" />
              <BalanceChip label="Left"     value={availableDays}  tone="navy" />
            </View>

            <View style={s.balanceBarWrap}>
              <View style={s.balanceBarLabelRow}>
                <Text style={s.balanceBarLabel}>Annual leave</Text>
                <Text style={s.balanceBarValue}>{approvedDays + pendingDays} of {annualQuota}</Text>
              </View>
              <View style={s.balanceTrack}>
                <View style={[s.balanceFill,    { width: `${Math.min(100, (approvedDays / annualQuota) * 100)}%`, backgroundColor: colors.success }]} />
                <View style={[s.balanceFillPending, { width: `${Math.min(100, (pendingDays / annualQuota) * 100)}%`, left: `${(approvedDays / annualQuota) * 100}%`, backgroundColor: colors.warning }]} />
              </View>
            </View>

            <Pressable
              onPress={() => navigation.navigate('ApplyLeave')}
              android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
              style={({ pressed }) => [s.applyBtn, pressed && { opacity: 0.92 }]}
            >
              <Text style={s.applyBtnText}>+   Apply for leave</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Upcoming holidays ─────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>Upcoming holidays</Text>
              <Pressable onPress={() => navigation.navigate('Holidays')} hitSlop={8}>
                <Text style={s.cardLink}>Calendar</Text>
              </Pressable>
            </View>

            {upcomingHolidays.length > 0 ? (
              upcomingHolidays.map((h, i) => {
                const dm = dayMonth(h.date);
                const inDays = daysFromToday(h.date);
                return (
                  <View key={h.id} style={[s.holidayRow, i > 0 && s.holidayRowDivider]}>
                    <View style={s.dateChip}>
                      <Text style={s.dateChipMonth}>{dm.month}</Text>
                      <Text style={s.dateChipDay}>{dm.day}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.holidayName} numberOfLines={1}>{h.name}</Text>
                      <Text style={s.holidaySub}>
                        {dm.weekday}  ·  {inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : `in ${inDays} days`}
                      </Text>
                    </View>
                    <View style={s.tag}><Text style={s.tagText}>HOLIDAY</Text></View>
                  </View>
                );
              })
            ) : (
              <View style={s.empty}>
                <Text style={s.emptyTitle}>No upcoming holidays</Text>
                <Text style={s.emptySub}>Your calendar is clear for now.</Text>
              </View>
            )}
          </View>
        </View>

        {!summary && (
          <View style={{ paddingVertical: spacing.xl }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </ScrollView>

      {/* ── Floating bottom nav ─────────────────────────────────── */}
      <View style={s.bottomNav}>
        <NavItem icon="⌂" label="Home"       active />
        <NavItem icon="✓" label="Attendance" onPress={() => navigation.navigate('Attendance')} />
        <NavItem icon="✈" label="Leave"      onPress={() => navigation.navigate('Leaves')} />
        <NavItem icon="₹" label="Payslip"    onPress={() => navigation.navigate('Payslip')} />
        <NavItem icon="◉" label="Profile"    onPress={() => navigation.navigate('Profile')} />
      </View>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function PulseDot() {
  // Simple solid dot — RN doesn't have CSS keyframes, but the colour signals
  // "active" clearly enough. Could swap in an Animated loop later.
  return <View style={s.pulseDot} />;
}

type Tone = 'navy' | 'purple' | 'amber' | 'teal' | 'pink' | 'gray';

const TONE_PALETTE: Record<Tone, { bg: string; fg: string }> = {
  navy:   { bg: colors.primary50, fg: colors.primary },
  purple: { bg: '#EEEDFE',        fg: '#3C3489' },
  amber:  { bg: '#FAEEDA',        fg: '#854F0B' },
  teal:   { bg: '#E1F5EE',        fg: '#0F6E56' },
  pink:   { bg: '#FBEAF0',        fg: '#72243E' },
  gray:   { bg: '#F1EFE8',        fg: '#444441' },
};

function Tile({
  icon, tone, title, sub, onPress,
}: { icon: string; tone: Tone; title: string; sub: string; onPress: () => void }) {
  const p = TONE_PALETTE[tone];
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      style={({ pressed }) => [s.tile, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <View style={[s.tileIcon, { backgroundColor: p.bg }]}>
        <Text style={[s.tileIconText, { color: p.fg }]}>{icon}</Text>
      </View>
      <Text style={s.tileTitle}>{title}</Text>
      <Text style={s.tileSub}>{sub}</Text>
    </Pressable>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={s.metric}>
      <Text style={s.metricLabel}>{label.toUpperCase()}</Text>
      <Text style={s.metricValue}>
        {value}{unit ? <Text style={s.metricUnit}>{unit}</Text> : null}
      </Text>
    </View>
  );
}

function BalanceChip({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const p = TONE_PALETTE[tone];
  return (
    <View style={[s.bChip, { backgroundColor: p.bg }]}>
      <Text style={[s.bChipValue, { color: p.fg }]}>{value}</Text>
      <Text style={[s.bChipLabel, { color: p.fg }]}>{label}</Text>
    </View>
  );
}

function NavItem({
  icon, label, active, onPress,
}: { icon: string; label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={active}
      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      style={({ pressed }) => [s.navItem, pressed && !active && { opacity: 0.75 }]}
    >
      <Text style={[s.navIcon, active && { color: colors.primary }]}>{icon}</Text>
      <Text style={[s.navLabel, active && { color: colors.primary, fontWeight: '800' }]}>{label}</Text>
    </Pressable>
  );
}

// ── Status pill colour helpers ────────────────────────────────────────
type StatusTone = 'gray' | 'green' | 'red' | 'cyan' | 'amber';

function statusPillStyle(t: StatusTone) {
  return t === 'green' ? { backgroundColor: 'rgba(16, 185, 129, 0.18)', borderColor: 'rgba(110, 231, 183, 0.35)' } :
         t === 'red'   ? { backgroundColor: 'rgba(239, 68, 68, 0.18)',  borderColor: 'rgba(248, 113, 113, 0.35)' } :
         t === 'cyan'  ? { backgroundColor: 'rgba(14, 165, 233, 0.18)', borderColor: 'rgba(56, 189, 248, 0.35)' } :
         t === 'amber' ? { backgroundColor: 'rgba(245, 158, 11, 0.18)', borderColor: 'rgba(252, 211, 77, 0.35)' } :
                         { backgroundColor: 'rgba(255, 255, 255, 0.12)', borderColor: 'rgba(255, 255, 255, 0.25)' };
}
function statusDotStyle(t: StatusTone) {
  return t === 'green' ? { backgroundColor: '#6ee7b7' } :
         t === 'red'   ? { backgroundColor: '#fca5a5' } :
         t === 'cyan'  ? { backgroundColor: '#7dd3fc' } :
         t === 'amber' ? { backgroundColor: '#fcd34d' } :
                         { backgroundColor: 'rgba(255, 255, 255, 0.7)' };
}
function statusTextStyle(t: StatusTone) {
  return t === 'green' ? { color: '#6ee7b7' } :
         t === 'red'   ? { color: '#fca5a5' } :
         t === 'cyan'  ? { color: '#7dd3fc' } :
         t === 'amber' ? { color: '#fcd34d' } :
                         { color: 'rgba(255, 255, 255, 0.85)' };
}

// ── Styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.4 },
  greetEyebrow: { fontSize: 10.5, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.8 },
  greetName: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: -0.3, marginTop: 1 },
  bellBtn: {
    position: 'relative',
    width: 38, height: 38, borderRadius: 12,
    borderWidth: 0.5, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  bellIcon: { fontSize: 18, fontWeight: '700', color: colors.text },
  bellDot: {
    position: 'absolute',
    top: 7, right: 8,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.danger,
    borderWidth: 1.5, borderColor: colors.surface,
  },

  dateLine: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 12,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },

  // Hero
  heroWrap: { paddingHorizontal: spacing.lg },
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: 22,
    padding: 18,
    overflow: 'hidden',
    ...shadow.blue,
  },
  heroBlob: { position: 'absolute', borderRadius: 9999 },
  heroBlob1: { width: 220, height: 220, backgroundColor: '#2748a3', opacity: 0.55, top: -100, right: -80 },
  heroBlob2: { width: 160, height: 160, backgroundColor: '#2c5cb8', opacity: 0.32, bottom: -80, left: -50 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroEyebrow: { fontSize: 10.5, fontWeight: '800', color: '#c7d2fe', letterSpacing: 1.2 },
  heroClock: {
    fontSize: 36, fontWeight: '800', color: '#fff',
    letterSpacing: -0.8, marginTop: 4, lineHeight: 38,
    fontVariant: ['tabular-nums'],
  },
  heroCaption: { fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 4 },
  heroTarget: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 0.5,
  },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34d399' },
  staticDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

  heroProgress: {
    height: 6, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: 14, overflow: 'hidden',
  },
  heroProgressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 999 },

  heroActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  heroBtn: {
    flex: 1, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  heroBtnGhost: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.28)',
  },
  heroBtnGhostText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  heroBtnSolid:    { backgroundColor: '#fff' },
  heroBtnSolidText: { color: colors.primary, fontWeight: '800', fontSize: 13.5 },

  // Section
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: 12 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  sectionHint:  { fontSize: 12, color: colors.textMuted },

  // Tile grid
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '31.5%',
    backgroundColor: colors.surface,
    borderWidth: 0.5, borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    gap: 8,
    minHeight: 102,
    ...shadow.card,
  },
  tileIcon: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  tileIconText: { fontSize: 18, fontWeight: '800' },
  tileTitle: { fontSize: 13, fontWeight: '800', color: colors.text, letterSpacing: -0.1 },
  tileSub:   { fontSize: 11, color: colors.textMuted },

  // Card (white panel)
  card: {
    backgroundColor: colors.surface,
    borderWidth: 0.5, borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.lg,
    ...shadow.card,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  cardLink:  { fontSize: 12, fontWeight: '800', color: colors.primary },

  // Activity metrics
  metricRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
  metric: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: 12, padding: 10,
  },
  metricLabel: { fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  metricValue: {
    fontSize: 18, fontWeight: '800', color: colors.text,
    marginTop: 2, letterSpacing: -0.3, fontVariant: ['tabular-nums'],
  },
  metricUnit: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

  // Timeline
  timeline: { paddingLeft: 16, position: 'relative' },
  timelineRail: {
    position: 'absolute', left: 3, top: 8, bottom: 8,
    width: 1, backgroundColor: colors.border,
  },
  timelineItem: { flexDirection: 'row', gap: 10, paddingVertical: 6, alignItems: 'flex-start' },
  timelineDot: { width: 8, height: 8, borderRadius: 4, marginLeft: -16, marginTop: 6 },
  timelineTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  timelineSub:   { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 4,
  },
  emptyTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  emptySub:   { fontSize: 12, color: colors.textMuted, textAlign: 'center' },

  // Leave balance
  balanceChips: {
    flexDirection: 'row', gap: 8,
    marginBottom: spacing.md,
  },
  bChip: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'flex-start',
  },
  bChipValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  bChipLabel: { fontSize: 11, fontWeight: '700', opacity: 0.85, marginTop: 1 },

  balanceBarWrap: { marginBottom: spacing.md },
  balanceBarLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  balanceBarLabel: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  balanceBarValue: { fontSize: 12, color: colors.textMuted, fontWeight: '700', fontVariant: ['tabular-nums'] },
  balanceTrack: {
    height: 8, borderRadius: 999,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    position: 'relative',
  },
  balanceFill: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    borderRadius: 999,
  },
  balanceFillPending: {
    position: 'absolute',
    top: 0, bottom: 0,
    borderRadius: 999,
    opacity: 0.85,
  },

  applyBtn: {
    backgroundColor: colors.primary,
    height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.blue,
  },
  applyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.2 },

  // Holiday rows
  holidayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  holidayRowDivider: { borderTopWidth: 0.5, borderTopColor: colors.border },
  dateChip: {
    width: 46,
    paddingVertical: 6,
    borderRadius: 11,
    backgroundColor: colors.primary50,
    alignItems: 'center',
  },
  dateChipMonth: {
    fontSize: 10, fontWeight: '800', color: colors.primary,
    letterSpacing: 0.6,
  },
  dateChipDay: {
    fontSize: 16, fontWeight: '800', color: colors.primary,
    marginTop: -1, letterSpacing: -0.3,
  },
  holidayName: { fontSize: 14, fontWeight: '700', color: colors.text },
  holidaySub:  { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  tag: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.primary50,
  },
  tagText: { fontSize: 10, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 },

  // Bottom nav
  bottomNav: {
    position: 'absolute',
    left: 12, right: 12,
    bottom: 8,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 8,
    borderWidth: 0.5, borderColor: colors.border,
    ...shadow.pop,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    gap: 3,
    borderRadius: 14,
  },
  navIcon:  { fontSize: 20, fontWeight: '700', color: colors.textMuted },
  navLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
});
