import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'error';
type BadgeSize = 'sm' | 'md';

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Status pill with soft tinted background + strong label color.
 * Optional leading dot for live status semantics.
 */
export function Badge({ label, variant = 'neutral', size = 'md', dot = false, style }: BadgeProps) {
  const theme = useTheme();

  const bg =
    variant === 'neutral'
      ? theme.surfaceSecondary
      : variant === 'accent'
        ? theme.accentSoft
        : variant === 'success'
          ? theme.successSoft
          : variant === 'warning'
            ? theme.warningSoft
            : theme.errorSoft;

  const fg =
    variant === 'neutral'
      ? theme.textSecondary
      : variant === 'accent'
        ? theme.accentDark
        : variant === 'success'
          ? theme.success
          : variant === 'warning'
            ? theme.warning
            : theme.error;

  return (
    <View
      style={[
        styles.badge,
        size === 'sm' && styles.sm,
        { backgroundColor: bg },
        style,
      ]}>
      {dot && <View style={[styles.dot, { backgroundColor: fg }]} />}
      <ThemedText type="overline" style={{ color: fg }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  sm: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
