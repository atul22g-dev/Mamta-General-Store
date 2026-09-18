import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AdminCardProps = ViewProps & {
  title?: string;
  description?: string;
  status?: 'active' | 'pending' | 'inactive';
};

export function AdminCard({
  style,
  title,
  description,
  status = 'pending',
  ...props
}: AdminCardProps) {
  const theme = useTheme();

  const statusColor =
    status === 'active'
      ? theme.success
      : status === 'pending'
        ? theme.warning
        : theme.textTertiary;

  const statusBg =
    status === 'active'
      ? theme.successSoft
      : status === 'pending'
        ? theme.warningSoft
        : theme.surfaceSecondary;

  return (
    <ThemedView
      type="surface"
      style={[styles.card, { borderColor: theme.border }, style]}
      {...props}>
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <ThemedText type="smallBold" style={styles.title}>
            {title || 'Item'}
          </ThemedText>
          {description && (
            <ThemedText type="caption" themeColor="textSecondary" style={styles.description}>
              {description}
            </ThemedText>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <ThemedText type="caption" style={[styles.statusText, { color: statusColor }]}>
            {status}
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
    borderWidth: 1,
    minHeight: 72,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  textContainer: {
    flex: 1,
    gap: Spacing.one / 2,
  },
  title: {
    fontSize: 15,
    lineHeight: 22,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    textTransform: 'capitalize',
  },
});
