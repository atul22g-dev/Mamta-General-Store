import { StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

type CardPadding = 'none' | 'compact' | 'normal' | 'roomy';

type CardProps = {
  children?: React.ReactNode;
  onPress?: () => void;
  elevated?: boolean;
  padding?: CardPadding;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const PADDING: Record<CardPadding, number> = {
  none: 0,
  compact: Spacing.three,
  normal: Spacing.four,
  roomy: Spacing.five,
};

/**
 * Surface container. Pass `onPress` for an interactive card with
 * press feedback; otherwise it renders as a static view.
 */
export function Card({
  children,
  onPress,
  elevated = true,
  padding = 'normal',
  accessibilityLabel,
  style,
}: CardProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          padding: PADDING[padding],
        },
        elevated && Shadows.md,
        onPress && pressed && styles.pressed,
        style,
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});
