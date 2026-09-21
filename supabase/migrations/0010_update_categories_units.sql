-- =============================================================================
-- 0010 — Update product categories and units for Mamta General Store
-- =============================================================================
-- Adds new categories: boots, toys, cloths
-- Adds new unit: pair
-- Old values (groceries, snacks, household, beverages, dairy, kg, gram, litre, ml, pack, dozen)
-- are kept in the enum but hidden from the app config. They can be dropped later
-- if needed by rebuilding the enum type.
--
-- NOTE: Postgres enums cannot DROP values. Old values remain in the type
-- but are not shown in the app. If you need to remove them, use:
--   ALTER TYPE product_category RENAME TO product_category_old;
--   CREATE TYPE product_category AS ENUM ('boots', 'personal_care', 'toys', 'cloths', 'other');
--   ALTER TABLE products ALTER COLUMN category TYPE product_category USING category::text::product_category;
--   DROP TYPE product_category_old;
-- =============================================================================

-- Add new category values
alter type public.product_category add value if not exists 'boots';
alter type public.product_category add value if not exists 'toys';
alter type public.product_category add value if not exists 'cloths';

-- Add new unit value
alter type public.product_unit add value if not exists 'pair';

-- Update config comment
comment on type public.product_category is
  'Product categories. Active values: boots, personal_care, toys, cloths, other. Legacy values (groceries, snacks, household, beverages, dairy) are unused but retained in the enum.';
