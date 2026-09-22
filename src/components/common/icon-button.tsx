import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Shadows, MinTouchTarget, Motion } from '@/constants';
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
  sm: { box: MinTouchTarget - 8, icon: 14 },
  md: { box: MinTouchTarget, icon: 18 },
  lg: { box: MinTouchTarget + 12, icon: 22 },
};

type ThemeTokens = ReturnType<typeof useTheme>;

/** Variants and their background tokens (ghost is transparent). */
const BACKGROUND_COLOR = {
  primary: (t: ThemeTokens) => t.accent,
  cta: (t: ThemeTokens) => t.cta,
  secondary: (t: ThemeTokens) => t.surface,
  ghost: () => 'transparent',
} as const;

/** Disabled buttons are uniform regardless of variant. */
const DISABLED_BACKGROUND = (t: ThemeTokens) => t.surfaceSecondary;

/** Variants with a richer hover tint on web. */
const HOVER_BACKGROUND: Partial<Record<IconButtonVariant, (t: ThemeTokens) => string>> = {
  primary: (t) => t.accentDark,
  cta: (t) => t.ctaDark,
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

  // Table-driven token lookup replaces the nested conditional chain.
  const backgroundColor = disabled
    ? DISABLED_BACKGROUND(theme)
    : BACKGROUND_COLOR[variant](theme);
  const hoverBackgroundColor = disabled
    ? undefined
    : HOVER_BACKGROUND[variant]?.(theme);

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
            transitionDuration: `${Motion.fast}ms`,
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
