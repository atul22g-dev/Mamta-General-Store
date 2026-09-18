import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductCard } from '@/components/products/product-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, WebTopBarInset, Spacing, Radius, Typography } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

const CATEGORIES = ['All', 'Groceries', 'Snacks', 'Household', 'Beverages'] as const;

const PREVIEW_ITEMS = [
  { name: 'Basmati Rice 5kg', price: '₹485', category: 'Groceries' },
  { name: 'Sunflower Oil 1L', price: '₹142', category: 'Groceries' },
  { name: 'Assam Tea 500g', price: '₹260', category: 'Beverages' },
  { name: 'Detergent Powder 1kg', price: '₹110', category: 'Household' },
] as const;

export default function ProductsScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          entering={FadeIn.duration(300)}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <ThemedText type="h1" style={styles.title}>
              Products
            </ThemedText>
            <ThemedText type="bodySmall" themeColor="textSecondary">
              Browse and manage your product catalog
            </ThemedText>
          </View>

          {/* Search */}
          <ThemedView
            type="surface"
            style={[styles.searchBar, { borderColor: theme.border }]}>
            <Icon name="search" size={18} color={theme.textTertiary} />
            <ThemedText type="body" themeColor="textTertiary" style={styles.searchPlaceholder}>
              Search catalog…
            </ThemedText>
          </ThemedView>

          {/* Category chips */}
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}>
            {CATEGORIES.map((label, index) => {
              const isActive = index === 0;
              return (
                <ThemedView
                  key={label}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isActive ? theme.text : theme.surface,
                      borderColor: isActive ? theme.text : theme.border,
                    },
                  ]}>
                  <ThemedText
                    type="caption"
                    style={{ color: isActive ? theme.background : theme.textSecondary }}>
                    {label}
                  </ThemedText>
                </ThemedView>
              );
            })}
          </Animated.ScrollView>

          {/* Preview catalog */}
          <View style={styles.list}>
            {PREVIEW_ITEMS.map((item, index) => (
              <Animated.View
                key={item.name}
                entering={FadeInDown.duration(300).delay(index * 60)}>
                <ProductCard
                  name={item.name}
                  price={item.price}
                  category={item.category}
                />
              </Animated.View>
            ))}
          </View>

          {/* Coming soon note */}
          <ThemedView
            style={[styles.notice, { backgroundColor: theme.accentSoft }]}>
            <Icon name="sparkles" size={16} color={theme.accent} />
            <ThemedText type="caption" style={[styles.noticeText, { color: theme.accentDark }]}>
              Full catalog, filters and stock levels are coming soon.
            </ThemedText>
          </ThemedView>
        </Animated.ScrollView>
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
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five + WebTopBarInset,
    paddingBottom: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one / 2,
  },
  title: Typography.h1,
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  searchPlaceholder: {
    flex: 1,
  },
  chipsRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  list: {
    gap: Spacing.two,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    marginTop: 'auto',
  },
  noticeText: {
    flex: 1,
  },
});
