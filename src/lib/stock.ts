/**
 * Single source of truth for stock-status rules.
 *
 *   0–1 units → Out of stock (error)
 *   2–4 units → Low stock   (warning)
 *   5+ units  → In stock    (success)
 *
 * Every screen (catalog rows, product detail, find-product result, admin
 * dashboard) derives its stock label/tone/counting from here — change the
 * boundaries in this one file and the whole app follows.
 */

/** stock ≤ this → Out of stock. */
export const OUT_OF_STOCK_MAX = 1;
/** stock ≤ this (and above OUT_OF_STOCK_MAX) → Low stock. */
export const LOW_STOCK_MAX = 4;

export type StockLevel = 'out' | 'low' | 'in';
export type StockTone = 'error' | 'warning' | 'success';

/** Maps a stock count to its level bucket. */
export function stockLevel(stock: number): StockLevel {
  if (stock <= OUT_OF_STOCK_MAX) return 'out';
  if (stock <= LOW_STOCK_MAX) return 'low';
  return 'in';
}

/** UI tone (badge/label color) for a stock count. */
export function stockTone(stock: number): StockTone {
  const level = stockLevel(stock);
  return level === 'out' ? 'error' : level === 'low' ? 'warning' : 'success';
}

/**
 * Human label. With `withCount` the number is included where it makes sense:
 *   0  → "Out of stock"        3  → "Low stock · 3"
 *   1  → "Out of stock · 1"    12 → "In stock · 12"
 */
export function stockLabel(stock: number, options: { withCount?: boolean } = {}): string {
  const { withCount = false } = options;
  const level = stockLevel(stock);
  // The count comes from `stock`, never a literal: with the boundary moved
  // (e.g. OUT_OF_STOCK_MAX = 2) a hardcoded '1' would misreport every count.
  if (level === 'out') return withCount && stock > 0 ? `Out of stock · ${stock}` : 'Out of stock';
  if (level === 'low') return withCount ? `Low stock · ${stock}` : 'Low stock';
  return withCount ? `In stock · ${stock}` : 'In stock';
}
