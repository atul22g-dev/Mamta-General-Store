import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Motion, Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

/** Solid variants and their background tokens (ghost is transparent). */
const BACKGROUND_COLOR = {
  primary: (t: ThemeTokens) => t.accent,
  cta: (t: ThemeTokens) => t.cta,
  secondary: (t: ThemeTokens) => t.surface,
  tertiary: (t: ThemeTokens) => t.surfaceSecondary,
  danger: (t: ThemeTokens) => t.error,
  ghost: () => 'transparent',
} as const;

const isWeb = Platform.OS === 'web';

type ButtonVariant = 'primary' | 'cta' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';
type ThemeTokens = ReturnType<typeof useTheme>;

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Solid variants get a white label; bordered ones text; ghost accent. */
const TEXT_COLOR: Record<ButtonVariant, (t: ThemeTokens) => string> = {
  primary: (t) => t.white,
  cta: (t) => t.white,
  danger: (t) => t.white,
  secondary: (t) => t.text,
  tertiary: (t) => t.text,
  ghost: (t) => t.accent,
};

/** Disabled buttons are uniform regardless of variant. */
const DISABLED_STYLE = {
  backgroundColor: (t: ThemeTokens) => t.surfaceSecondary,
  color: (t: ThemeTokens) => t.textTertiary,
} as const;

/** Bordered variants draw a hairline outline. */
const BORDERED: ReadonlySet<ButtonVariant> = new Set(['secondary', 'tertiary']);

/** Variants with a richer hover tint on web. */
const HOVER_BACKGROUND: Partial<Record<ButtonVariant, (t: ThemeTokens) => string>> = {
  primary: (t) => t.accentDark,
  cta: (t) => t.ctaDark,
};

/**
 * Pressable text button with variant + size scale.
 * Every size keeps a >= 44pt touch target for accessibility.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  block = false,
  disabled = false,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const theme = useTheme();

  // Style resolution is table-driven: each variant/size maps to tokens in
  // the lookup tables above instead of nested conditionals here.
  const sizeStyle =
    size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : styles.md;
  const backgroundColor = disabled
    ? DISABLED_STYLE.backgroundColor(theme)
    : BACKGROUND_COLOR[variant](theme);
  const textColor = disabled
    ? DISABLED_STYLE.color(theme)
    : TEXT_COLOR[variant](theme);
  const hoverBackgroundColor = disabled
    ? undefined
    : HOVER_BACKGROUND[variant]?.(theme);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled, busy: false }}
      style={({ pressed, hovered }) => [
        styles.button,
        sizeStyle,
        { backgroundColor },
        BORDERED.has(variant) && { borderWidth: 1, borderColor: theme.border },
        variant !== 'ghost' && !disabled && Shadows.sm,
        isWeb &&
          !disabled && {
            cursor: 'pointer' as const,
            transitionProperty: 'background-color, box-shadow, transform, opacity',
            transitionDuration: `${Motion.fast}ms`,
          },
        isWeb && hovered && !pressed && hoverBackgroundColor && { backgroundColor: hoverBackgroundColor },
        isWeb && hovered && !disabled && Shadows.md,
        block && styles.block,
        pressed && !disabled && styles.pressed,
        style,
      ]}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <ThemedText
        type="smallBold"
        style={[{ color: textColor }, size === 'lg' && styles.textLg]}>
        {title}
      </ThemedText>
      {iconRight && <View style={styles.icon}>{iconRight}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    gap: Spacing.two,
    alignSelf: 'flex-start',
  },
  block: {
    alignSelf: 'stretch',
  },
  sm: {
    minHeight: MinTouchTarget,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  md: {
    minHeight: MinTouchTarget + 8,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  lg: {
    minHeight: MinTouchTarget + 12,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  textLg: {
    fontSize: 16,
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.85,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
