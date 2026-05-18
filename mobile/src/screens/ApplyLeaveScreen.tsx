import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api, ApiError, LeaveDetail } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, shadow, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplyLeave'>;

// ── helpers ────────────────────────────────────────────────────────────
const ISO = (d: Date) => d.toISOString().slice(0, 10);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fmtDate = (s: string) => {
  if (!DATE_RE.test(s)) return s;
  return new Date(s).toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
};
const fmtRelative = (s: string) => {
  if (!DATE_RE.test(s)) return '';
  const d = new Date(s); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((+d - +today) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff > 0)   return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
};
const daysBetween = (a: string, b: string) => {
  const ms = +new Date(b) - +new Date(a);
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
};

// ── screen ─────────────────────────────────────────────────────────────
export default function ApplyLeaveScreen({ navigation }: Props) {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const [fromDate, setFromDate] = useState(ISO(today));
  const [toDate, setToDate]     = useState(ISO(tomorrow));
  const [reason, setReason]     = useState('');
  const [busy, setBusy]         = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Live, in-screen validation
  const validation = useMemo(() => {
    const issues: string[] = [];
    if (!DATE_RE.test(fromDate))       issues.push('From date must be YYYY-MM-DD');
    if (!DATE_RE.test(toDate))         issues.push('To date must be YYYY-MM-DD');
    if (issues.length > 0) return { ok: false, issues };

    const from = new Date(fromDate); from.setHours(0, 0, 0, 0);
    const to   = new Date(toDate);   to.setHours(0, 0, 0, 0);
    const now  = new Date();         now.setHours(0, 0, 0, 0);

    if (to < from)             issues.push('To date must be on or after from date');
    if (from < now)            issues.push('Leave cannot start in the past');
    const maxFuture = new Date(now); maxFuture.setMonth(maxFuture.getMonth() + 12);
    if (from > maxFuture)      issues.push('Leave cannot start more than 12 months from now');
    return { ok: issues.length === 0, issues };
  }, [fromDate, toDate]);

  const total = validation.ok ? daysBetween(fromDate, toDate) : 0;

  async function submit() {
    setServerError(null);
    if (!validation.ok) {
      Alert.alert('Check your dates', validation.issues[0]);
      return;
    }
    setBusy(true);
    try {
      await api.post<LeaveDetail>('/leaves', { fromDate, toDate, reason: reason || null });
      Alert.alert('Submitted', 'Your leave request has been sent for approval.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message
                : e instanceof Error    ? e.message
                                        : 'Could not submit your request.';
      setServerError(msg);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = validation.ok && !busy;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl + spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
              <Text style={s.heroTitle}>Apply for leave</Text>
              <Text style={s.heroSub}>Submit a new request</Text>
            </View>
            <View style={s.iconBtn} />
          </View>

          {/* Day-count preview */}
          <View style={s.previewBlock}>
            <Text style={s.previewEyebrow}>REQUESTING</Text>
            <Text style={s.previewBig}>
              {total}
              <Text style={s.previewUnit}>{total === 1 ? ' day' : ' days'}</Text>
            </Text>
            {validation.ok ? (
              <Text style={s.previewSub}>
                {fmtDate(fromDate)}
                {fromDate !== toDate ? `   →   ${fmtDate(toDate)}` : ''}
              </Text>
            ) : (
              <Text style={[s.previewSub, { color: '#fca5a5' }]} numberOfLines={2}>
                {validation.issues[0]}
              </Text>
            )}
          </View>
        </View>

        {/* ── Body ──────────────────────────────────────────────── */}
        <View style={s.body}>
          {/* Dates card */}
          <View style={s.card}>
            <Text style={s.cardEyebrow}>DATES</Text>
            <Text style={s.cardSub}>Inclusive of both ends · YYYY-MM-DD format</Text>

            <Text style={s.label}>From date</Text>
            <View style={[
              s.inputWrap,
              !DATE_RE.test(fromDate) && s.inputWrapError,
            ]}>
              <Text style={s.inputIcon}>›</Text>
              <TextInput
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSoft}
                autoCapitalize="none"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                style={s.input}
              />
              <Text style={s.inputHint}>{fmtRelative(fromDate)}</Text>
            </View>

            <Text style={[s.label, { marginTop: spacing.md }]}>To date</Text>
            <View style={[
              s.inputWrap,
              !DATE_RE.test(toDate) && s.inputWrapError,
            ]}>
              <Text style={s.inputIcon}>›</Text>
              <TextInput
                value={toDate}
                onChangeText={setToDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSoft}
                autoCapitalize="none"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                style={s.input}
              />
              <Text style={s.inputHint}>{fmtRelative(toDate)}</Text>
            </View>

            {/* Validation summary */}
            {!validation.ok && validation.issues.length > 1 && (
              <View style={s.validBlock}>
                {validation.issues.map((msg) => (
                  <Text key={msg} style={s.validIssue}>·  {msg}</Text>
                ))}
              </View>
            )}
          </View>

          {/* Reason card */}
          <View style={s.card}>
            <Text style={s.cardEyebrow}>REASON</Text>
            <Text style={s.cardSub}>Optional · your manager will see this</Text>
            <View style={s.inputWrap}>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. wedding in family"
                placeholderTextColor={colors.textSoft}
                multiline
                numberOfLines={3}
                style={[s.input, { height: 80, paddingTop: 8, textAlignVertical: 'top' }]}
              />
            </View>
            <Text style={s.charCount}>{reason.length}/500</Text>
          </View>

          {/* Server error banner */}
          {serverError && (
            <View style={s.errBanner}>
              <Text style={s.errBannerIcon}>⚠</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.errBannerTitle}>Could not submit</Text>
                <Text style={s.errBannerBody}>{serverError}</Text>
              </View>
            </View>
          )}

          {/* Submit */}
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
            style={({ pressed }) => [
              s.submitBtn,
              !canSubmit && { opacity: 0.6 },
              pressed && canSubmit && { transform: [{ translateY: 1 }] },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.submitText}>Submit application</Text>
            )}
          </Pressable>

          <Text style={s.helpText}>
            Once approved, each leave day credits your payslip with the daily-hours baseline.
            You can cancel a pending request from My Leaves.
          </Text>
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
    paddingBottom: 32,
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

  previewBlock: { marginTop: spacing.lg, alignItems: 'flex-start' },
  previewEyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2 },
  previewBig: {
    color: '#fff',
    fontSize: 44, fontWeight: '800', letterSpacing: -1.4,
    fontVariant: ['tabular-nums'], marginTop: 4,
  },
  previewUnit: { fontSize: 20, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
  previewSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 4 },

  // Body
  body: { paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.md },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  cardEyebrow: { fontSize: 10.5, fontWeight: '800', color: colors.primary, letterSpacing: 1.2 },
  cardSub: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md },

  // Form fields
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    minHeight: 48,
    gap: 8,
  },
  inputWrapError: {
    borderColor: colors.danger,
    backgroundColor: '#fffafa',
  },
  inputIcon: { fontSize: 16, fontWeight: '800', color: colors.primary },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    padding: 0,
  },
  inputHint: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '700',
    fontStyle: 'italic',
  },
  charCount: {
    fontSize: 11, color: colors.textMuted,
    alignSelf: 'flex-end',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },

  validBlock: {
    marginTop: spacing.md,
    backgroundColor: colors.danger50,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 0.5, borderColor: '#fecaca',
    gap: 3,
  },
  validIssue: { color: colors.danger700, fontSize: 12, fontWeight: '600' },

  // Error banner
  errBanner: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.danger50,
    borderWidth: 0.5, borderColor: '#fecaca',
    borderRadius: 12,
    padding: spacing.md,
  },
  errBannerIcon: { fontSize: 18, color: colors.danger700, fontWeight: '900' },
  errBannerTitle: { color: colors.danger700, fontWeight: '800', fontSize: 13 },
  errBannerBody:  { color: colors.danger700, fontSize: 12, marginTop: 2, lineHeight: 17 },

  // Submit
  submitBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.blue,
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  helpText: {
    fontSize: 11.5,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
  },
});
