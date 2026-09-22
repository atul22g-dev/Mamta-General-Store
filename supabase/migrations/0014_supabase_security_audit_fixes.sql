-- =============================================================================
-- 0014 — Supabase security audit fixes (RLS stays ENABLED everywhere)
-- =============================================================================
-- Findings from the 2026-09-22 security audit and their fixes. The policy
-- matrix itself was verified CORRECT (see the matrix in the verification
-- section at the bottom); the gaps were:
--
--   1. Default-privilege EXECUTE gaps: `setup-all-in-one.sql` re-grants
--      visual_search_matches to anon/authenticated, but a database built
--      from older scripts (or restored partially) may still carry the
--      Postgres DEFAULT "EXECUTE to PUBLIC" on other SECURITY DEFINER
--      helpers — granting roleless signups more than intended.
--      Fix: explicit grant/revoke statements (0014 is re-runnable).
--
--   2. Credential leak incident notes still quoted the actual admin
--      password. Reproducing secrets — even in incident documentation —
--      keeps them in the repository forever. Fixed in that file (app-side).
--
--   3. Drift risk: nothing asserted the full RLS + storage policy CONTRACT
--      in one place. Section 3 re-asserts every policy idempotently so any
--      future drift from setup scripts or partial restores is repaired by
--      simply applying this migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Function EXECUTE privileges — explicit, no reliance on defaults
-- -----------------------------------------------------------------------------
-- current_role()/is_admin(): SECURITY DEFINER RLS helpers. They are safe for
-- any caller (they only read the caller's own profile row), but least-
-- privilege says the PUBLIC default should be revoked and access granted
-- explicitly to the roles the policies run as. Revoking from PUBLIC is what
-- the SQL standard recommends for SECURITY DEFINER functions.
revoke execute on function public.current_role()
  from public, anon;
grant execute on function public.current_role()
  to authenticated;

revoke execute on function public.is_admin()
  from public, anon;
grant execute on function public.is_admin()
  to authenticated;

-- handle_new_user(): the auth-signup trigger runs as the service principal,
-- and GoTrue (not end users) invokes it. PUBLIC never needs it.
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
grant execute on function public.handle_new_user()
  to service_role;

-- clear_product_embeddings(): destructive maintenance helper — service role
-- only (re-assertion of 0006 §2 / 0007 §4; idempotent).
revoke execute on function public.clear_product_embeddings(uuid)
  from public, anon, authenticated;
grant execute on function public.clear_product_embeddings(uuid)
  to service_role;

-- visual_search_matches(): DELIBERATELY public — shop-floor customers scan
-- without an account. SECURITY DEFINER is required for that flow and is
-- bounded (read-only catalog ids + similarity; see 0007 §4). Explicit grants
-- so the intent survives any restore-order drift.
revoke execute on function public.visual_search_matches(vector(512), double precision, integer)
  from public;
grant execute on function public.visual_search_matches(vector(512), double precision, integer)
  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Defensive re-assertion — RLS stays ON and FORCEd on every table
-- -----------------------------------------------------------------------------
-- Cheap, idempotent, and repairs any database where a restore or manual
-- dashboard edit dropped it. NO policy here disables or bypasses RLS.
alter table public.profiles       enable row level security;
alter table public.products       enable row level security;
alter table public.product_images enable row level security;
alter table public.profiles       force row level security;
alter table public.products       force row level security;
alter table public.product_images force row level security;

-- -----------------------------------------------------------------------------
-- 3. Policy contract re-assertion (idempotent drop + recreate)
-- -----------------------------------------------------------------------------
-- 3a. products: catalog readable by everyone; writes admin/staff per role.
drop policy if exists "catalog is readable by everyone" on public.products;
create policy "catalog is readable by everyone"
  on public.products
  for select
  to anon, authenticated
  using (true);

drop policy if exists "staff and admins can create products" on public.products;
create policy "staff and admins can create products"
  on public.products
  for insert
  to authenticated
  with check (public.is_admin() or public.current_role() = 'staff');

drop policy if exists "admins can update products" on public.products;
create policy "admins can update products"
  on public.products
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can delete products" on public.products;
create policy "admins can delete products"
  on public.products
  for delete
  to authenticated
  using (public.is_admin());

-- 3b. product_images: readable by everyone; insert staff/admin;
--     update/delete admin-only (0006 §3).
drop policy if exists "images are readable by everyone" on public.product_images;
create policy "images are readable by everyone"
  on public.product_images
  for select
  to anon, authenticated
  using (true);

drop policy if exists "staff and admins can attach images" on public.product_images;
create policy "staff and admins can attach images"
  on public.product_images
  for insert
  to authenticated
  with check (public.is_admin() or public.current_role() = 'staff');

drop policy if exists "admins can update images" on public.product_images;
create policy "admins can update images"
  on public.product_images
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can delete images" on public.product_images;
create policy "admins can delete images"
  on public.product_images
  for delete
  to authenticated
  using (public.is_admin());

-- 3c. profiles: owner/admin reads, self-update cannot touch role,
--     inserts only via the security-definer signup trigger + admins.
drop policy if exists "users read own profile, admins read all" on public.profiles;
create policy "users read own profile, admins read all"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "admins can insert profiles" on public.profiles;
create policy "admins can insert profiles"
  on public.profiles
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "users update own profile except role" on public.profiles;
create policy "users update own profile except role"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role());

drop policy if exists "admins can update any profile" on public.profiles;
create policy "admins can update any profile"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can delete profiles" on public.profiles;
create policy "admins can delete profiles"
  on public.profiles
  for delete
  to authenticated
  using (public.is_admin());

-- 3d. Storage bucket: public catalog images; role/extension/path-gated
--     writes (bucket-level MIME + 5 MiB cap re-asserted too).
update storage.buckets
   set public = true,
       file_size_limit = 5 * 1024 * 1024,
       allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/gif',
         'image/heic',
         'image/heif'
       ]
 where id = 'product-images';

drop policy if exists "product images are publicly readable" on storage.objects;
create policy "product images are publicly readable"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "staff and admins can upload product images" on storage.objects;
create policy "staff and admins can upload product images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.current_role() in ('admin', 'staff')
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif')
    and exists (
      select 1 from public.products p
      where p.id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

drop policy if exists "admins can update product images" on storage.objects;
create policy "admins can update product images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_admin()
  )
  with check (
    bucket_id = 'product-images'
    and public.is_admin()
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif')
  );

drop policy if exists "admins can delete product images" on storage.objects;
create policy "admins can delete product images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_admin()
  );

-- -----------------------------------------------------------------------------
-- 4. Verification queries (run after applying; every result must be as noted)
-- -----------------------------------------------------------------------------
-- RLS enabled everywhere:
--   select relname, relrowsecurity, relforcerowsecurity
--     from pg_class
--    where relname in ('profiles','products','product_images')
--      and relnamespace = 'public'::regnamespace;
--   → all three rows: true, true
--
-- No anon DML anywhere:
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public' and roles @> '{anon}' and cmd <> 'SELECT';
--   → 0 rows
--
-- The full write matrix (admins CREATE/UPDATE/DELETE products + upload;
-- staff restricted; roleless signups and anon read-only) is asserted by
-- tests/supabase-security.test.mjs against this migration's source.
-- =============================================================================
