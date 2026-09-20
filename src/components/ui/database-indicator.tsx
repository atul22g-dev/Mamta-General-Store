import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import type { DatabaseHealthStatus } from '@/hooks/use-database-health';

type DatabaseIndicatorProps = {
  status: DatabaseHealthStatus;
  /** Round-trip latency in ms; shown only when online. */
  latencyMs?: number | null;
  /** Show the "Database" label next to the dot (default true). */
  labeled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const LABELS: Record<DatabaseHealthStatus, string> = {
  checking: 'Checking…',
  online: 'Database connected',
  offline: 'Database offline',
};

/**
 * Connection status pill for the database. Table-driven per state:
 * status → (dot color, soft background, icon, label). Used on the admin
 * dashboard and the Settings "About" group so staff can see at a glance
 * whether the store server is reachable.
 */
export function DatabaseIndicator({
  status,
  latencyMs,
  labeled = true,
  style,
}: DatabaseIndicatorProps) {
  const theme = useTheme();

  const color =
    status === 'online' ? theme.success : status === 'offline' ? theme.error : theme.warning;
  const soft =
    status === 'online' ? theme.successSoft : status === 'offline' ? theme.errorSoft : theme.warningSoft;
  const icon: 'checkmark-circle' | 'close-circle' | 'sync-circle' = status === 'online'
    ? 'checkmark-circle'
    : status === 'offline'
      ? 'close-circle'
      : 'sync-circle';

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={LABELS[status]}
      style={[styles.pill, { backgroundColor: soft }, style]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Icon name={icon} size={14} color={color} />
      {labeled && (
        <ThemedText type="caption" style={{ color }}>
          {LABELS[status]}
          {status === 'online' && typeof latencyMs === 'number' ? ` · ${latencyMs} ms` : ''}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    minHeight: 28,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
  },
});
