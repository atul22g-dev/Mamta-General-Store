# Search Embedding Pipeline Fixes

## Summary

The Find Product search embedding pipeline lacked validation of the AI-generated
embedding vector before sending it to the pgvector RPC. A malformed vector
(wrong dimensions, NaN values, non-array) would cause silent failures or
incorrect similarity results. Additionally, the error message incorrectly
mentioned WebP support.

## Pipeline Traced

```
Captured Image → data URI → visual-match edge function → MobileCLIP-S0 → embedding vector → visual_search_matches RPC → products
```

### Step-by-step:

1. **App** (`client.ts`): validates data URI format → invokes `visual-match` edge function
2. **Edge Function** (`visual-match/index.ts`): validates MIME/size → calls `provider.embedImages([image])`
3. **Embedding Provider** (`_shared/embedding.ts`): creates MobileCLIP provider → calls `embedWithMobileClip()`
4. **Embedding Engine** (`_shared/embedding-engine.ts`): decodes image → resizes to 224×224 → CLIP preprocess → ONNX inference → L2-normalize → returns 512-dim float32 vector
5. **Edge Function**: validates embedding vector → calls `supabase.rpc('visual_search_matches', { query_embedding: vector })`
6. **RPC** (`visual_search_matches`): pgvector cosine similarity search → returns product IDs + similarity scores

### Model Compatibility

Both product indexing (admin) and customer search use the **same model**:
- **Model:** MobileCLIP-S0 (Apple, MIT license)
- **Dimensions:** 512
- **Output:** L2-normalized float32 vector
- **Inference:** Supabase Edge Functions (Deno, ONNX runtime)

No compatibility risk — same pipeline for both directions.

## Issues Found and Fixed

### 1. No embedding vector validation before RPC call (HIGH)

**Before:** The edge function extracted `vectors[0]` and passed it directly to
the RPC without checking if it was an array, had the correct dimension, or
contained valid numbers. A corrupted embedding could produce garbage similarity
scores or crash the RPC.

**After:** Added `validateEmbeddingVector()` that checks:
- Vector exists and is an array
- Vector length matches `EMBEDDING_DIMENSIONS` (512)
- Every element is a finite number (no NaN, Infinity, null, undefined)
- Returns specific error message with the index of the first invalid value

### 2. No check for empty vectors array (HIGH)

**Before:** If `provider.embedImages()` returned `{ vectors: [] }` (e.g. input
validation failure), `vectors[0]` would be `undefined`, passed to the RPC as
null, and cause a Postgres error.

**After:** Explicit check: `if (!vectors || !Array.isArray(vectors) || vectors.length === 0)`
returns a clear error before attempting to access `vectors[0]`.

### 3. Error message incorrectly mentioned WebP (LOW)

**Before:** `"A data-URI product photo is required (png/jpeg/webp)."` — but
WebP is NOT supported by MobileCLIP-S0 (no decoder in Deno).

**After:** `"A data-URI product photo is required (png/jpeg)."`

### 4. No reusable validation function (LOW)

**Before:** Validation logic was inline in the edge function, not testable
independently.

**After:** Extracted `validateEmbeddingVector()` to `_shared/embedding.ts` —
a reusable, testable function that can be used by both `visual-match` and
`embed-product-image` edge functions.

## Validation Added

```typescript
// After embedding generation:
const queryVector = vectors[0];

const vectorError = validateEmbeddingVector(queryVector);
if (vectorError) {
  return json({ error: vectorError }, 500);
}
```

### What gets validated:

| Check | Failure Message |
|---|---|
| Not an array | "Embedding vector is not an array." |
| Wrong length | "Embedding dimension mismatch: got X, expected 512." |
| NaN/Infinity/null | "Embedding contains invalid value at index N: V." |

## Tests Added

`tests/search-embedding.test.mjs` — 28 tests covering:

- Valid vectors: 512-dim, all zeros, all ones, negative, mixed
- Invalid types: null, undefined, string, number, object
- Wrong dimensions: empty, 100, 511, 513
- Invalid values: NaN, Infinity, -Infinity, null, undefined, string, boolean
- Multiple invalid: stops at first occurrence
- Custom dimension: 256-dim validation
- Edge cases: sparse vectors, array holes

## Verification

- `npx tsc --noEmit` — 0 errors
- `npm run lint` — 0 problems
- `node tests/search-embedding.test.mjs` — 28 passed, 0 failed
- `node tests/embedding-generation.test.mjs` — 14 passed, 0 failed
- `node tests/image-pipeline.test.mjs` — 27 passed, 0 failed
