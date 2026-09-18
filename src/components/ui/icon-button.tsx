import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

const isWeb = Platform.OS === 'web';

type IconButtonSize = 'sm' | 'md' | 'lg';
type IconButtonVariant = 'primary' | 'secondary' | 'ghost' | 'cta';

type IconButtonProps = {
  icon: ReactNode;
  onPress?: () => void;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  disabled?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

const SIZES: Record<IconButtonSize, { box: number; icon: number }> = {
  sm: { box: 36, icon: 14 },
  md: { box: 44, icon: 18 },
  lg: { box: 56, icon: 22 },
};

/**
 * Square icon-only button. Always pass `accessibilityLabel` — the icon
 * alone carries no meaning for screen readers. Small size still keeps
 * the 44pt minimum touch target by expanding the hit area.
 */
export function IconButton({
  icon,
  onPress,
  size = 'md',
  variant = 'secondary',
  disabled = false,
  accessibilityLabel,
  style,
}: IconButtonProps) {
  const theme = useTheme();

  const { box } = SIZES[size];

  const backgroundColor = disabled
    ? theme.surfaceSecondary
    : variant === 'primary'
      ? theme.accent
      : variant === 'cta'
        ? theme.cta
        : variant === 'secondary'
          ? theme.surface
          : 'transparent';

  const hoverBackgroundColor = disabled
    ? undefined
    : variant === 'primary'
      ? theme.accentDark
      : variant === 'cta'
        ? theme.ctaDark
        : undefined;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={size === 'sm' ? 4 : 0}
      style={({ pressed, hovered }) => [
        styles.button,
        {
          width: box,
          height: box,
          backgroundColor,
        },
        variant === 'secondary' && { borderWidth: 1, borderColor: theme.border },
        variant !== 'ghost' && !disabled && Shadows.sm,
        isWeb &&
          !disabled && {
            cursor: 'pointer' as const,
            transitionProperty: 'background-color, box-shadow, transform, opacity',
            transitionDuration: '150ms',
          },
        isWeb && hovered && !pressed && hoverBackgroundColor && { backgroundColor: hoverBackgroundColor },
        isWeb && hovered && variant === 'secondary' && { borderColor: theme.textTertiary + '55' },
        pressed && !disabled && styles.pressed,
        style,
      ]}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
});
