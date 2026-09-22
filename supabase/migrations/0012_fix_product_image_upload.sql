-- =============================================================================
-- 0012 — Fix product image uploads
-- =============================================================================
-- SYMPTOM
--   Every product image upload fails, even for a signed-in admin, with:
--     {"statusCode":"403","error":"Unauthorized",
--      "message":"new row violates row-level security policy","code":"AccessDenied"}
--   The product row saves and the product_images row inserts fine, but the
--   Storage object is never created — so the bucket stays empty and NO product
--   ever shows a picture anywhere in the app ("Product Image Not Show").
--
-- CAUSE
--   0007 gated the storage INSERT on columns of the row being inserted:
--       metadata->>'mimetype' like 'image/%'
--       (metadata->>'size')::bigint <= 5 * 1024 * 1024
--   storage-api does not populate those metadata keys at the moment the INSERT
--   policy is evaluated on this deployment: `metadata->>'mimetype'` is NULL,
--   `NULL like 'image/%'` is NULL, and WITH CHECK therefore fails. Verified
--   both ways on the live database:
--     metadata {"mimetype":"image/png","size":84838} -> INSERT allowed
--     metadata {}                                    -> 42501 row-level security
--   (storage.objects has no top-level mimetype/size columns either — only
--   bucket_id, name, metadata — so those two keys are the only source and
--   they are simply not available at INSERT time.)
--
-- FIX
--   Enforce content type and size in the BUCKET, which storage-api applies to
--   every upload itself, and keep in the policy only the checks whose inputs
--   ARE present: the role, the bucket, the filename extension, and the
--   product-folder path. Same security intent, mechanism that actually runs.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bucket-level enforcement (server-side, independent of RLS timing)
-- ----------------------------------------------------------------------------
-- 5 MiB matches the app's capture cap (src/lib/image-pipeline.ts MAX_IMAGE_BYTES)
-- and the limits quoted in the UI. Mirrors the types uploadProductImage sends
-- (jpeg for camera/transcoded HEIC, otherwise image/<ext>).
update storage.buckets
   set file_size_limit = 5 * 1024 * 1024,
       allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/gif',
         'image/heic',
         'image/heif'
       ]
 where id = 'product-images';

-- ----------------------------------------------------------------------------
-- 2. INSERT: role + folder gates, extension gate — no metadata dependency
-- ----------------------------------------------------------------------------
drop policy if exists "staff and admins can upload product images" on storage.objects;

create policy "staff and admins can upload product images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    -- Role gate: profile-less or role-less accounts (NULL role) cannot upload.
    and public.current_role() in ('admin', 'staff')
    -- Extension gate: the bucket is served publicly, so refuse keys that are
    -- obviously not images (stored-XSS hosting). Real type/size enforcement is
    -- the bucket's job (see section 1) because metadata is unavailable here.
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif')
    -- Path gate: the object must live in a folder named for an EXISTING
    -- product id. Qualify storage.objects.name so the subquery binds the
    -- object key, not products.name (display name).
    and exists (
      select 1 from public.products p
      where p.id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

-- ----------------------------------------------------------------------------
-- 3. UPDATE: admins only, same extension gate, no metadata dependency
-- ----------------------------------------------------------------------------
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
