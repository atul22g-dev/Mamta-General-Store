-- ============================================================================
-- SYNC PRODUCT OPTIONS — run in Supabase Dashboard → SQL Editor → Run
-- ============================================================================
-- Keeps the DATABASE enums in sync with the app's editable config
-- (src/config/products.ts), which now declares:
--
--   categories : household, personal_care, other
--   units      : piece, Meter
--
-- Safe to run any number of time (IF NOT EXISTS guards). The catalog is
-- currently empty, so no row migration is needed; the guarded UPDATEs would
-- migrate old rows if any existed.
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
