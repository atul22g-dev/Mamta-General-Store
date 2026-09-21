# Embedding Generation Pipeline Fixes

## Summary

The Admin Add Product flow silently created products without embeddings when
embedding generation failed. The product appeared saved but was not searchable
by image — a critical gap that was hidden behind a brief "Product saved ✓"
success message.

## Admin Add Product Flow (traced)

```
Admin → Add Product → Product Image → Upload → Generate embedding → Store embedding → Save product
```

### Step-by-step:

1. `add.tsx:handleSubmit` calls `createProduct()` → creates product row in DB
2. Calls `uploadProductImage(productId, image.uri)` for each image → uploads to Storage + creates `product_images` row
3. Calls `generateProductEmbedding(productId)` → invokes `embed-product-image` edge function
4. Edge function: auth check → queries `product_images WHERE embedding IS NULL` → downloads image → runs MobileCLIP-S0 ONNX inference → stores 512-dim vector
5. Client receives structured response with `embedded`, `failed`, `hasEmbedding`

## Issues Found and Fixed

### 1. `generateImageEmbedding` ignored response details (HIGH)

**Before:** The function only checked the Supabase client `error` flag, discarding the
response body. A 200 response with `embedded: 0` and `failed: [...]` was treated as success.

**After:** New `generateProductEmbedding` function validates the full response shape:
- Checks for `error` field in response body
- Validates response is a non-null, non-array object
- Extracts `embedded` count and `failed` array
- Returns structured `hasEmbedding` boolean

### 2. `add.tsx` treated embedding failure as success (HIGH)

**Before:** When embeddings failed, the code set a warning message but still set
`status('success')` and navigated away after 650ms. The user saw "Product saved ✓"
even though the product was not searchable.

**After:** Embedding failure is a hard error:
- If `generateProductEmbedding` returns `ok: false` → status set to `'error'`, returns early
- If `hasEmbedding: false` → status set to `'error'`, returns early
- Partial failures (some images failed) → warning message but product is saved

### 3. `edit.tsx` had the same silent-failure problem (HIGH)

**Before:** Same pattern as `add.tsx` — embedding failures set `submitError` but
fell through to `submitStatus('success')`.

**After:** Same fix — embedding failure prevents the success state.

### 4. Edge function called with wrong parameters (MEDIUM)

**Before:** Client sent `{ image_url: imageUrl }` but the edge function expects
`{ product_id, limit }`. The edge function queried ALL pending images, not just
the ones for the current product.

**After:** Client sends `{ product_id: productId, limit: 20 }` — the edge function
processes only the current product's pending images.

### 5. No response shape validation (MEDIUM)

**Before:** If the edge function returned an unexpected shape (e.g. `null`,
a string, or an array), the client would crash or silently succeed.

**After:** `parseEmbeddingResponse` validates:
- `data` is non-null
- `data` is an object (not array, not string)
- `embedded` field is a number (defaults to 0)
- `failed` field is an array (defaults to [])

## Architecture: Embedding Service Module

Extracted `src/lib/products/embedding-service.ts` — a dedicated module for
embedding generation that has **zero React Native dependencies**:

- `generateProductEmbedding(productId, limit)` — main entry point
- `validateProductId()` — input validation
- `parseEmbeddingResponse()` — response validation
- Types: `EmbeddingStatus`, `EmbeddingResult`

`product-service.ts` re-exports `generateProductEmbedding` for backward
compatibility, but `add.tsx` and `edit.tsx` import directly from
`embedding-service.ts`.

## Model Compatibility

The embedding model used during product creation is **MobileCLIP-S0** (same
as the Find Product search):

| Property | Value |
|---|---|
| Model | MobileCLIP-S0 (Apple, MIT license) |
| Input | 224×224×3 RGB (float32, CHW, CLIP-normalized) |
| Output | 512-dim L2-normalized float32 vector |
| Dimension | 512 (matches `vector(512)` pgvector column) |
| Inference | Supabase Edge Functions (Deno, ONNX runtime) |

Both admin embedding generation and customer visual search use the same
model, same preprocessing pipeline, and same dimension. No compatibility risk.

## Tests Added

`tests/embedding-generation.test.mjs` — 14 tests covering:

- Empty/whitespace product ID → error
- Successful embedding (embedded > 0, no failures)
- Partial failure (some images failed, some succeeded)
- Zero embedded (nothing pending) → hasEmbedding false
- Edge function returns error object → error
- Edge function returns null response → error
- Supabase client returns error → error
- Exception thrown → returns error, not thrown
- All images failed → hasEmbedding false
- Malformed response (string, array) → error
- Missing embedded/failed fields → defaults

## Verification

- `npx tsc --noEmit` — 0 errors
- `npm run lint` — 0 problems
- `node tests/embedding-generation.test.mjs` — 14 passed, 0 failed
