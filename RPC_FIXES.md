# RPC Fixes

## Summary

Audited the application call to Supabase `visual_search_matches` RPC against
the SQL function definition. The parameter names, types, and return structure
already match. No functional fix was needed — the RPC call is correct.

The only change made was adding structured development logging to the edge
function for better observability.

## Pipeline Traced

```
Edge Function → supabase.rpc('visual_search_matches') → PostgreSQL function → rows
```

## Audit Results

### SQL Function Signature (migration 0009)

```sql
create or replace function public.visual_search_matches(
  query_embedding vector(512),
  match_threshold double precision default 0.82,
  match_count integer default 5
)
returns table (
  product_id uuid,
  image_id uuid,
  similarity double precision
)
```

### Edge Function Call

```typescript
const { data, error } = await supabase.rpc('visual_search_matches', {
  query_embedding: queryVector,        // number[] (512-dim)
  match_threshold: SIMILAR_PRODUCT_THRESHOLD, // 0.75
  match_count: EDGE_CANDIDATE_LIMIT,   // 20
});

const rows = (data ?? []) as { product_id: string; image_id: string; similarity: number }[];
```

### Comparison

| Aspect | SQL | TypeScript | Match |
|---|---|---|---|
| Function name | `visual_search_matches` | `'visual_search_matches'` | ✅ |
| Param 1 name | `query_embedding` | `query_embedding` | ✅ |
| Param 1 type | `vector(512)` | `number[]` (512-dim) | ✅ |
| Param 2 name | `match_threshold` | `match_threshold` | ✅ |
| Param 2 type | `double precision` | `0.75` (number) | ✅ |
| Param 3 name | `match_count` | `match_count` | ✅ |
| Param 3 type | `integer` | `20` (number) | ✅ |
| Return col 1 | `product_id uuid` | `product_id: string` | ✅ |
| Return col 2 | `image_id uuid` | `image_id: string` | ✅ |
| Return col 3 | `similarity double precision` | `similarity: number` | ✅ |

### TypeScript Types (database.ts)

```typescript
Functions: {
  visual_search_matches: {
    Args: {
      query_embedding: number[];
      match_threshold?: number;
      match_count?: number;
    };
    Returns: {
      product_id: string;
      image_id: string;
      similarity: number;
    }[];
  };
};
```

TypeScript types match the SQL function definition.

## Changes Made

### 1. Added structured logging to edge function

Added `[visual-match]` prefixed log lines at key pipeline stages:
- Input size (KB)
- Embedding generation result (model, dimensions, vector length, time)
- RPC result (candidate count, total time)
- Final decision (status, confidence, product count, main match ID)
- Error cases (embedding failure, RPC error, unhandled error)

### 2. No functional changes

The RPC call, parameter names, types, and return structure were already correct.

## Error Handling (already present)

| Error | Response |
|---|---|
| Invalid input (no image, wrong MIME) | 400 + message |
| Image too large (>7MB) | 413 + message |
| Embedding returns no vectors | 500 + message |
| Vector validation fails | 500 + specific error |
| RPC returns error | 500 + `error.message` |
| Unhandled exception | 500 + message |

All errors are returned as JSON with appropriate HTTP status codes. No errors
are silently swallowed.

## Verification

- `npx tsc --noEmit` — 0 errors
- `npm run lint` — 0 problems
- `node tests/search-embedding.test.mjs` — 28 passed
- `node tests/embedding-generation.test.mjs` — 14 passed
- `node tests/image-pipeline.test.mjs` — 27 passed
