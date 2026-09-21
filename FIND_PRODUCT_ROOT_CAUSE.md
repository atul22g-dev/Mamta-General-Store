# FIND PRODUCT ROOT CAUSE (Phase 2)

**Method:** every check below was executed against the CURRENT implementation —
`npx tsc --noEmit`, `npm run lint`, all four node test suites, and live HTTP/REST probes of the
actual Supabase project backing this repo (key from `.env`). No code was modified.

## Verification of the repo itself (all pass)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | ✅ 0 errors |
| ESLint | `npm run lint` | ✅ 0 problems |
| visual-match tests | `node tests/visual-match.test.mjs` | ✅ 18/18 |
| image-pipeline tests | `node tests/image-pipeline.test.mjs` | ✅ 23/23 |
| search-embedding tests | `node tests/search-embedding.test.mjs` | ✅ 28/28 |
| embedding-generation tests | `node tests/embedding-generation.test.mjs` | ✅ 14/14 |

The repository source is coherent. **The feature is broken at deployment/database level**, not at the
level of app logic. There is exactly one implementation and one call path (verified in AUDIT_REPORT.md §ACTUAL CALL CHAIN) — no duplicate/legacy matcher exists in `src/`.

## Stage-by-stage trace (INPUT → OUTPUT → ERROR → EXPECTED → ACTUAL)

| # | Stage | Input | Output | Error | Expected | Actual (live) |
|---|---|---|---|---|---|---|
| 1 | Image selection | shutter tap / gallery pick | local file URI | none | URI valid | ✅ works (permission ladder + cancel handled) |
| 2 | Image URI | file:// URI | `scanSession.setShot` | none | stored in memory | ✅ works |
| 3 | Image file | file on disk | bytes via expo-file-system | handled (`file_not_found`, empty) | bytes read | ✅ works |
| 4 | Preprocessing | bytes + ext | `data:image/(jpeg\|png);base64,…` | handled (`file_too_large`, `unsupported_format`) | valid data URI ≤7 MB | ✅ works (`validateAndConvert` + `bytesToBase64`, chunked) |
| 5 | Embedding request | data URI | `supabase.functions.invoke('visual-match')` | — | 200 with match JSON | ❌ **HTTP 500** |
| 6 | Embedding response | edge JSON | vectors | — | 512-dim finite array | ❌ **`{"error":"COHERE_API_KEY is not configured for edge functions."}`** |
| 7 | Embedding validation | vector | pass/fail message | — | dimension+finite check | unreachable in production (deployed build has no validation; repo build OK) |
| 8 | RPC request | validated vector | PostgREST call | — | rows | blocked upstream (5) |
| 9 | RPC response | — | — | — | image-level candidates | **RPC itself verified working** (`[]` for unrelated 512-dim test vector, no error) |
| 10 | Matching product IDs | rows | grouped product results | — | top-N products | blocked upstream |
| 11 | Product query | product IDs | `products.select('*, product_images(…)').in(id).eq('is_active', true)` | — | product rows | ❌ **PostgREST 42703: `column products.is_active does not exist`** (migration 0009 missing on live DB) |
| 12 | Product price | product row | selling_price → formatted ₹ | — | price | blocked upstream (11) |
| 13 | UI result | outcome | result screen | — | identified/ambiguous/no-match | user sees "Couldn't complete the match: COHERE_API_KEY is not configured…" (and after a redeploy would see the 42703 failure instead) |

## THE FIRST ACTUAL FAILURE

**Stage 5/6 — the deployed `visual-match` Edge Function is an OLD Cohere-era build whose
`COHERE_API_KEY` secret was never configured.** Proven live:

```
POST {project}/functions/v1/visual-match   (valid data-URI image)
→ HTTP 500 {"error":"COHERE_API_KEY is not configured for edge functions."}
```

- The error message exists only in commit `ce5070d`–`8c55a16` code; the repo has since been
  rewritten to the free MobileCLIP-S0/ONNX provider (`bb88f16`…`6b7b0cb`).
- The 400 message from the live function (`"A data-URI product photo is required."`) also matches
  only the OLD code — the current code says `"(png/jpeg)"`. Confirms a stale deployment.
- Additionally, `sb_publishable_…` keys make supabase-js **omit** the `Authorization` header for
  functions.invoke when the user has no session → the current repo build's auth gate
  (`auth.getUser()` without custom-header flag) would **401 anonymous shop-floor scans** —
  so even a redeploy of the current code as-is breaks the documented anonymous flow.
  (auth-js source verified: `_getUser` requires `session.access_token` OR `hasCustomAuthorizationHeader`.)

## Second failure (masked by the first)

**Live DB is missing migration 0009 (and 0010 enums):**

```
GET /rest/v1/products?select=is_active
→ {"code":"42703","message":"column products.is_active does not exist"}
GET /rest/v1/product_images?select=image_type
→ {"code":"42703","message":"column product_images.image_type does not exist"}
```

Consequences even after fixing the edge function:
1. App `fetchProducts` calls `.eq('is_active', true)` → 42703 → "Could not load product details."
2. Edge `embed-product-image` inserts nothing about image_type (column has a default), but the
   missing enum values (0010) break the admin form (`boots/toys/cloths` categories, `pair` unit).
3. The single product image in the DB has **embedding NULL** → zero visual-search coverage even
   with a working pipeline.

## Why this is NOT those (checked and ruled out)

- ❌ Not a duplicate/legacy matcher in the app — only `src/lib/visual-match/*` exists.
- ❌ Not an RPC/TS contract mismatch — Args/return types match the SQL exactly.
- ❌ Not a vector-dimension mismatch — `vector(512)` end-to-end.
- ❌ Not a price bug — prices only ever come from `products` (by construction).
- ❌ Not image-pipeline bugs — 23/23 pipeline tests pass; MIME/size/cancel handled.
- ❌ Not swallowed errors — `matchProductFromPhoto` surfaces real edge-function error strings via
  `toUserMessage` (the live 500's message is exactly what the user sees).

## Fix plan (Phases 3–9)

1. **DB:** apply migrations 0009 + 0010 (columns + enums) via a non-destructive new migration only if
   needed — 0009/0010 already exist and are idempotent-safe; `setup-all-in-one.sql` matches them.
   Provide `DATABASE_FIX.md` + a verification SQL the user runs (`npm run db:deploy`).
2. **Backend:** make the edge function's embedding provider work WITHOUT unproven external assets:
   restore the Cohere v4.0 image-embedding path (the provider this project's pipeline was originally
   built and deployed for — commit `ce5070d` code) as the default with `COHERE_API_KEY`, OR keep
   MobileCLIP only as an explicit opt-in (`EMBEDDING_PROVIDER=mobileclip-s0`) once `MODEL_URL` is
   verifiably configured. → No hard dependency on an ONNX model file that doesn't exist anywhere.
3. **Auth:** fix the anonymous-call contract: pass the publishable key explicitly as the
   Authorization header for the edge invoke (supabase-js option), or relax the gate to accept
   `apikey`-authenticated calls, so anon shop-floor scans work exactly as documented.
4. **Indexing:** after DB columns exist, backfill `product_images.embedding` for existing rows
   (`embed-product-image` batch), then verify RPC returns candidates.
5. **Tests:** end-to-end probe sequence documented in FIND_PRODUCT_TEST_REPORT.md.
