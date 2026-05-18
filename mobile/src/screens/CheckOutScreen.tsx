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
import { useFocusEffect } from '@react-navigation/native';

import { api, ApiError, Attendance, AttendanceDto, OrgConfig, TodaySummary } from '../api/client';
import { Coords, LocationError, getCurrentCoords } from '../api/location';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, shadow, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'CheckOut'>;

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
const durationStr = (start: string, end: number | string) => {
  const ms = +new Date(end) - +new Date(start);
  const m = Math.max(0, Math.round(ms / 60_000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

type Stage = 'idle' | 'locating' | 'submitting';

type FenceState =
  | { kind: 'loading' }
  | { kind: 'no-fence'; coords: Coords }
  | { kind: 'inside';   coords: Coords; distance: number; radius: number }
  | { kind: 'outside';  coords: Coords; distance: number; radius: number }
  | { kind: 'error';    message: string };

// ── screen ─────────────────────────────────────────────────────────────
export default function CheckOutScreen({ navigation }: Props) {
  const [stage, setStage]       = useState<Stage>('idle');
  const [result, setResult]     = useState<AttendanceDto | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [cfg, setCfg]           = useState<OrgConfig | null>(null);
  const [openSession, setOpen]  = useState<Attendance | null>(null);
  const [fence, setFence]       = useState<FenceState>({ kind: 'loading' });
  const [now, setNow]           = useState(() => new Date());
  const [tick, setTick]         = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const busy = stage !== 'idle';

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pulse animation
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

  // Open-session elapsed ticker (every 30s)
  useEffect(() => {
    if (!openSession) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [openSession]);

  const refresh = useCallback(async () => {
    setFence({ kind: 'loading' });
    setError(null);

    let c: OrgConfig | null = cfg;
    try {
      if (!c) c = await api.get<OrgConfig>('/config');
      setCfg(c);
    } catch { /* non-fatal */ }
    try {
      const summary = await api.get<TodaySummary>('/attendance/today/summary');
      setOpen(summary.log?.find((r) => !r.checkOutAt) ?? null);
    } catch {
      setOpen(null);
    }

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
    if (!c || c.geofenceLat == null || c.geofenceLng == null || c.geofenceRadiusM == null) {
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

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }, [refresh]);

  // Elapsed label re-runs on each tick (and every 30s while shift open)
  const elapsedLabel = useMemo(() => {
    if (!openSession?.checkInAt) return '—';
    return durationStr(openSession.checkInAt, Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSession, tick]);

  async function go() {
    setError(null); setResult(null);
    setStage('locating');
    let coords: Coords;
    try {
      coords = await getCurrentCoords();
    } catch (e) {
      setError(
        e instanceof LocationError ? e.message
      : e instanceof Error          ? e.message
      :                                "Couldn't read your location.",
      );
      setStage('idle');
      return;
    }
    setStage('submitting');
    try {
      const res = await api.post<AttendanceDto>('/attendance/checkout', coords);
      setResult(res);
      setOpen(null);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409 || e.status === 404) {
          setError(e.message || "You don't have an open shift to close. Check in first.");
        } else if (e.status === 401) {
          setError('Your session has expired. Please sign in again.');
        } else {
          setError(e.message);
        }
      } else if (e instanceof Error) setError(e.message);
      else                            setError("Couldn't record your check-out. Please try again.");
    } finally {
      setStage('idle');
    }
  }

  const canCheckOut = !!openSession && !busy;

  // Derived states
  const isInside  = fence.kind === 'inside' || fence.kind === 'no-fence';
  const isOutside = fence.kind === 'outside';
  const isError   = fence.kind === 'error';

  const distanceText =
    fence.kind === 'inside' || fence.kind === 'outside' ? fmtDistance(fence.distance) :
    fence.kind === 'no-fence' ? '0 m' : '—';
  const radiusText =
    fence.kind === 'inside' || fence.kind === 'outside' ? fmtDistance(fence.radius) :
    cfg?.geofenceRadiusM ? fmtDistance(cfg.geofenceRadiusM) : '—';

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
              <Text style={s.heroTitle}>Attendance check-out</Text>
              <Text style={s.heroDate}>{fmtDate(now)}</Text>
            </View>
            <View style={s.clockPill}>
              <Text style={s.clockPillText}>{fmtClock(now)}</Text>
            </View>
          </View>

          {/* On-shift big number */}
          <View style={s.heroBigRow}>
            <View>
              <Text style={s.heroEyebrow}>{openSession ? 'ON SHIFT FOR' : 'NO OPEN SHIFT'}</Text>
              <Text style={s.heroBig}>{openSession ? elapsedLabel : '—'}</Text>
              <Text style={s.heroBigSub}>
                {openSession
                  ? `Started at ${fmtTime12(openSession.checkInAt)}`
                  : 'Check in first to start a shift'}
              </Text>
            </View>
            <Pressable
              onPress={refresh}
              android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 18 }}
              style={s.refreshChipBig}
            >
              <Text style={s.refreshChipText}>⟳</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Navy status card overlapping hero ──────────────── */}
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
                <Text style={s.metricK}>Shift</Text>
                <Text style={[s.metricBig, { color: '#fff', fontSize: 14 }]} numberOfLines={1}>
                  {openSession ? 'OPEN' : 'CLOSED'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Body ──────────────────────────────────────────── */}
        <View style={s.body}>
          {/* Mini-map */}
          <View style={s.mapCard}>
            <MiniMap fence={fence} />
          </View>

          {/* Action button */}
          <Pressable
            onPress={go}
            disabled={!canCheckOut}
            android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
            style={({ pressed }) => [
              s.actionBtn,
              {
                backgroundColor: canCheckOut ? colors.info : '#94a3b8',
                opacity: !canCheckOut ? 0.85 : 1,
              },
              pressed && canCheckOut && { transform: [{ translateY: 1 }] },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.actionBtnText}>
                {stage === 'locating'   ? '◴  Capturing location…' :
                 stage === 'submitting' ? '⟳  Closing your shift…' :
                 !openSession           ? '✕  No open shift to close' :
                                           '↩  Check out now'}
              </Text>
            )}
          </Pressable>

          {/* Outside warning */}
          {isOutside && openSession && (
            <View style={s.warnBanner}>
              <Text style={s.warnIcon}>⚠</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.warnTitle}>You're outside office premises</Text>
                <Text style={s.warnBody}>
                  The server will reject this check-out. Move within {fmtDistance(fence.radius)} of the work site.
                </Text>
              </View>
            </View>
          )}

          {/* Success — with shift-aware overtime / early-checkout indicators */}
          {result?.checkOutAt && (
            <View style={[s.card, { backgroundColor: '#ecfeff', borderColor: '#bae6fd' }]}>
              <View style={s.cardHead}>
                <View>
                  <Text style={[s.cardEyebrow, { color: colors.info700 }]}>SHIFT CLOSED</Text>
                  <Text style={s.cardTitle}>
                    {(result.overtimeMinutes ?? 0) > 0
                      ? `Overtime: ${Math.round((result.overtimeMinutes ?? 0) / 60 * 10) / 10}h`
                      : (result.earlyCheckoutMinutes ?? 0) > 0
                        ? `Left early by ${result.earlyCheckoutMinutes}m`
                        : 'Have a good rest'}
                  </Text>
                </View>
                <View style={[
                  s.tagPill,
                  (result.overtimeMinutes ?? 0) > 0 ? { backgroundColor: '#fef3c7' } :
                  (result.earlyCheckoutMinutes ?? 0) > 0 ? { backgroundColor: '#fee2e2' } :
                                                          { backgroundColor: colors.info50 },
                ]}>
                  <Text style={[
                    s.tagPillText,
                    (result.overtimeMinutes ?? 0) > 0 ? { color: '#b45309' } :
                    (result.earlyCheckoutMinutes ?? 0) > 0 ? { color: '#b91c1c' } :
                                                            { color: colors.info700 },
                  ]}>
                    {(result.overtimeMinutes ?? 0) > 0 ? 'OVERTIME' :
                     (result.earlyCheckoutMinutes ?? 0) > 0 ? 'EARLY' : 'CLOSED'}
                  </Text>
                </View>
              </View>
              <View style={s.kvRow}>
                <Text style={s.kvK}>Started</Text>
                <Text style={s.kvV}>{fmtTime12(result.checkInAt)}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.kvRow}>
                <Text style={s.kvK}>Ended</Text>
                <Text style={s.kvV}>{fmtTime12(result.checkOutAt)}</Text>
              </View>
              {result.expectedCheckOutAt && (
                <>
                  <View style={s.divider} />
                  <View style={s.kvRow}>
                    <Text style={s.kvK}>Expected end</Text>
                    <Text style={s.kvV}>{fmtTime12(result.expectedCheckOutAt)}</Text>
                  </View>
                </>
              )}
              <View style={s.divider} />
              <View style={s.kvRow}>
                <Text style={s.kvK}>Duration</Text>
                <Text style={[s.kvV, { color: colors.info700, fontVariant: ['tabular-nums'] }]}>
                  {durationStr(result.checkInAt, result.checkOutAt)}
                </Text>
              </View>
              {(result.overtimeMinutes ?? 0) > 0 && (
                <>
                  <View style={s.divider} />
                  <View style={s.kvRow}>
                    <Text style={s.kvK}>Overtime</Text>
                    <Text style={[s.kvV, { color: '#b45309', fontVariant: ['tabular-nums'] }]}>
                      {Math.floor((result.overtimeMinutes ?? 0) / 60)}h {(result.overtimeMinutes ?? 0) % 60}m
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Error */}
          {error && (
            <View style={[s.card, { backgroundColor: colors.danger50, borderColor: '#fecaca' }]}>
              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                <Text style={[s.warnIcon, { color: colors.danger700 }]}>⚠</Text>
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Text style={[s.warnBody, { color: colors.danger700 }]}>{error}</Text>
                  <Pressable
                    onPress={go}
                    disabled={busy}
                    android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                    style={({ pressed }) => [
                      s.retryBtn,
                      pressed && { opacity: 0.7 },
                      busy && { opacity: 0.5 },
                    ]}
                  >
                    <Text style={s.retryText}>Try again</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {/* Motivational strip */}
          <View style={s.motivStrip}>
            <View style={s.motivStripBlob} pointerEvents="none" />
            <View style={s.motivIcon}>
              <Text style={s.motivIconText}>✦</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.motivTitle}>
                {openSession ? 'Wrapping up?' : 'See you tomorrow'}
              </Text>
              <Text style={s.motivSub}>
                {openSession
                  ? 'Tap the button above to close your shift safely.'
                  : 'Your hours are saved. Have a great evening.'}
              </Text>
            </View>
          </View>

          {/* Footer */}
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

// ── Mini-map (same as CheckIn) ─────────────────────────────────────────
function MiniMap({ fence }: { fence: FenceState }) {
  const fenceR = 64;
  let userOffset = { dx: 0, dy: 0 };
  let userVisible = false;
  let isInside = false;
  let isOutside = false;
  if (fence.kind === 'inside' || fence.kind === 'outside') {
    const ratio = Math.min(1.35, fence.distance / Math.max(1, fence.radius));
    userOffset = { dx: ratio * (fenceR - 6), dy: -ratio * 14 };
    userVisible = true;
    isInside = fence.kind === 'inside';
    isOutside = fence.kind === 'outside';
  }
  return (
    <View style={m.frame}>
      <View style={[m.gridH, { top: 50 }]} />
      <View style={[m.gridH, { top: 110 }]} />
      <View style={[m.gridV, { left: 70 }]} />
      <View style={[m.gridV, { left: 200 }]} />
      <View style={m.road} />
      <View style={[m.block, { width: 50, height: 20, top: 20, left: 20 }]} />
      <View style={[m.block, { width: 60, height: 32, top: 130, left: 100 }]} />
      <View style={[m.block, { width: 60, height: 22, top: 20, right: 30 }]} />
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
      <View style={m.officeMarker}><Text style={m.officeMarkerText}>⬢</Text></View>
      {userVisible && (
        <View style={[m.userWrap, { transform: [{ translateX: userOffset.dx }, { translateY: userOffset.dy }] }]}>
          <View style={[m.userPulse, { backgroundColor: isInside ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)' }]} />
          <View style={[m.userDot, { backgroundColor: isInside ? colors.success : colors.danger }]} />
        </View>
      )}
      <View style={m.attrib}><Text style={m.attribText}>Map preview</Text></View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

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

  heroBigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.lg,
  },
  heroEyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  heroBig: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -0.6, marginTop: 4, fontVariant: ['tabular-nums'] },
  heroBigSub: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 2 },
  refreshChipBig: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  refreshChipText: { color: '#fff', fontSize: 18, fontWeight: '800' },

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
  gpsAnim: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  gpsPulse: { position: 'absolute', width: 56, height: 56, borderRadius: 28 },
  gpsCore: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
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

  statusDivider: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 14 },
  statusMetricsRow: { flexDirection: 'row', gap: 8 },
  metricK: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  metricBig: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },

  body: { paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.md },

  mapCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 0.5, borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },

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
  tagPill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  tagPillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },

  actionBtn: {
    height: 54, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.blue,
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },

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

  retryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.danger700,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  retryText: { color: colors.danger700, fontWeight: '800', fontSize: 13 },

  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },
  kvK: { fontSize: 12.5, color: colors.textMuted },
  kvV: { fontSize: 13, fontWeight: '700', color: colors.text },
  divider: { height: 0.5, backgroundColor: colors.border },

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

  footerRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerDot: { width: 6, height: 6, borderRadius: 3 },
  footerText: { fontSize: 11.5, color: colors.textMuted, fontWeight: '600' },
});

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
  gridH: { position: 'absolute', left: 0, right: 0, height: 0.8, backgroundColor: '#d6dde7', opacity: 0.6 },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 0.8, backgroundColor: '#d6dde7', opacity: 0.6 },
  road:  { position: 'absolute', top: 80, left: 0, right: 0, height: 6, backgroundColor: '#cdd6e2' },
  block: { position: 'absolute', backgroundColor: '#dde4ee', borderRadius: 2 },
  fence: {
    position: 'absolute', top: '50%', left: '50%',
    borderRadius: 9999, borderWidth: 1.3, borderStyle: 'dashed',
  },
  officeMarker: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    position: 'absolute', top: '50%', left: '50%',
    marginTop: -14, marginLeft: -14,
    ...shadow.blue,
  },
  officeMarkerText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  userWrap: {
    position: 'absolute', top: '50%', left: '50%',
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
    marginTop: -14, marginLeft: -14,
  },
  userPulse: { position: 'absolute', width: 32, height: 32, borderRadius: 16 },
  userDot:   { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#fff' },
  attrib: {
    position: 'absolute', bottom: 6, right: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  attribText: { fontSize: 9, color: colors.textMuted, fontWeight: '700' },
});
