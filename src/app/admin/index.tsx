import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export default function AdminScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedView style={styles.content}>
          <ThemedText type="subtitle" style={styles.title}>
            Admin
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
            Manage products and store data
          </ThemedText>

          <Card style={styles.actionCard}>
            <ThemedText type="smallBold" style={styles.actionTitle}>
              Coming Soon
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.actionDescription}>
              Product management, inventory updates, and pricing controls will be available in a future update.
            </ThemedText>
          </Card>

          <Button
            title="Go Back"
            onPress={() => {}}
            variant="secondary"
            style={styles.backButton}
          />
        </ThemedView>
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  actionCard: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  actionTitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  actionDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  backButton: {
    marginTop: Spacing.three,
  },
});
