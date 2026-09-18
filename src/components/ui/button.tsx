import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

const isWeb = Platform.OS === 'web';

type ButtonVariant = 'primary' | 'cta' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

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

  const backgroundColor = disabled
    ? theme.surfaceSecondary
    : variant === 'primary'
      ? theme.accent
      : variant === 'cta'
        ? theme.cta
        : variant === 'secondary'
          ? theme.surface
          : variant === 'tertiary'
            ? theme.surfaceSecondary
            : variant === 'danger'
              ? theme.error
              : 'transparent';

  const textColor = disabled
    ? theme.textTertiary
    : variant === 'primary' || variant === 'cta' || variant === 'danger'
      ? theme.white
      : variant === 'secondary'
        ? theme.text
        : variant === 'tertiary'
          ? theme.text
          : theme.accent;

  // Richer hover tint for solid variants on web.
  const hoverBackgroundColor = disabled
    ? undefined
    : variant === 'primary'
      ? theme.accentDark
      : variant === 'cta'
        ? theme.ctaDark
        : undefined;

  const sizeStyle =
    size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : styles.md;

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
        (variant === 'secondary' || variant === 'tertiary') && {
          borderWidth: 1,
          borderColor: theme.border,
        },
        variant !== 'ghost' && !disabled && Shadows.sm,
        isWeb &&
          !disabled && {
            cursor: 'pointer' as const,
            transitionProperty: 'background-color, box-shadow, transform, opacity',
            transitionDuration: '150ms',
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
    minHeight: 44,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  md: {
    minHeight: 52,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  lg: {
    minHeight: 56,
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
