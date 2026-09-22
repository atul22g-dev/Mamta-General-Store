import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { ProductThumb } from '@/components/products/product-thumb';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORY_LABELS, type ProductCategory } from '@/lib/products/product-validation';
import type { ProductWithImages } from '@/lib/products/product-service';
import { formatPrice, formatPriceWithUnit } from '@/lib/format';
import { PriceText } from '@/components/ui/price-text';
import { stockLabel, stockTone } from '@/lib/stock';

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

  const stock = { label: stockLabel(product.stock, { withCount: true }), tone: stockTone(product.stock) };

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
          <ProductThumb
            imageUrl={product.product_images[0]?.image_url}
            name={product.name}
            size={THUMB}
          />

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

        <View style={[styles.footer, { borderTopColor: theme.border }]}>
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
    // Divider colour comes from the theme (see the inline borderTopColor).
    borderTopWidth: StyleSheet.hairlineWidth,
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
