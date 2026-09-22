import { Platform, StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { MinTouchTarget, Motion, Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

const isWeb = Platform.OS === 'web';

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
      style={({ pressed, hovered }) => [
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          padding: PADDING[padding],
        },
        elevated && Shadows.md,
        onPress &&
          isWeb && {
            cursor: 'pointer' as const,
            transitionProperty: 'box-shadow, transform, border-color',
            transitionDuration: `${Motion.base}ms`,
          },
        onPress && hovered && !pressed && Shadows.lg,
        onPress && hovered && !pressed && { borderColor: theme.textTertiary + '55' },
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
    minHeight: MinTouchTarget,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});
