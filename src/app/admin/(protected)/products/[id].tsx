import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Icon } from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ImageViewer } from '@/components/ui/image-viewer';
import { ProductThumb } from '@/components/products/product-thumb';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useProductDetail } from '@/hooks/use-product-detail';
import { deleteProduct } from '@/lib/products/product-service';
import { formatPrice, formatPriceWithUnit } from '@/lib/format';
import { PriceText } from '@/components/ui/price-text';
import { alert } from '@/lib/alert';
import { getProductImageUrl } from '@/lib/products/get-product-image-url';
import { stockLabel, stockTone } from '@/lib/stock';
import { CATEGORY_LABELS, type ProductCategory } from '@/lib/products/product-validation';
import type { ProductImageRef, ProductWithImages } from '@/lib/products/product-service';

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}



/**
 * Gallery block, Amazon/Flipkart style: swipeable square image carousel
 * with a "1 / N" counter, thumbnail row, and a full-screen swipeable
 * viewer (which opens at the image you're on). Falls back to a letter
 * tile when the product has no photos.
 */
function ProductGallery({ product }: { product: ProductWithImages }) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const listRef = useRef<FlatList<ProductImageRef> | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  const images = product.product_images;
  const hero = images[heroIndex] ?? images[0];
  const viewerImages = images.map((image) => ({ url: getProductImageUrl(image.image_url) }));

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width);
    setHeroIndex((current) => (current === next ? current : next));
  };

  if (!hero) {
    return (
      <View style={[styles.gallery, Shadows.sm]}>
        <View style={[styles.heroFallback, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="display" style={{ color: theme.accent }}>
            {product.name.charAt(0).toUpperCase() || '?'}
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.gallery, Shadows.sm]}>
      {/* Swipeable square carousel (Amazon-style): one image per swipe,
          square aspect so photos never letterbox, counter top-right. */}
      <View>
        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          keyExtractor={(image) => image.id}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          getItemLayout={(_, i) => ({ length: windowWidth, offset: windowWidth * i, index: i })}
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel={`View full image ${index + 1} of ${images.length}`}
              accessibilityHint="Opens the image full screen"
              onPress={() => setViewerOpen(true)}
              style={({ pressed }: { pressed: boolean }) => [
                styles.slide,
                { width: windowWidth },
                pressed && styles.pressed,
              ]}>
              <ProductThumb
                imageUrl={item.image_url}
                name={product.name}
                radius={0}
                textType="display"
                style={styles.slideImage}
              />
            </Pressable>
          )}
        />

        {/* Counter chip "1 / 3" (Flipkart-style), top-right. */}
        {images.length > 1 && (
          <View
            style={[
              styles.counterChip,
              styles.pointerNone,
              // Photo-overlay scrim, not a plain black tint: white text on this
              // clears 12:1 over a bright product photo too.
              { backgroundColor: theme.scrim },
            ]}>
            <ThemedText type="caption" style={styles.counterText}>
              {heroIndex + 1} / {images.length}
            </ThemedText>
          </View>
        )}

        {/* Zoom affordance so users know the image opens full-screen. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View full image"
          onPress={() => setViewerOpen(true)}
          style={styles.expandHint}>
          <Icon name="expand" size={14} color={theme.textSecondary} />
        </Pressable>

        {/* Dots under the image. */}
        {images.length > 1 && (
          <View style={[styles.dotsRow, styles.pointerNone]}>
            {images.map((image, index) => (
              <View
                key={image.id}
                style={[
                  styles.dot,
                  index === heroIndex && { backgroundColor: theme.accent, width: 16 },
                ]}
              />
            ))}
          </View>
        )}
      </View>

      {images.length > 1 && (
        <FlatList
          horizontal
          data={images}
          keyExtractor={(image) => image.id}
          showsHorizontalScrollIndicator={false}
          style={styles.thumbStrip}
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show photo ${index + 1}`}
              onPress={() => {
                setHeroIndex(index);
                listRef.current?.scrollToIndex({ index, animated: true });
              }}
              style={({ pressed }: { pressed: boolean }) => [pressed && styles.pressed]}>
              <ProductThumb
                imageUrl={item.image_url}
                name={product.name}
                size={64}
                radius={Radius.sm}
                style={[
                  styles.thumbImage,
                  index === heroIndex && { borderWidth: 2, borderColor: theme.accent },
                ]}
              />
            </Pressable>
          )}
        />
      )}

      <ImageViewer
        visible={viewerOpen}
        images={viewerImages}
        initialIndex={heroIndex}
        caption={product.name}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}

/** Price card: dominant selling price, struck-through MRP, savings badge. */
function PriceCard({ product }: { product: ProductWithImages }) {
  const theme = useTheme();
  const hasDiscount = product.mrp !== product.selling_price;
  const savePercent =
    hasDiscount && product.mrp > 0
      ? Math.round(((product.mrp - product.selling_price) / product.mrp) * 100)
      : 0;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.priceRow}>
        <View style={styles.priceMain}>
          <ThemedText type="caption" themeColor="textTertiary">
            Selling price
          </ThemedText>
          <PriceText variant="hero">
            {formatPriceWithUnit(product.selling_price, product.unit)}
          </PriceText>
        </View>
        {hasDiscount && (
          <View style={styles.priceAside}>
            <ThemedText type="caption" themeColor="textTertiary">
              MRP
            </ThemedText>
            <ThemedText type="bodySmall" themeColor="textTertiary" style={styles.mrp}>
              {formatPrice(product.mrp)}
            </ThemedText>
            {product.mrp > product.selling_price && (
              <Badge label={`Save ${savePercent}%`} variant="success" size="sm" />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

/** Product detail screen for /admin/products/[id] — real Supabase data. */
export default function AdminProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const { product, status, errorMessage, reload } = useProductDetail(id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const backToList = () => router.replace('/admin/products');

  const handleDelete = async () => {
    if (!product || deleting) return;
    setDeleting(true);

    // Service errors come back as results, not throws — an unexpected
    // rejection (offline, crash mid-request) becomes a failed result so
    // the busy flag always resets below, on every path.
    let result: Awaited<ReturnType<typeof deleteProduct>>;
    try {
      result = await deleteProduct(product.id);
    } catch {
      result = { ok: false, error: 'Something went wrong. Please try again.' };
    }

    setDeleting(false);
    setConfirmingDelete(false);

    if (result.ok) {
      backToList();
    } else {
      alert('Could not delete product', result.error);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <IconButton
            icon={<Icon name="arrow-back" size={20} color={theme.text} />}
            onPress={() =>
              router.canGoBack() ? router.back() : backToList()
            }
            accessibilityLabel="Go back"
            variant="ghost"
          />
          <ThemedText type="h3">Product Details</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        {status === 'loading' && <Loading text="Loading product…" showIcon style={styles.centerState} />}

        {status === 'error' && (
          <View style={styles.centerState}>
            <ErrorState description={errorMessage ?? 'Failed to load.'} onRetry={reload} />
            <Button
              title="Back to products"
              variant="secondary"
              onPress={backToList}
              style={styles.stateAction}
            />
          </View>
        )}

        {status === 'not-found' && (
          <View style={styles.centerState}>
            <EmptyState
              title="Product not found"
              description="It may have been deleted by another admin."
            />
            <Button
              title="Back to products"
              variant="secondary"
              onPress={backToList}
              style={styles.stateAction}
            />
          </View>
        )}

        {status === 'ready' && product && (
          <Animated.ScrollView
            entering={FadeInDown.duration(300)}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {/* Gallery */}
            <ProductGallery product={product} />

            {/* Identity */}
            <View style={styles.identity}>
              <ThemedText type="h2" style={styles.name}>
                {product.name}
              </ThemedText>
              <View style={styles.badgeRow}>
                <Badge
                  label={CATEGORY_LABELS[product.category as ProductCategory] ?? product.category}
                  variant="accent"
                />
                <Badge
                  label={stockLabel(product.stock, { withCount: true })}
                  variant={stockTone(product.stock)}
                  dot
                />
              </View>
            </View>

            {/* Pricing */}
            <PriceCard product={product} />

            {/* Description */}
            {product.description && (
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <ThemedText type="caption" themeColor="textTertiary" style={styles.cardLabel}>
                  Description
                </ThemedText>
                <ThemedText type="bodySmall" themeColor="textSecondary">
                  {product.description}
                </ThemedText>
              </View>
            )}

            {/* Meta */}
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.metaRow}>
                <ThemedText type="caption" themeColor="textTertiary">
                  Unit
                </ThemedText>
                <ThemedText type="smallBold">{product.unit}</ThemedText>
              </View>
              <View style={[styles.metaRow, styles.metaRowBordered]}>
                <ThemedText type="caption" themeColor="textTertiary">
                  Stock
                </ThemedText>
                <ThemedText type="smallBold">{product.stock}</ThemedText>
              </View>
              <View style={[styles.metaRow, styles.metaRowBordered]}>
                <ThemedText type="caption" themeColor="textTertiary">
                  Added
                </ThemedText>
                <ThemedText type="smallBold">{formatDate(product.created_at)}</ThemedText>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <Button
                title="Edit Product"
                icon={<Icon name="create" size={18} color={theme.white} />}
                block
                onPress={() =>
                  router.push({
                    pathname: '/admin/products/[id]/edit',
                    params: { id: product.id },
                  })
                }
              />
              <Button
                title="Delete Product"
                variant="danger"
                icon={<Icon name="trash" size={18} color={theme.white} />}
                block
                onPress={() => setConfirmingDelete(true)}
              />
            </View>
          </Animated.ScrollView>
        )}
      </SafeAreaView>

      <ConfirmDialog
        visible={confirmingDelete}
        title="Delete this product?"
        message={product ? `“${product.name}” will be permanently removed.\n\nThis action cannot be undone.` : 'This action cannot be undone.'}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => !deleting && setConfirmingDelete(false)}
      />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  headerSpacer: {
    width: 44,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  stateAction: {
    alignSelf: 'stretch',
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.four,
  },
  gallery: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideImage: {
    width: '100%',
    aspectRatio: 1,
    // No placeholder colour here: ProductThumb paints its own themed one,
    // and this style is applied last (so a literal would override it).
    objectFit: 'cover',
  },
  counterChip: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    borderRadius: Radius.sm,
    // Background is the themed scrim (set at the call site).
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  counterText: {
    color: '#FFFFFF',
  },
  dotsRow: {
    position: 'absolute',
    bottom: Spacing.two,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  pointerNone: {
    pointerEvents: 'none',
  } as const,
  heroFallback: {
    width: '100%',
    aspectRatio: 16 / 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandHint: {
    position: 'absolute',
    right: Spacing.two,
    bottom: Spacing.two,
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  thumbStrip: {
    flexDirection: 'row',
    marginTop: Spacing.two,
  },
  thumbImage: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
    marginRight: Spacing.two,
  },

  identity: {
    gap: Spacing.two,
  },
  name: {
    letterSpacing: -0.3,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  cardLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  priceMain: {
    gap: Spacing.one,
  },
  priceAside: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  mrp: {
    textDecorationLine: 'line-through',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaRowBordered: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(100,116,139,0.25)',
    paddingTop: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
  },
});
