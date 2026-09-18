import { StyleSheet, ViewProps } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type CardProps = ViewProps & {
  elevated?: boolean;
  title?: string;
  subtitle?: string;
};

export function Card({
  style,
  elevated = true,
  title,
  subtitle,
  children,
  ...props
}: CardProps) {

  return (
    <ThemedView
      type="backgroundElement"
      style={[
        styles.card,
        elevated && {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 3,
          elevation: 2,
        },
        style,
      ]}
      {...props}>
      {(title || subtitle) && (
        <ThemedView style={styles.header}>
          {title && (
            <ThemedText type="smallBold" style={styles.title}>
              {title}
            </ThemedText>
          )}
          {subtitle && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          )}
        </ThemedView>
      )}
      {children && <ThemedView style={styles.body}>{children}</ThemedView>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
  },
  header: {
    marginBottom: Spacing.two,
    gap: Spacing.one,
  },
  title: {
    fontSize: 15,
    lineHeight: 22,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    gap: Spacing.two,
  },
});
