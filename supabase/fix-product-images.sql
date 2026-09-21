-- ============================================================================
-- FIX: product image upload fails with
--   "new row violates row-level security policy" (storage.objects)
-- ============================================================================
-- WHY: the `product-images` bucket exists on this project, but its Storage
-- policies (INSERT for authenticated users) were never applied — the bucket
-- was created without running this project's setup SQL. Result: every image
-- upload is rejected, so product_images rows are never created and the app
-- can never display a product image.
--
-- This script is IDEMPOTENT: run it any number of times, it will not
-- duplicate policies or data. It does NOT touch any existing rows.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste entire file → Run.
-- VERIFY: the final SELECT must show all 4 policies = t.
-- ============================================================================

-- 1. Make sure the bucket exists and is public (no-op if already correct).
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- 2. Everyone (even visitors without an account) can view catalog images.
drop policy if exists "product images are publicly readable" on storage.objects;
create policy "product images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

-- 3. Authenticated staff/admins may upload, but ONLY into a folder named
--    after an existing product id (product-images/<product_id>/<file>).
--    Includes role gate (NULL-role signups cannot upload), image MIME only,
--    5 MiB cap, and product-folder existence check.
--
--    ⚠ COLUMN-QUALIFICATION BUG FIX: the original policy compared against
--    `(storage.foldername(name))[1]` with an UNQUALIFIED `name` while the
--    subquery queried `products p` — so `name` silently bound to `p.name`
--    (the product's display name, e.g. "Smily Face Ball"), never matching
--    the product id, and EVERY upload was rejected with
--    "new row violates row-level security policy".
--    Fix: qualify the outer column as `storage.objects.name`.
drop policy if exists "staff can upload product images" on storage.objects;
drop policy if exists "staff and admins can upload product images" on storage.objects;
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
      where p.id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

-- 4. Only admins can replace or remove stored images.
--    WITH CHECK ensures replaced files also pass MIME/size validation.
drop policy if exists "admins can update product images" on storage.objects;
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

drop policy if exists "admins can delete product images" on storage.objects;
create policy "admins can delete product images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_admin()
  );

-- 5. VERIFY — every row must show has_policy = t (true).
select
  'verify' as step,
  p.policyname,
  p.cmd,
  (p.policyname is not null) as has_policy
from pg_policies p
where p.schemaname = 'storage'
  and p.tablename = 'objects'
  and p.policyname like '%product images%';
