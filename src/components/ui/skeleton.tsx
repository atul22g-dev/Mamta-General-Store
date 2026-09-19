import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

/** One pulsing block. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [progress]);

  const pulse = useAnimatedStyle(() => ({
    opacity: 0.45 + 0.4 * progress.value,
  }));

  return (
    <Animated.View
      style={[
        { backgroundColor: theme.surfaceSecondary, borderRadius: Radius.sm },
        pulse,
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
    gap: 12,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: 8,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
  },
  lines: {
    flex: 1,
    gap: 8,
  },
  lineWide: {
    height: 12,
    width: '72%',
  },
  lineShort: {
    height: 10,
    width: '42%',
  },
  price: {
    width: 52,
    height: 16,
  },
});
