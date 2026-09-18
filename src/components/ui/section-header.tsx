import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Typography, Radius } from '@/constants';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
};

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <Pressable style={styles.container} disabled={!action}>
      <View style={styles.textContainer}>
        <ThemedText type="h2" style={styles.title}>
          {title}
        </ThemedText>
        {subtitle && (
          <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.subtitle}>
            {subtitle}
          </ThemedText>
        )}
      </View>
      {action && (
        <Pressable onPress={action.onPress} style={styles.actionButton}>
          <ThemedText type="link">{action.label}</ThemedText>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
    gap: Spacing.three,
  },
  textContainer: {
    flex: 1,
  },
  title: Typography.h3,
  subtitle: {
    marginTop: Spacing.one / 2,
  },
  actionButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.sm,
  },
});
