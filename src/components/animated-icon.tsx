import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  Keyframe,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/common/themed-text';
import { APP_ICON_SOURCE, Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

const DURATION = 600;

/**
 * Native startup screen — modern brand launch, fully theme-aware (light and
 * dark follow the app palette instead of a hardcoded white flash):
 *   • a rounded brand-tinted tile holding the store icon, popping in;
 *   • the wordmark and tagline staggering in beneath it;
 *   • a quiet three-dot loading wave in the brand accent;
 *   • a gentle scale+fade handoff as the app mounts.
 *
 * Motion follows the system reduced-motion setting: the entrance stagger and
 * the loading wave both settle to calm, static states. Runs after the static
 * splash hides (expo-splash-screen), then animates out once the first frame
 * of real content is ready.
 */
export function AnimatedSplashOverlay() {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    25: {
      opacity: 1,
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1.06 }],
      easing: Easing.in(Easing.cubic),
    },
  });

  const content = (
    <>
      <Animated.View
        entering={reduceMotion ? FadeIn.duration(200) : logoKeyframe.duration(DURATION)}
        style={[
          styles.iconTile,
          { backgroundColor: theme.accentSoft, borderColor: `${theme.accent}22` },
          Shadows.sm,
        ]}>
        <Image style={styles.splashImage} source={APP_ICON_SOURCE} contentFit="contain" />
      </Animated.View>

      <Animated.View
        entering={reduceMotion ? undefined : FadeInDown.duration(400).delay(220)}
        style={styles.wordmark}>
        <ThemedText type="h1" style={[styles.splashTitle, { color: theme.text }]}>
          Mamta General Store
        </ThemedText>
        <ThemedText type="bodySmall" style={[styles.splashSubtitle, { color: theme.textSecondary }]}>
          Scan to price · Inventory in your pocket
        </ThemedText>
      </Animated.View>

      <SplashDots color={theme.accent} reduceMotion={reduceMotion} />
    </>
  );

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={[styles.splashOverlay, { backgroundColor: theme.background }]}>
      {content}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={[styles.splashOverlay, { backgroundColor: theme.background }]}>
      {content}
    </View>
  );
}

/**
 * Quiet loading wave shown at the bottom of the startup screen. Continuous
 * animation is reserved for loading indicators (UI guideline): three dots
 * pulse in a staggered wave in the brand accent. With reduced motion the
 * dots stay static — no infinite animation runs at all.
 */
function SplashDots({ color, reduceMotion }: { color: string; reduceMotion: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return; // static dots — the calm fallback
    // Compiler-safe shared-value accessors (.set/.get).
    progress.set(
      withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
    return () => progress.set(0);
  }, [progress, reduceMotion]);

  const pulse = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.7 * progress.get(),
    transform: [{ scale: 0.85 + 0.15 * progress.get() }],
  }));

  return (
    <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(300).delay(500)} style={styles.dotsRow}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            reduceMotion ? styles.dotStatic : pulse,
            { backgroundColor: color, marginLeft: i === 0 ? 0 : Spacing.two },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 0.6 }],
    opacity: 0,
  },
  60: {
    transform: [{ scale: 1.06 }],
    opacity: 1,
    easing: Easing.out(Easing.back(1.6)),
  },
  100: {
    transform: [{ scale: 1 }],
  },
});

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    gap: Spacing.three,
  },
  iconTile: {
    width: 132,
    height: 132,
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashImage: {
    width: 112,
    height: 112,
    borderRadius: 28,
  },
  wordmark: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  splashTitle: {
    letterSpacing: -0.5,
  },
  splashSubtitle: {
    letterSpacing: 0.1,
  },
  dotsRow: {
    flexDirection: 'row',
    marginTop: Spacing.five,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  dotStatic: {
    opacity: 0.45,
  },
});
