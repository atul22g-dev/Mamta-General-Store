-- Mamta General Store: Find Product repair / verification
-- Run this in Supabase SQL Editor if the remote database is behind the app code.
-- Safe to re-run. It does NOT create prices or embeddings.
-- RPC shape matches migration 0013 (identity + live price + image + similarity).

alter table public.products
  add column if not exists brand text;
alter table public.products
  add column if not exists subcategory text;
alter table public.products
  add column if not exists is_active boolean not null default true;

alter table public.product_images
  add column if not exists image_type text not null default 'main';

create index if not exists products_is_active_idx
  on public.products (is_active) where is_active = true;

create index if not exists product_images_main_idx
  on public.product_images (product_id) where image_type = 'main';

create or replace function public.visual_search_matches(
  query_embedding vector(512),
  match_threshold double precision default 0.75,
  match_count integer default 20
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
  join public.products p on p.id = pi.product_id
  where pi.embedding is not null
    and p.is_active = true
    and 1 - (pi.embedding <=> query_embedding) >= match_threshold
  order by pi.embedding <=> query_embedding asc
  limit least(greatest(coalesce(match_count, 20), 1), 25);
$$;

revoke all on function public.visual_search_matches(vector(512), double precision, integer) from public;
grant execute on function public.visual_search_matches(vector(512), double precision, integer) to anon, authenticated;

-- IMPORTANT: every searchable product image must have embedding IS NOT NULL.
-- After changing the embedding model, clear old embeddings and re-run the
-- embed-product-image Edge Function for every product image.
