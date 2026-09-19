import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
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
import { MaxContentWidth, WebTopBarInset, Spacing, Radius, Typography } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useProductSearch } from '@/hooks/use-product-search';
import { formatPrice } from '@/lib/format';
import {
  PRODUCT_CATEGORIES,
  CATEGORY_LABELS,
  UNIT_LABELS,
  type ProductUnit,
} from '@/lib/products/product-validation';
import { matchSession } from '@/lib/visual-match/session';
import type { ProductWithImages } from '@/lib/products/product-service';

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
  const firstImage = product.product_images[0]?.image_url;

  return (
    <Animated.View entering={FadeInDown.duration(280).delay(Math.min(index, 8) * 45)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${product.name}, ${formatPrice(product.selling_price)}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
          pressed && styles.cardPressed,
        ]}>
        {firstImage ? (
          <Image source={{ uri: firstImage }} style={styles.cardThumb} />
        ) : (
          <View style={[styles.cardThumb, styles.cardThumbFallback]}>
            <ThemedText type="h3" style={{ color: theme.accent }}>
              {product.name.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
        )}

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

        <ThemedText type="h3" style={{ color: theme.accent }}>
          {formatPrice(product.selling_price)}
        </ThemedText>
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          entering={FadeIn.duration(300)}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
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

          {/* Category chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}>
            <Chip label="All" active={category === 'all'} onPress={() => setCategory('all')} />
            {PRODUCT_CATEGORIES.map((cat) => (
              <Chip
                key={cat}
                label={CATEGORY_LABELS[cat]}
                active={category === cat}
                onPress={() => setCategory(cat)}
              />
            ))}
          </ScrollView>

          {/* Body */}
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

          {status === 'ready' && products.length > 0 && (
            <View style={styles.list}>
              {products.map((product, index) => (
                <CatalogCard
                  key={product.id}
                  product={product}
                  index={index}
                  onPress={() => handleSelect(product)}
                />
              ))}
            </View>
          )}
        </Animated.ScrollView>
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
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.accent : theme.surface,
          borderColor: active ? theme.accent : theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <ThemedText
        type="caption"
        style={{ color: active ? theme.white : theme.textSecondary }}>
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
  chipsRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  list: {
    gap: Spacing.two,
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
  cardThumb: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(100,116,139,0.12)',
  },
  cardThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
});
