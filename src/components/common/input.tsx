import {
  useState,
  type ReactNode,
} from 'react';
import {
  StyleSheet,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/common/themed-text';
import { ThemedView } from '@/components/common/themed-view';
import { Spacing, Radius, Shadows, MinTouchTarget } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

type InputProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Text field with label, focus ring, icon slots and inline error text.
 * Focus ring + border color follow the accent; errors override both.
 */
export function Input({
  label,
  hint,
  error,
  leftIcon,
  rightIcon,
  style,
  ...props
}: InputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? theme.error : focused ? theme.accent : theme.border;

  return (
    <ThemedView style={[styles.wrapper, style]}>
      {label && (
        <ThemedText type="caption" themeColor={error ? 'error' : 'textSecondary'} style={styles.label}>
          {label}
        </ThemedText>
      )}
      <ThemedView
        style={[
          styles.field,
          {
            backgroundColor: theme.surface,
            borderColor,
          },
          focused && !error && Shadows.sm,
        ]}>
        {leftIcon && <ThemedView style={styles.iconLeft}>{leftIcon}</ThemedView>}
        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholderTextColor={theme.textTertiary}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          accessibilityLabel={props.accessibilityLabel ?? label}
          {...props}
        />
        {rightIcon && <ThemedView style={styles.iconRight}>{rightIcon}</ThemedView>}
      </ThemedView>
      {error ? (
        <ThemedText type="caption" style={{ color: theme.error }}>
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="caption" themeColor="textTertiary">
          {hint}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.two,
  },
  label: {
    marginBottom: -Spacing.one,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    minHeight: MinTouchTarget + 4,
    paddingHorizontal: Spacing.four,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    paddingVertical: Spacing.three,
  },
  iconLeft: {
    marginRight: Spacing.two,
  },
  iconRight: {
    marginLeft: Spacing.two,
  },
});
