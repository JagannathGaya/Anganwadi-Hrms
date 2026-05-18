import React, { ReactNode, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  PressableProps,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadow, spacing, typography } from '../theme/tokens';

/* ------- Screen --------------------------------------------------- */

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inner = (
    <View style={[padded && { padding: spacing.lg, gap: spacing.lg }, style]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={s.screen} edges={['bottom']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

/* ------- Card ----------------------------------------------------- */

export function Card({
  children,
  style,
  padded = true,
  tone,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  tone?: 'success' | 'info' | 'warning' | 'danger' | 'primary';
}) {
  const toneBg =
    tone === 'success' ? colors.success50 :
    tone === 'info'    ? colors.info50    :
    tone === 'warning' ? colors.warning50 :
    tone === 'danger'  ? colors.danger50  :
    tone === 'primary' ? colors.primary50 :
    colors.surface;
  const toneBorder =
    tone === 'success' ? '#bbf7d0' :
    tone === 'info'    ? '#bae6fd' :
    tone === 'warning' ? '#fde68a' :
    tone === 'danger'  ? '#fecaca' :
    tone === 'primary' ? '#c7d2fe' :
    colors.border;
  return (
    <View
      style={[
        s.card,
        { backgroundColor: toneBg, borderColor: toneBorder },
        padded && { padding: spacing.lg },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardHeader({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <View style={s.cardHeader}>
      <View style={{ flex: 1 }}>
        <Text style={typography.h3}>{title}</Text>
        {hint ? <Text style={[typography.small, { marginTop: 2 }]}>{hint}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/* ------- Buttons -------------------------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  size = 'md',
  fullWidth,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = btnPalette(variant);
  const sizing =
    size === 'sm' ? { height: 36, paddingHorizontal: 14, fontSize: 13 } :
    size === 'lg' ? { height: 52, paddingHorizontal: 22, fontSize: 16 } :
                    { height: 46, paddingHorizontal: 18, fontSize: 15 };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          height: sizing.height,
          paddingHorizontal: sizing.paddingHorizontal,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: 1,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: disabled || loading ? 0.6 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          ...(pressed ? shadow.pressedDown : null),
        },
        style,
      ]}
      android_ripple={{ color: 'rgba(255,255,255,0.18)', borderless: false }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <>
          {icon}
          <Text style={{ color: palette.fg, fontSize: sizing.fontSize, fontWeight: '600' }}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function btnPalette(v: Variant) {
  switch (v) {
    case 'primary':   return { bg: colors.primary, border: colors.primary, fg: colors.invert };
    case 'success':   return { bg: colors.success, border: colors.success, fg: colors.invert };
    case 'danger':    return { bg: colors.danger,  border: colors.danger,  fg: colors.invert };
    case 'secondary': return { bg: colors.surface, border: colors.borderStrong, fg: colors.text };
    case 'ghost':     return { bg: 'transparent',  border: 'transparent',       fg: colors.textMuted };
  }
}

/* ------- TextField ----------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  containerStyle,
  ...input
}: TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  containerStyle?: ViewStyle;
}) {
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label ? <Text style={typography.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textSoft}
        {...input}
        style={[s.input, input.style]}
      />
      {error ? <Text style={[typography.small, { color: colors.danger700 }]}>{error}</Text>
        : hint ? <Text style={typography.small}>{hint}</Text>
        : null}
    </View>
  );
}

/* ------- Badge --------------------------------------------------- */

type BadgeTone = 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'indigo';

export function Badge({ tone = 'gray', label, dot = true }: { tone?: BadgeTone; label: string; dot?: boolean }) {
  const palette = badgePalette(tone);
  return (
    <View style={[s.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      {dot ? <View style={[s.badgeDot, { backgroundColor: palette.fg }]} /> : null}
      <Text style={{ color: palette.fg, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.2 }}>
        {label}
      </Text>
    </View>
  );
}

function badgePalette(t: BadgeTone) {
  switch (t) {
    case 'green':  return { bg: colors.success50, fg: colors.success700, border: '#bbf7d0' };
    case 'red':    return { bg: colors.danger50,  fg: colors.danger700,  border: '#fecaca' };
    case 'amber':  return { bg: colors.warning50, fg: colors.warning700, border: '#fde68a' };
    case 'blue':   return { bg: colors.info50,    fg: colors.info700,    border: '#bae6fd' };
    case 'indigo': return { bg: colors.primary50, fg: colors.primary700, border: '#c7d2fe' };
    case 'gray':
    default:       return { bg: '#f1f5f9',        fg: '#475569',         border: '#e2e8f0' };
  }
}

/* ------- KV (label + value) -------------------------------------- */

export function KV({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={typography.label}>{k}</Text>
      {typeof v === 'string' || typeof v === 'number' ? (
        <Text style={[typography.body, mono ? { fontVariant: ['tabular-nums'] } : null]}>
          {String(v)}
        </Text>
      ) : (
        v
      )}
    </View>
  );
}

/* ------- Avatar -------------------------------------------------- */

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = (name || '?')
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('') || '?';
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.primary,
      }}
    >
      <Text style={{ color: colors.invert, fontWeight: '700', fontSize: size * 0.38, letterSpacing: 0.5 }}>
        {initials}
      </Text>
    </View>
  );
}

/* ------- Hero (gradient-like header using stacked overlays) ------ */

export function Hero({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[s.hero, style]}>
      <View style={[s.heroOverlay, { backgroundColor: '#312e81', opacity: 0.65 }]} />
      <View style={[s.heroOverlay, {
        backgroundColor: '#a855f7', opacity: 0.18,
        // simulate a soft radial via offset rounded shape
        borderRadius: 200,
        top: -160, right: -120, width: 360, height: 360,
      }]} />
      <View style={[s.heroOverlay, {
        backgroundColor: '#6366f1', opacity: 0.22,
        borderRadius: 200,
        bottom: -180, left: -80, width: 320, height: 320,
      }]} />
      <View style={{ position: 'relative', zIndex: 2 }}>{children}</View>
    </View>
  );
}

/* ------- Pressable list-row style card --------------------------- */

export function ActionRow({
  title,
  subtitle,
  iconBg,
  icon,
  onPress,
  badge,
  ...rest
}: {
  title: string;
  subtitle?: string;
  iconBg: string;
  icon: ReactNode;
  badge?: ReactNode;
  onPress?: () => void;
} & PressableProps) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#e2e8f0' }}
      style={({ pressed }) => [
        s.actionRow,
        pressed ? { backgroundColor: colors.surface2 } : null,
      ]}
      {...rest}
    >
      <View style={[s.actionIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={typography.h3}>{title}</Text>
        {subtitle ? <Text style={[typography.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {badge}
      <Text style={s.chev}>›</Text>
    </Pressable>
  );
}

/* ------- Misc text helpers -------------------------------------- */

export function Title(props: TextProps) {
  return <Text {...props} style={[typography.h1, props.style]} />;
}
export function Muted(props: TextProps) {
  return <Text {...props} style={[typography.small, props.style]} />;
}

/* ------- Section spacer ----------------------------------------- */

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text style={[typography.label, { color: colors.textMuted, marginTop: spacing.sm }]}>
      {children}
    </Text>
  );
}

/* ------- InlineAlert: in-screen notification banner --------------- */

export type AlertTone = 'error' | 'success' | 'info' | 'warning';

export function InlineAlert({
  tone,
  title,
  message,
  onDismiss,
  autoHideMs,
  style,
}: {
  tone: AlertTone;
  title?: string;
  message: string;
  onDismiss?: () => void;
  /** Auto-dismiss after this many milliseconds. Requires onDismiss. */
  autoHideMs?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = alertPalette(tone);
  const slide = useRef(new Animated.Value(-8)).current;
  const fade  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade,  { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [fade, slide]);

  useEffect(() => {
    if (!autoHideMs || !onDismiss) return;
    const id = setTimeout(onDismiss, autoHideMs);
    return () => clearTimeout(id);
  }, [autoHideMs, onDismiss]);

  return (
    <Animated.View
      // accessibility: announces tone via role + live region
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        s.alert,
        { backgroundColor: palette.bg, borderColor: palette.border },
        { opacity: fade, transform: [{ translateY: slide }] },
        style,
      ]}
    >
      <View style={[s.alertIcon, { backgroundColor: palette.iconBg }]}>
        <Text style={{ color: palette.fg, fontSize: 14, fontWeight: '900' }}>
          {tone === 'error'   ? '!' :
           tone === 'success' ? '✓' :
           tone === 'warning' ? '⚠' :
                                'i'}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 14, letterSpacing: -0.1 }}>
            {title}
          </Text>
        ) : null}
        <Text style={{ color: palette.fg, fontSize: 13, lineHeight: 18, opacity: 0.92 }}>
          {message}
        </Text>
      </View>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: true, radius: 16 }}
          style={s.alertClose}
        >
          <Text style={{ color: palette.fg, fontSize: 18, fontWeight: '700', opacity: 0.7 }}>×</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function alertPalette(t: AlertTone) {
  switch (t) {
    case 'error':
      return { bg: colors.danger50,  border: '#fecaca', fg: colors.danger700,  iconBg: '#fff' };
    case 'success':
      return { bg: colors.success50, border: '#bbf7d0', fg: colors.success700, iconBg: '#fff' };
    case 'warning':
      return { bg: colors.warning50, border: '#fde68a', fg: colors.warning700, iconBg: '#fff' };
    case 'info':
    default:
      return { bg: colors.info50,    border: '#bae6fd', fg: colors.info700,    iconBg: '#fff' };
  }
}

/* ------- Generic icon (text-glyph based, no extra deps) ---------- */

export function Glyph({ char, color, size = 18 }: { char: string; color?: string; size?: number }) {
  return (
    <Text style={{ color: color ?? colors.text, fontSize: size, fontWeight: '700', lineHeight: size + 2 }}>
      {char}
    </Text>
  );
}

/* ----------------------------------------------------------------- */

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...(shadow.card as ViewStyle),
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  input: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, height: 24,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  hero: {
    overflow: 'hidden',
    backgroundColor: colors.navyTo,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    minHeight: 180,
    position: 'relative',
  },
  heroOverlay: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0, left: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 42, height: 42, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  chev: {
    color: colors.textSoft,
    fontSize: 22, fontWeight: '300',
    paddingLeft: spacing.sm,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  alertIcon: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  alertClose: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: spacing.xs,
  },
});
