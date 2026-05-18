/**
 * Reusable building blocks for the bright-blue HRMS theme.
 *
 *   BlueHero      — full-width blue gradient hero with rounded bottom corners
 *                   and decorative bubbles. Hosts greeting + bell row.
 *   ServiceTile   — large rounded white tile with a coloured circular icon,
 *                   title, and optional sub. Used for service grids.
 *   StatCircle    — coloured circular badge with a big number and a label.
 *   ListChip      — coloured vertical-stripe list row used for activity feeds.
 *   SectionTitle  — small bold section header with optional "See all" link.
 *
 * No external deps. Gradient is simulated with overlapping shapes so it works
 * on legacy-arch React Native without a linear-gradient library.
 */

import React, { ReactNode } from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, shadow, spacing, typography } from '../theme/tokens';

// ── BlueHero ───────────────────────────────────────────────────────────
export function BlueHero({
  children,
  style,
  short = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  short?: boolean;
}) {
  return (
    <View style={[s.hero, short && { paddingBottom: spacing.lg }, style]}>
      <View style={s.heroBase} />
      <View style={[s.heroBlob, s.heroBlob1]} />
      <View style={[s.heroBlob, s.heroBlob2]} />
      <View style={[s.heroBlob, s.heroBlob3]} />
      <View style={s.heroContent}>{children}</View>
    </View>
  );
}

// ── ServiceTile ────────────────────────────────────────────────────────
type IconTone = 'green' | 'orange' | 'yellow' | 'red' | 'purple' | 'blue' | 'pink' | 'cyan';

const ICON_PALETTE: Record<IconTone, { bg: string; fg: string }> = {
  green:  { bg: colors.success50, fg: colors.success },
  orange: { bg: colors.warning50, fg: colors.warning },
  yellow: { bg: '#fff4d6',         fg: '#d97706' },
  red:    { bg: colors.danger50,   fg: colors.danger },
  purple: { bg: colors.accent50,   fg: colors.accent700 },
  blue:   { bg: colors.primary50,  fg: colors.primary },
  pink:   { bg: colors.pink50,     fg: colors.pink },
  cyan:   { bg: colors.info50,     fg: colors.info },
};

export function ServiceTile({
  icon,
  title,
  sub,
  tone,
  onPress,
  badge,
  disabled,
}: {
  icon: string;
  title: string;
  sub?: string;
  tone: IconTone;
  onPress: () => void;
  badge?: string;
  disabled?: boolean;
}) {
  const palette = ICON_PALETTE[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      style={({ pressed }) => [
        s.serviceTile,
        disabled && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={[s.serviceIcon, { backgroundColor: palette.bg }]}>
        <Text style={[s.serviceIconText, { color: palette.fg }]}>{icon}</Text>
      </View>
      <Text style={s.serviceTitle}>{title}</Text>
      {sub ? <Text style={s.serviceSub} numberOfLines={1}>{sub}</Text> : null}
      {badge ? (
        <View style={[s.serviceBadge, { backgroundColor: palette.fg }]}>
          <Text style={s.serviceBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ── StatCircle ─────────────────────────────────────────────────────────
export function StatCircle({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone: IconTone;
}) {
  const palette = ICON_PALETTE[tone];
  return (
    <View style={s.stat}>
      <View style={[s.statCircle, { backgroundColor: palette.bg }]}>
        <Text style={[s.statValue, { color: palette.fg }]}>{String(value)}</Text>
      </View>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ── ListChip — coloured-stripe list row ────────────────────────────────
export function ListChip({
  title,
  sub,
  right,
  stripeTone = 'blue',
  onPress,
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
  stripeTone?: IconTone;
  onPress?: () => void;
}) {
  const palette = ICON_PALETTE[stripeTone];
  const inner = (
    <View style={s.chip}>
      <View style={[s.chipStripe, { backgroundColor: palette.fg }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.chipTitle} numberOfLines={1}>{title}</Text>
        {typeof sub === 'string' ? (
          <Text style={s.chipSub} numberOfLines={1}>{sub}</Text>
        ) : sub}
      </View>
      {right}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      style={({ pressed }) => [pressed && { opacity: 0.96 }]}
    >
      {inner}
    </Pressable>
  );
}

// ── Pill — small coloured badge ───────────────────────────────────────
export function Pill({
  label,
  tone,
  outline,
}: {
  label: string;
  tone: IconTone;
  outline?: boolean;
}) {
  const palette = ICON_PALETTE[tone];
  return (
    <View style={[
      s.pill,
      outline ? { borderWidth: 1, borderColor: palette.fg, backgroundColor: 'transparent' }
              : { backgroundColor: palette.fg },
    ]}>
      <Text style={[s.pillText, outline ? { color: palette.fg } : { color: '#fff' }]}>
        {label}
      </Text>
    </View>
  );
}

// ── SectionTitle ───────────────────────────────────────────────────────
export function SectionTitle({
  title,
  rightLabel,
  onRightPress,
}: {
  title: string;
  rightLabel?: string;
  onRightPress?: () => void;
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {rightLabel ? (
        <Pressable
          onPress={onRightPress}
          hitSlop={8}
          android_ripple={{ color: 'rgba(0,0,0,0.04)', borderless: true, radius: 14 }}
        >
          <Text style={s.sectionRight}>{rightLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Tile / White card ──────────────────────────────────────────────────
export function WhiteCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.white, style]}>{children}</View>;
}

// ── BellButton ────────────────────────────────────────────────────────
export function BellButton(props: PressableProps & { dot?: boolean }) {
  const { dot, ...rest } = props;
  return (
    <Pressable
      hitSlop={8}
      android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 22 }}
      {...rest}
      style={s.bell}
    >
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>◔</Text>
      {dot ? <View style={s.bellDot} /> : null}
    </Pressable>
  );
}

// ── MenuButton ────────────────────────────────────────────────────────
export function MenuButton(props: PressableProps) {
  return (
    <Pressable
      hitSlop={8}
      android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, radius: 22 }}
      {...props}
      style={s.menu}
    >
      <View style={s.menuLine} />
      <View style={[s.menuLine, { width: 14 }]} />
      <View style={s.menuLine} />
    </Pressable>
  );
}

// ──────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Hero
  hero: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl + spacing.md,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
  },
  heroBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.heroFrom,
  },
  heroBlob: {
    position: 'absolute',
    borderRadius: 9999,
  },
  heroBlob1: {
    width: 260, height: 260,
    backgroundColor: colors.heroTo,
    opacity: 0.55,
    bottom: -130, right: -80,
  },
  heroBlob2: {
    width: 180, height: 180,
    backgroundColor: '#60a5fa',
    opacity: 0.35,
    top: -60, right: -40,
  },
  heroBlob3: {
    width: 140, height: 140,
    backgroundColor: '#dbeafe',
    opacity: 0.18,
    top: 30, left: -40,
  },
  heroContent: { position: 'relative', zIndex: 2 },

  // Service tile
  serviceTile: {
    flex: 1,
    aspectRatio: 0.95,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  serviceIcon: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  serviceIconText: { fontSize: 26, fontWeight: '800' },
  serviceTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 2, letterSpacing: -0.1 },
  serviceSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  serviceBadge: {
    position: 'absolute',
    top: 10, right: 10,
    minWidth: 22, height: 22, borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  serviceBadgeText: { color: '#fff', fontWeight: '800', fontSize: 11 },

  // Stat circle
  stat: { alignItems: 'center', flex: 1 },
  statCircle: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '700', letterSpacing: 0.2 },

  // List chip
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    paddingLeft: 0,
    overflow: 'hidden',
    ...shadow.card,
  },
  chipStripe: {
    width: 5,
    alignSelf: 'stretch',
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
  },
  chipTitle: { fontSize: 14, fontWeight: '700', color: colors.text, letterSpacing: -0.1 },
  chipSub: { fontSize: 12, color: colors.textMuted },

  // Pill
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

  // Section
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  sectionRight: { fontSize: 12, fontWeight: '700', color: colors.primary, letterSpacing: 0.2 },

  // Generic white card
  white: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },

  // Bell / menu
  bell: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  bellDot: {
    position: 'absolute',
    top: 8, right: 11,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.warning,
    borderWidth: 1.5, borderColor: '#fff',
  },
  menu: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    gap: 3,
  },
  menuLine: {
    width: 18, height: 2.5, borderRadius: 1,
    backgroundColor: '#fff',
  },
});
