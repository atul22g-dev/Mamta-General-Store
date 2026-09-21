# AUDIT REPORT — Find Product feature (Phase 1)

**Date:** 2026-09-22 · **Branch:** `Preview` · **Scope:** full repository inspection, no code modified.

Sources of truth used: actual source files (not prior fix reports), `git log`/`git show` history,
live Supabase project probes (REST + Edge Function HTTP calls) performed with the project's
publishable key from `.env`, and the installed supabase-js package source.

---

## 1. Find Product entry point

- **Tab route:** `src/app/(tabs)/products.tsx` — "Find Product" CTA → `router.push('/find-product')`
- **Flow stack:** `src/app/find-product/_layout.tsx` (nested Expo Router Stack):
  `index` (entry) → `camera` (or gallery pick) → `preview` → `searching` (runs the match) → `result`
  with `search` as the manual fallback screen.

## 2. Every function involved (app side, in call order)

| # | Function | File |
|---|---|---|
| 1 | `FindProductScreen` (index) | `src/app/find-product/index.tsx` |
| 2 | `useGalleryPick().pickFromGallery` | `src/hooks/use-gallery-pick.ts` |
| 3 | `FindProductCameraScreen.handleCapture` (shutter) | `src/app/find-product/camera.tsx` |
| 4 | `validateImageFile` | `src/lib/image-pipeline.ts` |
| 5 | `scanSession.setShot` / `getShot` / `clearShot` | `src/lib/scan-session.ts` |
| 6 | `FindProductPreviewScreen.handleUsePhoto` | `src/app/find-product/preview.tsx` |
| 7 | `FindProductSearchingScreen.runMatch` | `src/app/find-product/searching.tsx` |
| 8 | `validateAndConvert` (read bytes → MIME → base64 data URI) | `src/lib/image-pipeline.ts` |
| 9 | `bytesToBase64` | `src/lib/visual-match/base64.ts` |
| 10 | `matchProductFromPhoto` (invoke edge function → parse → fetch products → build outcome) | `src/lib/visual-match/client.ts` |
| 11 | `parseEdgeMatchResponse` (wire contract validation) | `src/lib/visual-match/edge-contract.ts` |
| 12 | `fetchProducts` (`.eq('is_active', true)` — **depends on migration 0009**) | `src/lib/visual-match/client.ts` |
| 13 | `analyzeMatchOutcome` (decision state machine) | `src/lib/visual-match/decision.ts` |
| 14 | `matchSession.setResult/getResult/clear` | `src/lib/visual-match/session.ts` |
| 15 | `FindProductResultScreen` (price render via `formatPrice*`) | `src/app/find-product/result.tsx` |
| 16 | `formatPrice` / `formatPriceWithUnit` | `src/lib/format.ts` |
| 17 | `getProductImageUrl` | `src/lib/products/get-product-image-url.ts` |

## 3. Every file involved

**App:** files in §2 plus `src/lib/supabase.ts` (single client), `src/lib/errors.ts`
(`toUserMessage`/`isNetworkError`, incl. Edge Function `details` JSON parsing),
`src/lib/visual-match/thresholds.ts`, `types-client.ts`.

**Backend (Edge Functions, Deno):**
- `supabase/functions/visual-match/index.ts` — auth gate → validate data URI → embed → RPC → group → decide
- `supabase/functions/_shared/embedding.ts` — provider selection + `validateEmbeddingVector`
- `supabase/functions/_shared/embedding-engine.ts` — MobileCLIP-S0 ONNX engine (decode/resize/CLIP preprocess/infer/L2)
- `supabase/functions/embed-product-image/index.ts` — admin backfill of `product_images.embedding`

**Indexing (admin):** `src/app/admin/(protected)/products/add.tsx`, `[id]/edit.tsx`,
`src/lib/products/product-service.ts` (`uploadProductImage`, `createProduct`, `listProducts`, `getProduct`),
`src/lib/products/embedding-service.ts` (`generateProductEmbedding` → invokes `embed-product-image`).

**Database:** `supabase/migrations/0001…0010`, `supabase/setup-all-in-one.sql`, `supabase/config.toml`,
`scripts/deploy.mjs` (`npm run db:deploy`).

## 4. Every API call

1. `supabase.functions.invoke('visual-match', { body: { image: dataUri }, signal })` — app → edge function.
2. Inside edge function: `fetch(MODEL_URL)` (ONNX model download) — **never verified end-to-end; see §8/§17**.
3. Inside edge function: `supabase.rpc('visual_search_matches', …)` → PostgREST → Postgres.
4. App: `supabase.from('products').select('*, product_images(id, image_url)').in('id', ids).eq('is_active', true)`.
5. Admin flow: `supabase.functions.invoke('embed-product-image', { body: { product_id, limit } })`.
6. Historical (deployed build only): `POST https://api.cohere.com/v2/embed` with `COHERE_API_KEY`.

## 5. Every Supabase call — see §4; plus Storage:
- `supabase.storage.from('product-images').upload/getPublicUrl/remove` (admin upload path).
- Storage public GET of product images (display).

## 6. Database tables involved

- **`products`** — id, name, description, category (enum), mrp, selling_price, stock, unit, created_at, updated_at
  (0002) + brand, subcategory, **is_active** (0009). Price source of truth.
- **`product_images`** — id, product_id (FK cascade), image_url, created_at (0002) + **embedding vector(512)**
  (0005, HNSW cosine index) + **image_type** (0009).
- **`profiles`** — auth/roles (0001); gates admin/staff for `embed-product-image`.
- **Storage bucket `product-images`** (0004, hardened 0007): public read; staff/admin upload; 5 MiB; image MIME.

## 7. RPCs involved

- **`visual_search_matches(query_embedding vector(512), match_threshold double precision DEFAULT 0.82, match_count integer DEFAULT 5)`**
  → returns table (product_id uuid, image_id uuid, similarity double precision).
  History: 0005 → hardened 0008 (search_path, operator binding, count clamp 1..25) → rewritten 0009
  (JOIN products, `p.is_active = true` filter). SECURITY DEFINER, granted to anon + authenticated (0007).
- **`clear_product_embeddings(uuid)`** — maintenance only, service-role (0006/0007). Not used by the app.

**App→RPC contract check:** TS `database.ts` Args (`query_embedding: number[]`, optional threshold/count)
and the edge-function call (`query_embedding`, `match_threshold`, `match_count`) **exactly match** the SQL
signature and return columns. ✔ No mismatch.

## 8. Embedding model actually being used

- **Repo code (current):** MobileCLIP-S0 vision encoder via ONNX (`onnxruntime-node`) in the edge function,
  224×224, CLIP normalization, L2-normalized **512-dim** output. `EMBEDDING_MODEL = 'mobileclip-s0'`.
- **Live deployed function (verified by HTTP probe):** the **old Cohere `embed-v4.0` provider**
  (from commit `ce5070d`/`8c55a16` era) — it answered `500 {"error":"COHERE_API_KEY is not configured for edge functions."}`.
- The repo rewrite (commits `bb88f16`→`6b7b0cb`) was **never redeployed**.

## 9. Embedding dimension

512 everywhere: RPC `vector(512)` (0005), `EMBEDDING_DIMENSIONS = 512` (shared module), DB types, tests.
Consistent. ✔ (Deployed Cohere build also used `output_dimension: 512`.)

## 10. Image format sent to the model

Data URI `data:image/(jpeg|png);base64,…` — built by `validateAndConvert` (camera JPEG quality 0.8;
gallery JPEG/PNG; HEIC→JPEG via expo-image-picker; WebP rejected with clear error). Edge function
whitelist `/^data:image\/(png|jpeg|jpg);base64,/`, ≤ 7,000,000 chars. Engine decodes JPEG (jpeg-js) /
PNG (pngjs). Consistent across app + function. ✔

## 11. Search vector format

`number[]` (JSON array) → PostgREST casts to `vector(512)`. `DATABASE_FIXES.md` correctly documents
why `number[]` (not `string`) is required. The deployed old build has no `validateEmbeddingVector`;
the current repo code validates array-ness, length, and finite values before the RPC.

## 12. Similarity threshold

- Client/edge defaults: MAIN 0.90, SIMILAR 0.75, AMBIGUOUS_MARGIN 0.03 (client `thresholds.ts`;
  edge reads secrets of the same names). RPC `match_threshold` is called with **0.75** (SIMILAR) to widen
  the candidate pool; main/uncertain decisions happen in the edge function after grouping.
- Live DB's stored RPC default (0.82 from 0005-era docs) is irrelevant — the caller always passes 0.75.

## 13. Product lookup mechanism

Edge function returns product IDs + similarity only → app `fetchProducts` re-reads `products`
(`.in('id', ids).eq('is_active', true)`) with `product_images(id, image_url)` embed → builds
`MatchCandidateView`s → decision → result screen. Deleted/deactivated IDs are dropped with a console.warn.
**This query is currently broken on the live DB** because `is_active` doesn't exist yet (migration 0009
not applied) → PostgREST error `42703`.

## 14. Price lookup mechanism

`selling_price`/`mrp` come **only** from the fetched `products` rows — never from the matcher.
`formatPrice`/`formatPriceWithUnit` coerce PostgREST numeric-as-string → number; non-finite → '—' + warn.
Correct by design. ✔ (Price display currently fails only because product fetch fails.)

## 15. Authentication requirements

- `visual-match`: edge function requires an `Authorization` header, then `supabase.auth.getUser()`.
  **Verified live:** anonymous shop-floor calls pass the gate (the deployed build accepts the publishable
  key as bearer). supabase-js ≥2.x **omits** the key-as-bearer for edge functions when using
  `sb_publishable_…` keys, so users **not signed in** send **no Authorization header → 401**.
  Mitigations that restore the documented "anon OK" contract are listed in DATABASE_FIX.md §5.
- `embed-product-image`: requires authenticated admin/staff (verified live: anonymous probe → 401). ✔
- RPC `visual_search_matches`: granted to anon+authenticated (SECURITY DEFINER, read-only catalog). ✔
- RLS: catalog public read (0003); upload/storage gated (0007). ✔

## 16. Environment variables required

- App: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (present in `.env`; key is
  `sb_publishable_…` format). ✔
- Edge secrets required by **current repo code**: NONE for the default free provider —
  MobileCLIP-S0 is downloaded from the HF Hub in-edge (11.8 MB quantized vision ONNX).
  (The original audit finding — missing `MODEL_URL` secret and no `models` bucket — is now
  moot; `scripts/export-mobileclip-onnx.mjs` was removed as obsolete on 2026-09-22.)
- Edge secrets required by **deployed old code**: `COHERE_API_KEY` — **not set** (proven by the 500).
- Optional threshold secrets: MAIN/SIMILAR/AMBIGUOUS/EDGE_CANDIDATE_LIMIT (defaults used when absent).

## 17. Current runtime errors (reproduced live, 2026-09-22)

| Probe | Result |
|---|---|
| `POST /functions/v1/visual-match` (empty body, anon key) | `400 {"error":"A data-URI product photo is required."}` — message proves **old deployed build** (current repo says "(png/jpeg)") |
| `POST …/visual-match` (valid 1×1 JPEG data URI) | **`500 {"error":"COHERE_API_KEY is not configured for edge functions."}`** |
| `POST …/embed-product-image` (anon) | `401 {"error":"Authentication required."}` (correct gate) |
| `GET /rest/v1/products?select=…,is_active` | **`42703 column products.is_active does not exist`** (migration 0009 missing) |
| `GET /rest/v1/product_images?select=…,image_type` | `42703 column product_images.image_type does not exist` |
| `POST /rest/v1/rpc/visual_search_matches` (512-dim test vector) | `[]` — RPC exists, executes, and correctly returns no candidates for an unrelated vector |
| `GET /rest/v1/product_images?select=id,embedding` | 1 row total; **embedding: NULL** |
| Storage `models/*` | `NoSuchBucket` |

## 18. TypeScript errors

`npx tsc --noEmit` → **0 errors**. ✔ (Edge Functions are excluded from tsconfig by design — Deno code.)

## 19. Dead code candidates (Phase 11 will verify each)

1. `supabase/setup-all-in-one.sql` — documented dev-reset script; referenced by README/troubleshooting → KEEP.
2. `supabase/fix-product-images.sql`, `supabase/sync-product-options.sql` — standalone repair scripts, no code references → UNCERTAIN (keep unless owner confirms obsolete; they are one-paste DB tools).
3. `scripts/export-mobileclip-onnx.mjs` — ~~UNCERTAIN~~ **removed** (2026-09-22): the engine now fetches the model from the HF Hub directly, so no local export step exists.
4. `src/components/themed-view.tsx` / other components — need import-graph verification (Phase 11).
5. Legacy doc reports (BUG_AUDIT.md, docs/BUG-AUDIT.md, *\_FIXES.md, FINAL_BUG_REPORT.md, SECURITY_AUDIT.md, FIND_PRODUCT_\*.md) — historical records → KEEP (documentation, no runtime impact).
6. `.expo-fulltest/`, `.claude/`, `.freebuff/`, `.vscode/`, `.github/` — tooling/config → KEEP.

No file will be deleted without the full reference analysis in Phase 11/12.

## 20. Dead file candidates

Same list as §19; additionally `tests/*` are all imported/executable test files (KEEP),
`src/app/+html.tsx` is an Expo Router convention file (KEEP).

---

## THE ACTUAL CALL CHAIN (as verified from source)

```
Products tab "Find Product" CTA
  → /find-product (index)  — camera button or gallery pick
  → expo-camera CameraView.takePictureAsync(quality .8)  OR  expo-image-picker (single)
  → validateImageFile(uri)                      [src/lib/image-pipeline.ts]
  → scanSession.setShot(uri) → /find-product/preview
  → "Use Photo" → /find-product/searching
  → validateAndConvert(uri) → data:image/(jpeg|png);base64,…
  → matchProductFromPhoto(dataUri, signal)      [src/lib/visual-match/client.ts]
      → supabase.functions.invoke('visual-match', { image })   [EDGE]
          → auth gate (Authorization header + auth.getUser())
          → MIME/size validation
          → EMBEDDING PROVIDER  ← ★ FIRST FAILURE (live)
          → validateEmbeddingVector (512, finite)
          → supabase.rpc('visual_search_matches', { query_embedding, 0.75, 20 })  ← ★ SECOND FAILURE (live: missing 0009 columns for app-side; RPC itself works)
          → group by product → main/similar/all_candidates → JSON (never prices)
      → parseEdgeMatchResponse (strict shape validation)
      → fetchProducts: products.select('*, product_images(…)').in(id).eq('is_active', true)  ← ★ THIRD FAILURE (live: 42703)
      → build VisualMatchOutcome
  → matchSession.setResult(outcome, photo) → router.replace('/find-product/result')
  → analyzeMatchOutcome → single | ambiguous | none
  → render: product name/brand/unit + PriceText(formatPrice(selling_price)) from DB row
```

★ marks the points where the live system provably fails today. Details in FIND_PRODUCT_ROOT_CAUSE.md.
