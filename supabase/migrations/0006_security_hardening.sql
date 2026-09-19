-- =============================================================================
-- 0006 — Security hardening (findings from the security review)
-- =============================================================================
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
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Default new profiles to NO role (must be explicitly granted)
-- ----------------------------------------------------------------------------
alter table public.profiles
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
drop policy if exists "admins can update images" on public.product_images;
create policy "admins can update images"
  on public.product_images
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
