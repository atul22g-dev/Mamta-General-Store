-- ============================================================================
-- REPAIR: visual search schema (Find Product) — for databases that are
-- missing the 0009/0010 schema changes (e.g. provisioned via a partial
-- setup, or via setup-all-in-one.sql before those stages existed).
--
-- VERIFIED SYMPTOM (live project, 2026-09-22):
--   GET /rest/v1/products?select=is_active
--     → {"code":"42703","message":"column products.is_active does not exist"}
--   GET /rest/v1/product_images?select=image_type
--     → {"code":"42703","message":"column product_images.image_type does not exist"}
--
-- WHAT IT DOES (idempotent, zero data loss, no table recreation):
--   1. products:        + brand, subcategory, is_active (defaults true)
--                       + the two partial indexes from 0009
--   2. product_images:  + image_type (default 'main') + its partial index
--   3. product_category enum: + boots, toys, cloths (0010)
--      product_unit enum:        + pair (0010)
--   4. Recreates visual_search_matches exactly as migration 0009 defines it
--      (JOIN products, is_active filter, hardened search_path, count clamp).
--   5. Re-asserts the grants (revoke public → grant anon, authenticated).
--
-- Every statement is IF NOT EXISTS / OR REPLACE — safe to run repeatedly.
-- It NEVER deletes rows, NEVER drops tables, NEVER resets the database.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste entire file → Run.
-- Then apply migration history + deploy functions:  npm run db:deploy
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. products: brand, subcategory, is_active  (from migration 0009)
-- ----------------------------------------------------------------------------
alter table public.products add column if not exists brand text;
comment on column public.products.brand is
  'Product brand name (nullable for unbranded/local items).';

alter table public.products add column if not exists subcategory text;
comment on column public.products.subcategory is
  'Optional subcategory within the product category (e.g. "cola" under "beverages").';

alter table public.products add column if not exists is_active boolean not null default true;
comment on column public.products.is_active is
  'When false the product is hidden from customer visual search and catalog browse. Defaults true for existing products.';

create index if not exists products_is_active_idx
  on public.products (is_active)
  where is_active = true;

create index if not exists products_active_created_idx
  on public.products (created_at desc)
  where is_active = true;

-- ----------------------------------------------------------------------------
-- 2. product_images: image_type  (from migration 0009)
-- ----------------------------------------------------------------------------
alter table public.product_images add column if not exists image_type text not null default 'main';
comment on column public.product_images.image_type is
  'Image role: main (primary), detail, variant, or thumbnail. Used to prioritize which images to embed.';

create index if not exists product_images_main_idx
  on public.product_images (product_id)
  where image_type = 'main';

-- ----------------------------------------------------------------------------
-- 3. Enum values  (from migration 0010)
--    Postgres enums cannot drop values — old ones stay, unused but harmless.
-- ----------------------------------------------------------------------------
alter type public.product_category add value if not exists 'boots';
alter type public.product_category add value if not exists 'toys';
alter type public.product_category add value if not exists 'cloths';
alter type public.product_unit add value if not exists 'pair';

comment on type public.product_category is
  'Product categories. Active values: boots, personal_care, toys, cloths, other. Legacy values (groceries, snacks, household, beverages, dairy) are unused but retained in the enum.';

-- ----------------------------------------------------------------------------
-- 4. Rewrite visual_search_matches exactly as migration 0009 defines it
--    (adds the is_active filter; preserves 0008 hardening).
-- ----------------------------------------------------------------------------
create or replace function public.visual_search_matches(
  query_embedding vector(512),
  match_threshold double precision default 0.82,
  match_count integer default 5
)
returns table (
  product_id uuid,
  image_id uuid,
  similarity double precision
)
language sql
stable
security definer
-- Search path includes the pgvector operator schemas; do NOT pin
-- operator(pg_catalog.<=>) here — pgvector is installed in public/extensions
-- on real projects, so the pg_catalog qualification fails with 42883
-- (see migration 0008 for the full history).
set search_path = public, extensions, pg_catalog
as $$
  select
    pi.product_id,
    pi.id as image_id,
    1 - (pi.embedding <=> query_embedding) as similarity
  from public.product_images pi
  inner join public.products p on p.id = pi.product_id
  where pi.embedding is not null
    and p.is_active = true
    and 1 - (pi.embedding <=> query_embedding) >= match_threshold
  order by pi.embedding <=> query_embedding asc
  limit least(greatest(coalesce(match_count, 5), 1), 25);
$$;

revoke all on function public.visual_search_matches(vector(512), double precision, integer)
  from public;
grant execute on function public.visual_search_matches(vector(512), double precision, integer)
  to anon, authenticated;

comment on function public.visual_search_matches(vector(512), double precision, integer) is
  'Cosine similarity search over product reference image embeddings. SECURITY DEFINER: anon can search without direct product_images read. Only returns active products. Returns product_id + image_id + similarity; NEVER prices, NEVER raw embeddings.';

-- ----------------------------------------------------------------------------
-- 5. Verification queries (run after the script; expect 4 × true + counts)
-- ----------------------------------------------------------------------------
-- select
--   exists (select 1 from information_schema.columns
--            where table_name='products' and column_name='is_active')        as products_is_active,
--   exists (select 1 from information_schema.columns
--            where table_name='products' and column_name='brand')            as products_brand,
--   exists (select 1 from information_schema.columns
--            where table_name='product_images' and column_name='image_type') as images_image_type,
--   exists (select 1 from pg_type t join pg_enum e on e.enumtypid=t.oid
--            where t.typname='product_category' and e.enumlabel='boots')     as enum_boots,
--   (select count(*) from public.product_images)                             as total_images,
--   (select count(*) from public.product_images where embedding is not null) as embedded_images;
