import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: ReactNode;
  disabled?: boolean;
  style?: Record<string, unknown>;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  style,
}: ButtonProps) {
  const theme = useTheme();

  const backgroundColor = disabled
    ? theme.backgroundElement
    : variant === 'primary'
      ? '#208AEF'
      : variant === 'secondary'
        ? theme.backgroundElement
        : 'transparent';

  const textColor = disabled
    ? theme.textSecondary
    : variant === 'primary'
      ? '#ffffff'
      : theme.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor },
        pressed && !disabled && styles.pressed,
        variant === 'ghost' && styles.ghostButton,
        style,
      ]}>
      {icon && <ThemedView style={styles.iconContainer}>{icon}</ThemedView>}
      <ThemedText type="smallBold" style={{ color: textColor }}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    minHeight: 52,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.85,
  },
  ghostButton: {
    backgroundColor: 'transparent',
  },
  iconContainer: {
    marginRight: Spacing.one,
  },
});
