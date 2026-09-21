# BUG AUDIT — Mamta General Store: Find Product Feature

**Date:** 2026-09-20
**Scope:** Complete end-to-end trace of the Find Product (visual product matching) flow
**Auditor:** Automated code review

---

## Executive Summary

The Find Product feature implements a camera/photo → ONNX embedding → pgvector similarity search → product display pipeline. The architecture is sound but contains **12 issues** across the full stack: 2 Critical, 3 High, 5 Medium, and 2 Low severity bugs.

The most impactful issues are:
1. **PNG gallery images crash the edge function** (Critical) — gallery picks are mislabeled as JPEG, causing ONNX decode failure
2. **`embed-product-image` ignores its `image_url` parameter** (Critical) — embeds wrong image when multiple are pending
3. **`onnxruntime-node` may not work in Deno** (High) — the entire ONNX inference layer is unverified in production
4. **TypeScript types are out of sync with the database** (High) — missing `embedding` column, wrong RPC parameter type

---

## Bugs

### BUG-01: PNG gallery images crash the embedding engine

- **File:** `src/lib/visual-match/base64.ts`
- **Function:** `fileUriToDataUri`
- **Severity:** Critical

**Problem:** On native, gallery-picked PNG files are always labeled as `image/jpeg` in the data URI, but the binary data remains PNG. When this data URI reaches the edge function, the JPEG decoder attempts to decode PNG bytes and throws `Error: Unsupported image format` or a corrupt-data exception.

**Root cause:** `fileUriToDataUri` defaults to `mimeType = 'image/jpeg'`. The MIME detection regex (`/(?:^|[&;])type=image\/(png|webp)(?:[&;]|$)/i`) only matches type fragments in blob URLs (web). Native `file:///` URIs have no type metadata, so the fallback always wins. The actual binary bytes are never re-encoded — only the label is wrong.

**Why it breaks the feature:** Any PNG image selected from the gallery on native platforms will fail the entire visual match pipeline with an unhelpful error. The user sees "Couldn't complete the match" instead of a result. Camera captures are JPEG by default, so this only affects gallery picks.

**Recommended fix:**
1. In `fileUriToDataUri`, read the first few bytes of the file to detect the magic number (`FF D8 FF` = JPEG, `89 50 4E 47` = PNG) instead of relying on the extension/URI pattern.
2. Alternatively, use the `mimeType` from the `ImagePickerResult.assets[0].mimeType` (expo-image-picker provides this) and pass it through `scanSession.setShot(uri, mimeType)`.

**Files to modify:**
- `src/lib/visual-match/base64.ts`
- `src/lib/scan-session.ts` (add optional mimeType to ScanShot)
- `src/hooks/use-gallery-pick.ts` (pass mimeType from picker result)
- `src/app/find-product/camera.tsx` (pass mimeType from camera result)

---

### BUG-02: `embed-product-image` ignores `image_url` parameter

- **File:** `supabase/functions/embed-product-image/index.ts`
- **Function:** `Deno.serve` handler
- **Severity:** Critical

**Problem:** The edge function's `EmbedRequest` interface declares `product_id?` and `limit?` — it does NOT accept `image_url`. The client (`generateImageEmbedding` in `product-service.ts`) sends `{ image_url: imageUrl }`. The function ignores this entirely and instead queries `product_images` for ANY row where `embedding IS NULL`, limited to 20. If multiple images are pending, it embeds the first N found, not the specific image requested.

**Root cause:** The function was designed as a batch backfill tool, but the client uses it as a single-image embed-after-upload. The API contract was never aligned between client and server.

**Why it breaks the feature:** In the normal single-image-per-product flow, this works by coincidence (the just-uploaded image IS the only pending one). But if an admin adds a product with 3 images simultaneously, all 3 calls to `generateImageEmbedding` will race — each one might embed the same first pending image, or embed them in an unpredictable order. The third image might remain un-embedded.

**Recommended fix:** Update the edge function to accept `{ image_url: string }` and embed that specific image instead of querying for pending ones. Or: update the client to use `product_id` + `limit=1` and accept the current batch behavior as intentional.

**Files to modify:**
- `supabase/functions/embed-product-image/index.ts`

---

### BUG-03: `onnxruntime-node` via esm.sh may not work in Deno Edge Functions

- **File:** `supabase/functions/_shared/embedding-engine.ts`
- **Function:** `getSession`, `embedWithMobileClip`
- **Severity:** High

**Problem:** The engine imports `onnxruntime-node@1.21.0` from `esm.sh`. This package contains native Node.js C++ bindings (`node-addon-api`) that require `node-gyp` compilation and a Node.js runtime. Deno's Edge Functions do NOT provide a native Node.js addon loader — `Deno.dlopen` exists but is not the same as `node:ffi` or `node:process.dlopen`. The import may fail at module resolution, at `InferenceSession.create`, or silently produce incorrect results.

**Root cause:** `onnxruntime-node` was chosen as a replacement for `onnxruntime-web` (WASM), but its Node.js native addon dependency makes it incompatible with Deno Edge Functions. Neither `onnxruntime-web` (browser WASM) nor `onnxruntime-node` (Node native) is a correct fit for Deno.

**Why it breaks the feature:** If the ONNX session fails to initialize, every visual match call returns a 500 error. The user sees "Edge Function returned a non-2xx status code" (or the now-fixed better message). The entire visual search pipeline is non-functional.

**Recommended fix:** Use `onnxruntime-web` with the `wasm` execution provider, which IS compatible with Deno (Deno has first-class WASM support). Alternatively, use `onnxruntime-common` with a Deno-compatible backend. The original `onnxruntime-web` WASM approach was correct for Deno — the switch to `onnxruntime-node` introduced this regression.

**Files to modify:**
- `supabase/functions/_shared/embedding-engine.ts`

---

### BUG-04: TypeScript `product_images` type missing `embedding` column

- **File:** `src/types/database.ts`
- **Function:** `product_images.Row` type definition
- **Severity:** High

**Problem:** The `product_images` TypeScript type includes `id`, `product_id`, `image_url`, `image_type`, `created_at` but does NOT include the `embedding vector(512)` column added in migration 0005. This means:
- The Supabase client cannot select or filter by `embedding`
- Any code that tries to read `row.embedding` in TypeScript gets a type error
- The `is('embedding', null)` filter in `embed-product-image` works at the SQL level but is not type-safe

**Root cause:** The TypeScript types were hand-written to mirror `supabase gen types` output, but the regeneration was not run after migration 0005 added the `embedding` column.

**Why it breaks the feature:** This is a type-safety gap, not a runtime failure. The SQL queries still work because Supabase JS sends raw strings to PostgREST. However, it prevents proper type checking for any future code that needs to interact with embeddings from the client side.

**Recommended fix:** Add `embedding: string | null` (pgvector serializes as a string like `[0.1,0.2,...]`) to the `product_images.Row` type, or run `npx supabase gen types typescript --local > src/types/database.ts` to regenerate.

**Files to modify:**
- `src/types/database.ts`

---

### BUG-05: RPC TypeScript type has wrong `query_embedding` type

- **File:** `src/types/database.ts`
- **Function:** `visual_search_matches.Args`
- **Severity:** High

**Problem:** The TypeScript type defines `query_embedding: string`, but the SQL function expects `query_embedding vector(512)`. When PostgREST receives the RPC call with a JSON-serialized `number[]`, it needs to cast it to `vector(512)`. The `string` type annotation is misleading and could cause type confusion.

**Root cause:** Hand-written types approximate the Supabase CLI output. The pgvector `vector(512)` type is represented as `string` in the generated types (PostgREST accepts vector as a string like `[0.1,0.2,...]`), but the edge function passes a `number[]` array. The Supabase JS client serializes this correctly, so it works at runtime.

**Why it breaks the feature:** This is a type-safety issue, not a runtime bug. The edge function's `client.ts` never calls the RPC directly — it goes through the edge function. But if anyone adds client-side RPC calls in the future, the wrong type will cause confusion.

**Recommended fix:** Change to `query_embedding: number[]` or keep as `string` with a comment explaining the serialization behavior.

**Files to modify:**
- `src/types/database.ts`

---

### BUG-06: `getEmbeddingProvider()` re-initializes on every call

- **File:** `supabase/functions/_shared/embedding.ts`
- **Function:** `mobileclipProvider`, `getEmbeddingProvider`
- **Severity:** Medium

**Problem:** `getEmbeddingProvider()` is called on every request (line 240 of `visual-match/index.ts`). Each call creates a new `mobileclipProvider()` instance, re-reads `Deno.env.get('MODEL_URL')`, and calls `initModelUrl()`. While `initModelUrl` sets a module-level variable (so the value persists), the provider object is recreated wastefully.

**Root cause:** The provider is designed as a factory function that returns a new instance each time. It should be a singleton.

**Why it breaks the feature:** Not a functional break, but unnecessary GC pressure and env reads on every request. In a high-traffic scenario, this adds latency.

**Recommended fix:** Cache the provider instance at module level, similar to how `cachedSession` is cached in `embedding-engine.ts`.

**Files to modify:**
- `supabase/functions/_shared/embedding.ts`

---

### BUG-07: `visual-match` edge function does not handle non-POST methods

- **File:** `supabase/functions/visual-match/index.ts`
- **Function:** `Deno.serve` handler
- **Severity:** Medium

**Problem:** The function handles `OPTIONS` (CORS preflight) and falls through to the `try` block for everything else. A `GET` request would hit `req.json()` which would throw (GET has no body), returning a generic 500 error instead of a proper 405 Method Not Allowed.

**Root cause:** No method guard beyond the OPTIONS check.

**Why it breaks the feature:** Not a direct break (the client always sends POST), but incorrect HTTP semantics and a confusing error if anyone tests the endpoint manually or a proxy sends a wrong method.

**Recommended fix:** Add `if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);` after the OPTIONS check.

**Files to modify:**
- `supabase/functions/visual-match/index.ts`

---

### BUG-08: `isVisualMatchConfigured` permanently false (dead code)

- **File:** `src/lib/visual-match/service.ts`
- **Function:** `submitForMatching`, `fetchMatchResult`
- **Severity:** Medium

**Problem:** `isVisualMatchConfigured` is hardcoded to `false` and never updated. The `submitForMatching` and `fetchMatchResult` functions always return `not-configured` / `failed`. This is legacy placeholder code that was never cleaned up after the real visual-match pipeline was implemented via `client.ts`.

**Root cause:** The original placeholder service was left in place when the real implementation landed in `client.ts`.

**Why it breaks the feature:** Not a functional break — nothing imports these functions in the active flow. But they are confusing dead code that could mislead future developers.

**Recommended fix:** Delete `service.ts` entirely, or rename it to `service.legacy.ts` with a prominent deprecation comment.

**Files to modify:**
- `src/lib/visual-match/service.ts` (delete or deprecate)

---

### BUG-09: `embed-product-image` auth check does not use the edge function's own auth

- **File:** `supabase/functions/embed-product-image/index.ts`
- **Function:** `Deno.serve` handler
- **Severity:** Medium

**Problem:** The function extracts the `Authorization` header and creates a `userClient`, then calls `userClient.auth.getUser(authHeader.replace('Bearer ', ''))`. This manually parses the Bearer token. However, the Supabase Edge Functions runtime already provides the authenticated user via `Deno.env.get('SUPABASE_URL')` + the request context. The manual parsing is fragile — if the header format changes (e.g., `Bearer eyJ...` with extra whitespace), the auth check breaks silently.

**Root cause:** The function was written before Supabase Edge Functions had built-in user context, or without awareness of the `getSupabase()` helper pattern.

**Why it breaks the feature:** If the auth header is malformed (e.g., a proxy strips or reformats it), the function returns 401 even though the user is authenticated. This is an edge case but could affect production.

**Recommended fix:** Use the Supabase Edge Functions built-in auth context, or use a consistent auth helper pattern across all edge functions.

**Files to modify:**
- `supabase/functions/embed-product-image/index.ts`

---

### BUG-10: `image-utils.ts` allows WebP for validation but edge function rejects it

- **File:** `src/lib/products/image-utils.ts` and `supabase/functions/visual-match/index.ts`
- **Function:** `validateImage` and `ALLOWED_IMAGE_MIME`
- **Severity:** Medium

**Problem:** `image-utils.ts` defines `ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']` — WebP is allowed for validation and upload. But the `visual-match` edge function's `ALLOWED_IMAGE_MIME` regex is `/^data:image\/(png|jpeg|jpg);base64,/` — WebP is rejected. If a WebP image is uploaded as a product reference and later a user tries to match against it, the embedding would work (the `embed-product-image` function processes whatever is in Storage), but the validation layer is inconsistent.

**Root cause:** The validation was written before the WebP limitation of the ONNX engine was known, or the two files were updated independently.

**Why it breaks the feature:** WebP images can be uploaded but may cause issues during embedding if the `content-type` from Storage download is `image/webp` and the engine can't decode it. The `embed-product-image` function passes the content-type from the HTTP response directly into the data URI.

**Recommended fix:** Remove `image/webp` from `ALLOWED_MIME_TYPES` in `image-utils.ts` to match the engine's capabilities. Or: add WebP-to-JPEG conversion in the edge function.

**Files to modify:**
- `src/lib/products/image-utils.ts`

---

### BUG-11: `VIEWS` type not empty — uses `Record<string, never>` pattern correctly but no views exist

- **File:** `src/types/database.ts`
- **Function:** `Database.public.Views`
- **Severity:** Low

**Problem:** `Views: Record<string, never>` is correct for a schema with no views. This is not actually a bug — it's noted here for completeness. If views are ever added, this type must be updated.

**Root cause:** N/A — correct current state.

**Why it breaks the feature:** Does not break anything.

**Recommended fix:** None needed.

**Files to modify:** None.

---

### BUG-12: Legacy `service.ts` and `types.ts` coexist with new implementations

- **File:** `src/lib/visual-match/service.ts`, `src/lib/visual-match/types.ts`
- **Function:** Module-level exports
- **Severity:** Low

**Problem:** `service.ts` exports `submitForMatching` and `fetchMatchResult` (placeholder functions that always return `not-configured`). `types.ts` exports `MatchCandidate`, `MatchRequest`, `MatchSubmission`, `MatchResult` — legacy types that do not match the active `VisualMatchOutcome` / `MatchCandidateView` types. Both files are imported by nothing in the active flow but remain in the codebase.

**Root cause:** Leftover from the pre-implementation design phase.

**Why it breaks the feature:** No functional impact, but creates confusion for developers who discover these files and wonder if they're the active implementation.

**Recommended fix:** Delete both files or add `@deprecated` JSDoc pointing to the active implementations (`client.ts`, `types-client.ts`).

**Files to modify:**
- `src/lib/visual-match/service.ts`
- `src/lib/visual-match/types.ts`

---

## Complete End-to-End Find Product Flow (Current Implementation)

### Step 1: Entry Screen (`find-product/index.tsx`)
- User sees "Find Product" screen with camera viewfinder mock, tips, and two buttons:
  - **Shutter button** → navigates to `/find-product/camera`
  - **Gallery button** → calls `useGalleryPick().pickFromGallery()`

### Step 2a: Camera Capture (`find-product/camera.tsx`)
- Requests camera permission via `useCameraPermissions()`
- Shows `CameraView` with flash toggle and framing guide
- On shutter press: `cameraRef.current.takePictureAsync({ quality: 0.8 })` → JPEG
- Stores URI in `scanSession.setShot(photo.uri)` → navigates to `/find-product/preview`

### Step 2b: Gallery Pick (`hooks/use-gallery-pick.ts`)
- Requests media library permission via `ImagePicker.requestMediaLibraryPermissionsAsync()`
- Launches `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })`
- Stores URI in `scanSession.setShot(uri)` → navigates to `/find-product/preview`

### Step 3: Preview (`find-product/preview.tsx`)
- Shows captured photo with timestamp
- "Use Photo" → navigates to `/find-product/searching`
- "Choose Another Photo" → clears shot, goes back to camera

### Step 4: Searching (`find-product/searching.tsx`)
- Shows staged progress UI (Reading photo → Generating embedding → Searching catalog)
- **Step 4a:** Converts file URI to data URI: `fileUriToDataUri(shot.uri)` → `data:image/jpeg;base64,...`
  - Reads file bytes via `expo-file-system` `File` API
  - Converts to base64 via chunked `bytesToBase64`
  - Labels as JPEG (default) or detects PNG/WebP from blob URL (web only)
- **Step 4b:** Calls `matchProductFromPhoto(dataUri, signal)` → invokes the visual-match edge function

### Step 5: Edge Function (`supabase/functions/visual-match/index.ts`)
- Receives `{ image: "data:image/jpeg;base64,..." }`
- Validates MIME (jpeg/png only) and size (< 7MB)
- **Step 5a:** Embeds the photo:
  - `getEmbeddingProvider()` → initializes MobileCLIP-S0 ONNX session
  - `provider.embedImages([image])` → runs through `embedding-engine.ts`:
    1. Decode data URI → raw RGB bytes (jpeg-js or pngjs)
    2. Bilinear resize to 224×224
    3. CLIP preprocessing (normalize mean/std, HWC→CHW)
    4. Create ONNX tensor [1, 3, 224, 224]
    5. Run ONNX inference → 512-dim vector
    6. L2-normalize → cosine-ready vector
- **Step 5b:** Vector similarity search:
  - Creates Supabase client (anon key, for RPC)
  - Calls `supabase.rpc('visual_search_matches', { query_embedding, match_threshold: 0.75, match_count: 20 })`
- **Step 5c:** Groups results by product (best score per product)
- **Step 5d:** Determines main match (> 0.90 threshold, clear margin) and similar products (> 0.75)
- Returns `{ status, confidence, thresholds, main_match, similar_products, all_candidates }`

### Step 6: RPC (`visual_search_matches` in PostgreSQL)
- SECURITY DEFINER function (runs as owner, bypasses RLS on product_images)
- Queries `product_images pi INNER JOIN products p ON p.id = pi.product_id`
- Filters: `pi.embedding IS NOT NULL AND p.is_active = true AND cosine_similarity >= threshold`
- Orders by cosine distance (ASC = best first)
- Returns: `{ product_id, image_id, similarity }` — NEVER prices, NEVER raw embeddings
- Clamped limit: `least(greatest(coalesce(match_count, 5), 1), 25)`

### Step 7: Client Processing (`visual-match/client.ts`)
- Validates edge function response via `parseEdgeMatchResponse` (wire contract)
- Collects ALL product IDs from main_match + similar_products + all_candidates
- Fetches LIVE product data from `products` table: `supabase.from('products').select('*, product_images(id, image_url)').in('id', productIds).eq('is_active', true)`
- Builds `MatchCandidateView` objects with product data + similarity score
- Determines final status based on DB results (not edge function's stale status)
- Returns `VisualMatchOutcome` with live prices from the products table

### Step 8: Decision Logic (`visual-match/decision.ts`)
- Pure function: `analyzeMatchOutcome(outcome)`
- Returns `{ kind: 'single' | 'ambiguous' | 'none', showCandidates: boolean }`
- `single`: main match exists and passes threshold → auto-show
- `ambiguous`: similar products exist but no clear main → user disambiguates
- `none`: nothing passes threshold → "Product not recognized"

### Step 9: Result Screen (`find-product/result.tsx`)
- Reads outcome from `matchSession.getResult()`
- **No match:** Shows "Product not found" + Search Manually / Scan Again
- **Single match:** Shows `MainMatchCard` with product image, name, brand, unit, selling price, discount %, MRP
- **Ambiguous:** Shows similar products list (`SimilarProductCard`) — user taps to view
- **Manual search result:** Shows product with similarity = 0 (from manual search fallback)
- All prices come from the `products` table — the AI layer NEVER supplies prices

### Step 10: Price Display
- `formatPrice(selling_price)` → Indian Rupee format (₹28, ₹1,250)
- `formatPriceWithUnit(selling_price, unit)` → appends "/meter" for measured units
- Discount calculated from `mrp` vs `selling_price` (both from DB)
- MRP shown with strikethrough when discounted

---

## Flow Diagram

```
User Photo (camera/gallery)
    ↓
fileUriToDataUri() → data:image/jpeg;base64,...
    ↓
supabase.functions.invoke('visual-match', { image: dataUri })
    ↓
┌─── EDGE FUNCTION ──────────────────────────────────┐
│  1. Decode JPEG/PNG → RGB pixels                    │
│  2. Resize 224×224 (bilinear)                       │
│  3. CLIP normalize (mean/std, HWC→CHW)              │
│  4. ONNX inference (MobileCLIP-S0) → 512-dim vector │
│  5. L2-normalize                                    │
│  6. RPC: visual_search_matches(vector, 0.75, 20)    │
│  7. Group by product (best score)                   │
│  8. Threshold: main > 0.90, similar > 0.75          │
│  9. Return { main_match, similar_products }         │
└─────────────────────────────────────────────────────┘
    ↓
Client: fetchProducts(allProductIds) → live DB prices
    ↓
analyzeMatchOutcome() → single / ambiguous / none
    ↓
Result Screen: product image + name + DB price + similar products
```

---

## Summary Table

| Bug ID | Severity | Component | Short Description |
|--------|----------|-----------|-------------------|
| BUG-01 | Critical | base64.ts | PNG gallery images mislabeled as JPEG → crash |
| BUG-02 | Critical | embed-product-image | `image_url` parameter ignored |
| BUG-03 | High | embedding-engine.ts | `onnxruntime-node` incompatible with Deno |
| BUG-04 | High | database.ts | `product_images` type missing `embedding` column |
| BUG-05 | High | database.ts | RPC `query_embedding` typed as `string` not `number[]` |
| BUG-06 | Medium | embedding.ts | Provider re-initialized on every request |
| BUG-07 | Medium | visual-match/index.ts | No 405 for non-POST methods |
| BUG-08 | Medium | service.ts | `isVisualMatchConfigured` permanently false |
| BUG-09 | Medium | embed-product-image | Fragile manual auth header parsing |
| BUG-10 | Medium | image-utils.ts | WebP allowed in validation but rejected by engine |
| BUG-11 | Low | database.ts | No views (correct, noted for completeness) |
| BUG-12 | Low | service.ts, types.ts | Dead legacy code coexists with active implementation |
