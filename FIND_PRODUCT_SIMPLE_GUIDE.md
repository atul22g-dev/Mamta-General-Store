# Find Product — Simple Architecture

## One rule

**AI identifies the product. Supabase provides the price.**

```text
Photo
  -> MobileCLIP-S0 (free)
  -> 512-number embedding
  -> pgvector similarity search
  -> product_id
  -> products table
  -> current selling_price
```

## Files to understand first

- `src/app/find-product/camera.tsx` — takes the photo.
- `src/app/find-product/preview.tsx` — lets the user confirm the photo.
- `src/app/find-product/searching.tsx` — starts one search job and shows progress/errors.
- `src/lib/image-pipeline.ts` — validates the image and converts it to base64.
- `src/lib/visual-match/client.ts` — calls the Edge Function and loads live product rows.
- `supabase/functions/visual-match/index.ts` — creates the query embedding and searches pgvector.
- `supabase/functions/embed-product-image/index.ts` — creates embeddings for catalog images.
- `supabase/migrations/0005_visual_search.sql` — creates the vector column/RPC.
- `supabase/migrations/0009_free_visual_search_foundation.sql` — adds active-product filtering.

## Required database state

1. `product_images.embedding` is `vector(512)`.
2. Searchable products have `products.is_active = true`.
3. Searchable reference images have a non-null 512-d embedding.
4. Reference embeddings and user-photo embeddings MUST use the same MobileCLIP-S0 model.

## If Find Product says no match

Check these in order:

1. Product exists and is active.
2. Product has at least one image.
3. `product_images.embedding` is not null.
4. `visual-match` Edge Function is deployed.
5. `EMBEDDING_PROVIDER` is not set to Cohere. The simplified project uses MobileCLIP-S0 only.
6. Run `npm run test:all`.
7. Run `npm run db:deploy` after logging into Supabase.

## Embeddings after adding products

Adding an image does not magically create a vector. The admin flow must call `embed-product-image`. If an image has `embedding IS NULL`, it cannot be found by visual search.

## Prices

The Edge Function never returns a price. The app gets the current `selling_price` from `products`.
