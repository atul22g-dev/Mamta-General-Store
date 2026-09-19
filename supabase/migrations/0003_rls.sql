-- =============================================================================
-- 0003 — Row Level Security & policies
-- =============================================================================
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
