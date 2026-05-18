import { Platform, TextStyle, ViewStyle } from 'react-native';

// ──────────────────────────────────────────────────────────────────────
// Bright-blue palette inspired by the consumer HRMS reference design:
// a saturated cobalt blue for hero surfaces, a cool light-grey app
// background, and bold accent chips for action tiles (green / orange /
// yellow / red / purple / cyan). Each accent has a "50" tint for soft
// chip backgrounds and a "700" tint for icons/text inside them.
// ──────────────────────────────────────────────────────────────────────
export const colors = {
  bg:           '#eff3f8',   // light cool grey app background
  surface:      '#ffffff',
  surface2:     '#f5f7fb',
  border:       '#e5e9ef',
  borderStrong: '#cfd6e0',

  text:         '#0f172a',
  textMuted:    '#64748b',
  textSoft:     '#94a3b8',
  invert:       '#ffffff',

  // Primary — classic navy blue. The "hero" anchor color across the app.
  primary:      '#1e3a8a',
  primary700:   '#1e40af',
  primary50:    '#e7edfa',
  primary100:   '#c7d2fe',
  primaryDark:  '#172554',

  // Success — emerald green for "active / approved / present".
  success:      '#10b981',
  success50:    '#d1fae5',
  success700:   '#047857',

  // Danger — red for "absent / cancelled".
  danger:       '#ef4444',
  danger50:     '#fee2e2',
  danger700:    '#b91c1c',

  // Warning — amber for "late / pending".
  warning:      '#f59e0b',
  warning50:    '#fef3c7',
  warning700:   '#b45309',

  // Info — cyan/sky for "approved / closed" tones.
  info:         '#0ea5e9',
  info50:       '#e0f2fe',
  info700:      '#0369a1',

  // Accent — purple for tasks/teams.
  accent:       '#a855f7',
  accent50:     '#f3e8ff',
  accent700:    '#7c3aed',

  // Accent — pink/coral for marketing-style highlights.
  pink:         '#ec4899',
  pink50:       '#fce7f3',
  pink700:      '#be185d',

  // Hero gradient endpoints — used by BlueHero.
  heroFrom:     '#1e40af',   // lighter navy, top
  heroTo:       '#1e3a8a',   // main navy, bottom

  // Legacy aliases for screens that haven't migrated yet.
  navyFrom:     '#1e3a8a',
  navyTo:       '#172554',
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 36,
} as const;

export const typography = {
  display: {
    fontSize: 28, fontWeight: '800' as TextStyle['fontWeight'], color: colors.text, letterSpacing: -0.4,
  },
  h1:  { fontSize: 22, fontWeight: '800' as TextStyle['fontWeight'], color: colors.text, letterSpacing: -0.3 },
  h2:  { fontSize: 18, fontWeight: '700' as TextStyle['fontWeight'], color: colors.text, letterSpacing: -0.2 },
  h3:  { fontSize: 15, fontWeight: '700' as TextStyle['fontWeight'], color: colors.text },
  body:{ fontSize: 14, fontWeight: '400' as TextStyle['fontWeight'], color: colors.text },
  small:{ fontSize: 12, fontWeight: '500' as TextStyle['fontWeight'], color: colors.textMuted },
  label:{ fontSize: 12, fontWeight: '700' as TextStyle['fontWeight'], color: colors.text, letterSpacing: 0.3,
          textTransform: 'uppercase' as TextStyle['textTransform'] },
  money:{ fontSize: 14, fontWeight: '600' as TextStyle['fontWeight'], color: colors.text,
          fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] },
} as const;

export const shadow = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
    },
    android: { elevation: 3 },
    default: {},
  }) as ViewStyle,
  pop: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
    },
    android: { elevation: 8 },
    default: {},
  }) as ViewStyle,
  blue: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#1e3a8a',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.30,
      shadowRadius: 20,
    },
    android: { elevation: 10 },
    default: {},
  }) as ViewStyle,
  pressedDown: { transform: [{ translateY: 1 }] } as ViewStyle,
} as const;
