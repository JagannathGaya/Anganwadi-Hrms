import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api, ApiError, AttendanceDto, OrgConfig, TodaySummary } from '../api/client';
import { Coords, LocationError, getCurrentCoords } from '../api/location';
import { showToast } from '../lib/toast';
import { fmtShiftRange } from '../lib/format';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, shadow, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'CheckIn'>;

// ── helpers ────────────────────────────────────────────────────────────
const haversine = (a: number, b: number, c: number, d: number) => {
  const R = 6_371_000;
  const dLat = (c - a) * Math.PI / 180;
  const dLng = (d - b) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
            Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const fmtDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`;
const fmtClock = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' });
const fmtTime12 = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

type FenceState =
  | { kind: 'loading' }
  | { kind: 'no-fence'; coords?: Coords }
  | { kind: 'inside';   coords: Coords; distance: number; radius: number }
  | { kind: 'outside';  coords: Coords; distance: number; radius: number }
  | { kind: 'error';    message: string };

// ── screen ─────────────────────────────────────────────────────────────
export default function CheckInScreen({ navigation }: Props) {
  const [cfg, setCfg]               = useState<OrgConfig | null>(null);
  const [summary, setSummary]       = useState<TodaySummary | null>(null);
  const [fence, setFence]           = useState<FenceState>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState<AttendanceDto | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [now, setNow]               = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const lastFenceKind = useRef<FenceState['kind'] | null>(null);

  // Live clock — tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pulse animation on the GPS dot
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ).start();
  }, [pulse]);

  // Toast when transitioning to "outside"
  useEffect(() => {
    if (fence.kind === 'outside' && lastFenceKind.current !== 'outside') {
      const over = fence.distance - fence.radius;
      showToast(`You're ${fmtDistance(over)} from the work site.`, true);
    }
    lastFenceKind.current = fence.kind;
  }, [fence]);

  const refresh = useCallback(async () => {
    setFence({ kind: 'loading' });
    setSubmitError(null);
    // Org config
    let c: OrgConfig;
    try {
      c = cfg ?? (await api.get<OrgConfig>('/config'));
      if (!cfg) setCfg(c);
    } catch (e) {
      setFence({
        kind: 'error',
        message: e instanceof ApiError ? `Couldn't load work-site: ${e.message}`
              : e instanceof Error      ? e.message
              :                            "Couldn't load work-site",
      });
      return;
    }
    // Coords
    let coords: Coords;
    try {
      coords = await getCurrentCoords();
    } catch (e) {
      setFence({
        kind: 'error',
        message: e instanceof LocationError ? e.message
              : e instanceof Error          ? e.message
              :                                'Could not read location',
      });
      return;
    }
    if (c.geofenceLat == null || c.geofenceLng == null || c.geofenceRadiusM == null) {
      setFence({ kind: 'no-fence', coords });
      return;
    }
    const d = haversine(c.geofenceLat, c.geofenceLng, coords.lat, coords.lng);
    setFence(
      d <= c.geofenceRadiusM
        ? { kind: 'inside',  coords, distance: d, radius: c.geofenceRadiusM }
        : { kind: 'outside', coords, distance: d, radius: c.geofenceRadiusM },
    );
  }, [cfg]);

  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull-to-refresh — re-runs the fence + summary fetch with the spinner.
  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      const sum = await api.get<TodaySummary>('/attendance/today/summary').catch(() => null);
      setSummary(sum);
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  // Pull today's summary for the "Recent activity" / metrics row
  useEffect(() => {
    api.get<TodaySummary>('/attendance/today/summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  async function submit() {
    if (fence.kind !== 'inside' && fence.kind !== 'no-fence') return;
    if (!fence.coords) return;
    setSubmitting(true); setSubmitError(null); setResult(null);
    try {
      const res = await api.post<AttendanceDto>('/attendance/checkin', fence.coords);
      setResult(res);
      // Re-pull summary so the activity card updates
      api.get<TodaySummary>('/attendance/today/summary').then(setSummary).catch(() => {});
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409)      setSubmitError(e.message || 'You already have an open shift.');
        else if (e.status === 401) setSubmitError('Your session has expired. Please sign in again.');
        else                       setSubmitError(e.message);
      } else if (e instanceof Error) setSubmitError(e.message);
      else                           setSubmitError("Couldn't record your check-in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canCheckIn = fence.kind === 'inside' || fence.kind === 'no-fence';

  const onBigPress = () => {
    if (submitting) return;
    if (fence.kind === 'outside') {
      const over = fence.distance - fence.radius;
      showToast(`Move ${fmtDistance(over)} closer to check in.`);
      return;
    }
    if (fence.kind === 'loading') return showToast('Getting your location…');
    if (fence.kind === 'error')   return showToast('Location unavailable. Tap refresh.');
    void submit();
  };

  // ── Derived values for the status card ──────────────────────────────
  const isInside  = fence.kind === 'inside' || fence.kind === 'no-fence';
  const isOutside = fence.kind === 'outside';
  const isError   = fence.kind === 'error';

  const distanceText =
    fence.kind === 'inside' || fence.kind === 'outside' ? fmtDistance(fence.distance) :
    fence.kind === 'no-fence' ? '0 m' : '—';
  const radiusText =
    fence.kind === 'inside' || fence.kind === 'outside' ? fmtDistance(fence.radius) :
    cfg?.geofenceRadiusM ? fmtDistance(cfg.geofenceRadiusM) : '—';

  const lastSession = summary?.log?.[0];

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl + spacing.xl }}
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
        {/* ── Navy hero ───────────────────────────────────────── */}
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
              <Text style={s.heroTitle}>Attendance check-in</Text>
              <Text style={s.heroDate}>{fmtDate(now)}</Text>
            </View>
            <View style={s.clockPill}>
              <Text style={s.clockPillText}>{fmtClock(now)}</Text>
            </View>
          </View>

          {/* Status row */}
          <View style={s.heroSub}>
            <Text style={s.heroSubText}>Have a productive day.</Text>
            <View style={s.refreshChip}>
              <Pressable
                onPress={refresh}
                android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 16 }}
                hitSlop={6}
                style={s.refreshChipInner}
              >
                <Text style={s.refreshChipText}>⟳  Refresh</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Navy status card (overlaps the hero) ───────────── */}
        <View style={s.statusWrap}>
          <View style={s.statusCard}>
            <View style={[s.statusBlob, s.statusBlob1]} pointerEvents="none" />
            <View style={[s.statusBlob, s.statusBlob2]} pointerEvents="none" />

            <View style={s.statusRow}>
              <View style={s.gpsAnim}>
                <Animated.View
                  style={[
                    s.gpsPulse,
                    {
                      backgroundColor: isInside ? 'rgba(110,231,183,0.35)'
                        : isOutside ? 'rgba(248,113,113,0.35)'
                        : 'rgba(255,255,255,0.25)',
                      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 0] }),
                      transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.7] }) }],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    s.gpsPulse,
                    {
                      backgroundColor: isInside ? 'rgba(110,231,183,0.35)'
                        : isOutside ? 'rgba(248,113,113,0.35)'
                        : 'rgba(255,255,255,0.25)',
                      opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.5, 0] }),
                      transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.7] }) }],
                    },
                  ]}
                />
                <View style={[
                  s.gpsCore,
                  { backgroundColor: isInside ? colors.success
                    : isOutside ? colors.danger
                    : '#94a3b8' },
                ]}>
                  <Text style={s.gpsCoreIcon}>◉</Text>
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <View style={[
                  s.statusPill,
                  isInside  ? s.statusPillGreen :
                  isOutside ? s.statusPillRed :
                  isError   ? s.statusPillAmber :
                              s.statusPillGray,
                ]}>
                  <Text style={[
                    s.statusPillText,
                    isInside  ? { color: '#6ee7b7' } :
                    isOutside ? { color: '#fca5a5' } :
                    isError   ? { color: '#fcd34d' } :
                                { color: 'rgba(255,255,255,0.85)' },
                  ]}>
                    {isInside  ? '✓  Inside office area'  :
                     isOutside ? '✕  Outside office area' :
                     isError   ? '!  Location unavailable':
                                  '…  Locating you…'}
                  </Text>
                </View>
                <Text style={s.officeName}>Work site</Text>
                <Text style={s.officeSub}>
                  {cfg?.geofenceLat != null && cfg?.geofenceLng != null
                    ? `${cfg.geofenceLat.toFixed(4)}, ${cfg.geofenceLng.toFixed(4)}`
                    : 'No geofence configured'}
                </Text>
              </View>
            </View>

            <View style={s.statusDivider} />

            <View style={s.statusMetricsRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.metricK}>Your distance</Text>
                <Text style={[
                  s.metricBig,
                  isInside  ? { color: '#6ee7b7' } :
                  isOutside ? { color: '#fca5a5' } : { color: '#fff' },
                ]}>
                  {distanceText}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.metricK}>Allowed</Text>
                <Text style={[s.metricBig, { color: '#fff' }]}>{radiusText}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.metricK}>State</Text>
                <Text style={[s.metricBig, { color: '#fff', fontSize: 14 }]} numberOfLines={1}>
                  {isInside ? 'OK' : isOutside ? 'TOO FAR' : isError ? 'ERROR' : '...'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Mini-map preview (fake, built from Views) ───────── */}
        <View style={s.body}>
          <View style={s.mapCard}>
            <MiniMap fence={fence} />
          </View>

          {/* ── Attendance state card ───────────────────────── */}
          <View style={s.card}>
            <View style={s.cardHead}>
              <View>
                <Text style={s.cardEyebrow}>ATTENDANCE STATE</Text>
                <Text style={s.cardTitle}>
                  {summary?.openSession    ? 'Already on shift'
                    : summary?.sessions   ? 'Shift closed for today'
                                           : 'Not checked in yet'}
                </Text>
                <Text style={s.cardSub}>
                  {summary?.openSession
                    ? `Checked in at ${fmtTime12(summary.log.find((r) => !r.checkOutAt)!.checkInAt)}`
                    : 'Tap the button below to start your shift'}
                </Text>
              </View>
              <View style={[s.tagPill, { backgroundColor: colors.primary50 }]}>
                <Text style={[s.tagPillText, { color: colors.primary }]}>
                  {summary?.openSession ? 'OPEN' : 'READY'}
                </Text>
              </View>
            </View>

            <View style={s.metricRow}>
              <View style={s.metric}>
                <Text style={s.metricLabel}>WORKED</Text>
                <Text style={s.metricValue}>
                  {summary?.totalHours ? Number(summary.totalHours).toFixed(2) : '0.00'}
                  <Text style={s.metricUnit}>h</Text>
                </Text>
              </View>
              <View style={s.metric}>
                <Text style={s.metricLabel}>SESSIONS</Text>
                <Text style={s.metricValue}>{summary?.sessions ?? 0}</Text>
              </View>
              <View style={s.metric}>
                <Text style={s.metricLabel}>TARGET</Text>
                <Text style={s.metricValue}>
                  {Number(summary?.expectedHours ?? cfg?.dailyHours ?? 6).toFixed(0)}
                  <Text style={s.metricUnit}>h</Text>
                </Text>
              </View>
            </View>
          </View>

          {/* ── Main action button ──────────────────────────── */}
          <Pressable
            onPress={onBigPress}
            disabled={submitting}
            android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
            style={({ pressed }) => [
              s.actionBtn,
              {
                backgroundColor: !canCheckIn ? '#94a3b8' : colors.primary,
                opacity: (!canCheckIn || submitting) ? 0.85 : 1,
              },
              pressed && canCheckIn && { transform: [{ translateY: 1 }] },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.actionBtnText}>
                {fence.kind === 'outside' ? '✕  Move inside to check in'
                  : fence.kind === 'loading' ? '◴  Locating you…'
                  : fence.kind === 'error'   ? '!  Location unavailable'
                                              : '↵  Check in now'}
              </Text>
            )}
          </Pressable>

          {/* ── Outside warning banner ─────────────────────── */}
          {isOutside && (
            <View style={s.warnBanner}>
              <Text style={s.warnIcon}>⚠</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.warnTitle}>You're outside office premises</Text>
                <Text style={s.warnBody}>
                  Move within {fmtDistance(fence.radius)} of the work site to check in.
                </Text>
              </View>
            </View>
          )}

          {/* ── Error banner ─────────────────────────────── */}
          {isError && (
            <View style={s.warnBanner}>
              <Text style={s.warnIcon}>!</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.warnTitle}>Location unavailable</Text>
                <Text style={s.warnBody}>{(fence as { message: string }).message}</Text>
              </View>
            </View>
          )}

          {/* ── Success card with shift-aware punctuality ───── */}
          {result && (
            <View style={[s.card, { backgroundColor: '#ecfdf5', borderColor: '#bbf7d0' }]}>
              <View style={s.cardHead}>
                <View>
                  <Text style={[s.cardEyebrow, { color: colors.success700 }]}>CHECKED IN</Text>
                  <Text style={s.cardTitle}>
                    {result.punctuality === 'LATE'
                      ? `Late by ${Math.abs(result.lateMinutes ?? 0)}m`
                      : result.punctuality === 'EARLY'
                        ? `Early by ${Math.abs(result.lateMinutes ?? 0)}m`
                        : 'On time'}
                  </Text>
                </View>
                <View style={[
                  s.tagPill,
                  result.punctuality === 'LATE' ? { backgroundColor: '#fef3c7' } :
                  result.punctuality === 'EARLY' ? { backgroundColor: '#dbeafe' } :
                                                   { backgroundColor: colors.success50 },
                ]}>
                  <Text style={[
                    s.tagPillText,
                    result.punctuality === 'LATE' ? { color: '#b45309' } :
                    result.punctuality === 'EARLY' ? { color: '#1e40af' } :
                                                     { color: colors.success700 },
                  ]}>
                    {result.punctuality === 'NO_SHIFT' ? 'NO SHIFT' : result.punctuality}
                  </Text>
                </View>
              </View>
              <View style={s.kvRow}>
                <Text style={s.kvK}>Time</Text>
                <Text style={s.kvV}>{fmtTime12(result.checkInAt)}</Text>
              </View>
              {result.expectedCheckInAt && (
                <>
                  <View style={s.divider} />
                  <View style={s.kvRow}>
                    <Text style={s.kvK}>Expected at</Text>
                    <Text style={s.kvV}>{fmtTime12(result.expectedCheckInAt)}</Text>
                  </View>
                </>
              )}
              {result.shift && (
                <>
                  <View style={s.divider} />
                  <View style={s.kvRow}>
                    <Text style={s.kvK}>Shift</Text>
                    <Text style={s.kvV}>{result.shift.name}</Text>
                  </View>
                  <View style={s.divider} />
                  <View style={s.kvRow}>
                    <Text style={s.kvK}>Schedule</Text>
                    <Text style={s.kvV}>
                      {fmtShiftRange(result.shift.startTime, result.shift.endTime)}
                    </Text>
                  </View>
                </>
              )}
              <View style={s.divider} />
              <View style={s.kvRow}>
                <Text style={s.kvK}>Location</Text>
                <Text style={[s.kvV, { fontVariant: ['tabular-nums'] }]}>
                  {result.checkInLat != null && result.checkInLng != null
                    ? `${result.checkInLat.toFixed(5)}, ${result.checkInLng.toFixed(5)}`
                    : '—'}
                </Text>
              </View>
            </View>
          )}

          {/* ── Submit error ─────────────────────────────── */}
          {submitError && (
            <View style={[s.card, { backgroundColor: colors.danger50, borderColor: '#fecaca' }]}>
              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                <Text style={[s.warnIcon, { color: colors.danger700 }]}>⚠</Text>
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Text style={[s.warnBody, { color: colors.danger700 }]}>{submitError}</Text>
                  <Pressable
                    onPress={submit}
                    disabled={submitting || !canCheckIn}
                    android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                    style={({ pressed }) => [
                      s.retryBtn,
                      pressed && { opacity: 0.7 },
                      (submitting || !canCheckIn) && { opacity: 0.5 },
                    ]}
                  >
                    <Text style={s.retryText}>Try again</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {/* ── Recent activity ─────────────────────────── */}
          {lastSession && (
            <View style={s.card}>
              <View style={s.cardHead}>
                <Text style={s.cardEyebrow}>RECENT ACTIVITY</Text>
              </View>
              <View style={s.kvRow}>
                <Text style={s.kvK}>Last check-in today</Text>
                <Text style={s.kvV}>{fmtTime12(lastSession.checkInAt)}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.kvRow}>
                <Text style={s.kvK}>Last check-out today</Text>
                <Text style={s.kvV}>
                  {lastSession.checkOutAt ? fmtTime12(lastSession.checkOutAt) : '—'}
                </Text>
              </View>
              <View style={s.divider} />
              <View style={s.kvRow}>
                <Text style={s.kvK}>Total today</Text>
                <Text style={[s.kvV, { color: colors.success700 }]}>
                  {summary?.totalHours ? Number(summary.totalHours).toFixed(2) : '0.00'}h
                </Text>
              </View>
            </View>
          )}

          {/* ── Motivational strip ──────────────────────── */}
          <View style={s.motivStrip}>
            <View style={[s.motivStripBlob]} pointerEvents="none" />
            <View style={s.motivIcon}>
              <Text style={s.motivIconText}>✦</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.motivTitle}>Have a productive day</Text>
              <Text style={s.motivSub}>
                {summary?.openSession
                  ? 'Keep up the good work — your shift is rolling.'
                  : 'Tap the navy button to start. Every minute counts.'}
              </Text>
            </View>
          </View>

          {/* ── Footer sync row ─────────────────────────── */}
          <View style={s.footerRow}>
            <View style={s.footerItem}>
              <View style={[s.footerDot, { backgroundColor: colors.success }]} />
              <Text style={s.footerText}>Sync: just now</Text>
            </View>
            <View style={s.footerItem}>
              <Text style={[s.footerText, { color: colors.primary }]}>◔</Text>
              <Text style={s.footerText}>Battery-saver location</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Mini-map (no library, built from Views) ────────────────────────────
function MiniMap({ fence }: { fence: FenceState }) {
  // Compute user dot position inside the map area. Map is 320px wide, ~180 tall
  // in our layout, but the actual width comes from the parent. We map the
  // user→office distance to a screen offset, capping at the visible area.
  const MAP_H = 180;
  const fenceR = 64;             // visible radius of the dashed circle (px)

  let userOffset = { dx: 0, dy: 0 };
  let userVisible = false;
  let isInside = false;
  let isOutside = false;
  if (fence.kind === 'inside' || fence.kind === 'outside') {
    // Place the user dot roughly relative to the radius. Inside → halfway out;
    // outside → just past the fence boundary in the same direction.
    const ratio = Math.min(1.35, fence.distance / Math.max(1, fence.radius));
    userOffset = { dx: ratio * (fenceR - 6), dy: -ratio * 14 };
    userVisible = true;
    isInside = fence.kind === 'inside';
    isOutside = fence.kind === 'outside';
  }

  return (
    <View style={m.frame}>
      {/* Fake "street grid" */}
      <View style={[m.gridH, { top: 50 }]} />
      <View style={[m.gridH, { top: 110 }]} />
      <View style={[m.gridV, { left: 70 }]} />
      <View style={[m.gridV, { left: 200 }]} />
      <View style={[m.road]} />

      {/* Buildings */}
      <View style={[m.block, { width: 50, height: 20, top: 20, left: 20 }]} />
      <View style={[m.block, { width: 60, height: 32, top: 130, left: 100 }]} />
      <View style={[m.block, { width: 60, height: 22, top: 20, right: 30 }]} />

      {/* Fence ring */}
      <View style={[
        m.fence,
        {
          width: fenceR * 2,
          height: fenceR * 2,
          marginLeft: -fenceR,
          marginTop: -fenceR,
          borderColor: isInside || (!isOutside && fence.kind !== 'error') ? colors.primary : '#94a3b8',
          backgroundColor: isInside
            ? 'rgba(30,58,138,0.10)'
            : isOutside ? 'rgba(148,163,184,0.10)' : 'rgba(30,58,138,0.10)',
        },
      ]} />

      {/* Office marker (centre) */}
      <View style={m.officeMarker}>
        <Text style={m.officeMarkerText}>⬢</Text>
      </View>

      {/* User dot */}
      {userVisible && (
        <View
          style={[
            m.userWrap,
            {
              transform: [{ translateX: userOffset.dx }, { translateY: userOffset.dy }],
            },
          ]}
        >
          <View style={[
            m.userPulse,
            { backgroundColor: isInside ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)' },
          ]} />
          <View style={[
            m.userDot,
            { backgroundColor: isInside ? colors.success : colors.danger },
          ]} />
        </View>
      )}

      {/* Map attribution */}
      <View style={m.attrib}>
        <Text style={m.attribText}>Map preview</Text>
      </View>
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
  heroTitle: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: -0.1 },
  heroDate: { color: 'rgba(255,255,255,0.78)', fontSize: 11.5, marginTop: 2, fontWeight: '600' },
  clockPill: {
    paddingHorizontal: 12, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  clockPillText: { color: '#fff', fontWeight: '800', fontVariant: ['tabular-nums'], fontSize: 13 },

  heroSub: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 14,
  },
  heroSubText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  refreshChip: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  refreshChipInner: { paddingHorizontal: 12, paddingVertical: 5 },
  refreshChipText: { color: '#fff', fontSize: 11.5, fontWeight: '700', letterSpacing: 0.3 },

  // Status card (overlapping hero)
  statusWrap: { marginTop: -56, paddingHorizontal: spacing.lg },
  statusCard: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    padding: 16,
    overflow: 'hidden',
    borderWidth: 0.5, borderColor: '#2748a3',
    ...shadow.blue,
  },
  statusBlob: { position: 'absolute', borderRadius: 9999 },
  statusBlob1: { width: 180, height: 180, backgroundColor: '#2c5cb8', opacity: 0.32, top: -90, right: -70 },
  statusBlob2: { width: 130, height: 130, backgroundColor: '#2748a3', opacity: 0.30, bottom: -80, left: -50 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  gpsAnim: {
    width: 56, height: 56,
    alignItems: 'center', justifyContent: 'center',
  },
  gpsPulse: { position: 'absolute', width: 56, height: 56, borderRadius: 28 },
  gpsCore: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  gpsCoreIcon: { color: '#fff', fontSize: 16, fontWeight: '800' },

  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 0.5,
  },
  statusPillGreen: { backgroundColor: 'rgba(52,211,153,0.18)', borderColor: 'rgba(110,231,183,0.35)' },
  statusPillRed:   { backgroundColor: 'rgba(239,68,68,0.20)',  borderColor: 'rgba(248,113,113,0.35)' },
  statusPillAmber: { backgroundColor: 'rgba(245,158,11,0.20)', borderColor: 'rgba(252,211,77,0.35)' },
  statusPillGray:  { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)' },
  statusPillText:  { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

  officeName: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 8, letterSpacing: -0.2 },
  officeSub:  { color: 'rgba(255,255,255,0.75)', fontSize: 11.5, marginTop: 2, fontVariant: ['tabular-nums'] },

  statusDivider: {
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginVertical: 14,
  },
  statusMetricsRow: { flexDirection: 'row', gap: 8 },
  metricK: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  metricBig: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },

  // Body
  body: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.md,
  },

  // Map card
  mapCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 0.5, borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },

  // White card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  cardEyebrow: { fontSize: 10.5, fontWeight: '800', color: colors.primary, letterSpacing: 1.2 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 4, letterSpacing: -0.2 },
  cardSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  tagPill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  tagPillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },

  metricRow: { flexDirection: 'row', gap: 8 },
  metric: {
    flex: 1, backgroundColor: colors.surface2,
    borderRadius: 12, padding: 10,
  },
  metricLabel: { fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  metricValue: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 2, fontVariant: ['tabular-nums'] },
  metricUnit: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

  // Action button
  actionBtn: {
    height: 54, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.blue,
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },

  // Warn banner
  warnBanner: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 0.5, borderColor: '#fed7aa',
    borderRadius: 12,
  },
  warnIcon: { color: '#b45309', fontSize: 18, fontWeight: '900' },
  warnTitle: { color: '#9a3412', fontSize: 12.5, fontWeight: '800' },
  warnBody:  { color: '#9a3412', fontSize: 12, marginTop: 2, lineHeight: 17 },

  // Retry
  retryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.danger700,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  retryText: { color: colors.danger700, fontWeight: '800', fontSize: 13 },

  // KV
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },
  kvK: { fontSize: 12.5, color: colors.textMuted },
  kvV: { fontSize: 13, fontWeight: '700', color: colors.text },
  divider: { height: 0.5, backgroundColor: colors.border },

  // Motivational strip
  motivStrip: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  motivStripBlob: {
    position: 'absolute',
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#2748a3',
    opacity: 0.4,
    top: -70, right: -50,
  },
  motivIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  motivIconText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  motivTitle: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
  motivSub: { color: 'rgba(255,255,255,0.78)', fontSize: 11.5, marginTop: 1 },

  // Footer
  footerRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerDot: { width: 6, height: 6, borderRadius: 3 },
  footerText: { fontSize: 11.5, color: colors.textMuted, fontWeight: '600' },
});

// Mini-map styles
const m = StyleSheet.create({
  frame: {
    width: '100%',
    height: 180,
    backgroundColor: '#eaf0f8',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gridH: {
    position: 'absolute',
    left: 0, right: 0,
    height: 0.8,
    backgroundColor: '#d6dde7',
    opacity: 0.6,
  },
  gridV: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: 0.8,
    backgroundColor: '#d6dde7',
    opacity: 0.6,
  },
  road: {
    position: 'absolute',
    top: 80,
    left: 0, right: 0,
    height: 6,
    backgroundColor: '#cdd6e2',
  },
  block: {
    position: 'absolute',
    backgroundColor: '#dde4ee',
    borderRadius: 2,
  },
  fence: {
    position: 'absolute',
    top: '50%', left: '50%',
    borderRadius: 9999,
    borderWidth: 1.3,
    borderStyle: 'dashed',
  },
  officeMarker: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    position: 'absolute',
    top: '50%', left: '50%',
    marginTop: -14, marginLeft: -14,
    ...shadow.blue,
  },
  officeMarkerText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  userWrap: {
    position: 'absolute',
    top: '50%', left: '50%',
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
    marginTop: -14, marginLeft: -14,
  },
  userPulse: {
    position: 'absolute',
    width: 32, height: 32, borderRadius: 16,
  },
  userDot: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: '#fff',
  },
  attrib: {
    position: 'absolute',
    bottom: 6, right: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  attribText: { fontSize: 9, color: colors.textMuted, fontWeight: '700' },
});
