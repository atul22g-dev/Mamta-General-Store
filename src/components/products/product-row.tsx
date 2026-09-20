import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORY_LABELS, type ProductCategory } from '@/lib/products/product-validation';
import type { ProductWithImages } from '@/lib/products/product-service';
import { formatPrice, formatPriceWithUnit } from '@/lib/format';
import { PriceText } from '@/components/ui/price-text';
import { getProductImageUrl } from '@/lib/products/get-product-image-url';

const THUMB = 56;

type ProductRowProps = {
  product: ProductWithImages;
  index?: number;
  deleting?: boolean;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  style?: StyleProp<ViewStyle>;
};



/** Stock label + tone shared by the row. */
function stockStatus(stock: number): { label: string; tone: 'success' | 'warning' | 'error' } {
  if (stock === 0) return { label: 'Out of stock', tone: 'error' };
  if (stock <= 10) return { label: `Low · ${stock}`, tone: 'warning' };
  return { label: `In stock · ${stock}`, tone: 'success' };
}

/**
 * Catalog row for the admin list: image thumbnail (or letter tile),
 * name/category/prices/stock, then Edit and Delete actions.
 */
export function ProductRow({
  product,
  index = 0,
  deleting = false,
  onPress,
  onEdit,
  onDelete,
  style,
}: ProductRowProps) {
  const theme = useTheme();

  const firstImage = getProductImageUrl(product.product_images[0]?.image_url);
  const initial = product.name.charAt(0).toUpperCase() || '?';
  const stock = stockStatus(product.stock);

  return (
    <Animated.View entering={FadeInDown.duration(300).delay(Math.min(index, 8) * 50)} style={style}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
          Shadows.sm,
          deleting && { opacity: 0.5 },
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${product.name}`}
          onPress={onPress}
          style={styles.main}>
          {firstImage ? (
            <Image source={{ uri: firstImage }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.accentSoft }]}>
              <ThemedText type="h3" style={{ color: theme.accent }}>
                {initial}
              </ThemedText>
            </View>
          )}

          <View style={styles.info}>
            <ThemedText type="body" numberOfLines={1}>
              {product.name}
            </ThemedText>
            <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
              {CATEGORY_LABELS[product.category as ProductCategory] ?? product.category}
            </ThemedText>
            <View style={styles.priceRow}>
              <PriceText variant="compact">
                {formatPriceWithUnit(product.selling_price, product.unit)}
              </PriceText>
              {product.mrp !== product.selling_price && (
                <ThemedText
                  type="caption"
                  themeColor="textTertiary"
                  style={styles.mrp}>
                  MRP {formatPrice(product.mrp)}
                </ThemedText>
              )}
            </View>
          </View>
        </Pressable>

        <View style={styles.footer}>
          <ThemedText
            type="overline"
            style={{
              color:
                stock.tone === 'success'
                  ? theme.success
                  : stock.tone === 'warning'
                    ? theme.warning
                    : theme.error,
            }}>
            {stock.label}
          </ThemedText>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${product.name}`}
              onPress={onEdit}
              hitSlop={8}
              style={({ pressed }) => [styles.actionChip, { backgroundColor: theme.surfaceSecondary }, pressed && styles.pressed]}>
              <Icon name="create" size={16} color={theme.textSecondary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${product.name}`}
              onPress={onDelete}
              disabled={deleting}
              hitSlop={8}
              style={({ pressed }) => [styles.actionChip, { backgroundColor: theme.errorSoft }, pressed && styles.pressed]}>
              <Icon name="trash" size={16} color={theme.error} />
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.md,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: Spacing.half,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  mrp: {
    textDecorationLine: 'line-through',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(100,116,139,0.25)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionChip: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
