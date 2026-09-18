import { StyleSheet, ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type ProductCardProps = ViewProps & {
  name?: string;
  price?: string;
  category?: string;
};

export function ProductCard({
  style,
  name,
  price,
  category,
  ...props
}: ProductCardProps) {
  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.card, style]}
      {...props}>
      <ThemedView style={styles.content}>
        <ThemedView style={styles.textContainer}>
          <ThemedText type="smallBold" style={styles.name}>
            {name || 'Product Name'}
          </ThemedText>
          {category && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.category}>
              {category}
            </ThemedText>
          )}
        </ThemedView>
        {price && (
          <ThemedText type="smallBold" style={styles.price}>
            {price}
          </ThemedText>
        )}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
    minHeight: 72,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  textContainer: {
    flex: 1,
    gap: Spacing.one,
  },
  name: {
    fontSize: 15,
    lineHeight: 22,
  },
  category: {
    fontSize: 13,
    lineHeight: 18,
  },
  price: {
    fontSize: 15,
    lineHeight: 22,
  },
});
