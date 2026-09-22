import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { Icon } from '@/components/common/icon';

import { ThemedText } from '@/components/common/themed-text';
import { ThemedView } from '@/components/common/themed-view';
import { Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

type EmptyStateProps = ViewProps & {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
};

export function EmptyState({
  title,
  description,
  action,
  icon,
  style,
}: EmptyStateProps) {
  const theme = useTheme();

  return (
    <ThemedView
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
        style,
      ]}>
      <View style={[styles.iconContainer, { backgroundColor: theme.accentSoft }]}>
        {icon ?? (
          <Icon name="cube-outline" size={26} color={theme.accent} />
        )}
      </View>
      <ThemedText type="h3" style={styles.title}>
        {title}
      </ThemedText>
      {description && (
        <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.description}>
          {description}
        </ThemedText>
      )}
      {action && <View style={styles.action}>{action}</View>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    maxWidth: 280,
  },
  action: {
    marginTop: Spacing.two,
  },
});
