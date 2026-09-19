-- =============================================================================
-- 0002 — products & product_images
-- =============================================================================

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

-- FK lookup + "images for product" queries.
create index product_images_product_id_idx on public.product_images (product_id);
