import { StyleSheet, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants';

type ScreenProps = {
  title?: string;
  subtitle?: string;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * Page shell: themed background + safe area + centered content column.
 * With `scroll`, children live in a ScrollView (keyboard-aware).
 */
export function Screen({
  title,
  subtitle,
  scroll = false,
  padded = true,
  style,
  children,
}: ScreenProps) {
  const header = (title || subtitle) && (
    <View style={styles.header}>
      {title && (
        <ThemedText type="h1">{title}</ThemedText>
      )}
      {subtitle && (
        <ThemedText type="bodySmall" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      )}
    </View>
  );

  return (
    <ThemedView style={[styles.container, style]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {scroll ? (
          <ScrollView
            style={styles.grow}
            contentContainerStyle={[
              styles.content,
              padded && styles.padded,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {header}
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.grow, styles.content, padded && styles.padded]}>
            {header}
            {children}
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  grow: {
    flex: 1,
  },
  content: {
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  padded: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
  },
  header: {
    gap: Spacing.one / 2,
    marginBottom: Spacing.four,
  },
});
