/**
 * ============================================================================
 * PRODUCT OPTIONS CONFIG — the ONE file to edit categories & units
 * ============================================================================
 * Everything the app shows for product categories and units (form dropdowns,
 * catalog filter chips, result screens, labels) is DERIVED from the two lists
 * below. Change them HERE — the whole app follows. No other file to touch.
 *
 * ▼ HOW TO ADD / CHANGE AN ENTRY
 *   1. Edit the lists below:
 *        • value = stored in the database (lowercase_snake_case, UNIQUE)
 *        • label = what users see in the app
 *      Add → append an object. Reorder → move the object (dropdown order
 *      follows list order). Rename display → change `label` only.
 *   2. If you changed a VALUE, sync the database (see SQL below). Label-only
 *      changes need NO database step.
 *   3. Restart the dev server (`npx expo start -c`) — done.
 *
 * ▼ DATABASE SYNC (only when a `value` is added/renamed/removed)
 *   Run in Supabase Dashboard → SQL Editor, AND mirror the same list in
 *   supabase/migrations/0002_products.sql + supabase/setup-all-in-one.sql
 *   so fresh databases match:
 *
 *     -- add a category:
 *     alter type public.product_category add value 'new_category';
 *     -- add a unit:
 *     alter type public.product_unit add value 'new_unit';
 *
 *     -- rename a value (updates stored data too):
 *     update public.products set category = 'new_value' where category = 'old_value';
 *     alter type public.product_category rename value 'old_value' to 'new_value';
 *
 *     -- REMOVING a value: Postgres enums cannot drop values directly —
 *     -- either leave the entry unused, or rebuild the column (ask for the
 *     -- rebuild migration template before removing a value that has data).
 *
 * ⚠  GUARD RAILS (compile-time safety):
 *   • The default new-product unit lives in product-validation.ts
 *     (EMPTY_PRODUCT_FORM). If you remove that unit from the list, the
 *     build fails there — pick a different default intentionally.
 *   • Existing products stored with a removed value will fail to load:
 *     prefer renames (which migrate rows) over removals.
 * ============================================================================
 */

/** Product categories — `value` must match the DB enum product_category. */
export const PRODUCT_CATEGORY_OPTIONS = [
  { value: 'boots', label: 'Boots' },
  { value: 'personal_care', label: 'Personal Care' },
  { value: 'toys', label: 'Toys' },
  { value: 'cloths', label: 'Cloths' },
  { value: 'other', label: 'Other' },
] as const;

/** Sale units — `value` must match the DB enum product_unit. */
export const PRODUCT_UNIT_OPTIONS = [
  { value: 'piece', label: 'Piece' },
  { value: 'pair', label: 'Pair' },
] as const;

/* ==========================================================================
 * DERIVED — the app reads these. No need to edit below this line.
 * ========================================================================== */

export type ProductCategory = (typeof PRODUCT_CATEGORY_OPTIONS)[number]['value'];
export type ProductUnit = (typeof PRODUCT_UNIT_OPTIONS)[number]['value'];
export type ProductCategoryOption = (typeof PRODUCT_CATEGORY_OPTIONS)[number];
export type ProductUnitOption = (typeof PRODUCT_UNIT_OPTIONS)[number];

/** Plain value lists (form dropdowns, filter chips — in config order). */
export const PRODUCT_CATEGORIES: readonly ProductCategory[] = PRODUCT_CATEGORY_OPTIONS.map(
  (option) => option.value,
);
export const PRODUCT_UNITS: readonly ProductUnit[] = PRODUCT_UNIT_OPTIONS.map(
  (option) => option.value,
);

/** value → display label. */
export const CATEGORY_LABELS: Record<ProductCategory, string> = Object.fromEntries(
  PRODUCT_CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ProductCategory, string>;

export const UNIT_LABELS: Record<ProductUnit, string> = Object.fromEntries(
  PRODUCT_UNIT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ProductUnit, string>;
