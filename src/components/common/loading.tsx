import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/common/themed-text';
import { Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

type LoadingProps = {
  text?: string;
  size?: 'small' | 'large';
  style?: StyleProp<ViewStyle>;
  /** Show the store icon above the dots (full-screen loading surfaces). */
  showIcon?: boolean;
};

/**
 * Loading indicator: optional store icon + three pulsing dots + label.
 * Uses a shared-value pulse (opacity + scale) that loops smoothly; the
 * icon breathes gently so waiting feels intentional, not frozen.
 */
export function Loading({ text, size = 'large', style, showIcon = false }: LoadingProps) {
  const theme = useTheme();

  const dotSize = size === 'small' ? 6 : 10;
  const gap = size === 'small' ? 4 : 8;

  const progress = useSharedValue(0);
  const iconProgress = useSharedValue(0);

  useEffect(() => {
    // Compiler-compatible shared-value accessors (.set/.get) — direct
    // .value writes are a mutation the React Compiler cannot optimize.
    progress.set(
      withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
    iconProgress.set(
      withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [progress, iconProgress]);

  const pulse = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.65 * progress.get(),
    transform: [{ scale: 0.85 + 0.15 * progress.get() }],
  }));

  const iconBreath = useAnimatedStyle(() => ({
    opacity: 0.85 + 0.15 * iconProgress.get(),
    transform: [{ scale: 0.97 + 0.03 * iconProgress.get() }],
  }));

  return (
    <View style={[styles.container, style]}>
      {showIcon && (
        <Animated.View style={iconBreath}>
          <Image
            source={require('@/assets/images/play_store_512.png')}
            style={styles.icon}
            contentFit="contain"
            transition={0}
          />
        </Animated.View>
      )}
      <View style={[styles.dotsRow, { gap }]}>
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            style={[
              pulse,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: theme.accent,
              },
            ]}
          />
        ))}
      </View>
      {text && (
        <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.text}>
          {text}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
    gap: Spacing.three,
  },
  icon: {
    width: 72,
    height: 72,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    marginTop: Spacing.one,
  },
});
