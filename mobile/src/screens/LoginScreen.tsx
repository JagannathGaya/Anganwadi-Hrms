import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
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

import { api, ApiError, AuthState, saveAuth } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { InlineAlert } from '../components/ui';
import { colors, radius, shadow, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

// ── Validation ─────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type FieldError = { email?: string; password?: string };

function validate(email: string, password: string): FieldError {
  const out: FieldError = {};
  if (!email)                     out.email = 'Email is required';
  else if (!EMAIL_RE.test(email)) out.email = 'Enter a valid email address';
  if (!password)                  out.password = 'Password is required';
  else if (password.length < 4)   out.password = 'Password is too short';
  return out;
}

// Map server / network errors into something a user can act on.
function loginErrorMessage(e: unknown): { title: string; message: string } {
  if (e instanceof ApiError) {
    switch (e.status) {
      case 401: return { title: 'Wrong email or password',
                         message: 'Double-check your work email and password.' };
      case 403: return { title: 'Account inactive',
                         message: 'Your account is deactivated. Please contact your administrator.' };
      case 408: return { title: 'Request timed out',
                         message: e.message || 'The server took too long. Try again.' };
      case 0:   return { title: "Can't reach the server",
                         message: e.message || 'Check your internet connection.' };
      case 429: return { title: 'Too many attempts', message: 'Please wait a moment before trying again.' };
      case 500: case 502: case 503:
        return { title: 'Server unavailable', message: 'Try again shortly.' };
      default:  return { title: "Couldn't sign you in", message: e.message };
    }
  }
  if (e instanceof Error) return { title: "Couldn't sign you in", message: e.message };
  return { title: "Couldn't sign you in", message: 'An unexpected error occurred.' };
}

// ── Screen ─────────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [pwFocus, setPwFocus]   = useState(false);
  const [touched, setTouched]   = useState<{ email?: boolean; password?: boolean }>({});
  const [alert, setAlert] = useState<
    { tone: 'error' | 'success' | 'info' | 'warning'; title?: string; message: string } | null
  >(null);
  const passwordRef = useRef<TextInput | null>(null);

  // Card entrance animation — slides up + fades in on mount.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const fieldErrors = useMemo(() => validate(email, password), [email, password]);
  const hasFieldErrors = Boolean(fieldErrors.email || fieldErrors.password);
  const showEmailError = touched.email    && Boolean(fieldErrors.email);
  const showPwError    = touched.password && Boolean(fieldErrors.password);

  // Dismiss the alert the moment the user keeps typing.
  useEffect(() => {
    if (alert && (email || password)) setAlert(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password]);

  async function onSubmit() {
    if (loading) return;
    setTouched({ email: true, password: true });
    if (hasFieldErrors) {
      setAlert({
        tone: 'warning',
        title: 'Check your details',
        message: fieldErrors.email || fieldErrors.password || 'Please fix the highlighted fields.',
      });
      return;
    }
    setLoading(true);
    setAlert(null);
    try {
      const res = await api.post<AuthState>('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });
      if (!res?.token) throw new ApiError(500, 'Server returned an incomplete login response.');
      await saveAuth(res);
      navigation.replace('Home');
    } catch (e) {
      const { title, message } = loginErrorMessage(e);
      setAlert({ tone: 'error', title, message });
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = email.length > 0 && password.length > 0 && !loading;
  const cardAnim = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Navy hero with decorative blobs ───────────────── */}
          <View style={s.hero}>
            <View style={[s.heroBlob, s.heroBlob1]} pointerEvents="none" />
            <View style={[s.heroBlob, s.heroBlob2]} pointerEvents="none" />
            <View style={[s.heroBlob, s.heroBlob3]} pointerEvents="none" />

            <View style={s.heroBrandRow}>
              <View style={s.logoBg}>
                <View style={s.logoBgRingA} />
                <View style={s.logoBgRingB} />
                <View style={s.logo}>
                  <Text style={s.logoChar}>A</Text>
                </View>
              </View>
              <View>
                <Text style={s.brandName}>AnganwadiHrms</Text>
                <View style={s.brandPill}>
                  <View style={s.brandPillDot} />
                  <Text style={s.brandPillText}>Workforce companion</Text>
                </View>
              </View>
            </View>

            <View style={s.heroTitleBlock}>
              <Text style={s.heroEyebrow}>SIGN IN</Text>
              <Text style={s.heroTitle}>Welcome back</Text>
              <Text style={s.heroSubtitle}>
                Sign in to manage your shifts, attendance, and payslips.
              </Text>
            </View>
          </View>

          {/* ── White card overlapping hero ─────────────────────── */}
          <Animated.View style={[s.cardWrap, cardAnim]}>
            <View style={s.card}>
              {alert && (
                <View style={{ marginBottom: spacing.lg }}>
                  <InlineAlert
                    tone={alert.tone}
                    title={alert.title}
                    message={alert.message}
                    onDismiss={() => setAlert(null)}
                  />
                </View>
              )}

              {/* Email field */}
              <Text style={s.label}>Work email</Text>
              <View style={[
                s.inputWrap,
                emailFocus && s.inputFocus,
                showEmailError && s.inputError,
              ]}>
                <View style={[
                  s.iconBox,
                  emailFocus && { backgroundColor: colors.primary50 },
                  showEmailError && { backgroundColor: colors.danger50 },
                ]}>
                  <Text style={[
                    s.iconChar,
                    emailFocus && { color: colors.primary },
                    showEmailError && { color: colors.danger },
                  ]}>@</Text>
                </View>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setEmailFocus(true)}
                  onBlur={() => { setEmailFocus(false); setTouched((t) => ({ ...t, email: true })); }}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  placeholder="you@anganwadi.local"
                  placeholderTextColor={colors.textSoft}
                  style={s.input}
                  editable={!loading}
                />
              </View>
              {showEmailError ? (
                <Text style={s.err}>{fieldErrors.email}</Text>
              ) : (
                <View style={s.errSpacer} />
              )}

              {/* Password field */}
              <View style={s.labelRow}>
                <Text style={s.label}>Password</Text>
                <Pressable
                  onPress={() => setShowPwd((v) => !v)}
                  hitSlop={6}
                  android_ripple={{ color: 'rgba(0,0,0,0.04)', borderless: true, radius: 16 }}
                  accessibilityLabel={showPwd ? 'Hide password' : 'Show password'}
                >
                  <Text style={s.toggle}>{showPwd ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
              <View style={[
                s.inputWrap,
                pwFocus && s.inputFocus,
                showPwError && s.inputError,
              ]}>
                <View style={[
                  s.iconBox,
                  pwFocus && { backgroundColor: colors.primary50 },
                  showPwError && { backgroundColor: colors.danger50 },
                ]}>
                  <Text style={[
                    s.iconChar,
                    pwFocus && { color: colors.primary },
                    showPwError && { color: colors.danger },
                  ]}>⚿</Text>
                </View>
                <TextInput
                  ref={passwordRef}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPwFocus(true)}
                  onBlur={() => { setPwFocus(false); setTouched((t) => ({ ...t, password: true })); }}
                  secureTextEntry={!showPwd}
                  autoCapitalize="none"
                  autoComplete="password"
                  returnKeyType="go"
                  onSubmitEditing={onSubmit}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textSoft}
                  style={s.input}
                  editable={!loading}
                />
              </View>
              {showPwError ? (
                <Text style={s.err}>{fieldErrors.password}</Text>
              ) : (
                <View style={s.errSpacer} />
              )}

              {/* Submit */}
              <Pressable
                onPress={onSubmit}
                disabled={!canSubmit}
                android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
                style={({ pressed }) => [
                  s.submit,
                  !canSubmit && { opacity: 0.55 },
                  pressed && canSubmit && { transform: [{ translateY: 1 }] },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={s.submitText}>Sign in</Text>
                    <Text style={s.submitArrow}>→</Text>
                  </>
                )}
              </Pressable>

              {/* Trust row */}
              <View style={s.trustRow}>
                <View style={s.trustDot} />
                <Text style={s.trustText}>
                  Secured by JWT  ·  session expires in 12h
                </Text>
              </View>
            </View>

            {/* Footer help text outside the card */}
            <Text style={s.footerText}>
              Need help?{' '}
              <Text style={s.footerLink}>Contact your administrator</Text>
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.primary },
  scroll: { flexGrow: 1, backgroundColor: colors.bg },

  // Hero
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl + spacing.lg,
    overflow: 'hidden',
  },
  heroBlob: { position: 'absolute', borderRadius: 9999 },
  heroBlob1: { width: 260, height: 260, backgroundColor: '#2748a3', opacity: 0.55, top: -110, right: -90 },
  heroBlob2: { width: 180, height: 180, backgroundColor: '#2c5cb8', opacity: 0.30, bottom: -90, left: -60 },
  heroBlob3: { width: 140, height: 140, backgroundColor: '#bfdbfe', opacity: 0.10, top: 60,   left: -30 },

  heroBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },

  logoBg: {
    width: 64, height: 64,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  logoBgRingA: {
    position: 'absolute',
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#ffffff', opacity: 0.10,
  },
  logoBgRingB: {
    position: 'absolute',
    width: 92, height: 92, borderRadius: 46,
    backgroundColor: '#ffffff', opacity: 0.05,
  },
  logo: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center',
  },
  logoChar: { color: colors.primary, fontWeight: '800', fontSize: 24, letterSpacing: -0.8 },

  brandName: { color: '#fff', fontWeight: '800', fontSize: 17, letterSpacing: -0.2 },
  brandPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)',
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  brandPillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  brandPillText: { color: '#fff', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },

  heroTitleBlock: { alignItems: 'flex-start' },
  heroEyebrow: {
    fontSize: 11, fontWeight: '800',
    color: 'rgba(255,255,255,0.75)', letterSpacing: 1.4,
    marginBottom: 6,
  },
  heroTitle: {
    color: '#fff', fontSize: 30, fontWeight: '800',
    letterSpacing: -0.7, lineHeight: 34,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14, marginTop: spacing.sm, lineHeight: 20,
    paddingRight: spacing.xl,
  },

  // Card
  cardWrap: {
    paddingHorizontal: spacing.lg,
    marginTop: -spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 0.5, borderColor: 'rgba(30,58,138,0.08)',
    padding: spacing.xl,
    ...shadow.pop,
  },

  // Form
  label: {
    fontSize: 12, fontWeight: '800', color: colors.text,
    letterSpacing: 0.4, textTransform: 'uppercase',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggle: {
    fontSize: 11, fontWeight: '800',
    color: colors.primary, letterSpacing: 0.4,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingLeft: 8, paddingRight: 14, gap: 10,
  },
  inputFocus: {
    borderColor: colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
      default: null,
    }),
  },
  inputError: { borderColor: colors.danger, backgroundColor: '#fffafa' },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  iconChar: {
    color: colors.textMuted,
    fontWeight: '900', fontSize: 17,
  },
  input: {
    flex: 1,
    fontSize: 15, color: colors.text,
    paddingVertical: 0,
  },
  err: {
    color: colors.danger700,
    fontSize: 12, marginTop: 4,
    fontWeight: '600',
  },
  errSpacer: { height: 4, marginTop: 4 },

  // Submit
  submit: {
    marginTop: spacing.md,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 10,
    ...shadow.blue,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.1 },
  submitArrow: { color: '#fff', fontSize: 18, fontWeight: '800' },

  // Trust
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
  trustDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  trustText: { fontSize: 11, color: colors.textMuted, fontWeight: '700', letterSpacing: 0.2 },

  // Footer (outside card)
  footerText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12.5,
    marginTop: spacing.xl,
    fontWeight: '600',
  },
  footerLink: {
    color: colors.primary,
    fontWeight: '800',
  },
});
