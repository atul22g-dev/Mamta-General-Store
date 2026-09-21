/**
 * Find Product Result Screen
 *
 * Modern, clean, mobile-first design for displaying visual search results.
 * Shows the matched product with all database information, similar products,
 * and handles all error/loading states gracefully.
 *
 * Design principles:
 * - Simple and easy for shop customers to understand
 * - Fast loading with proper image placeholders
 * - No technical vector data shown to users
 * - All prices from database (AI never invents prices)
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { ImageViewer } from '@/components/ui/image-viewer';
import { PriceText } from '@/components/ui/price-text';
import { MaxContentWidth, Radius, Shadows, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice, formatPriceWithUnit } from '@/lib/format';
import { getProductImageUrl } from '@/lib/products/get-product-image-url';
import type { ProductWithImages } from '@/lib/products/product-service';
import { UNIT_LABELS, type ProductUnit } from '@/lib/products/product-validation';
import type { MatchCandidateView } from '@/lib/visual-match/client';
import { analyzeMatchOutcome } from '@/lib/visual-match/decision';
import { matchSession } from '@/lib/scan-session';
import { MAX_SIMILAR_PRODUCTS } from '@/lib/visual-match/thresholds';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidencePercent(similarity: number): string {
  return `${Math.round(similarity * 100)}%`;
}

function unitLabel(unit: string): string {
  return UNIT_LABELS[unit as ProductUnit] ?? unit;
}

function toNum(v: unknown): number {
  return typeof v === 'string' ? Number(v) : (v as number);
}

function hasDiscount(product: ProductWithImages): boolean {
  const mrp = toNum(product.mrp);
  const sp = toNum(product.selling_price);
  return mrp !== sp && mrp > sp;
}

function savePercent(product: ProductWithImages): number {
  const mrp = toNum(product.mrp);
  const sp = toNum(product.selling_price);
  if (!hasDiscount(product) || mrp <= 0) return 0;
  return Math.round(((mrp - sp) / mrp) * 100);
}

// ---------------------------------------------------------------------------
// Image with loading state
// ---------------------------------------------------------------------------

function ProductImage({
  uri,
  name,
  size = 120,
  style,
}: {
  uri: string | null;
  name: string;
  size?: number;
  style?: object;
}) {
  const theme = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (!uri || error) {
    return (
      <View
        style={[
          styles.imageFallback,
          { width: size, height: size, backgroundColor: theme.accentSoft },
          style,
        ]}>
        <ThemedText type="h2" style={{ color: theme.accent }}>
          {name.charAt(0).toUpperCase()}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size, borderRadius: Radius.md, overflow: 'hidden' }, style]}>
      {!loaded && (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.imagePlaceholder,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        />
      )}
      <Image
        source={{ uri }}
        style={[styles.productImage, { opacity: loaded ? 1 : 0 }]}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        resizeMode="cover"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Match Card
// ---------------------------------------------------------------------------

function MainMatchCard({ product, similarity }: { product: ProductWithImages; similarity: number }) {
  const theme = useTheme();
  const [viewerOpen, setViewerOpen] = useState(false);
  const firstImage = getProductImageUrl(product.product_images[0]?.image_url);
  const discounted = hasDiscount(product);
  const percentOff = savePercent(product);

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.mainCard}>
      {/* Confidence badge */}
      <View style={[styles.confidenceBadge, { backgroundColor: theme.success }]}>
        <Icon name="checkmark-circle" size={14} color={theme.white} />
        <ThemedText type="caption" style={{ color: theme.white }}>
          {confidencePercent(similarity)} match
        </ThemedText>
      </View>

      {/* Product image */}
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`View full image of ${product.name}`}
        onPress={() => setViewerOpen(true)}>
        <ProductImage uri={firstImage} name={product.name} size={200} style={styles.mainImage} />
      </Pressable>

      {/* Product info */}
      <View style={styles.mainInfo}>
        <ThemedText type="h2" style={styles.productName}>
          {product.name}
        </ThemedText>

        {product.brand && (
          <ThemedText type="body" themeColor="textSecondary">
            {product.brand}
          </ThemedText>
        )}

        <ThemedText type="caption" themeColor="textTertiary">
          {unitLabel(product.unit)}
        </ThemedText>

        {/* Price */}
        <View style={styles.priceRow}>
          <PriceText variant="hero">{formatPriceWithUnit(product.selling_price, product.unit)}</PriceText>
          {discounted && (
            <View style={styles.discountBadge}>
              <ThemedText type="caption" style={{ color: theme.white }}>
                {percentOff}% OFF
              </ThemedText>
            </View>
          )}
        </View>

        {discounted && (
          <ThemedText type="bodySmall" themeColor="textTertiary" style={styles.mrpText}>
            MRP: {formatPrice(product.mrp)}
          </ThemedText>
        )}
      </View>

      <ImageViewer
        visible={viewerOpen}
        images={[{ url: firstImage }]}
        caption={product.name}
        onClose={() => setViewerOpen(false)}
      />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Similar Product Card (compact)
// ---------------------------------------------------------------------------

function SimilarProductCard({
  candidate,
  onPress,
}: {
  candidate: MatchCandidateView;
  onPress: () => void;
}) {
  const theme = useTheme();
  const firstImage = getProductImageUrl(candidate.product.product_images[0]?.image_url);
  const discounted = hasDiscount(candidate.product);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${candidate.product.name}, ${formatPrice(candidate.product.selling_price)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.similarCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
        Shadows.sm,
        pressed && styles.pressed,
      ]}>
      <ProductImage uri={firstImage} name={candidate.product.name} size={64} />

      <View style={styles.similarInfo}>
        <ThemedText type="body" numberOfLines={1} style={styles.similarName}>
          {candidate.product.name}
        </ThemedText>
        {candidate.product.brand && (
          <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
            {candidate.product.brand}
          </ThemedText>
        )}
        <View style={styles.similarPriceRow}>
          <PriceText variant="card">
            {formatPriceWithUnit(candidate.product.selling_price, candidate.product.unit)}
          </PriceText>
          {discounted && (
            <ThemedText type="caption" themeColor="textTertiary" style={styles.mrpSmall}>
              {formatPrice(candidate.product.mrp)}
            </ThemedText>
          )}
        </View>
      </View>

      <View style={styles.similarMatch}>
        <View
          style={[
            styles.matchDot,
            {
              backgroundColor:
                candidate.similarity >= 0.85
                  ? theme.success
                  : candidate.similarity >= 0.75
                    ? theme.warning
                    : theme.textTertiary,
            },
          ]}
        />
        <ThemedText type="caption" themeColor="textTertiary">
          {confidencePercent(candidate.similarity)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Similar Products Section
// ---------------------------------------------------------------------------

function SimilarProductsSection({
  products,
  onSelect,
}: {
  products: MatchCandidateView[];
  onSelect: (product: MatchCandidateView) => void;
}) {
  if (products.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.duration(300).delay(100)} style={styles.section}>
      <ThemedText type="h3" style={styles.sectionTitle}>
        Similar Products
      </ThemedText>
      <ThemedText type="caption" themeColor="textTertiary" style={styles.sectionSubtitle}>
        {products.length} {products.length === 1 ? 'product' : 'products'} found
      </ThemedText>
      <View style={styles.similarList}>
        {products.slice(0, MAX_SIMILAR_PRODUCTS).map((candidate) => (
          <SimilarProductCard
            key={candidate.product.id}
            candidate={candidate}
            onPress={() => onSelect(candidate)}
          />
        ))}
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function FindProductResultScreen() {
  const router = useRouter();
  const theme = useTheme();

  const visual = matchSession.getResult();
  const manualProduct = matchSession.getManualResult();
  const [selectedCandidate, setSelectedCandidate] = useState<MatchCandidateView | null>(null);

  // Determine what to show
  const outcome = visual?.outcome ?? null;
  const decision = outcome ? analyzeMatchOutcome(outcome) : null;

  // Priority: manual pick > selected candidate > main match
  const mainProduct: { product: ProductWithImages; similarity: number } | null = manualProduct
    ? { product: manualProduct, similarity: 0 }
    : selectedCandidate
      ? { product: selectedCandidate.product, similarity: selectedCandidate.similarity }
      : decision?.kind === 'single' && outcome?.main_match
        ? { product: outcome.main_match.product, similarity: outcome.main_match.similarity }
        : null;

  const similarProducts = (outcome?.similar_products ?? []).filter(
    (c) => c.product.id !== mainProduct?.product.id,
  );
  const hasSimilar = similarProducts.length > 0;

  // Handlers
  const handleDone = useCallback(() => {
    matchSession.clear();
    router.dismissTo('/(tabs)');
  }, [router]);

  const handleScanAgain = useCallback(() => {
    matchSession.clear();
    router.replace('/find-product');
  }, [router]);

  const handleSearchManually = useCallback(() => {
    matchSession.clear();
    router.push('/find-product/search');
  }, [router]);

  const handleSelectSimilar = useCallback((candidate: MatchCandidateView) => {
    setSelectedCandidate(candidate);
  }, [setSelectedCandidate]);

  // Empty state (no session data)
  if (!visual && !manualProduct) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.centerContent}>
            <EmptyState
              title="No result yet"
              description="Take a product photo to get a match, or search the catalog manually."
              icon={<Icon name="camera" size={26} color={theme.accent} />}
              action={<Button title="Scan a product" onPress={handleScanAgain} />}
            />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // No match state
  if (decision?.kind === 'none' && !mainProduct) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={handleDone}
              style={styles.backButton}
              accessibilityLabel="Go back">
              <Icon name="close" size={20} color={theme.text} />
            </Pressable>
            <ThemedText type="h3">Result</ThemedText>
            <View style={styles.headerSpacer} />
          </View>
        </SafeAreaView>

        <SafeAreaView style={styles.flex} edges={['bottom']}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Captured image preview */}
            {visual?.photo && (
              <Animated.View entering={FadeIn.duration(200)} style={styles.imagePreviewContainer}>
                <Image source={{ uri: visual.photo.uri }} style={styles.capturedThumb} />
              </Animated.View>
            )}

            <EmptyState
              title="Product not found"
              description="This item isn't in the catalog yet. Try searching by name or scan another product."
              icon={<Icon name="search" size={26} color={theme.accent} />}
              action={
                <View style={styles.noMatchActions}>
                  <Button title="Search Manually" onPress={handleSearchManually} />
                  <Button title="Scan Again" variant="secondary" onPress={handleScanAgain} />
                </View>
              }
            />
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // Main result view
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleDone}
            style={styles.backButton}
            accessibilityLabel="Go back">
            <Icon name="close" size={20} color={theme.text} />
          </Pressable>
          <ThemedText type="h3">
            {mainProduct ? 'Product Found' : 'Similar Products'}
          </ThemedText>
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Captured image preview */}
          {visual?.photo && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.imagePreviewContainer}>
              <Image source={{ uri: visual.photo.uri }} style={styles.capturedThumb} />
              <ThemedText type="caption" themeColor="textTertiary">
                Your photo
              </ThemedText>
            </Animated.View>
          )}

          {/* Main matched product */}
          {mainProduct && (
            <MainMatchCard product={mainProduct.product} similarity={mainProduct.similarity} />
          )}

          {/* Selected candidate actions */}
          {selectedCandidate && mainProduct && (
            <Button
              title="View original match"
              variant="ghost"
              onPress={() => setSelectedCandidate(null)}
              style={styles.viewOriginalButton}
            />
          )}

          {/* Similar products */}
          {hasSimilar && (
            <SimilarProductsSection products={similarProducts} onSelect={handleSelectSimilar} />
          )}

          {/* Bottom actions */}
          <View style={styles.bottomActions}>
            <Button
              title="Scan Another Product"
              onPress={handleScanAgain}
              block
              size="lg"
              icon={<Icon name="camera" size={18} color={theme.white} />}
            />
            <Button
              title="Search Manually"
              variant="secondary"
              onPress={handleSearchManually}
              block
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 0,
  },
  flex: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.four,
  },
  imagePreviewContainer: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  capturedThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(100,116,139,0.12)',
  },

  // Main card
  mainCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'white',
    overflow: 'hidden',
    ...Shadows.md,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  mainImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: 'rgba(100,116,139,0.08)',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  mainInfo: {
    padding: Spacing.four,
    gap: Spacing.one,
  },
  productName: {
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  discountBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  mrpText: {
    textDecorationLine: 'line-through',
  },

  // Similar products
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontWeight: '600',
  },
  sectionSubtitle: {
    marginBottom: Spacing.one,
  },
  similarList: {
    gap: Spacing.two,
  },
  similarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  similarInfo: {
    flex: 1,
    gap: 2,
  },
  similarName: {
    fontWeight: '500',
  },
  similarPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
    marginTop: 2,
  },
  mrpSmall: {
    textDecorationLine: 'line-through',
    fontSize: 11,
  },
  similarMatch: {
    alignItems: 'center',
    gap: 4,
  },
  matchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Actions
  viewOriginalButton: {
    alignSelf: 'center',
  },
  noMatchActions: {
    gap: Spacing.two,
  },
  bottomActions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
