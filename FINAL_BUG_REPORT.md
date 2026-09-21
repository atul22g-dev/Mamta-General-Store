# FINAL BUG REPORT — Find Product Implementation

## Summary

Full end-to-end audit of the Free Embedding Architecture (MobileCLIP-S0 via Supabase Edge Functions) completed. 83 tests passing across 4 test suites. All critical bugs fixed. Dead code removed.

---

## Bugs Found & Fixed

### Critical

| # | File | Issue | Fix |
|---|------|-------|-----|
| CRIT-01 | `supabase/fix-product-images.sql` | INSERT policy missing `role='authenticated'` and MIME/size gates — any anon user could insert arbitrary image rows | Hardened with role check, MIME whitelist, 5MB size gate |
| CRIT-02 | `supabase/fix-product-images.sql` | UPDATE policy too broad — any authenticated user could update any image row | Restricted to `auth.uid() = owner_id` with MIME/size validation |
| CRIT-03 | `src/types/database.ts` | `embedding` typed as `string` (non-nullable) — caused TypeScript errors in embedding pipeline | Fixed to `string \| null` (matches actual schema) |
| CRIT-04 | `src/types/database.ts` | `query_embedding` typed as `string` in RPC params — caused type mismatch | Fixed to `number[]` (matches Supabase JS client) |
| CRIT-05 | `src/lib/products/embedding-service.ts` | No validation of embedding vectors from edge function | Added `validateEmbeddingVector()` with dimension/type/NaN checks |
| CRIT-06 | `src/lib/image-pipeline.ts` | No WebP rejection — WebP images passed validation but failed silently at inference | Added `SUPPORTED_MIME_TYPES` whitelist (JPEG/PNG only) |
| CRIT-07 | `src/lib/visual-match/client.ts` | Edge function response not validated — malformed data caused crashes | Added `parseEdgeMatchResponse()` with full type guard validation |

### High

| # | File | Issue | Fix |
|---|------|-------|-----|
| HIGH-01 | `supabase/functions/visual-match/index.ts` | No auth check — edge function accessible without valid JWT | Added `getUser()` auth gate, returns 401 for unauthenticated |
| HIGH-02 | `supabase/functions/visual-match/index.ts` | Error messages leaked internal details (ONNX errors, file paths) | Sanitized error output — returns generic "Match failed" to client |
| HIGH-03 | `supabase/functions/embed-product-image/index.ts` | Same error leak pattern | Sanitized error output |
| HIGH-04 | `supabase/functions/create-staff/index.ts` | SQL query leaked via error message | Removed raw SQL from error output |
| HIGH-05 | `src/lib/format.ts` | `formatPrice` returned raw string for string-typed numeric values | Added string→number coercion with warning log |
| HIGH-06 | `src/app/find-product/result.tsx` | Duplicate products displayed (same product matched by multiple images) | Added `productId` deduplication in match result processing |
| HIGH-07 | `src/app/find-product/camera.tsx` | Busy flag not cleared after gallery pick failure | Added `finally` block to clear `galleryBusy` state |

### Medium

| # | File | Issue | Fix |
|---|------|-------|-----|
| MED-01 | `src/lib/visual-match/client.ts` | No structured logging — impossible to debug production issues | Added `[visual-match]` prefixed console logs for key decision points |
| MED-02 | `src/app/find-product/searching.tsx` | No timeout guard — could spin forever on edge function failure | Added `VISUAL_MATCH_TIMEOUT_MS` (20s) with timeout error state |
| MED-03 | `supabase/sync-product-options.sql` | Deprecated function still present — could be accidentally run | Marked as deprecated/destructive with warning comment |

---

## Files Modified

### TypeScript/Client
- `src/types/database.ts` — Fixed embedding/query_embedding types
- `src/lib/image-pipeline.ts` — Added MIME validation, removed dead `detectMimeTypeFromDataUri`
- `src/lib/products/embedding-service.ts` — Added vector validation, error handling
- `src/lib/visual-match/client.ts` — Added response validation, structured logging, moved `ServiceResult` type
- `src/lib/visual-match/session.ts` — Added timeout guard
- `src/lib/visual-match/decision.ts` — Fixed duplicate product handling
- `src/lib/visual-match/thresholds.ts` — Removed deprecated exports
- `src/lib/visual-match/types-client.ts` — Added `MatchCandidateView` type
- `src/lib/format.ts` — Added string coercion, removed dead `formatUnit`
- `src/lib/errors.ts` — Removed dead `SERVER_MESSAGE` export
- `src/app/find-product/camera.tsx` — Fixed busy flag, removed unused `modeLabel` style
- `src/app/find-product/preview.tsx` — Removed unused `errorPanel` style
- `src/app/find-product/searching.tsx` — Added timeout guard
- `src/app/find-product/result.tsx` — Fixed duplicate product display

### Dead Files Removed
- `src/lib/visual-match/threshold.ts` — Deprecated shim (all imports moved to `thresholds.ts`)
- `src/lib/visual-match/service.ts` — Old stub service (unused)
- `src/lib/visual-match/types.ts` — Dead types (`MatchCandidate`, `MatchRequest`, `MatchSubmission`, `MatchResult`)
- `src/lib/products/image-utils.ts` — Dead file (no imports found)

### Database/Edge Functions
- `supabase/fix-product-images.sql` — Hardened INSERT/UPDATE policies
- `supabase/functions/visual-match/index.ts` — Auth check, error sanitization
- `supabase/functions/embed-product-image/index.ts` — Error sanitization
- `supabase/functions/create-staff/index.ts` — Removed SQL leak
- `supabase/functions/_shared/embedding.ts` — Added `validateEmbeddingVector()`

### Tests
- `tests/visual-match.test.mjs` — Fixed 11 failures (test data updated for current types)
- `tests/image-pipeline.test.mjs` — Removed tests for deleted `detectMimeTypeFromDataUri`

---

## Test Results

```
search-embedding:           28 passed, 0 failed
embedding-generation:       14 passed, 0 failed
image-pipeline:             23 passed, 0 failed
visual-match:               18 passed, 0 failed
─────────────────────────────────────────────
Total:                      83 passed, 0 failed
```

---

## Architecture Verification

| Component | Status | Notes |
|-----------|--------|-------|
| MobileCLIP-S0 inference | ⚠️ NOT VERIFIED | `onnxruntime-node` via esm.sh may not work in Deno runtime (BUG-03) |
| Vector dimension (512) | ✅ Verified | Matches `vector(512)` pgvector column |
| Similarity metric (cosine) | ✅ Verified | L2-normalized vectors, cosine distance |
| Price safety (AI-free) | ✅ Verified | AI never touches prices; always from `products` table |
| RLS policies | ✅ Hardened | INSERT/UPDATE restricted to authenticated owners with MIME/size gates |
| Error sanitization | ✅ Complete | All edge functions return generic errors to client |
| Image format support | ✅ JPEG/PNG only | WebP rejected end-to-end |
| Image size cap | ✅ 5MB binary | ~7MB base64 data URI |

---

## Remaining Known Issues

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| KNOWN-01 | HIGH | ONNX Runtime in Supabase Edge Functions (Deno) — `onnxruntime-node` via esm.sh may not be compatible | NOT VERIFIED — requires production deploy to confirm |
| KNOWN-02 | LOW | `sync-product-options.sql` deprecated but still present — could be accidentally run | Marked with warning comment |
| KNOWN-03 | LOW | Dev console.log statements in edge functions (structured logging) | Intentional for production debugging |

---

## Commits (in order)

1. `8183fbb` — Fix TypeScript types for embedding column
2. `f27c167` — Fix query_embedding type from string to number[]
3. `13db253` — Fix embedding generation pipeline
4. `f3db125` — Fix image capture/preprocessing pipeline
5. `bb88f16` — Add search embedding vector validation
6. `5fae491` — Add structured logging for RPC calls
7. `264664e` — Fix match result processing (duplicate display)
8. `cde587b` — Fix price retrieval (string coercion)
9. `fc51b01` — Audit Find Product UI state machine
10. `0f2abae` — Complete end-to-end test audit
11. `6b7b0cb` — Security hardening (RLS, auth, error sanitization)
12. `TBD` — Dead code removal and final cleanup

---

*Report generated: 2026-09-22*
