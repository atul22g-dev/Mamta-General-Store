import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ProductCardProps = ViewProps & {
  name?: string;
  price?: string;
  category?: string;
};

/**
 * Catalog row: tinted initial tile on the left, name/category in the
 * middle, accent price on the right.
 */
export function ProductCard({
  style,
  name,
  price,
  category,
  ...props
}: ProductCardProps) {
  const theme = useTheme();

  return (
    <ThemedView
      type="surface"
      style={[styles.card, { borderColor: theme.border }, style]}
      {...props}>
      <ThemedView type="accentSoft" style={styles.thumbnail}>
        <ThemedText type="h3" style={{ color: theme.accent }}>
          {(name ?? 'Product').trim().charAt(0).toUpperCase()}
        </ThemedText>
      </ThemedView>
      <View style={styles.textContainer}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
          {name || 'Product Name'}
        </ThemedText>
        {category && (
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {category}
          </ThemedText>
        )}
      </View>
      {price && (
        <ThemedText type="smallBold" style={[styles.price, { color: theme.accent }]}>
          {price}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    borderWidth: 1,
    minHeight: 72,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: Spacing.one / 2,
  },
  name: {
    fontSize: 15,
    lineHeight: 22,
  },
  price: {
    fontSize: 15,
    lineHeight: 22,
  },
});
