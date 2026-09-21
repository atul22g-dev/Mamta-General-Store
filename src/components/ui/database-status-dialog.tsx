import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import type { DatabaseHealthStatus } from '@/hooks/use-database-health';
import type { HealthCheckResult } from '@/lib/health-service';

type DatabaseStatusDialogProps = {
  visible: boolean;
  status: DatabaseHealthStatus;
  health: HealthCheckResult;
  onClose: () => void;
  onRetry: () => void;
};

/** Human explanation for each machine failure code. */
function whyOffline(health: HealthCheckResult): string {
  switch (health.code) {
    case 'PGRST002':
      return 'The store API is reachable, but it cannot query the database. The database service on the server is likely down or restarting.';
    case 'PGRST205':
      return 'The database is running, but its tables have not been created yet. The database setup (migrations) still needs to be applied on the server.';
    case 'PROBE_TIMEOUT':
      return 'The server did not answer within 8 seconds. It may be overloaded or offline.';
    case 'NETWORK_ERROR':
      return 'No connection to the store server. Check this device\'s internet, or the server may be down.';
    case 'API_ERROR':
      return 'The store API reported an error while checking the database.';
    default:
      return 'The store server is not responding properly right now.';
  }
}

type DialogVisuals = {
  color: string;
  soft: string;
  icon: 'checkmark-circle' | 'close-circle' | 'sync-circle';
  headline: string;
  detail: string;
};

/** Maps health status → the dialog's color, glyph, headline and body copy. */
function dialogVisuals(
  status: DatabaseHealthStatus,
  health: HealthCheckResult,
  theme: ReturnType<typeof useTheme>,
): DialogVisuals {
  if (status === 'online') {
    return {
      color: theme.success,
      soft: theme.successSoft,
      icon: 'checkmark-circle',
      headline: 'Database connected',
      detail:
        typeof health.latencyMs === 'number'
          ? `Everything is working. Response time: ${health.latencyMs} ms.`
          : 'Everything is working.',
    };
  }
  if (status === 'offline') {
    return {
      color: theme.error,
      soft: theme.errorSoft,
      icon: 'close-circle',
      headline: 'Database not connected',
      detail: whyOffline(health),
    };
  }
  return {
    color: theme.warning,
    soft: theme.warningSoft,
    icon: 'sync-circle',
    headline: 'Checking database…',
    detail: 'Contacting the store server…',
  };
}

/**
 * Tappable "Store database" status dialog: says plainly whether the
 * database is connected, and when it is not, WHY — the actual error code
 * and message from the failed probe, translated into plain language.
 */
export function DatabaseStatusDialog({
  visible,
  status,
  health,
  onClose,
  onRetry,
}: DatabaseStatusDialogProps) {
  const theme = useTheme();
  const { color, soft, icon, headline, detail } = dialogVisuals(status, health, theme);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.center} onPress={undefined}>
          <Animated.View
            entering={ZoomIn.duration(180)}
            exiting={ZoomOut.duration(140)}
            style={[styles.card, { backgroundColor: theme.surface }, Shadows.lg]}>
            <View style={[styles.iconTile, { backgroundColor: soft }]}>
              <View style={[styles.iconRing, { borderColor: color }]} />
              <Icon name={icon} size={26} color={color} />
            </View>
            <ThemedText type="h3" style={styles.title}>
              {headline}
            </ThemedText>
            <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.message}>
              {detail}
            </ThemedText>

            {status === 'online' && typeof health.latencyMs === 'number' && (
              <Animated.View
                entering={FadeInDown.duration(220)}
                style={[styles.statChip, { backgroundColor: soft, borderColor: `${color}33` }]}>
                <ThemedText type="h3" style={{ color }}>
                  {Math.round(health.latencyMs)}
                </ThemedText>
                <ThemedText type="caption" style={[styles.statUnit, { color }]}>
                  ms round trip
                </ThemedText>
              </Animated.View>
            )}

            {status === 'offline' && health.code !== null && (
              <View style={[styles.technical, { backgroundColor: theme.surfaceSecondary }]}>
                <ThemedText type="caption" themeColor="textTertiary">
                  Technical detail: {health.code}
                  {health.message ? ` — ${health.message}` : ''}
                </ThemedText>
              </View>
            )}

            <View style={styles.actions}>
              {status === 'offline' && (
                <Button
                  title="Retry"
                  variant="primary"
                  size="sm"
                  onPress={onRetry}
                  block
                />
              )}
              <Button title="Close" variant="secondary" size="sm" onPress={onClose} block />
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.xl,
    padding: Spacing.five,
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  iconRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statUnit: {
    fontWeight: '600',
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
  },
  technical: {
    alignSelf: 'stretch',
    borderRadius: Radius.md,
    padding: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
    alignSelf: 'stretch',
    marginTop: Spacing.two,
  },
});
