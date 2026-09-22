-- =============================================================================
-- 0013 — visual_search_matches returns product identity, price and image
-- =============================================================================
-- WHY
--   The RPC previously returned only (product_id, image_id, similarity).
--   Answering "what is this and what does it cost?" required a SECOND
--   PostgREST round trip (a products select) after every search, and the
--   image URL — already stored on product_images — was not returned either.
--   One RPC call now returns everything a result card needs:
--   identity + price + image + similarity score.
--
--   All of it comes from the SAME JOIN the 0009 is_active filter already
--   performs. No new table access, no denormalization, no new columns.
--
-- CONTRACT (additive — existing columns keep their names and order first):
--   product_id    uuid             — unchanged
--   image_id      uuid             — unchanged
--   product_name  text             — NEW: products.name (NOT NULL in schema)
--   selling_price numeric          — NEW: products.selling_price (numeric(10,2))
--   mrp           numeric          — NEW: products.mrp (numeric(10,2))
--   image_url     text             — NEW: product_images.image_url
--   similarity    double precision — unchanged: 1 - (embedding <=> query)
--
-- SECURITY POSTURE (unchanged by this migration):
--   • Catalog is public-read by design (0003): products.name/price and
--     product_images.image_url rows are ALREADY readable by anon through
--     their own SELECT policies. SECURITY DEFINER here exposes nothing new;
--     it only removes extra round trips.
--   • Prices are READ live from the products table — never computed, stored
--     or supplied by any AI/embedding layer (longstanding project rule).
--   • Only ACTIVE products are returned (0009 is_active filter preserved).
--   • Ranking, NULL-embedding guard, threshold semantics and the match_count
--     clamp are exactly the 0008/0009 hardened behavior.
-- =============================================================================

-- Defensive re-assertion: pgvector must exist for vector(512) and the <=> operator.
create extension if not exists vector;

create or replace function public.visual_search_matches(
  query_embedding vector(512),
  match_threshold double precision default 0.82,
  match_count integer default 5
)
returns table (
  product_id uuid,
  image_id uuid,
  product_name text,
  selling_price numeric,
  mrp numeric,
  image_url text,
  similarity double precision
)
language sql
stable
security definer
-- Search path includes the pgvector operator schemas; do NOT pin
-- operator(pg_catalog.<=>) — pgvector installs its operator in public or
-- extensions on real projects, and the pg_catalog qualification failed
-- everywhere with SQLSTATE 42883 (see migration 0008 for the full history).
set search_path = public, extensions, pg_catalog
as $$
  select
    pi.product_id,
    pi.id as image_id,
    p.name as product_name,
    p.selling_price as selling_price,
    p.mrp as mrp,
    pi.image_url as image_url,
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
  'Cosine similarity search over product reference image embeddings. SECURITY DEFINER: anon can search without direct product_images read. Only returns active products. Returns product_id, image_id, product_name, selling_price, mrp, image_url and similarity (prices are read live from products — never computed). NEVER returns raw embeddings, never user data.';

-- -----------------------------------------------------------------------------
-- Embedding dimension invariant — VERIFIED, no schema change
-- -----------------------------------------------------------------------------
-- The column remains vector(512) and must always equal the embedding model's
-- output width. The ONLY embedding producer in the system is
-- supabase/functions/_shared/embedding-engine.ts (EMBEDDING_DIMS = 512):
--   • computeImageDescriptor() THROWS unless the descriptor is exactly 512
--     dimensions ("Descriptor produced N dimensions; expected 512") — there is
--     no truncation or padding path anywhere in the code.
--   • Both edge functions validate every vector with
--     validateEmbeddingVector(vector, 512) BEFORE calling this RPC
--     (_shared/embedding.ts, EMBEDDING_DIMENSIONS = 512).
--   • Postgres itself would reject any other length: vector(512) is a
--     fixed-width type.
-- So a mismatch fails loudly at three independent layers; it can never
-- silently corrupt the search space. Guarded by tests/visual-search-rpc.test.mjs
-- and tests/edge-embedding-provider.test.mjs.
--
-- Index verdict (no change): product_images_embedding_hnsw
-- (hnsw, vector_cosine_ops, m = 16, ef_construction = 64) from 0005 already
-- covers this query's `ORDER BY embedding <=> query LIMIT ≤ 25` pattern, and
-- pgvector skips NULL vectors by itself — a partial variant would add write
-- cost on every image insert for no read benefit.
--
-- RLS verdict (no change): products and product_images are FORCE RLS with
-- public SELECT policies (0003); anon DML is default-denied (0006/0007).
-- Storage verdict (no change): the product-images bucket enforces type/size
-- at the bucket level and its policies gate role/extension/path (0012);
-- image_url values were already publicly readable, so returning them adds
-- no exposure.
-- -----------------------------------------------------------------------------
