import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import { api, ApiError, clearAuth, Me, OrgConfig } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, shadow, spacing } from '../theme/tokens';
import { fmtMoney, fmtShiftRange } from '../lib/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

const initials = (n: string) =>
  (n || '?').split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';

const fmtTenure = (months: number) => {
  if (months <= 0) return 'New this month';
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (m === 0) return `${y} ${y === 1 ? 'year' : 'years'}`;
  return `${y}y ${m}m`;
};

export default function ProfileScreen({ navigation }: Props) {
  const [me, setMe]       = useState<Me | null>(null);
  const [cfg, setCfg]     = useState<OrgConfig | null>(null);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([
        api.get<Me>('/me'),
        api.get<OrgConfig>('/config'),
      ]);
      setMe(m);
      setPhone(m.phone ?? '');
      setCfg(c);
    } catch (e) {
      Alert.alert('Failed to load profile', e instanceof Error ? e.message : 'unknown');
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  async function savePhone() {
    if (!me) return;
    setSaving(true);
    try {
      const updated = await api.patch<Me>('/me', { phone });
      setMe(updated);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Save failed';
      Alert.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    Alert.alert('Sign out?', 'You will need to sign in again to use the app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await clearAuth();
          navigation.replace('Login');
        },
      },
    ]);
  }

  const currency = cfg?.currency ?? 'INR';
  const phoneChanged = me ? (phone !== (me.phone ?? '')) : false;
  const canSavePhone = phoneChanged && !saving;

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
              <Text style={s.heroTitle}>Profile</Text>
              <Text style={s.heroSub}>Personal & work details</Text>
            </View>
            <View style={s.iconBtn} />
          </View>

          {/* Big avatar + name block */}
          {me && (
            <View style={s.profileBlock}>
              <View style={s.avatarRing}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{initials(me.name)}</Text>
                </View>
              </View>
              <Text style={s.name}>{me.name}</Text>
              <Text style={s.email}>{me.email}</Text>
              <View style={s.pillRow}>
                <View style={[s.pill, { backgroundColor: me.role === 'ADMIN' ? 'rgba(110,231,183,0.18)' : 'rgba(125,211,252,0.18)' }]}>
                  <Text style={[s.pillText, { color: me.role === 'ADMIN' ? '#6ee7b7' : '#7dd3fc' }]}>
                    {me.role}
                  </Text>
                </View>
                <View style={[s.pill, { backgroundColor: me.active ? 'rgba(110,231,183,0.18)' : 'rgba(248,113,113,0.18)' }]}>
                  <Text style={[s.pillText, { color: me.active ? '#6ee7b7' : '#fca5a5' }]}>
                    {me.active ? 'ACTIVE' : 'INACTIVE'}
                  </Text>
                </View>
                {me.employeeCode && (
                  <View style={[s.pill, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
                    <Text style={[s.pillText, { color: '#fff' }]}>{me.employeeCode}</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        {/* ── Body ──────────────────────────────────────────────── */}
        <View style={s.body}>
          {!me ? (
            <View style={{ paddingVertical: spacing.xxxl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <>
              {/* ── At-a-glance stat row ──────────────────────── */}
              <View style={s.statRow}>
                <View style={s.statTile}>
                  <Text style={s.statK}>TENURE</Text>
                  <Text style={s.statV}>
                    {fmtTenure(me.tenureMonths ?? 0)}
                  </Text>
                </View>
                <View style={s.statTile}>
                  <Text style={s.statK}>SALARY</Text>
                  <Text style={s.statV}>{fmtMoney(me.monthlySalary, currency)}</Text>
                </View>
                <View style={s.statTile}>
                  <Text style={s.statK}>SHIFT</Text>
                  <Text style={s.statV} numberOfLines={1}>
                    {me.shift?.name ?? 'Not set'}
                  </Text>
                </View>
              </View>

              {/* ── Work details card ─────────────────────────── */}
              <View style={s.card}>
                <Text style={s.cardEyebrow}>WORK DETAILS</Text>
                <KVRow label="Employee ID" value={me.employeeCode ?? '—'} />
                <Divider />
                <KVRow label="Role" value={me.role} />
                <Divider />
                <KVRow label="Status" value={me.active ? 'Active' : 'Inactive'}
                  valueColor={me.active ? colors.success700 : colors.danger700} />
                <Divider />
                <KVRow label="Shift" value={me.shift?.name ?? 'Not assigned'} />
                {me.shift && (
                  <>
                    <Divider />
                    <KVRow
                      label="Schedule"
                      value={fmtShiftRange(me.shift.startTime, me.shift.endTime)}
                    />
                  </>
                )}
                <Divider />
                <KVRow label="Member since"
                  value={new Date(me.createdAt).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })} />
              </View>

              {/* ── Compensation card ────────────────────────── */}
              <View style={s.card}>
                <Text style={s.cardEyebrow}>COMPENSATION</Text>
                <Text style={s.salaryAmount}>
                  {fmtMoney(me.monthlySalary, currency)}
                  <Text style={s.salaryUnit}>  /month</Text>
                </Text>
                <Text style={s.salaryHint}>
                  Set by your administrator. Daily and hourly rates appear on each payslip.
                </Text>
              </View>

              {/* ── Contact card with editable phone ─────────── */}
              <View style={s.card}>
                <View style={s.cardHeadRow}>
                  <Text style={s.cardEyebrow}>CONTACT</Text>
                  {savedFlash && (
                    <View style={s.savedPill}>
                      <Text style={s.savedPillText}>✓ SAVED</Text>
                    </View>
                  )}
                </View>

                <KVRow label="Email" value={me.email} />
                <Divider />

                <Text style={s.fieldLabel}>Phone</Text>
                <View style={s.inputWrap}>
                  <Text style={s.inputIcon}>☏</Text>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+91 ..."
                    placeholderTextColor={colors.textSoft}
                    keyboardType="phone-pad"
                    style={s.input}
                    maxLength={20}
                  />
                </View>

                <Pressable
                  onPress={savePhone}
                  disabled={!canSavePhone}
                  android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
                  style={({ pressed }) => [
                    s.saveBtn,
                    !canSavePhone && { opacity: 0.5 },
                    pressed && canSavePhone && { transform: [{ translateY: 1 }] },
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={s.saveBtnText}>
                      {phoneChanged ? 'Save phone' : 'No changes to save'}
                    </Text>
                  )}
                </Pressable>
              </View>

              {/* ── Account actions ──────────────────────────── */}
              <View style={s.card}>
                <Text style={s.cardEyebrow}>ACCOUNT</Text>
                <Pressable
                  onPress={logout}
                  android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                  style={({ pressed }) => [
                    s.actionRow,
                    pressed && { backgroundColor: colors.surface2 },
                  ]}
                >
                  <View style={[s.actionIcon, { backgroundColor: colors.danger50 }]}>
                    <Text style={[s.actionIconText, { color: colors.danger700 }]}>↶</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.actionTitle, { color: colors.danger700 }]}>Sign out</Text>
                    <Text style={s.actionSub}>Return to the login screen</Text>
                  </View>
                  <Text style={s.actionChev}>›</Text>
                </Pressable>
              </View>

              <Text style={s.footerHint}>
                Need to change your name, role, or salary? Contact your administrator.
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────
function KVRow({
  label, value, mono, valueColor,
}: { label: string; value: string; mono?: boolean; valueColor?: string }) {
  return (
    <View style={s.kvRow}>
      <Text style={s.kvK}>{label}</Text>
      <Text style={[s.kvV, mono && { fontVariant: ['tabular-nums'] }, valueColor && { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
function Divider() { return <View style={s.divider} />; }

// ── Styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Hero
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
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

  profileBlock: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  avatarRing: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '800', fontSize: 26, letterSpacing: 0.4 },
  name: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  email: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  pillRow: { flexDirection: 'row', gap: 6, marginTop: spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
  pill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)',
  },
  pillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },

  // Body
  body: { paddingHorizontal: spacing.lg, marginTop: -spacing.sm, gap: spacing.md },

  // Stat row
  statRow: { flexDirection: 'row', gap: 8 },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 0.5, borderColor: colors.border,
    padding: 12,
    ...shadow.card,
  },
  statK: { fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  statV: { fontSize: 13.5, fontWeight: '800', color: colors.text, marginTop: 3, letterSpacing: -0.2 },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  cardEyebrow: {
    fontSize: 10.5, fontWeight: '800', color: colors.primary, letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  cardHeadRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  savedPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: '#d1fae5',
  },
  savedPillText: { fontSize: 10, fontWeight: '800', color: '#047857', letterSpacing: 0.5 },

  // KV row
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    gap: spacing.md,
  },
  kvK: { fontSize: 12.5, color: colors.textMuted, fontWeight: '600' },
  kvV: {
    fontSize: 13.5, fontWeight: '700', color: colors.text,
    maxWidth: '60%', textAlign: 'right',
  },
  divider: { height: 0.5, backgroundColor: colors.border },

  // Salary
  salaryAmount: {
    fontSize: 26, fontWeight: '800', color: colors.text,
    fontVariant: ['tabular-nums'], letterSpacing: -0.5,
  },
  salaryUnit: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  salaryHint: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 17 },

  // Phone field
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 0.3, marginTop: spacing.md, marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    height: 48,
    borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12, gap: 8,
  },
  inputIcon: { fontSize: 16, color: colors.primary, fontWeight: '900' },
  input: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },

  saveBtn: {
    marginTop: spacing.md,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.blue,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 13.5, letterSpacing: 0.3 },

  // Action rows
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionIcon: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  actionIconText: { fontSize: 20, fontWeight: '900' },
  actionTitle: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  actionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  actionChev: { fontSize: 22, color: colors.textSoft, fontWeight: '300' },

  footerHint: {
    fontSize: 11.5, color: colors.textMuted, textAlign: 'center',
    marginTop: spacing.sm, lineHeight: 17, paddingHorizontal: spacing.lg,
  },
});
