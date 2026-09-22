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

/**
 * Per-status presentation, in ONE table.
 *
 * These used to be three parallel ternary chains (foreground colour, soft
 * background, icon) plus a separate label map, all of which had to be kept in
 * sync by hand — adding a status meant editing four places, and a mismatch was
 * a silent visual bug rather than a type error. Now the status is looked up
 * once and each field has exactly one definition.
 */
const STATUS: Record<
  DatabaseHealthStatus,
  {
    label: string;
    icon: 'checkmark-circle' | 'close-circle' | 'sync-circle';
    /** Theme key for the foreground colour. */
    tone: 'success' | 'warning' | 'error';
    /** Theme key for the matching soft background. */
    softTone: 'successSoft' | 'warningSoft' | 'errorSoft';
  }
> = {
  checking: {
    label: 'Checking…',
    icon: 'sync-circle',
    tone: 'warning',
    softTone: 'warningSoft',
  },
  online: {
    label: 'Database connected',
    icon: 'checkmark-circle',
    tone: 'success',
    softTone: 'successSoft',
  },
  offline: {
    label: 'Database offline',
    icon: 'close-circle',
    tone: 'error',
    softTone: 'errorSoft',
  },
};

/** Round-trip time → compact label. Calibrated for a Supabase round trip. */
function latencyLabel(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  return `${Math.round(ms)} ms`;
}

/**
 * Status dot with its live "ping" ring, which pulses while the database is
 * reachable. Owns the ambient animation so the pill above stays a plain layout
 * component (compiler-safe shared-value accessors: .set/.get).
 */
function StatusDot({ color, pinging }: { color: string; pinging: boolean }) {
  const ping = useSharedValue(0);

  useEffect(() => {
    if (pinging) {
      ping.set(
        withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, false),
      );
    } else {
      ping.set(0);
    }
  }, [ping, pinging]);

  const pingStyle = useAnimatedStyle(() => ({
    opacity: (1 - ping.get()) * 0.5,
    transform: [{ scale: 1 + ping.get() * 1.6 }],
  }));

  return (
    <View style={styles.dotWrap}>
      <Animated.View
        pointerEvents="none"
        style={[styles.pingRing, pingStyle, { borderColor: color }]}
      />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

/**
 * Connection status pill for the database — modern status-page styling:
 * a colored status dot with a soft live "ping" ring while online, a
 * hairline tinted border, and the latency in its own tinted segment.
 * Presentation is looked up from STATUS: status → (label, icon, tones).
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
  const { label, icon, tone, softTone } = STATUS[status];
  const color = theme[tone];
  const soft = theme[softTone];
  const online = status === 'online';
  const quality = online ? latencyLabel(latencyMs) : null;

  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.get() }],
  }));

  const body = (
    <Animated.View
      style={[
        pressStyle,
        styles.pill,        {backgroundColor: soft, borderColor: `${color}33` },
        online && Shadows.sm,
        style,
      ]}>
      <StatusDot color={color} pinging={online} />
      {labeled && (
        <ThemedText type="caption" style={[styles.label, { color }]}>
          {label}
        </ThemedText>
      )}
      {quality && (
        <View style={[styles.latencyChip, { backgroundColor: `${color}1F` }]}>
          <ThemedText type="caption" style={[styles.latencyText, { color }]}>
            {quality}
          </ThemedText>
        </View>
      )}
      {!online && <Icon name={icon} size={13} color={color} />}
    </Animated.View>
  );

  const accessibility = `${label}${quality ? `, ${quality}` : ''}`;

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
