-- ============================================================================
-- SETUP ALL IN ONE — Mamta General Store
-- ============================================================================
-- Full database schema in ONE paste (Supabase Dashboard → SQL Editor).
--
-- ⚠️  Run this ONLY on an EMPTY database (fresh project or after a wipe).
--     On an existing database it stops at the first CREATE with
--     "already exists" — use the migrations instead:
--
--       npm run db:deploy     ← migrates DB + deploys Edge Functions
--
-- After a fresh setup, restore the admin login with the dedicated,
-- idempotent supabase/create-admin-user.sql (edit its ▼ EDIT ME values).
-- ============================================================================

-- ============================================================================
-- 0001 — profiles & access control helpers
-- ============================================================================
-- profiles extends auth.users with store-specific fields (role).
-- A database trigger creates a profile row for every new signup.

create type public.user_role as enum ('admin', 'staff');

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  -- Nullable BY DESIGN: new signups start with NO role until an admin
  -- grants one (0006 security hardening). NULL role = no privileges.
  role       public.user_role,
  created_at timestamptz not null default now()
);

-- RLS is enabled at creation so the table is never exposed without it;
-- policies are defined in 0003_rls.sql.
alter table public.profiles enable row level security;

comment on table public.profiles is 'Store user profiles; 1:1 with auth.users.';

create index profiles_role_idx on public.profiles (role);

-- -----------------------------------------------------------------------------
-- Helpers (security definer to avoid RLS recursion on profiles)
-- -----------------------------------------------------------------------------
-- Returns the role of the current user, or null for anon callers.
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- True when the caller is authenticated with the 'admin' role.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_role() = 'admin'
$$;

-- -----------------------------------------------------------------------------
-- Auto-create a profile on signup
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 0002 — products & product_images
-- ============================================================================

create type public.product_category as enum (
  'groceries',
  'snacks',
  'household',
  'beverages',
  'personal_care',
  'dairy',
  'other'
);

create type public.product_unit as enum ('piece', 'kg', 'gram', 'litre', 'ml', 'pack', 'dozen');

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 200),
  description   text,
  category      public.product_category not null,
  mrp           numeric(10, 2) not null check (mrp >= 0),
  selling_price numeric(10, 2) not null check (selling_price >= 0 and selling_price <= mrp),
  stock         integer not null default 0 check (stock >= 0),
  unit          public.product_unit not null default 'piece',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.products is 'Store catalog. mrp = maximum retail price; selling_price <= mrp.';

-- RLS is enabled at creation so the table is never exposed without it;
-- policies are defined in 0003_rls.sql.
alter table public.products enable row level security;

-- Listing screens sort/paginate by these.
create index products_category_idx on public.products (category);
create index products_name_idx on public.products (name);
create index products_created_at_idx on public.products (created_at desc);

-- Keep updated_at fresh on every modification.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Images: 1:N from products, cascade delete with the product.
-- -----------------------------------------------------------------------------
create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  image_url  text not null,
  created_at timestamptz not null default now()
);

comment on table public.product_images is 'Image URLs (Supabase Storage paths) attached to products.';

-- RLS is enabled at creation so the table is never exposed without it;
-- policies are defined in 0003_rls.sql.
alter table public.product_images enable row level security;

-- FK lookup + "images for product" queries.
create index product_images_product_id_idx on public.product_images (product_id);

-- ============================================================================
-- 0003 — Row Level Security & policies
-- ============================================================================
-- Model:
--   * Catalog (products, product_images) is PUBLIC READ — customers browse it.
--   * Writes (insert/update/delete) are restricted to authenticated store
--     staff; destructive stock/price changes are admin-only.
--   * profile rows are visible to their owner and to admins; role changes
--     are admin-only and users can never self-promote.
-- Enable RLS first so no table is ever exposed without policies.

alter table public.profiles       enable row level security;
alter table public.products       enable row level security;
alter table public.product_images enable row level security;

-- Force RLS even for table owners (belt & braces against accidental grants).
alter table public.profiles       force row level security;
alter table public.products       force row level security;
alter table public.product_images force row level security;

-- =============================================================================
-- products
-- =============================================================================
-- INTENDED PERMISSION DESIGN (verified against the application):
--   • The admin UI (/(protected) routes) gates every product screen to
--     role='admin' only — staff never reach write screens in practice.
--   • The database intentionally ALLOWS staff inserts (create products on
--     the shop floor / via future staff tooling) but keeps destructive
--     price/stock changes and deletes admin-only. Do not "simplify" these
--     without product sign-off — the split is deliberate least-privilege.
-- =============================================================================
create policy "catalog is readable by everyone"
  on public.products
  for select
  to anon, authenticated
  using (true);

create policy "staff and admins can create products"
  on public.products
  for insert
  to authenticated
  with check (public.is_admin() or public.current_role() = 'staff');

create policy "admins can update products"
  on public.products
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete products"
  on public.products
  for delete
  to authenticated
  using (public.is_admin());

-- =============================================================================
-- product_images
-- =============================================================================
create policy "images are readable by everyone"
  on public.product_images
  for select
  to anon, authenticated
  using (true);

create policy "staff and admins can attach images"
  on public.product_images
  for insert
  to authenticated
  with check (public.is_admin() or public.current_role() = 'staff');

create policy "admins can update images"
  on public.product_images
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete images"
  on public.product_images
  for delete
  to authenticated
  using (public.is_admin());

-- =============================================================================
-- profiles — protect the role column
-- =============================================================================
create policy "users read own profile, admins read all"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "admins can insert profiles"
  on public.profiles
  for insert
  to authenticated
  with check (public.is_admin());

-- The trigger uses security definer to create profiles, so no anon insert
-- policy is needed; users cannot forge profiles.

create policy "users update own profile except role"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role());

create policy "admins can update any profile"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins can delete profiles"
  on public.profiles
  for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- 0004 — Supabase Storage: product images bucket & policies
-- ============================================================================
-- Bucket layout: product-images/<product_id>/<uuid>.<ext>
-- Public read (catalog images), staff/admin write. Paths embed the product
-- id, and the object key must live under a folder named for an existing
-- product — enforced by storage.foldername(storage.objects.name) checks in the policies.

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Everyone (even anon visitors) can view catalog images.
create policy "product images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

-- Staff/admins may upload (0007 hardening): role gate (NULL-role signups
-- cannot upload), image MIME only, 5 MiB cap, and only into a folder that
-- matches an existing product id.
create policy "staff and admins can upload product images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.current_role() in ('admin', 'staff')
    and mimetype like 'image/%'
    and size <= 5 * 1024 * 1024
    and exists (
      select 1 from public.products p
      -- ⚠ Must qualify `storage.objects.name` — an unqualified `name`
      -- inside this subquery binds to products.name (display name),
      -- never matches the product id, and rejects every upload.
      where p.id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

create policy "admins can update product images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_admin()
  )
  with check (
    bucket_id = 'product-images'
    and public.is_admin()
    and mimetype like 'image/%'
    and size <= 5 * 1024 * 1024
  );

create policy "admins can delete product images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_admin()
  );

-- ============================================================================
-- 0005: Visual search — embeddings + vector similarity search (pgvector)
-- ============================================================================
-- Architecture:
--   • Each product_images row can carry one `embedding vector(512)` computed
--     from its image by the embedding provider (Cohere embed-v4.0, 512-dim).
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
  'Embedding of the image computed by the embedding provider (Cohere embed-v4.0, 512 dims). Used for visual similarity search.';

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
  'Cosine similarity search over product reference image embeddings. Returns product ids + similarity; NEVER prices.';

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

-- ============================================================================
-- 0006 — Security hardening (findings from the security review)
-- ============================================================================
-- Fixes three privilege gaps without changing app behavior for admins/staff:
--
--   1. Auto-created profiles defaulted to role='staff', so ANY user who
--      signed up (API-level signup is open on most projects) received
--      catalog INSERT rights. New signups now start with NO role until an
--      admin grants one explicitly:
--        update public.profiles set role='staff' where email='...';
--
--   2. `clear_product_embeddings()` was executable by ANY authenticated
--      user (default PUBLIC execute privilege), letting a roleless signup
--      blind another product's visual search. Revoked from everyone except
--      the service role (used by server-side maintenance only). The app
--      never calls this function.
--
--   3. product_images UPDATE allowed staff to edit image rows (including
--      the embedding column). Catalog imagery is admin-managed — narrowed
--      to admins, matching update/delete on the storage objects.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Default new profiles to NO role (must be explicitly granted)
-- ----------------------------------------------------------------------------
-- profiles.role is already created nullable above; this is belt & braces
-- for databases where the table pre-existed from an older 0001.
alter table public.profiles
  alter column role drop not null,
  alter column role set default null;

-- ----------------------------------------------------------------------------
-- 2. clear_product_embeddings → service role only
-- ----------------------------------------------------------------------------
revoke execute on function public.clear_product_embeddings(uuid)
  from public, authenticated, anon;
grant execute on function public.clear_product_embeddings(uuid)
  to service_role;

-- ----------------------------------------------------------------------------
-- 3. product_images update → admin-only
-- ----------------------------------------------------------------------------
-- Already created admin-only in the 0003 section above (same name, same
-- definition); no duplicate drop/create needed in this consolidated file.

-- ============================================================================
-- 0007 — RLS & storage hardening (see migrations/0007_rls_storage_hardening.sql)
-- ============================================================================
-- Maintenance helper stays service-role-only (defensive re-assertion).
revoke execute on function public.clear_product_embeddings(uuid)
  from public, anon, authenticated;
grant execute on function public.clear_product_embeddings(uuid)
  to service_role;

-- Similarity search stays anon/authenticated-callable BY DESIGN (shop-floor
-- scans); SECURITY DEFINER exposure is catalog image ids + similarity only.
comment on function public.visual_search_matches(vector(512), double precision, integer) is
  'Cosine similarity search over product reference image embeddings. SECURITY DEFINER by design so anonymous shop-floor scans can search; definer exposure is limited to catalog image ids + similarity scores. NEVER prices, never user data.';

-- ============================================================================
-- ✅ SCHEMA COMPLETE
-- ============================================================================
-- ADMIN CREATION: do NOT put account provisioning in this reset script.
-- After a rebuild, restore the admin login with the dedicated, idempotent
--   supabase/create-admin-user.sql   (edit its two ▼ EDIT ME values).
-- Supported alternative: Dashboard → Authentication → Users → Add user,
-- then grant: update public.profiles set role='admin' where email='…';
--
-- OTHER SETUP STEPS:
--   • Migrate + deploy everything from your project folder:
--       npm run db:deploy
--   • In the app: Settings → Store database should say "Database connected".
--     Then sign in at /admin/login with the email + password above.
--   • Staff accounts: no SQL needed — Dashboard → Add Staff in the app.
-- ============================================================================
