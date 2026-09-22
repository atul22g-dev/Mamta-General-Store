import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';

import { Radius, Shadows, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

/**
 * One pulsing block — the loading placeholder pattern (loading-states rule).
 * Honors prefers-reduced-motion: the looping pulse is replaced by a static
 * tinted block, because the loop is decorative, not informational.
 */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return; // static block — no loop
    progress.set(
      withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [progress, reducedMotion]);

  const pulse = useAnimatedStyle(() => ({
    opacity: 0.45 + 0.4 * progress.get(),
  }));

  return (
    <Animated.View
      style={[
        {
          backgroundColor: theme.surfaceSecondary,
          borderRadius: Radius.sm,
        },
        reducedMotion ? null : pulse,
        style,
      ]}
    />
  );
}

/** Product-card skeleton row matching SearchResultRow / ProductRow shapes. */
export function SkeletonRow({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.surface, borderColor: theme.border },
        Shadows.sm,
        style,
      ]}>
      <Skeleton style={styles.thumb} />
      <View style={styles.lines}>
        <Skeleton style={styles.lineWide} />
        <Skeleton style={styles.lineShort} />
      </View>
      <Skeleton style={styles.price} />
    </View>
  );
}

/** A stack of skeleton rows. */
export function SkeletonList({ count = 5, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
  },
  lines: {
    flex: 1,
    gap: Spacing.two,
  },
  lineWide: {
    height: 14,
    width: '70%',
    borderRadius: Radius.sm,
  },
  lineShort: {
    height: 12,
    width: '45%',
    borderRadius: Radius.sm,
  },
  price: {
    width: 56,
    height: 16,
    borderRadius: Radius.sm,
  },
});
