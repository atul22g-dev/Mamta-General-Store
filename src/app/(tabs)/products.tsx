import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonList } from '@/components/ui/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, WebTopBarInset, Spacing, Radius, Shadows, Typography } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useProductSearch } from '@/hooks/use-product-search';
import { formatPriceWithUnit } from '@/lib/format';
import { PriceText } from '@/components/ui/price-text';
import {
  PRODUCT_CATEGORIES,
  CATEGORY_LABELS,
  UNIT_LABELS,
  type ProductCategory,
  type ProductUnit,
} from '@/lib/products/product-validation';
import { matchSession } from '@/lib/scan-session';
import type { ProductWithImages } from '@/lib/products/product-service';
import { ProductThumb } from '@/components/products/product-thumb';

/** Chip-row filter values: the implicit "All" filter + every category. */
const CHIP_FILTERS: ('all' | ProductCategory)[] = ['all', ...PRODUCT_CATEGORIES];

/** Catalog card thumbnail size (was an inline 72×72 style). */
const CARD_THUMB = 72;

/** Vertical gap between catalog cards (FlatList separator). */
function RowSeparator() {
  return <View style={styles.rowSeparator} />;
}

/** Customer catalog card: image, name, category, live price. */
function CatalogCard({
  product,
  index,
  onPress,
}: {
  product: ProductWithImages;
  index: number;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Animated.View entering={FadeInDown.duration(280).delay(Math.min(index, 8) * 45)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${product.name}, ${formatPriceWithUnit(product.selling_price, product.unit)}`}
        onPress={onPress}
        style={({ pressed, hovered }) => [
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
          Shadows.sm,
          hovered && !pressed && { borderColor: theme.accent },
          pressed && styles.cardPressed,
        ]}>
        <ProductThumb
          imageUrl={product.product_images[0]?.image_url}
          name={product.name}
          size={CARD_THUMB}
        />

        <View style={styles.cardInfo}>
          <ThemedText type="body" numberOfLines={1}>
            {product.name}
          </ThemedText>
          <ThemedText type="caption" themeColor="textTertiary">
            {CATEGORY_LABELS[product.category as keyof typeof CATEGORY_LABELS] ?? product.category}
            {' · '}
            {UNIT_LABELS[product.unit as ProductUnit] ?? product.unit}
          </ThemedText>
        </View>

        <PriceText variant="card">
          {formatPriceWithUnit(product.selling_price, product.unit)}
        </PriceText>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Customer-facing catalog. Real Supabase data with debounced search and
 * category filters; selecting a product opens the shared result screen.
 */
export default function ProductsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const {
    search,
    setSearch,
    category,
    setCategory,
    products,
    status,
    errorMessage,
    loading,
    refresh,
  } = useProductSearch();

  const hasQuery = search.trim().length > 0 || category !== 'all';

  const handleSelect = (product: ProductWithImages) => {
    // Reuse the result card (with its live DB price) for catalog taps.
    matchSession.setManualResult(product);
    router.push('/find-product/result');
  };

  // Header (title, search, filters, and loading/error/empty panels) rides
  // above the virtualized rows; FlatList mounts only the visible cards.
  const listHeader = (
    <View style={styles.headerBlock}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="h1" style={styles.title}>
          Products
        </ThemedText>
        <ThemedText type="bodySmall" themeColor="textSecondary">
          Browse the store catalog
        </ThemedText>
      </View>

      {/* Search */}
      <Input
        placeholder="Search catalog…"
        value={search}
        onChangeText={setSearch}
        leftIcon={<Icon name="search" size={18} color={theme.textTertiary} />}
        clearButtonMode="while-editing"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search catalog by product name"
      />

      {/* Category chips (short fixed set, horizontal FlatList).
          flexGrow: 0 — keeps rows from stretching vertically. */}
      <FlatList
        horizontal
        data={CHIP_FILTERS}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipList}
        renderItem={({ item }) => (
          <Chip
            label={item === 'all' ? 'All' : CATEGORY_LABELS[item]}
            active={category === item}
            onPress={() => setCategory(item)}
          />
        )}
      />

      {/* States */}
      {loading && <SkeletonList count={6} />}

      {status === 'error' && (
        <ErrorState
          description={errorMessage ?? 'Failed to load the catalog.'}
          onRetry={() => void refresh()}
        />
      )}

      {status === 'ready' && products.length === 0 && (
        <EmptyState
          title={hasQuery ? 'No products found' : 'Catalog is empty'}
          description={
            hasQuery
              ? 'Try a different name or category.'
              : 'Products added by the store admin will appear here.'
          }
          icon={
            <Icon name={hasQuery ? 'search' : 'cube-outline'} size={26} color={theme.accent} />
          }
        />
      )}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Animated.View wrapper carries the entrance: reanimated's web
            layout animations crash on Animated.FlatList itself (its RN-web
            internals pass undefined styles into the animation manager), so
            the list stays a plain FlatList on every platform. */}
        <Animated.View entering={FadeIn.duration(300)} style={styles.grow}>
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <CatalogCard product={item} index={index} onPress={() => handleSelect(item)} />
            )}
            ItemSeparatorComponent={RowSeparator}
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </Animated.View>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Category filter pill with 44pt minimum height. */
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}        style={({ pressed }) => [
          styles.chip,
          {
            // Selected = soft accent fill + accent outline. A solid accent
            // fill would leave the 12px label below 4.5:1 in light mode;
            // this pairing is readable in both schemes.
            backgroundColor: active ? theme.accentSoft : theme.surface,
            borderColor: active ? theme.accent : theme.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}>
      <ThemedText
        type="caption"
        style={{ color: active ? theme.accentDark : theme.textSecondary }}>
        {label}
      </ThemedText>
    </Pressable>
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
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five + WebTopBarInset,
    paddingBottom: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  headerBlock: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  header: {
    gap: Spacing.one / 2,
  },
  title: Typography.h1,
  chipsRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  chipList: {
    flexGrow: 0,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  rowSeparator: {
    height: Spacing.two,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    minHeight: 76,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
});
