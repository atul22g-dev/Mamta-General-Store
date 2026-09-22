import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * Price typography scale — prices are the most-scanned element in a retail
 * app, so they get their own hierarchy (separate from headings):
 *   hero    — find-product result / product detail hero price
 *   card    — product list cards
 *   compact — inline mentions, admin rows
 * All sizes pair bold weight with tight tracking for a price-tag feel.
 */
const PRICE_STYLES: Record<'hero' | 'card' | 'compact', TextStyle> = StyleSheet.create({
  hero: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  card: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  compact: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
});

export type PriceTextProps = TextProps & {
  /** Visual weight of the price in the layout. */
  variant?: 'hero' | 'card' | 'compact';
  /** Defaults to the accent color (retail green); override for MRP strikethrough etc. */
  color?: string;
};

/**
 * The ONE component for displaying prices. Pairs with `formatPrice()` /
 * `formatPriceWithUnit()` from `@/lib/format` — those produce the string,
 * this renders it with the dedicated price hierarchy.
 *
 * `tabular-nums` keeps digits aligned across list rows.
 */
export function PriceText({
  variant = 'card',
  color,
  style,
  ...rest
}: PriceTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[PRICE_STYLES[variant], { color: color ?? theme.accent }, style]}
      accessibilityRole="text"
      {...rest}
    />
  );
}
