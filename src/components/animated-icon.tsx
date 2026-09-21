import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  Keyframe,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Radius, Shadows } from '@/constants';

const INITIAL_SCALE_FACTOR = Dimensions.get('screen').height / 90;
const DURATION = 600;

/** Single source for the store icon everywhere it is displayed. */
export const APP_ICON_SOURCE = require('@/assets/images/play_store_512.png');

/**
 * Native startup screen — modern brand launch:
 *   • a rounded brand-gradient tile holding the store icon, popping in;
 *   • the wordmark and tagline staggering in beneath it;
 *   • a quiet three-dot loading pulse at the bottom;
 *   • a gentle scale+fade handoff as the app mounts.
 *
 * Runs after the static splash hides (expo-splash-screen), then animates
 * out once the first frame of real content is ready.
 */
export function AnimatedSplashOverlay() {
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
        entering={logoKeyframe.duration(DURATION)}
        style={[styles.iconTile, Shadows.lg]}>
        <Image style={styles.splashImage} source={APP_ICON_SOURCE} contentFit="contain" />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(220)} style={styles.wordmark}>
        <ThemedText type="h1" style={styles.splashTitle}>
          Mamta General Store
        </ThemedText>
        <ThemedText type="bodySmall" style={styles.splashSubtitle}>
          Scan to price · Inventory in your pocket
        </ThemedText>
      </Animated.View>

      <SplashDots />
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
      style={styles.splashOverlay}>
      {content}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.splashOverlay}>
      {content}
    </View>
  );
}

/** Quiet loading pulse shown at the bottom of the startup screen. */
function SplashDots() {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Compiler-safe shared-value accessors (.set/.get).
    progress.set(
      withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
  }, [progress]);

  const pulse = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.7 * progress.get(),
    transform: [{ scale: 0.85 + 0.15 * progress.get() }],
  }));

  return (
    <Animated.View entering={FadeIn.duration(300).delay(500)} style={styles.dotsRow}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[styles.dot, pulse, { marginLeft: i === 0 ? 0 : Spacing.two }]}
        />
      ))}
    </Animated.View>
  );
}

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: INITIAL_SCALE_FACTOR }],
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '0deg' }],
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

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

/**
 * Animated app icon (used by dev/launch surfaces): the store icon inside
 * a rounded brand-tinted tile with a slow rotating glow behind it.
 */
export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={glowKeyframe.duration(60 * 1000 * 4)} style={styles.glow}>
        <Image style={styles.glow} source={APP_ICON_SOURCE} contentFit="contain" />
      </Animated.View>

      <Animated.View entering={keyframe.duration(DURATION)} style={styles.background} />
      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Image style={styles.image} source={APP_ICON_SOURCE} contentFit="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
    opacity: 0.18,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
    zIndex: 100,
  },
  image: {
    width: 96,
    height: 96,
  },
  background: {
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    width: 128,
    height: 128,
    position: 'absolute',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    gap: Spacing.three,
  },
  iconTile: {
    width: 132,
    height: 132,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashImage: {
    width: 112,
    height: 112,
  },
  wordmark: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  splashTitle: {
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  splashSubtitle: {
    color: '#64748B',
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
    backgroundColor: '#CBD5E1',
  },
});
