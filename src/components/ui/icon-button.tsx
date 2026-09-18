import { type ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

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

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={size === 'sm' ? 4 : 0}
      style={({ pressed }) => [
        styles.button,
        {
          width: box,
          height: box,
          backgroundColor,
        },
        variant === 'secondary' && { borderWidth: 1, borderColor: theme.border },
        variant !== 'ghost' && !disabled && Shadows.sm,
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
