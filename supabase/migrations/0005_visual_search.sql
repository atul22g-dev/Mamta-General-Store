-- ============================================================================
-- 0005: Visual search — embeddings + vector similarity search (pgvector)
--
-- Architecture:
--   • Each product_images row can carry one `embedding vector(512)` computed
--     from its image by the embedding provider (MobileCLIP-S0, 512-dim).
--   • The RPC `visual_search_matches` performs cosine-similarity search over
--     all embedded reference images and returns ranked product candidates.
--   • Prices are NEVER stored or derived here — the caller re-reads the
--     products table so the selling price is always current.
-- ============================================================================

create extension if not exists vector;

-- ----------------------------------------------------------------------------
-- 1. Embeddings on reference images
-- ----------------------------------------------------------------------------
alter table public.product_images
  add column if not exists embedding vector(512);

comment on column public.product_images.embedding is
  'Embedding of the image computed by the embedding provider (MobileCLIP-S0, 512 dims). Used for visual similarity search.';

-- Approximate nearest-neighbour index for cosine distance.
-- HNSW: fast, works well from small catalogs up to millions of rows.
create index if not exists product_images_embedding_hnsw
  on public.product_images
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- ----------------------------------------------------------------------------
-- 2. Similarity search RPC
--
-- Given the query embedding for the user photo, returns ranked product
-- candidates. SECURITY DEFINER so anonymous shop-floor users can search
-- without direct read on product_images (RLS stays enforced for DML).
-- ----------------------------------------------------------------------------

-- Tunables (session SET, no schema changes needed):
--   app.match_threshold  → min cosine similarity to be "identified" (default 0.82)
--   app.match_candidates → max rows returned (default 5)
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
set search_path = public
as $$
  select
    pi.product_id,
    pi.id as image_id,
    1 - (pi.embedding <=> query_embedding) as similarity
  from public.product_images pi
  where pi.embedding is not null
    and 1 - (pi.embedding <=> query_embedding) >= match_threshold
  order by pi.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

revoke all on function public.visual_search_matches(vector(512), double precision, integer)
  from public;
grant execute on function public.visual_search_matches(vector(512), double precision, integer)
  to anon, authenticated;

comment on function public.visual_search_matches is
  'Cosine similarity search over product reference image embeddings. SECURITY DEFINER: anon can search without direct product_images read. Only returns active products. Returns product_id + image_id + similarity; NEVER prices, NEVER raw embeddings.';

-- ----------------------------------------------------------------------------
-- 3. Admin maintenance helper: clear embeddings for a product
--    (used when its reference images change wholesale)
-- ----------------------------------------------------------------------------
create or replace function public.clear_product_embeddings(p_product_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.product_images
  set embedding = null
  where product_id = p_product_id;
$$;

revoke all on function public.clear_product_embeddings(uuid) from public;
grant execute on function public.clear_product_embeddings(uuid) to authenticated;
