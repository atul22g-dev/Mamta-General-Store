-- =============================================================================
-- 0007 — RLS & Storage security hardening (findings from the security audit)
-- =============================================================================
-- Closes three gaps that survived 0006. Nothing here weakens an existing
-- policy; every change narrows who can do what.
--
--   1. Storage uploads (INSERT on storage.objects) required only
--      "authenticated" + "folder matches a product id". Any authenticated
--      user — including a role-less signup (profiles.role is NULL since
--      0006) — could upload ARBITRARY content of ANY size into an existing
--      product's folder (e.g. text/html payloads served from the public
--      bucket, or multi-GB abuse). Uploads are now restricted to
--      staff/admin, real image MIME types, and a 5 MiB cap.
--
--   2. The Storage UPDATE policy had a USING clause but no WITH CHECK, so
--      a metadata rewrite (mimetype/size swap on replace) was not
--      re-validated on the new row state. Now both sides are checked and
--      constrained to admins + image MIME + the size cap.
--
--   3. Defensive re-assertion (idempotent, protects databases migrated in
--      any order or restored from partial dumps):
--        - clear_product_embeddings() stays service-role-only.
--        - visual_search_matches() remains grantable to anon/authenticated
--          BY DESIGN (shop-floor customers scan without an account); its
--          SECURITY DEFINER exposure is read-only catalog imagery (ids +
--          similarity scores) — no prices, no writes, no user data.
--      These statements change nothing on a correctly-migrated database.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Storage INSERT: staff/admin only, images only, size-capped
-- -----------------------------------------------------------------------------
drop policy if exists "staff can upload product images" on storage.objects;
drop policy if exists "staff and admins can upload product images" on storage.objects;

create policy "staff and admins can upload product images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    -- Role gate: profile-less or role-less accounts (NULL role) cannot upload.
    and public.current_role() in ('admin', 'staff')
    -- Content gate: catalog images are images. Blocks text/html (stored-XSS
    -- hosting) and other non-image payloads in the public bucket.
    and mimetype like 'image/%'
    -- Size gate: 5 MiB covers the app's JPEG captures with headroom.
    and size <= 5 * 1024 * 1024
    -- Path gate (unchanged from 0004): the object must live in a folder
    -- named for an EXISTING product id. Qualify storage.objects.name so
    -- the subquery binds the object key, not products.name (display name).
    and exists (
      select 1 from public.products p
      where p.id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

-- -----------------------------------------------------------------------------
-- 2. Storage UPDATE: admin-only on BOTH old and new row state
-- -----------------------------------------------------------------------------
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
    and mimetype like 'image/%'
    and size <= 5 * 1024 * 1024
  );

-- -----------------------------------------------------------------------------
-- 3. DELETE on storage.objects: keep admin-only, now stated explicitly
-- -----------------------------------------------------------------------------
-- 0004 created this policy; re-asserting it keeps 0007 self-contained and
-- guards against restore-order drift. drop-if-exists + recreate is idempotent.
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
-- 4. RPC / SECURITY DEFINER posture (defensive re-assertion)
-- -----------------------------------------------------------------------------
-- Maintenance helper: service role only (no caller-facing execution path;
-- the app never calls it). Statement is a no-op on a current database.
revoke execute on function public.clear_product_embeddings(uuid)
  from public, anon, authenticated;
grant execute on function public.clear_product_embeddings(uuid)
  to service_role;

-- Similarity search: deliberately executable by anon + authenticated
-- (customers scan without an account). SECURITY DEFINER is REQUIRED here —
-- without it a roleless/anon caller would see zero rows (product_images has
-- no anon select policy) and the shop-floor flow would never match. The
-- definer scope is bounded: the function reads only product_images
-- (embedding, id, product_id) and returns ids + similarity — never prices,
-- never profile/user data. No change; documented as the security contract.
comment on function public.visual_search_matches(vector(512), double precision, integer) is
  'Cosine similarity search over product reference image embeddings. SECURITY DEFINER by design so anonymous shop-floor scans can search; definer exposure is limited to catalog image ids + similarity scores. NEVER prices, never user data.';

-- -----------------------------------------------------------------------------
-- 5. Anonymous DML remains impossible: no INSERT/UPDATE/DELETE policy on
--    products, product_images, or profiles targets `anon`, so all anonymous
--    writes are denied by RLS default-deny. Verified; no statement needed.
-- -----------------------------------------------------------------------------
