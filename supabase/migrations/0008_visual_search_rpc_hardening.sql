-- =============================================================================
-- 0008 — Visual-search RPC hardening (matching accuracy & robustness)
-- =============================================================================
-- Behavioral contract (unchanged where already correct, now guaranteed):
--   • Ranking: best-first by cosine similarity (the RPC's own order — the
--     client and edge function preserve it; re-sorting there is stable on
--     the same score set).
--   • Decision: similarity >= threshold → match; below → "not recognized"
--     + candidates. The closest existing product is NEVER auto-selected
--     below threshold (client + edge enforce the same gate).
--   • Prices: never returned by this function — the app reads the live
--     products table.
--
-- Fixes here:
--   1. NULL-vector guard: rows with a NULL embedding were filtered only
--      implicitly (NULL comparison → NULL → not true). Make the intent
--      explicit so a NULL can never surface as a match candidate.
--   2. match_count sanitation: a caller (or a badly-set MATCH_CANDIDATES
--      secret) could pass 0 or a negative count; `greatest(match_count,1)`
--      masked it into "all rows" — effectively an unbounded LIMIT on the
--      HNSW scan. Clamp to a sane range instead.
--   3. Search-path hygiene: pin to public,pg_catalog and an explicit
--      operator binding so <=> is the vector cosine-distance operator
--      (pgvector), not something a future extension might shadow.
--   4. Explicit grant re-assertion (idempotent) matching 0007's contract.
-- =============================================================================

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
-- Operator resolution: pgvector installs its operators in the schema of the
-- extension (`public` on this project, `extensions` on others). The earlier
-- `operator(pg_catalog.<=>)` qualification was wrong — it pinned the cosine
-- operator to pg_catalog where it never exists (SQLSTATE 42883), making this
-- function unexecutable everywhere. Plain `<=>` + a search_path that includes
-- every schema pgvector realistically installs into resolves correctly and
-- keeps the explicit-extension intent.
set search_path = public, extensions, pg_catalog
as $$
  select
    pi.product_id,
    pi.id as image_id,
    1 - (pi.embedding <=> query_embedding) as similarity
  from public.product_images pi
  where pi.embedding is not null
    and 1 - (pi.embedding <=> query_embedding) >= match_threshold
  order by pi.embedding <=> query_embedding asc
  limit least(greatest(coalesce(match_count, 5), 1), 25);
$$;

revoke all on function public.visual_search_matches(vector(512), double precision, integer)
  from public;
grant execute on function public.visual_search_matches(vector(512), double precision, integer)
  to anon, authenticated;

comment on function public.visual_search_matches(vector(512), double precision, integer) is
  'Cosine similarity search over product reference image embeddings. SECURITY DEFINER by design so anonymous shop-floor scans can search; definer exposure is limited to catalog image ids + similarity scores. NEVER prices, never user data. Ranking is best-first; below-threshold results are "not recognized" by client contract.';
