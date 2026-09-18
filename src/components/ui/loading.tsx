import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

type LoadingProps = {
  text?: string;
  size?: 'small' | 'large';
  style?: StyleProp<ViewStyle>;
};

/**
 * Loading indicator: three pulsing dots + optional label.
 * Uses a shared-value pulse (opacity + scale) that loops smoothly.
 */
export function Loading({ text, size = 'large', style }: LoadingProps) {
  const theme = useTheme();

  const dotSize = size === 'small' ? 6 : 10;
  const gap = size === 'small' ? 4 : 8;

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [progress]);

  const pulse = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.65 * progress.value,
    transform: [{ scale: 0.85 + 0.15 * progress.value }],
  }));

  return (
    <View style={[styles.container, style]}>
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
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    marginTop: Spacing.one,
  },
});
