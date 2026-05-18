import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme/tokens';

/**
 * Branded splash, matching the bright-blue palette of the rest of the app.
 * Full-bleed cobalt blue with the same decorative bubbles used by BlueHero,
 * a pulsing logo, and three staggered loading dots.
 */
export default function SplashScreen({ fadeOut = false }: { fadeOut?: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const fade  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  useEffect(() => {
    if (!fadeOut) return;
    Animated.timing(fade, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fade, fadeOut]);

  const logoScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.45] });

  return (
    <Animated.View style={[s.root, { opacity: fade }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.heroFrom} />

      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <View style={[s.blob, s.blob1]} />
        <View style={[s.blob, s.blob2]} />
        <View style={[s.blob, s.blob3]} />
      </View>

      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.center}>
          <View style={s.logoWrap}>
            <Animated.View style={[s.glow, s.glow1, { transform: [{ scale: glowScale }], opacity: glowOpacity }]} />
            <Animated.View style={[s.glow, s.glow2, { transform: [{ scale: glowScale }], opacity: glowOpacity }]} />
            <Animated.View style={[s.logo, { transform: [{ scale: logoScale }] }]}>
              <Text style={s.logoChar}>A</Text>
            </Animated.View>
          </View>
          <Text style={s.brand}>AnganwadiHrms</Text>
          <View style={s.pill}>
            <View style={s.pillDot} />
            <Text style={s.pillText}>Workforce companion</Text>
          </View>
          <View style={s.dotsRow}>
            <Dot index={0} pulse={pulse} />
            <Dot index={1} pulse={pulse} />
            <Dot index={2} pulse={pulse} />
          </View>
        </View>
        <Text style={s.footer}>Loading your workspace…</Text>
      </SafeAreaView>
    </Animated.View>
  );
}

function Dot({ index, pulse }: { index: number; pulse: Animated.Value }) {
  const op = pulse.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange:
      index === 0 ? [0.3, 1, 0.3, 0.3] :
      index === 1 ? [0.3, 0.3, 1, 0.3] :
                    [0.3, 0.3, 0.3, 1],
  });
  return <Animated.View style={[s.dot, { opacity: op }]} />;
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.heroFrom },
  safe: { flex: 1 },

  blob: { position: 'absolute', borderRadius: 9999 },
  blob1: { width: 360, height: 360, backgroundColor: colors.heroTo,  opacity: 0.55, bottom: -160, right: -120 },
  blob2: { width: 240, height: 240, backgroundColor: '#60a5fa',       opacity: 0.35, top: -80,   right: -40 },
  blob3: { width: 260, height: 260, backgroundColor: '#93c5fd',       opacity: 0.25, top: 80,    left: -90 },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },

  logoWrap: {
    width: 132, height: 132,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  glow: { position: 'absolute', borderRadius: 9999 },
  glow1: { width: 116, height: 116, backgroundColor: '#fff' },
  glow2: { width: 150, height: 150, backgroundColor: '#bfdbfe' },
  logo: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  logoChar: { color: colors.primary, fontWeight: '800', fontSize: 38, letterSpacing: -1 },

  brand: { color: '#fff', fontWeight: '800', fontSize: 22, letterSpacing: -0.3, marginTop: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

  dotsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },

  footer: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12, fontWeight: '700', letterSpacing: 0.4,
    marginBottom: spacing.lg,
  },
});
