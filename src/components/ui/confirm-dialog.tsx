import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Centered confirmation dialog with a scrim. Used for irreversible
 * actions (e.g. deleting a product). Escape hatches: tapping the scrim
 * or Cancel both dismiss.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onCancel}>
      {/* Scrim catches outside taps to dismiss. */}
      <Pressable style={styles.scrim} onPress={busy ? undefined : onCancel}>
        <Pressable style={styles.center} onPress={undefined}>
          <Animated.View
            entering={ZoomIn.duration(180)}
            exiting={ZoomOut.duration(140)}
            style={[styles.card, { backgroundColor: theme.surface }, Shadows.lg]}>
            <View
              style={[
                styles.iconTile,
                { backgroundColor: destructive ? theme.errorSoft : theme.accentSoft },
              ]}>
              <Icon
                name="trash"
                size={24}
                color={destructive ? theme.error : theme.accent}
              />
            </View>
            <ThemedText type="h3" style={styles.title}>
              {title}
            </ThemedText>
            <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.message}>
              {message}
            </ThemedText>
            <View style={styles.actions}>
              <Button
                title={cancelLabel}
                variant="secondary"
                size="sm"
                onPress={onCancel}
                disabled={busy}
                block
              />
              <Button
                title={busy ? 'Deleting…' : confirmLabel}
                variant={destructive ? 'danger' : 'primary'}
                size="sm"
                onPress={onConfirm}
                disabled={busy}
                block
              />
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
  message: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignSelf: 'stretch',
    marginTop: Spacing.three,
  },
});
