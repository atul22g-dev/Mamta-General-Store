import { SafeAreaView, ScrollView, StyleSheet } from 'react-native';

import { AnimatedIcon } from '@/components/animated-icon';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          
          <ThemedView style={styles.header}>
            <ThemedText type="title" style={styles.brand}>
              Mamta General Store
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.greeting}>
              Welcome back 👋
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.findProductCard}>
            <ThemedView style={styles.findProductContent}>
              <ThemedText type="subtitle" style={styles.findProductTitle}>
                Find Product
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.findProductSubtitle}>
                Take a photo to check price
              </ThemedText>
            </ThemedView>
            <AnimatedIcon />
          </ThemedView>

          <ThemedView style={styles.shortcuts}>
            <Card style={styles.shortcutCard}>
              <ThemedText type="smallBold" style={styles.shortcutTitle}>
                Add Product
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.shortcutSubtitle}>
                Manage inventory
              </ThemedText>
            </Card>
            <Card style={styles.shortcutCard}>
              <ThemedText type="smallBold" style={styles.shortcutTitle}>
                Products
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.shortcutSubtitle}>
                Browse catalog
              </ThemedText>
            </Card>
          </ThemedView>

          <SectionHeader
            title="Recent Products"
            subtitle="Your recently looked up items"
          />
          
          <ThemedView style={styles.emptyState}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              No recent products yet
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyHint}>
              Start by finding a product above
            </ThemedText>
          </ThemedView>

        </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.one,
  },
  brand: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
  },
  greeting: {
    fontSize: 16,
    lineHeight: 24,
  },
  findProductCard: {
    backgroundColor: '#208AEF',
    borderRadius: Spacing.four,
    padding: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 120,
    marginBottom: Spacing.four,
  },
  findProductContent: {
    flex: 1,
    gap: Spacing.one,
  },
  findProductTitle: {
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
  },
  findProductSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    lineHeight: 20,
  },
  shortcuts: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.five,
  },
  shortcutCard: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.one,
    minHeight: 80,
  },
  shortcutTitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  shortcutSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.six,
    gap: Spacing.two,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 18,
  },
});
