import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/common/icon';
import { Input } from '@/components/common/input';
import { SkeletonList } from '@/components/common/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { IconButton } from '@/components/common/icon-button';
import { ThemedText } from '@/components/common/themed-text';
import { ThemedView } from '@/components/common/themed-view';
import { MaxContentWidth, Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useProductSearch } from '@/hooks/use-catalog-search';
import { matchSession } from '@/utils/scan-session';
import {
  PRODUCT_CATEGORIES,
  CATEGORY_LABELS,
  UNIT_LABELS,
  type ProductCategory,
  type ProductUnit,
} from '@/services/product-validation.service';
import type { ProductWithImages } from '@/services/product.service';
import { formatPriceWithUnit } from '@/utils/format';
import { PriceText } from '@/components/common/price-text';
import { ProductThumb } from '@/components/products/product-thumb';

/** Chip-row filter values: the implicit "All" filter + every category. */
const CHIP_FILTERS: ('all' | ProductCategory)[] = ['all', ...PRODUCT_CATEGORIES];

/** Vertical gap between result rows (FlatList separator). */
function RowSeparator() {
  return <View style={styles.rowSeparator} />;
}

/** Catalog result row: image, name, unit, current selling price. */
function SearchResultRow({
  product,
  onPress,
}: {
  product: ProductWithImages;
  onPress: () => void;
}) {
  const theme = useTheme();
  const unitLabel = UNIT_LABELS[product.unit as ProductUnit] ?? product.unit;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${product.name}`}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.row,
        { backgroundColor: theme.surface, borderColor: theme.border },
        Shadows.sm,
        pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
      ]}>
      <ProductThumb
        imageUrl={product.product_images[0]?.image_url}
        name={product.name}
        size={48}
        textType="bodySmall"
      />

      <View style={styles.rowInfo}>
        <ThemedText type="body" numberOfLines={1}>
          {product.name}
        </ThemedText>
        <ThemedText type="caption" themeColor="textTertiary">
          {unitLabel}
        </ThemedText>
      </View>

      {/* Current DB price — the only source, as everywhere in the flow. */}
      <PriceText variant="card">
        {formatPriceWithUnit(product.selling_price, product.unit)}
      </PriceText>
    </Pressable>
  );
}

/**
 * Manual search fallback for the find-product flow. Shown when visual
 * matching fails or confidence is too low; selecting a product opens the
 * same result screen with its live DB price.
 */
export default function FindProductSearchScreen() {
  const router = useRouter();
  const theme = useTheme();

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
  const hasResults = status === 'ready' && products.length > 0;

  const handleSelect = (product: ProductWithImages) => {
    matchSession.setManualResult(product);
    router.push('/find-product/result');
  };

  return (
    <ThemedView style={styles.grow}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <IconButton
            icon={<Icon name="arrow-back" size={20} color={theme.text} />}
            onPress={() => (router.canGoBack() ? router.back() : router.dismissTo('/(tabs)'))}
            accessibilityLabel="Go back"
            variant="ghost"
          />
          <View style={styles.headerText}>
            <ThemedText type="h3">Search Products</ThemedText>
            <ThemedText type="caption" themeColor="textTertiary">
              Live catalog · current prices
            </ThemedText>
          </View>
        </View>

        {/* Search input */}
        <View style={styles.searchWrap}>
          <Input
            placeholder="Search by product name…"
            value={search}
            onChangeText={setSearch}
            leftIcon={<Icon name="search" size={18} color={theme.textTertiary} />}
            clearButtonMode="while-editing"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search products by name"
          />
        </View>

        {/* Category chips (short fixed set, horizontal FlatList).
            flexGrow: 0 — without it the horizontal list stretches its
            rows to fill available vertical space (giant pill bug). */}
        <FlatList
          horizontal
          data={CHIP_FILTERS}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipList}
          renderItem={({ item }) => (
            <Chip
              label={item === 'all' ? 'All' : CATEGORY_LABELS[item]}
              active={category === item}
              onPress={() => setCategory(item)}
            />
          )}
        />

        {/* Body */}
        {loading && <SkeletonList count={6} style={styles.skeletonList} />}

        {status === 'error' && (
          <View style={styles.centerState}>
            <ErrorState
              description={errorMessage ?? 'Failed to search.'}
              onRetry={() => void refresh()}
            />
          </View>
        )}

        {hasResults && (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeInDown.duration(250).delay(Math.min(index, 8) * 40)}>
                <SearchResultRow product={item} onPress={() => handleSelect(item)} />
              </Animated.View>
            )}
            ListHeaderComponent={
              <ThemedText type="caption" themeColor="textTertiary" style={styles.countLine}>
                {products.length} {products.length === 1 ? 'product' : 'products'}
              </ThemedText>
            }
            ItemSeparatorComponent={RowSeparator}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {status === 'ready' && products.length === 0 && (
          <View style={styles.centerState}>
            <EmptyState
              title={hasQuery ? 'No products found' : 'Catalog is empty'}
              description={
                hasQuery
                  ? 'Try a different name or category.'
                  : 'Products added by an admin will appear here.'
              }
              icon={
                <Icon name={hasQuery ? 'search' : 'cube-outline'} size={26} color={theme.accent} />
              }
            />
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

/** Selectable category pill. */
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
            // Selected = soft accent fill + accent outline; readable in both
            // colour schemes (a solid accent fill is not, at this text size).
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
  grow: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  headerText: {
    flex: 1,
  },
  searchWrap: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  chipList: {
    flexGrow: 0,
  },
  countLine: {
    paddingBottom: Spacing.two,
  },
  rowSeparator: {
    height: Spacing.two,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  skeletonList: {
    paddingHorizontal: Spacing.four,
  },
  listContent: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
  },
  rowInfo: {
    flex: 1,
    gap: Spacing.half,
  },
});
