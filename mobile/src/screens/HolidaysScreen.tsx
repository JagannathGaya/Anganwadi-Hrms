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

import { api, Holiday } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, shadow, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Holidays'>;

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const monthName = (s: string) =>
  new Date(s).toLocaleString('en-IN', { month: 'short' }).toUpperCase();
const dayNum = (s: string) => new Date(s).getDate();
const weekdayName = (s: string, fallback?: string) =>
  fallback || new Date(s).toLocaleString('en-IN', { weekday: 'long' });

const relative = (daysUntil: number) =>
  daysUntil === 0  ? 'Today'
: daysUntil === 1  ? 'Tomorrow'
: daysUntil === -1 ? 'Yesterday'
: daysUntil > 1    ? `In ${daysUntil} days`
: `${Math.abs(daysUntil)} days ago`;

export default function HolidaysScreen({ navigation }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear]       = useState<number>(currentYear);
  const [items, setItems]     = useState<Holiday[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (y: number) => {
    try {
      const list = await api.get<Holiday[]>(`/holidays?year=${y}`);
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(year); }, [year, load]);

  // Group by upcoming vs past
  const { upcoming, past, nextHoliday } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sorted = (items ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const upcoming = sorted.filter((h) => new Date(h.date) >= today);
    const past = sorted.filter((h) => new Date(h.date) < today).reverse();
    return { upcoming, past, nextHoliday: upcoming[0] ?? null };
  }, [items]);

  // Group upcoming by month for nicer scanning
  const upcomingByMonth = useMemo(() => {
    const out: { month: string; items: Holiday[] }[] = [];
    let current: { month: string; items: Holiday[] } | null = null;
    for (const h of upcoming) {
      const m = monthName(h.date);
      if (!current || current.month !== m) {
        current = { month: m, items: [] };
        out.push(current);
      }
      current.items.push(h);
    }
    return out;
  }, [upcoming]);

  // Year switcher: allow current year ± 1
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl + spacing.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(year); }}
            tintColor={colors.primary}
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
              <Text style={s.heroTitle}>Holidays</Text>
              <Text style={s.heroSub}>{year} calendar</Text>
            </View>
            <View style={s.iconBtn} />
          </View>

          {/* Next holiday spotlight */}
          {nextHoliday ? (
            <View style={s.heroBody}>
              <Text style={s.heroEyebrow}>NEXT HOLIDAY</Text>
              <Text style={s.heroBig}>{nextHoliday.name}</Text>
              <Text style={s.heroCaption}>
                {weekdayName(nextHoliday.date, nextHoliday.weekday)}  ·  {fmtDate(nextHoliday.date)}
              </Text>
              <View style={s.countdownPill}>
                <Text style={s.countdownDot}>●</Text>
                <Text style={s.countdownText}>
                  {relative(nextHoliday.daysUntil ?? 0)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={s.heroBody}>
              <Text style={s.heroEyebrow}>{year}</Text>
              <Text style={s.heroBig}>No holidays ahead</Text>
              <Text style={s.heroCaption}>Check back later or switch the year below.</Text>
            </View>
          )}
        </View>

        {/* ── Year switcher chips ──────────────────────────────── */}
        <View style={s.yearRow}>
          {years.map((y) => {
            const isActive = year === y;
            return (
              <Pressable
                key={y}
                onPress={() => setYear(y)}
                android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                style={[s.yearChip, isActive && s.yearChipActive]}
              >
                <Text style={[s.yearChipText, isActive && s.yearChipTextActive]}>
                  {y}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Stats card ───────────────────────────────────────── */}
        <View style={s.body}>
          <View style={s.statRow}>
            <View style={[s.statTile, { backgroundColor: '#d1fae5' }]}>
              <Text style={[s.statValue, { color: '#047857' }]}>{upcoming.length}</Text>
              <Text style={[s.statLabel, { color: '#047857' }]}>Upcoming</Text>
            </View>
            <View style={[s.statTile, { backgroundColor: '#f1f5f9' }]}>
              <Text style={[s.statValue, { color: '#475569' }]}>{past.length}</Text>
              <Text style={[s.statLabel, { color: '#475569' }]}>Past</Text>
            </View>
            <View style={[s.statTile, { backgroundColor: '#e7edfa' }]}>
              <Text style={[s.statValue, { color: '#1e3a8a' }]}>{items?.length ?? 0}</Text>
              <Text style={[s.statLabel, { color: '#1e3a8a' }]}>Total {year}</Text>
            </View>
          </View>

          {items === null ? (
            <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <>
              {/* ── Upcoming, grouped by month ─────────────── */}
              {upcomingByMonth.length > 0 && (
                <>
                  <View style={s.sectionRow}>
                    <Text style={s.sectionLead}>Upcoming</Text>
                    <Text style={s.sectionCount}>{upcoming.length} {upcoming.length === 1 ? 'holiday' : 'holidays'}</Text>
                  </View>
                  {upcomingByMonth.map((group) => (
                    <View key={group.month} style={{ gap: spacing.sm }}>
                      <Text style={s.monthLabel}>{group.month}</Text>
                      {group.items.map((h) => <Row key={h.id} h={h} />)}
                    </View>
                  ))}
                </>
              )}

              {/* ── Past ───────────────────────────────────── */}
              {past.length > 0 && (
                <>
                  <View style={[s.sectionRow, { marginTop: spacing.lg }]}>
                    <Text style={s.sectionLead}>Past holidays</Text>
                    <Text style={s.sectionCount}>{past.length}</Text>
                  </View>
                  {past.map((h) => <Row key={h.id} h={h} muted />)}
                </>
              )}

              {(upcoming.length === 0 && past.length === 0) && (
                <View style={s.empty}>
                  <Text style={s.emptyIcon}>◴</Text>
                  <Text style={s.emptyTitle}>No holidays for {year}</Text>
                  <Text style={s.emptySub}>
                    Try a different year or ask your admin to add holidays.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ h, muted }: { h: Holiday; muted?: boolean }) {
  const daysUntil = h.daysUntil ?? 0;
  return (
    <View style={[s.row, muted && { opacity: 0.7 }]}>
      <View style={s.dateChip}>
        <Text style={s.dateChipMonth}>{monthName(h.date)}</Text>
        <Text style={s.dateChipDay}>{dayNum(h.date)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{h.name}</Text>
        <Text style={s.rowSub}>
          {weekdayName(h.date, h.weekday)}  ·  {fmtDate(h.date)}
        </Text>
      </View>
      {h.upcoming && (
        <View style={[
          s.relPill,
          daysUntil <= 7 && { backgroundColor: '#d1fae5' },
        ]}>
          <Text style={[
            s.relPillText,
            daysUntil <= 7 && { color: '#047857' },
          ]}>
            {relative(daysUntil)}
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Hero
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 24,
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

  heroBody: { marginTop: spacing.lg, alignItems: 'flex-start' },
  heroEyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2 },
  heroBig: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 4 },
  heroCaption: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },
  countdownPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(110,231,183,0.18)',
    borderWidth: 0.5, borderColor: 'rgba(110,231,183,0.35)',
    marginTop: 10,
  },
  countdownDot: { color: '#6ee7b7', fontSize: 8 },
  countdownText: { color: '#6ee7b7', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.4 },

  // Year chips
  yearRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: 8,
  },
  yearChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 0.5, borderColor: colors.border,
    alignItems: 'center',
  },
  yearChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...shadow.blue,
  },
  yearChipText: { fontSize: 13, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  yearChipTextActive: { color: '#fff' },

  // Body
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },

  // Stat row
  statRow: { flexDirection: 'row', gap: 8 },
  statTile: {
    flex: 1, borderRadius: 12, padding: 12,
    alignItems: 'flex-start',
  },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 2 },

  // Section header
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: spacing.sm,
  },
  sectionLead: { fontSize: 13, fontWeight: '800', color: colors.text, letterSpacing: -0.1 },
  sectionCount: { fontSize: 11.5, color: colors.textMuted, fontWeight: '700' },
  monthLabel: {
    fontSize: 10.5, fontWeight: '800', color: colors.textMuted, letterSpacing: 1.2,
    marginLeft: 2, marginTop: 6,
  },

  // Holiday row
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.md,
    ...shadow.card,
  },
  dateChip: {
    width: 60, height: 60,
    borderRadius: 14,
    backgroundColor: colors.primary50,
    alignItems: 'center', justifyContent: 'center',
  },
  dateChipMonth: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  dateChipDay: { color: colors.primary, fontSize: 24, fontWeight: '800', marginTop: -2, letterSpacing: -0.5 },
  rowTitle: { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  relPill: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surface2,
  },
  relPillText: { fontSize: 10.5, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.3 },

  // Empty state
  empty: {
    alignItems: 'center', padding: spacing.xl,
    gap: 6, marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 0.5, borderColor: colors.border,
    ...shadow.card,
  },
  emptyIcon: { fontSize: 32, color: colors.textSoft, marginBottom: spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  emptySub: { fontSize: 12.5, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
