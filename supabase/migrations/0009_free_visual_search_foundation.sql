-- =============================================================================
-- 0009 — Free visual search: schema foundation
-- =============================================================================
-- Adds the schema columns needed for a zero-paid-AI visual product search
-- engine (MobileCLIP-S0, 512-dim embeddings via Supabase Edge Functions).
--
-- What changes:
--   1. products:     +brand, +subcategory, +is_active
--   2. product_images: +image_type
--   3. RPC rewritten: visual_search_matches now filters by is_active and
--                     uses 0008-hardened search_path + operator binding
--
-- What does NOT change:
--   - vector(512) column and HNSW index (already correct for MobileCLIP-S0)
--   - All RLS policies (0003, 0006, 0007) untouched
--   - Storage bucket and policies (0004) untouched
--   - clear_product_embeddings RPC (unchanged)
--   - touch_updated_at trigger (unchanged)
--   - All other tables, enums, and functions (unchanged)
--
-- Embedding model dimension note:
--   MobileCLIP-S0 (Apple, MIT license) outputs 512-dim float32 vectors.
--   The existing vector(512) column from 0005 matches exactly.
--   If a different model is ever used, the column AND the HNSW index
--   AND this RPC must all change together.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. products: add brand, subcategory, is_active
-- ----------------------------------------------------------------------------

-- brand: nullable because not all products have a brand
-- (local unbranded items, loose goods, etc.)
alter table public.products
  add column if not exists brand text;

comment on column public.products.brand is
  'Product brand name (nullable for unbranded/local items).';

-- subcategory: nullable finer-grain classification within category
-- (e.g., category=beverages, subcategory=cola)
alter table public.products
  add column if not exists subcategory text;

comment on column public.products.subcategory is
  'Optional subcategory within the product category (e.g. "cola" under "beverages").';

-- is_active: controls whether a product appears in customer-facing search.
-- Defaults to true so existing products are immediately searchable.
-- Admins set is_active=false to hide discontinued/seasonal products.
alter table public.products
  add column if not exists is_active boolean not null default true;

comment on column public.products.is_active is
  'When false the product is hidden from customer visual search and catalog browse. Defaults true for existing products.';

-- Index: fast filter for active products (used by the RPC and catalog queries)
create index if not exists products_is_active_idx
  on public.products (is_active)
  where is_active = true;

-- Index: active products sorted newest-first (catalog listing optimization)
create index if not exists products_active_created_idx
  on public.products (created_at desc)
  where is_active = true;

-- ----------------------------------------------------------------------------
-- 2. product_images: add image_type
-- ----------------------------------------------------------------------------

-- image_type classifies the role of each image:
--   'main'     — primary product photo (used first for search)
--   'detail'   — close-up or label shot
--   'variant'  — color/size/flavor variant
--   'thumbnail' — auto-generated small version
-- Nullable with default 'main' so existing rows and new uploads without
-- an explicit type are treated as the primary image.
alter table public.product_images
  add column if not exists image_type text not null default 'main';

comment on column public.product_images.image_type is
  'Image role: main (primary), detail, variant, or thumbnail. Used to prioritize which images to embed.';

-- Index: find the main image for a product quickly
create index if not exists product_images_main_idx
  on public.product_images (product_id)
  where image_type = 'main';

-- ----------------------------------------------------------------------------
-- 3. Rewrite visual_search_matches RPC
--    Adds: JOIN to products for is_active filter
--    Preserves: 0008 hardening (search_path, operator binding, clamping)
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
-- Search path includes the pgvector operator schemas; see 0008 for why the
-- explicit pg_catalog operator qualification was removed (42883 everywhere).
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

-- Revoke from everyone, then grant only to the intended roles.
-- SECURITY DEFINER means the function runs with the owner's privileges;
-- anon/authenticated callers can invoke it but cannot bypass the
-- is_active filter or read raw embeddings.
revoke all on function public.visual_search_matches(vector(512), double precision, integer)
  from public;
grant execute on function public.visual_search_matches(vector(512), double precision, integer)
  to anon, authenticated;

comment on function public.visual_search_matches(vector(512), double precision, integer) is
  'Cosine similarity search over product reference image embeddings. SECURITY DEFINER: anon can search without direct product_images read. Only returns active products. Returns product_id + image_id + similarity; NEVER prices, NEVER raw embeddings.';
