-- =============================================================================
-- 0004 — Supabase Storage: product images bucket & policies
-- =============================================================================
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

-- Authenticated staff/admins may upload, but only into a folder that
-- matches an existing product id.
create policy "staff can upload product images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
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
  );

create policy "admins can delete product images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_admin()
  );
