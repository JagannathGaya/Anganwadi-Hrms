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

import { api, DayEntry, DayState, MonthAttendance } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, shadow, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Attendance'>;

// ── small helpers ──────────────────────────────────────────────────────
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
};
const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return monthKey(new Date(y, m - 2, 1));
};
const nextMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return monthKey(new Date(y, m, 1));
};
const isFutureMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const target = new Date(y, m - 1, 1);
  const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  return target > thisMonth;
};

// State → palette for the calendar cells
const STATE_PALETTE: Record<DayState, { bg: string; fg: string; label: string }> = {
  PRESENT:  { bg: '#d1fae5', fg: '#047857', label: 'Present' },
  PARTIAL:  { bg: '#fef3c7', fg: '#b45309', label: 'Partial' },
  ABSENT:   { bg: '#fee2e2', fg: '#b91c1c', label: 'Absent' },
  LEAVE:    { bg: '#dbeafe', fg: '#1e40af', label: 'Leave' },
  HOLIDAY:  { bg: '#e7edfa', fg: '#1e3a8a', label: 'Holiday' },
  WEEKEND:  { bg: '#f1f5f9', fg: '#64748b', label: 'Weekend' },
  FUTURE:   { bg: '#ffffff', fg: '#cbd5e1', label: 'Future' },
};

// ── screen ─────────────────────────────────────────────────────────────
export default function AttendanceScreen({ navigation }: Props) {
  const [month, setMonth]     = useState<string>(monthKey(new Date()));
  const [data, setData]       = useState<MonthAttendance | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (ym: string) => {
    setLoading(true);
    try {
      const res = await api.get<MonthAttendance>(`/attendance/month?month=${ym}`);
      setData(res);
      // Auto-select today if it's in this month, otherwise pick the first present day
      const today = new Date().toISOString().slice(0, 10);
      const todayInMonth = res.days.find((d) => d.date === today);
      if (todayInMonth) setSelectedDate(today);
      else {
        const firstActual = res.days.find((d) => d.state !== 'FUTURE');
        setSelectedDate(firstActual?.date ?? null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(month); }, [load, month]));

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(month); } finally { setRefreshing(false); }
  }, [load, month]);

  const selectedDay = useMemo(
    () => data?.days.find((d) => d.date === selectedDate) ?? null,
    [data, selectedDate],
  );

  // Build a 6x7 grid (with leading blanks for the first-day-of-week offset)
  const grid = useMemo(() => {
    if (!data) return [] as (DayEntry | null)[];
    const first = new Date(data.days[0].date);
    const leading = first.getDay(); // 0=Sun
    const cells: (DayEntry | null)[] = [];
    for (let i = 0; i < leading; i++) cells.push(null);
    cells.push(...data.days);
    // pad to multiple of 7 so the last row is complete
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [data]);

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
        {/* ── Navy hero with month selector ─────────────────────── */}
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
              <Text style={s.heroTitle}>Attendance</Text>
              <Text style={s.heroSub}>Calendar & history</Text>
            </View>
            <View style={s.iconBtn} />
          </View>

          {/* Month switcher */}
          <View style={s.monthSwitch}>
            <Pressable
              onPress={() => setMonth(prevMonth(month))}
              hitSlop={6}
              android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 18 }}
              style={s.monthArrow}
            >
              <Text style={s.monthArrowText}>‹</Text>
            </Pressable>
            <Text style={s.monthLabel}>{monthLabel(month)}</Text>
            <Pressable
              onPress={() => setMonth(nextMonth(month))}
              disabled={isFutureMonth(nextMonth(month))}
              hitSlop={6}
              android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 18 }}
              style={[s.monthArrow, isFutureMonth(nextMonth(month)) && { opacity: 0.35 }]}
            >
              <Text style={s.monthArrowText}>›</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Stats summary card overlapping the hero ──────────── */}
        <View style={s.statsWrap}>
          <View style={s.statsCard}>
            <View style={s.statsRow}>
              <StatTile tone="green"  value={data?.presentDays ?? 0} label="Present" />
              <StatTile tone="amber"  value={data?.lateDays ?? 0}    label="Late" />
              <StatTile tone="red"    value={data?.absentDays ?? 0}  label="Absent" />
              <StatTile tone="navy"   value={data?.leaveDays ?? 0}   label="Leave" />
            </View>
            <View style={s.statsDivider} />
            <View style={s.statsBottomRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.bigK}>WORKED</Text>
                <Text style={s.bigV}>
                  {Number(data?.totalHours ?? 0).toFixed(1)}<Text style={s.bigUnit}>h</Text>
                </Text>
              </View>
              <View style={s.statsVertDiv} />
              <View style={{ flex: 1 }}>
                <Text style={s.bigK}>TARGET</Text>
                <Text style={s.bigV}>
                  {Number(data?.expectedHours ?? 0).toFixed(1)}<Text style={s.bigUnit}>h</Text>
                </Text>
              </View>
              <View style={s.statsVertDiv} />
              <View style={{ flex: 1 }}>
                <Text style={s.bigK}>OVERTIME</Text>
                <Text style={[s.bigV, (data?.overtimeMinutes ?? 0) > 0 && { color: '#b45309' }]}>
                  {Math.floor((data?.overtimeMinutes ?? 0) / 60)}
                  <Text style={s.bigUnit}>h </Text>
                  {(data?.overtimeMinutes ?? 0) % 60}
                  <Text style={s.bigUnit}>m</Text>
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Calendar card ────────────────────────────────────── */}
        <View style={s.body}>
          <View style={s.card}>
            {loading && !data ? (
              <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <>
                <View style={s.weekdayRow}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <View key={i} style={s.weekdayCell}>
                      <Text style={s.weekdayText}>{d}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.calendarGrid}>
                  {grid.map((cell, i) => {
                    if (!cell) {
                      return <View key={i} style={s.dayCell} />;
                    }
                    const palette = STATE_PALETTE[cell.state];
                    const isSelected = cell.date === selectedDate;
                    const day = new Date(cell.date).getDate();
                    return (
                      <Pressable
                        key={i}
                        onPress={() => setSelectedDate(cell.date)}
                        android_ripple={{ color: 'rgba(0,0,0,0.04)', borderless: true, radius: 22 }}
                        style={[
                          s.dayCell,
                          { backgroundColor: palette.bg },
                          isSelected && s.dayCellSelected,
                          cell.state === 'FUTURE' && s.dayCellFuture,
                        ]}
                      >
                        <Text style={[
                          s.dayNum,
                          { color: palette.fg },
                          isSelected && { color: '#fff', fontWeight: '800' },
                        ]}>
                          {day}
                        </Text>
                        {(cell.lateMinutes != null && cell.lateMinutes > 5) && (
                          <View style={s.dayLateDot} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {/* Legend */}
                <View style={s.legendRow}>
                  {(['PRESENT', 'PARTIAL', 'ABSENT', 'LEAVE', 'HOLIDAY'] as DayState[]).map((k) => (
                    <View key={k} style={s.legendItem}>
                      <View style={[s.legendSwatch, { backgroundColor: STATE_PALETTE[k].bg, borderColor: STATE_PALETTE[k].fg }]} />
                      <Text style={s.legendText}>{STATE_PALETTE[k].label}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>

          {/* ── Selected day detail ──────────────────────────── */}
          {selectedDay && (
            <View style={s.card}>
              <View style={s.detailHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardEyebrow}>SELECTED DAY</Text>
                  <Text style={s.detailTitle}>
                    {new Date(selectedDay.date).toLocaleDateString('en-IN', {
                      weekday: 'long', day: '2-digit', month: 'long',
                    })}
                  </Text>
                  {selectedDay.note ? (
                    <Text style={s.detailNote}>{selectedDay.note}</Text>
                  ) : null}
                </View>
                <View style={[
                  s.tagPill,
                  { backgroundColor: STATE_PALETTE[selectedDay.state].bg },
                ]}>
                  <Text style={[s.tagPillText, { color: STATE_PALETTE[selectedDay.state].fg }]}>
                    {STATE_PALETTE[selectedDay.state].label.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={s.kvBlockRow}>
                <View style={s.kvCol}>
                  <Text style={s.kvK}>WORKED</Text>
                  <Text style={s.kvV}>
                    {Number(selectedDay.workedHours).toFixed(2)}<Text style={s.kvUnit}>h</Text>
                  </Text>
                </View>
                <View style={s.kvCol}>
                  <Text style={s.kvK}>TARGET</Text>
                  <Text style={s.kvV}>
                    {Number(selectedDay.expectedHours).toFixed(2)}<Text style={s.kvUnit}>h</Text>
                  </Text>
                </View>
                <View style={s.kvCol}>
                  <Text style={s.kvK}>SESSIONS</Text>
                  <Text style={s.kvV}>{selectedDay.sessions}</Text>
                </View>
              </View>

              {selectedDay.firstCheckInAt && (
                <View style={s.detailRow}>
                  <Text style={s.detailRowK}>First check-in</Text>
                  <Text style={s.detailRowV}>{selectedDay.firstCheckInAt}</Text>
                </View>
              )}
              {selectedDay.lastCheckOutAt && (
                <View style={s.detailRow}>
                  <Text style={s.detailRowK}>Last check-out</Text>
                  <Text style={s.detailRowV}>{selectedDay.lastCheckOutAt}</Text>
                </View>
              )}
              {selectedDay.lateMinutes != null && selectedDay.lateMinutes > 5 && (
                <View style={s.detailRow}>
                  <Text style={s.detailRowK}>Late by</Text>
                  <Text style={[s.detailRowV, { color: '#b45309' }]}>
                    {selectedDay.lateMinutes}m
                  </Text>
                </View>
              )}
              {selectedDay.lateMinutes != null && selectedDay.lateMinutes < -1 && (
                <View style={s.detailRow}>
                  <Text style={s.detailRowK}>Early by</Text>
                  <Text style={[s.detailRowV, { color: '#1e40af' }]}>
                    {Math.abs(selectedDay.lateMinutes)}m
                  </Text>
                </View>
              )}
              {selectedDay.overtimeMinutes != null && selectedDay.overtimeMinutes > 0 && (
                <View style={s.detailRow}>
                  <Text style={s.detailRowK}>Overtime</Text>
                  <Text style={[s.detailRowV, { color: '#b45309' }]}>
                    {Math.floor(selectedDay.overtimeMinutes / 60)}h {selectedDay.overtimeMinutes % 60}m
                  </Text>
                </View>
              )}

              {selectedDay.state === 'ABSENT' && (
                <View style={s.emptyHint}>
                  <Text style={s.emptyHintTitle}>No attendance recorded</Text>
                  <Text style={s.emptyHintSub}>Apply for leave if this was time off.</Text>
                </View>
              )}
              {selectedDay.state === 'FUTURE' && (
                <View style={s.emptyHint}>
                  <Text style={s.emptyHintTitle}>Hasn't happened yet</Text>
                  <Text style={s.emptyHintSub}>Check back after this date.</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ tone, value, label }: { tone: 'green' | 'amber' | 'red' | 'navy'; value: number; label: string }) {
  const palette =
    tone === 'green' ? { bg: '#d1fae5', fg: '#047857' } :
    tone === 'amber' ? { bg: '#fef3c7', fg: '#b45309' } :
    tone === 'red'   ? { bg: '#fee2e2', fg: '#b91c1c' } :
                       { bg: '#e7edfa', fg: '#1e3a8a' };
  return (
    <View style={[s.statTile, { backgroundColor: palette.bg }]}>
      <Text style={[s.statValue, { color: palette.fg }]}>{value}</Text>
      <Text style={[s.statLabel, { color: palette.fg }]}>{label}</Text>
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
    paddingBottom: 90,
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
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  monthArrow: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  monthArrowText: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: -2 },
  monthLabel: {
    color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.3,
    minWidth: 170, textAlign: 'center',
  },

  // Stats card (overlapping)
  statsWrap: { marginTop: -72, paddingHorizontal: spacing.lg },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md,
    ...shadow.card,
  },
  statsRow: { flexDirection: 'row', gap: 8 },
  statTile: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'flex-start',
  },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 2 },
  statsDivider: { height: 0.5, backgroundColor: colors.border, marginVertical: spacing.md },
  statsBottomRow: { flexDirection: 'row', alignItems: 'center' },
  statsVertDiv: { width: 0.5, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: 8 },
  bigK: { fontSize: 10, color: colors.textMuted, fontWeight: '800', letterSpacing: 0.6 },
  bigV: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  bigUnit: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

  // Body
  body: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.md,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },

  // Calendar
  weekdayRow: { flexDirection: 'row', marginBottom: 6 },
  weekdayCell: { flex: 1, alignItems: 'center' },
  weekdayText: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.4 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.285%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginVertical: 2,
    position: 'relative',
  },
  dayCellSelected: {
    backgroundColor: colors.primary,
    ...shadow.blue,
  },
  dayCellFuture: { borderWidth: 0.5, borderColor: colors.border },
  dayNum: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dayLateDot: {
    position: 'absolute',
    bottom: 5,
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#b45309',
  },

  // Legend
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    gap: 8,
    justifyContent: 'space-between',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 12, height: 12, borderRadius: 4, borderWidth: 1 },
  legendText: { fontSize: 10.5, fontWeight: '600', color: colors.textMuted },

  // Card eyebrow
  cardEyebrow: { fontSize: 10.5, fontWeight: '800', color: colors.primary, letterSpacing: 1.2 },

  // Detail
  detailHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  detailTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 4, letterSpacing: -0.2 },
  detailNote: { fontSize: 12, color: colors.textMuted, marginTop: 4, fontStyle: 'italic' },

  tagPill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  tagPillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },

  kvBlockRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
  },
  kvCol: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: 10,
    padding: 10,
  },
  kvK: { fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  kvV: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 2, fontVariant: ['tabular-nums'] },
  kvUnit: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  detailRowK: { fontSize: 12.5, color: colors.textMuted },
  detailRowV: { fontSize: 13, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },

  emptyHint: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 4,
    backgroundColor: colors.surface2,
    borderRadius: 12,
    marginTop: spacing.sm,
  },
  emptyHintTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  emptyHintSub: { fontSize: 11.5, color: colors.textMuted, textAlign: 'center' },
});
