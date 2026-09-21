-- ============================================================================
-- ⚠️  DEPRECATED — DO NOT RUN ON PRODUCTION ⚠️
-- ============================================================================
-- This script DESTRUCTIVELY drops and recreates enum types, which will:
--   - DESTROY the boots/toys/cloths categories added by migration 0010
--   - DESTROY any products using those categories
--   - Drop and recreate FK constraints (may fail with existing rows)
--
-- Use the migration chain instead: npm run db:deploy
-- This file is kept for historical reference only.
-- ============================================================================

-- 1. Make sure the new unit exists -------------------------------------------------
alter type public.product_unit add value if not exists 'Meter';

-- 2. Migrate rows off removed values, in case any exist ----------------------------
update public.products set unit = 'piece'      where unit not in ('piece', 'Meter');
update public.products set category = 'other'  where category not in ('household', 'personal_care', 'other');

-- 3. Narrow the columns to the new value sets (drops the stale enum values) -------
--    Postgres cannot REMOVE enum values in place, so the columns are rebuilt
--    on fresh types with the exact lists from the config.
alter table public.product_images drop constraint if exists product_images_product_id_fkey;

create type public.product_category_new as enum ('household', 'personal_care', 'other');
create type public.product_unit_new as enum ('piece', 'Meter');

alter table public.products
  alter column category type public.product_category_new
    using (category::text::public.product_category_new),
  alter column unit type public.product_unit_new
    using (unit::text::public.product_unit_new);

drop type public.product_category;
drop type public.product_unit;
alter type public.product_category_new rename to product_category;
alter type public.product_unit_new rename to product_unit;

alter table public.product_images
  add constraint product_images_product_id_fkey
  foreign key (product_id) references public.products (id) on delete cascade;

-- 4. Verify ------------------------------------------------------------------------
-- Expect: product_category = {household,personal_care,other},
--         product_unit = {piece,Meter}
select
  (select string_agg(enumlabel, ', ' order by enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'product_category') as categories,
  (select string_agg(enumlabel, ', ' order by enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'product_unit') as units;
