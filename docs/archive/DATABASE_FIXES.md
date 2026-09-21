# Database & Type Fixes — Supabase Visual Search

## Summary

Database schema is correct after all migrations. The issues were **TypeScript-side type mismatches** and **format inconsistencies** that would cause runtime failures.

## Fixes Applied

### 1. BUG-04: `product_images` TypeScript type missing `embedding` column
**File:** `src/types/database.ts`

The database table `product_images` has an `embedding vector(512)` column (added in migration 0005), but the TypeScript type was missing it. This means any code accessing `row.embedding` would be a type error, and Supabase queries selecting the embedding column would not be properly typed.

**Fix:** Added `embedding: string | null` to `Row`, `Insert`, and `Update` types for `product_images`.

### 2. BUG-05: RPC `query_embedding` typed as `string` instead of `number[]`
**File:** `src/types/database.ts`

The SQL function `visual_search_matches` accepts `query_embedding vector(512)`, but the TypeScript type declared it as `string`. The Supabase JS client serializes `number[]` to JSON (`[0.1, 0.2, ...]`), which PostgREST accepts and casts to `vector(512)`. A `string` type would produce `"\"[0.1,0.2,...]\""` — a double-encoded value that PostgREST rejects.

**Fix:** Changed `query_embedding: string` to `query_embedding: number[]`.

### 3. BUG-10: Image format validation allows WebP but ONNX engine rejects it
**Files:** `src/lib/products/image-utils.ts`, `src/lib/visual-match/base64.ts`

The image validation allowed WebP uploads, but the MobileCLIP-S0 ONNX engine in the Deno edge function has no WebP decoder (`jpeg-js` + `pngjs` only). A WebP image would pass validation, get uploaded to Storage, and then fail at embedding time with a confusing error.

**Fixes:**
- `image-utils.ts`: Removed `image/webp` from `ALLOWED_MIME_TYPES` and `detectMimeType`. Error message now says "JPEG, PNG" only.
- `base64.ts`: Removed WebP from `KNOWN_IMAGE_MIME` regex and `fileUriToDataUri` MIME detection. WebP gallery picks now default to JPEG (which will fail gracefully if the bytes are actually WebP, giving a clear decode error instead of a silent corruption).

## Verification

- `npx tsc --noEmit` — 0 errors
- `npm run lint` — 0 problems
