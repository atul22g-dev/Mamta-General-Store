import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/common/icon';

import { ThemedText } from '@/components/common/themed-text';
import { ThemedView } from '@/components/common/themed-view';
import { Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

type ErrorStateProps = {
  title?: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Error panel with icon, message and optional retry button.
 * Retry is the only built-in action; pass custom actions via composition
 * if you need more than one.
 */
export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  retryLabel = 'Try again',
  style,
}: ErrorStateProps) {
  const theme = useTheme();

  return (
    <ThemedView
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
        Shadows.sm,
        style,
      ]}>
      <View style={[styles.iconContainer, { backgroundColor: theme.errorSoft }]}>
        <Icon name="warning" size={24} color={theme.error} />
      </View>
      <ThemedText type="h3" style={styles.title}>
        {title}
      </ThemedText>
      <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.description}>
        {description}
      </ThemedText>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          style={({ pressed }) => [
            styles.retry,
            { backgroundColor: theme.errorSoft },
            pressed && styles.retryPressed,
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.error }}>
            {retryLabel}
          </ThemedText>
        </Pressable>
      )}
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
  retry: {
    marginTop: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
  },
  retryPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
});
