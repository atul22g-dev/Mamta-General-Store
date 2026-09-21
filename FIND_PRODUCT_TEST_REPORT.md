# FIND PRODUCT TEST REPORT (Phase 10)

**Date:** 2026-09-22 · **Scope:** the single, authoritative Find Product pipeline
`(tabs)` → `/find-product` → camera/gallery → preview → searching → `visual-match` edge function →
`visual_search_matches` RPC → products fetch → result (DB price).

## 1. Automated checks actually run (real commands, real output)

| Check | Command | Result |
|---|---|---|
| TypeScript (strict) | `npx tsc --noEmit` | ✅ 0 errors |
| ESLint (repo config) | `npm run lint` | ✅ 0 problems |
| Visual-match decision/wire-contract/base64/thresholds | `node tests/visual-match.test.mjs` | ✅ 18 passed, 0 failed |
| Image pipeline (validation/MIME/size/base64) | `node tests/image-pipeline.test.mjs` | ✅ 23 passed, 0 failed |
| Embedding vector validation | `node tests/search-embedding.test.mjs` | ✅ 28 passed, 0 failed |
| Embedding service response parsing | `node tests/embedding-generation.test.mjs` | ✅ 14 passed, 0 failed |
| Deno edge-function syntax | TypeScript parser over all 4 function files | ✅ OK |

## 2. Live-backend probes (executed against the real project)

> **Final status (2026-09-22, post-deploy): the whole chain is LIVE and PASSING.**
> Migrations 0001–0010 applied via `supabase db push` (0007 fixed for the modern storage
> schema, 0008/0009 operator resolution fixed); both functions deployed; the free
> MobileCLIP-S0 provider verified running inside the edge isolate (~1 s/image); the pending
> product image backfilled in-edge; end-to-end anonymous search returned
> `HTTP 200 {status: "identified", confidence: 1.0}` on the product's own photo.

| # | Probe | Before fix | After fix (live result) |
|---|---|---|---|
| P1 | `POST /functions/v1/visual-match` empty body, publishable key | `400 "A data-URI product photo is required."` (old build) | ✅ `400 "…required (png/jpeg)."` — new build confirmed |
| P2 | `POST …/visual-match` valid image, **anonymous** (no session) | **`500 "COHERE_API_KEY is not configured…"`** | ✅ `HTTP 200 {"status":"identified","confidence":1}` with the product's own photo — no API key needed (free MobileCLIP-S0 in-edge) |
| P3 | `POST …/visual-match` valid image, **signed-in staff JWT** | same 500 | code path unchanged (JWT validated via `auth.getUser`); anonymous path proven live |
| P4 | `POST /rest/v1/rpc/visual_search_matches` (512-dim test vector) | `[]` (works, pre-0009 definition) | ✅ RPC executes on the 0009 definition (returns matches with real vectors) |
| P5 | `GET /rest/v1/products?select=is_active` | **`42703 column does not exist`** | ✅ column exists (`supabase migration list`: 0001–0010 applied) |
| P6 | `GET /rest/v1/product_images?select=image_type` | **`42703 column does not exist`** | ✅ column exists |
| P7 | Embedding coverage SQL (`count(embedding)`) | 1 image, 0 embedded | ✅ 1 image, 1 embedded (in-edge backfill using the exact search engine) |

## 3. Scenario matrix (A–O)

Status legend: ✅ verified · 🔧 fixed by this change · ⏳ needs real store photos (code live and
unit-verified) · ✅(logic) verified at logic level by unit tests.

| Scenario | Path exercised | Status | Evidence |
|---|---|---|---|
| **A. Exact same product image** | embed → RPC top-1 → fetch product → price | ✅ | **verified live**: anonymous `visual-match` on the product's own photo → `identified`, confidence 1.0, correct product_id |
| **B. Different photo of same product** | same | ⏳ | pipeline live end-to-end (A verified); quality depends on real photos + threshold tuning (MAIN 0.90) |
| **C. Different angle** | same | ⏳ | same; below-MAIN → `uncertain` list path unit-covered |
| **D. Cropped product** | same | ⏳ | same |
| **E. Low-quality image** | small/blurry JPEG | ✅(logic) pipeline accepts valid JPEG; embedding quality decides match | image-pipeline tests 23/23 |
| **F. Unrelated product** | no candidates above 0.75 | ✅(logic) | `no-match` decision unit-tested; RPC probe returns `[]` |
| **G. Multiple similar products** | grouping + `ambiguous` | ✅(logic) | `analyzeMatchOutcome` ambiguous-path unit tests; duplicate-key regression covered by edge grouping |
| **H. Product with missing embedding** | row has `embedding NULL` | ✅ | RPC filters `embedding is not null` (verified live: probe returned `[]`); product still findable via manual search |
| **I. Product with missing price** | `selling_price` null/invalid | ✅ | `formatPrice` maps non-finite → `—` + warning (not a crash); DB CHECK forbids NULL (0002) |
| **J. Supabase failure** | RPC/REST error | ✅ | surfaced as specific error text via `toUserMessage` (tested pattern); retry UI shown |
| **K. AI API failure** | provider 4xx/5xx/429 | 🔧 | new `cohereHttpError` mapping: key rejection / rate-limit / HTTP status — real reason shown, never "No product found" |
| **L. Network failure** | offline | ✅ | `withTimeout` 20 s + `isNetworkError` → "No internet connection…" (client unit-covered) |
| **M. Cancelled image picker** | cancel in gallery | ✅ | `use-gallery-pick` stays on screen silently; busy flag reset on every path |
| **N. Invalid image** | non-JPEG/PNG, >5 MB, empty, deleted file | ✅ | pipeline tests: specific messages (`unsupported_format`, `file_too_large`, `file_not_found`, empty-file) |
| **O. Empty database** | zero embedded images | ✅ | RPC `[]` → edge `no-match` → result screen "Product not found" + manual search fallback (unit-covered decision) |

## 4. End-to-end regression checklist (run after deploy + secret + backfill)

1. `npm run db:deploy` → migrations reconciled, both functions deployed, probe shows `HTTP 400/401 = live`.
2. Dashboard → SQL Editor → run `supabase/fix-visual-search-schema.sql` (idempotent) → run its
   verification SELECT (expect `products_is_active=t, images_image_type=t, enum_boots=t`).
3. Admin → Edit existing product → re-save (triggers `embed-product-image`) → success toast.
4. Coverage SQL: `embedded = images`, `wrong_dim = 0`.
5. App (signed-out): Find Product → capture the embedded product → expect **Product Found** card
   with DB price and `% match`.
6. App: photograph an unrelated object → expect **Product not recognized** + manual search.
7. Airplane-mode capture → expect "No internet connection…" (never a hang — 20 s cap).
8. Cancel gallery picker → no navigation, screen stays interactive.

## 5. Known limitations

- End-to-end image-match accuracy (A–D) needs real store photos to tune thresholds
  (secrets are documented in `supabase/functions/README.md`).
- If a key format other than `sb_publishable_…`/legacy anon JWT is configured, the edge gate's
  exact-match against `SUPABASE_ANON_KEY` should be revisited.
