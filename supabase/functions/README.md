# Supabase Edge Functions

## Find Product backend

```text
User photo
  -> visual-match
  -> MobileCLIP-S0 (free)
  -> 512-d embedding
  -> pgvector
  -> product IDs + similarity
  -> Expo app loads current product/price
```

The AI function never returns or calculates prices.

| Function | Purpose | Caller |
|---|---|---|
| `visual-match` | User photo → MobileCLIP embedding → pgvector candidates | App; anonymous scans allowed |
| `embed-product-image` | Product image → MobileCLIP embedding → database | Admin/staff |

## Provider

This simplified project intentionally uses **MobileCLIP-S0 only**. It runs inside the Edge Function and needs no paid AI API key.

Reference product images and user photos must always use the same model. If embeddings are regenerated with another model, clear the old embeddings and re-embed every searchable product image before testing again.

## Required database state

- `product_images.embedding` is `vector(512)`.
- `products.is_active` exists and is `true` for searchable products.
- Searchable product images have `embedding IS NOT NULL`.
- `visual_search_matches(vector(512), double precision, integer)` exists and is executable by `anon`/`authenticated`.

## Deploy

```bash
supabase login
supabase link --project-ref YOUR-REF
supabase db push
supabase functions deploy visual-match
supabase functions deploy embed-product-image
```

Or use the project helper:

```bash
npm run db:deploy
```

## Product embeddings

After an admin uploads a product image, the image needs an embedding. The admin/staff-only `embed-product-image` function handles this.

For a batch:

```text
POST /functions/v1/embed-product-image
Authorization: Bearer ADMIN_JWT
{"limit":20}
```

Repeat until the response says `Nothing pending.`.
