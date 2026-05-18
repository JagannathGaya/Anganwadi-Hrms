import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { api, ApiError, LeaveBalance, LeaveDetail, LeaveStatus } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, shadow, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Leaves'>;

// ── helpers ────────────────────────────────────────────────────────────
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateShort = (s: string) =>
  new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const STATUS_PALETTE: Record<LeaveStatus, { bg: string; fg: string; dot: string; label: string }> = {
  PENDING:   { bg: '#fef3c7', fg: '#b45309', dot: '#f59e0b', label: 'Pending'   },
  APPROVED:  { bg: '#d1fae5', fg: '#047857', dot: '#10b981', label: 'Approved'  },
  REJECTED:  { bg: '#fee2e2', fg: '#b91c1c', dot: '#ef4444', label: 'Rejected'  },
  CANCELLED: { bg: '#f1f5f9', fg: '#475569', dot: '#94a3b8', label: 'Cancelled' },
};

type Filter = 'ALL' | LeaveStatus;
const FILTER_ORDER: Filter[] = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

// ── screen ─────────────────────────────────────────────────────────────
export default function LeavesScreen({ navigation }: Props) {
  const [items, setItems]       = useState<LeaveDetail[] | null>(null);
  const [balance, setBalance]   = useState<LeaveBalance | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]     = useState<Filter>('ALL');
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, bal] = await Promise.all([
        api.get<LeaveDetail[]>('/leaves'),
        api.get<LeaveBalance>('/leaves/balance'),
      ]);
      setItems(list);
      setBalance(bal);
    } catch {
      setItems([]);
      setBalance(null);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filtered = useMemo(() => {
    if (!items) return null;
    if (filter === 'ALL') return items;
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  // Counts for the filter chips
  const counts = useMemo(() => {
    const c = { ALL: items?.length ?? 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 } as Record<Filter, number>;
    items?.forEach((i) => { c[i.status]++; });
    return c;
  }, [items]);

  async function onCancel(lr: LeaveDetail) {
    Alert.alert(
      'Cancel leave?',
      `Cancel your request for ${fmtDate(lr.fromDate)}${lr.fromDate !== lr.toDate ? ` → ${fmtDate(lr.toDate)}` : ''}? This can't be undone.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel leave', style: 'destructive',
          onPress: async () => {
            setCancellingId(lr.id);
            try {
              await api.post(`/leaves/${lr.id}/cancel`);
              await load();
            } catch (e) {
              const msg = e instanceof ApiError ? e.message
                        : e instanceof Error    ? e.message
                                                : 'Cancel failed';
              Alert.alert('Could not cancel', msg);
            } finally {
              setCancellingId(null);
            }
          },
        },
      ],
    );
  }

  const balanceUsedPct =
    balance && balance.quota > 0
      ? Math.min(100, ((balance.approvedDays + balance.pendingDays) / balance.quota) * 100)
      : 0;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl + spacing.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(); }}
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
              <Text style={s.heroTitle}>My leaves</Text>
              <Text style={s.heroSub}>{balance ? `${balance.year} balance` : 'Track your requests'}</Text>
            </View>
            <View style={s.iconBtn} />
          </View>

          {/* Balance big number */}
          {balance && (
            <View style={s.balanceBlock}>
              <Text style={s.balanceEyebrow}>AVAILABLE LEAVES</Text>
              <Text style={s.balanceBig}>
                {balance.availableDays}
                <Text style={s.balanceBigMuted}> / {balance.quota}</Text>
              </Text>
              <View style={s.balanceTrack}>
                <View style={[s.balanceFill, { width: `${balanceUsedPct}%` }]} />
              </View>
              <View style={s.balanceLegend}>
                <View style={s.balLegItem}>
                  <View style={[s.balDot, { backgroundColor: '#6ee7b7' }]} />
                  <Text style={s.balLegText}>{balance.approvedDays} approved</Text>
                </View>
                <View style={s.balLegItem}>
                  <View style={[s.balDot, { backgroundColor: '#fcd34d' }]} />
                  <Text style={s.balLegText}>{balance.pendingDays} pending</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Apply CTA ─────────────────────────────────────────── */}
        <View style={s.applyWrap}>
          <Pressable
            onPress={() => navigation.navigate('ApplyLeave')}
            android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
            style={({ pressed }) => [s.applyBtn, pressed && { transform: [{ translateY: 1 }] }]}
          >
            <Text style={s.applyBtnText}>+   Apply for leave</Text>
          </Pressable>
        </View>

        {/* ── Status filter chips ───────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
        >
          {FILTER_ORDER.map((f) => {
            const isActive = filter === f;
            const label = f === 'ALL' ? 'All' : STATUS_PALETTE[f].label;
            const count = counts[f];
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                style={[
                  s.filterChip,
                  isActive && s.filterChipActive,
                ]}
              >
                <Text style={[s.filterChipText, isActive && s.filterChipTextActive]}>
                  {label}
                </Text>
                <View style={[s.filterCount, isActive && s.filterCountActive]}>
                  <Text style={[s.filterCountText, isActive && s.filterCountTextActive]}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── List ──────────────────────────────────────────────── */}
        <View style={s.body}>
          {items === null ? (
            <View style={{ paddingVertical: spacing.xxxl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : filtered && filtered.length > 0 ? (
            filtered.map((lr) => {
              const p = STATUS_PALETTE[lr.status];
              const isMultiDay = lr.fromDate !== lr.toDate;
              return (
                <View key={lr.id} style={s.leaveCard}>
                  <View style={[s.stripe, { backgroundColor: p.dot }]} />
                  <View style={{ flex: 1, padding: spacing.lg }}>
                    <View style={s.leaveHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.leaveTitle}>
                          {fmtDateShort(lr.fromDate)}{isMultiDay ? ` → ${fmtDateShort(lr.toDate)}` : ''}
                        </Text>
                        <Text style={s.leaveSub}>
                          {lr.days} {lr.days === 1 ? 'day' : 'days'}  ·  applied {fmtDateTime(lr.appliedAt)}
                        </Text>
                      </View>
                      <View style={[s.statusPill, { backgroundColor: p.bg }]}>
                        <View style={[s.statusDot, { backgroundColor: p.dot }]} />
                        <Text style={[s.statusText, { color: p.fg }]}>
                          {p.label.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {lr.reason ? (
                      <Text style={s.reasonText} numberOfLines={3}>
                        "{lr.reason}"
                      </Text>
                    ) : null}

                    {lr.decidedAt && (lr.status === 'APPROVED' || lr.status === 'REJECTED') && (
                      <Text style={s.metaText}>
                        Decided on {fmtDateTime(lr.decidedAt)}
                      </Text>
                    )}

                    {lr.canCancel && (
                      <Pressable
                        onPress={() => onCancel(lr)}
                        disabled={cancellingId === lr.id}
                        android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                        style={({ pressed }) => [
                          s.cancelBtn,
                          (pressed || cancellingId === lr.id) && { opacity: 0.7 },
                        ]}
                      >
                        {cancellingId === lr.id ? (
                          <ActivityIndicator color={colors.danger700} size="small" />
                        ) : (
                          <Text style={s.cancelText}>Cancel request</Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>◴</Text>
              <Text style={s.emptyTitle}>
                {filter === 'ALL' ? 'No leave requests yet' : `No ${STATUS_PALETTE[filter as LeaveStatus].label.toLowerCase()} requests`}
              </Text>
              <Text style={s.emptySub}>
                {filter === 'ALL'
                  ? 'When you apply for leave, your requests show up here with their status.'
                  : 'Switch filters above to see other requests.'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Hero
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 26,
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

  // Balance block inside hero
  balanceBlock: { marginTop: spacing.lg, alignItems: 'flex-start' },
  balanceEyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2 },
  balanceBig: {
    color: '#fff',
    fontSize: 44, fontWeight: '800', letterSpacing: -1.4,
    fontVariant: ['tabular-nums'], marginTop: 4,
  },
  balanceBigMuted: { color: 'rgba(255,255,255,0.55)', fontSize: 20, fontWeight: '700' },
  balanceTrack: {
    width: '100%',
    height: 6, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    marginTop: 8,
  },
  balanceFill: { height: '100%', backgroundColor: '#fff', borderRadius: 999 },
  balanceLegend: { flexDirection: 'row', gap: spacing.md, marginTop: 8 },
  balLegItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balDot: { width: 7, height: 7, borderRadius: 4 },
  balLegText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700' },

  // Apply CTA
  applyWrap: { paddingHorizontal: spacing.lg, marginTop: -spacing.lg },
  applyBtn: {
    backgroundColor: colors.info,           // sky / cyan blue
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
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
  applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  // Filter chips row
  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 0.5, borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  filterChipTextActive: { color: '#fff' },
  filterCount: {
    minWidth: 20, height: 18, borderRadius: 9,
    paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  filterCountText: { fontSize: 10, fontWeight: '800', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  filterCountTextActive: { color: '#fff' },

  // Body
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },

  // Leave card
  leaveCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  stripe: { width: 5, alignSelf: 'stretch' },
  leaveHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  leaveTitle: { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  leaveSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  reasonText: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  metaText: {
    fontSize: 11,
    color: colors.textSoft,
    marginTop: spacing.sm,
  },

  cancelBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.danger700,
    backgroundColor: colors.danger50,
  },
  cancelText: { color: colors.danger700, fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },

  // Empty state
  empty: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 0.5, borderColor: colors.border,
    gap: 6,
    ...shadow.card,
  },
  emptyIcon: { fontSize: 32, color: colors.textSoft, marginBottom: spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  emptySub: { fontSize: 12.5, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
