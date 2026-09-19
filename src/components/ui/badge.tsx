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

type ThemeTokens = ReturnType<typeof useTheme>;

/** Each variant's soft background + strong foreground token pair. */
const COLORS: Record<BadgeVariant, { bg: (t: ThemeTokens) => string; fg: (t: ThemeTokens) => string }> = {
  neutral: { bg: (t) => t.surfaceSecondary, fg: (t) => t.textSecondary },
  accent: { bg: (t) => t.accentSoft, fg: (t) => t.accentDark },
  success: { bg: (t) => t.successSoft, fg: (t) => t.success },
  warning: { bg: (t) => t.warningSoft, fg: (t) => t.warning },
  error: { bg: (t) => t.errorSoft, fg: (t) => t.error },
};

/**
 * Status pill with soft tinted background + strong label color.
 * Optional leading dot for live status semantics.
 */
export function Badge({ label, variant = 'neutral', size = 'md', dot = false, style }: BadgeProps) {
  const theme = useTheme();

  // Table-driven token lookup replaces the nested conditional chain.
  const { bg, fg } = COLORS[variant];

  return (
    <View
      style={[
        styles.badge,
        size === 'sm' && styles.sm,
        { backgroundColor: bg(theme) },
        style,
      ]}>
      {dot && <View style={[styles.dot, { backgroundColor: fg(theme) }]} />}
      <ThemedText type="overline" style={{ color: fg(theme) }}>
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
