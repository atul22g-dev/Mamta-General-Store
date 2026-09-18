import { StyleSheet, ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

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
  const statusColor =
    status === 'active'
      ? '#34C759'
      : status === 'pending'
        ? '#FF9500'
        : '#60646C';

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.card, style]}
      {...props}>
      <ThemedView style={styles.content}>
        <ThemedView style={styles.textContainer}>
          <ThemedText type="smallBold" style={styles.title}>
            {title || 'Item'}
          </ThemedText>
          {description && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
              {description}
            </ThemedText>
          )}
        </ThemedView>
        <ThemedView style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <ThemedText type="small" style={[styles.statusText, { color: statusColor }]}>
            {status}
          </ThemedText>
        </ThemedView>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
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
    gap: Spacing.one,
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
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
  },
  statusText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
