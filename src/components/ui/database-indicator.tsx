import { useEffect } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import type { DatabaseHealthStatus } from '@/hooks/use-database-health';

type DatabaseIndicatorProps = {
  status: DatabaseHealthStatus;
  /** Round-trip latency in ms; shown only when online. */
  latencyMs?: number | null;
  /** Show the "Database" label next to the dot (default true). */
  labeled?: boolean;
  /** When provided, the pill is tappable (press feedback + a11y role). */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const LABELS: Record<DatabaseHealthStatus, string> = {
  checking: 'Checking…',
  online: 'Database connected',
  offline: 'Database offline',
};

/** Round-trip time → compact label. Calibrated for a Supabase round trip. */
function latencyLabel(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  return `${Math.round(ms)} ms`;
}

/**
 * Connection status pill for the database — modern status-page styling:
 * a colored status dot with a soft live "ping" ring while online, a
 * hairline tinted border, and the latency in its own tinted segment.
 * Table-driven per state: status → (color, soft background, label).
 * Used on the admin dashboard and the Settings "About" group so staff can
 * see at a glance whether the store server is reachable.
 */
export function DatabaseIndicator({
  status,
  latencyMs,
  labeled = true,
  onPress,
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

  const quality = status === 'online' ? latencyLabel(latencyMs) : null;

  // Live ping: a fading ring emitted from the dot while online. Ambient
  // loop via compiler-safe shared-value accessors (.set/.get).
  const ping = useSharedValue(0);
  useEffect(() => {
    if (status === 'online') {
      ping.set(
        withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, false),
      );
    } else {
      ping.set(0);
    }
  }, [ping, status]);

  const pingStyle = useAnimatedStyle(() => ({
    opacity: (1 - ping.get()) * 0.5,
    transform: [{ scale: 1 + ping.get() * 1.6 }],
  }));

  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.get() }],
  }));

  const body = (
    <Animated.View
      style={[
        pressStyle,
        styles.pill,
        { backgroundColor: soft, borderColor: `${color}33` },
        status === 'online' && Shadows.sm,
        style,
      ]}>
      <View style={styles.dotWrap}>
        <Animated.View
          pointerEvents="none"
          style={[styles.pingRing, pingStyle, { borderColor: color }]}
        />
        <View style={[styles.dot, { backgroundColor: color }]} />
      </View>
      {labeled && (
        <ThemedText type="caption" style={[styles.label, { color }]}>
          {LABELS[status]}
        </ThemedText>
      )}
      {quality && (
        <View style={[styles.latencyChip, { backgroundColor: `${color}1F` }]}>
          <ThemedText type="caption" style={[styles.latencyText, { color }]}>
            {quality}
          </ThemedText>
        </View>
      )}
      {status !== 'online' && <Icon name={icon} size={13} color={color} />}
    </Animated.View>
  );

  const accessibility = `${LABELS[status]}${quality ? `, ${quality}` : ''}`;

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${accessibility} — tap for details`}
        onPress={onPress}
        onPressIn={() => press.set(0.96)}
        onPressOut={() => press.set(1)}
        style={styles.pressArea}>
        {body}
      </Pressable>
    );
  }

  return (
    <View accessibilityRole="text" accessibilityLabel={accessibility} style={styles.pressArea}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  pressArea: {
    alignSelf: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 1,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
    minHeight: 30,
  },
  dotWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pingRing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: Radius.full,
    borderWidth: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
  },
  label: {
    fontWeight: '600',
  },
  latencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  latencyText: {
    fontWeight: '600',
  },
});
