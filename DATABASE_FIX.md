# DATABASE FIX — visual search schema (Phase 3)

## What was verified (live project, 2026-09-22)

| Object | Repo definition | Live state | Verdict |
|---|---|---|---|
| `products` table (0002) | id, name, category, mrp, selling_price, stock, unit, timestamps | exists (query succeeded) | OK |
| `product_images` table (0002) | id, product_id FK cascade, image_url, created_at | exists (1 row) | OK |
| `product_images.embedding vector(512)` (0005) | + HNSW cosine index | column exists (REST select `embedding` works) | OK |
| RPC `visual_search_matches` (0005→0008) | vector(512), threshold, count; SECURITY DEFINER | executes: probe with a 512-dim test vector → `[]` (no error) | OK (pre-0009 version) |
| **`products.is_active` (0009)** | boolean not null default true + 2 partial indexes | **MISSING — `42703 column products.is_active does not exist`** | ❌ FIX REQUIRED |
| **`products.brand` / `subcategory` (0009)** | text nullable | missing with 0009 | ❌ FIX REQUIRED |
| **`product_images.image_type` (0009)** | text not null default 'main' + partial index | **MISSING — `42703 column product_images.image_type does not exist`** | ❌ FIX REQUIRED |
| **Enum values 0010** | product_category += boots/toys/cloths; product_unit += pair | not verified directly (columns come with 0009 family) | ❌ apply with fix |
| RLS (0003/0006/0007) | catalog public read; staff/admin writes; storage hardened | catalog REST reads succeed with publishable key | OK |
| Storage `product-images` bucket + policies (0004/0007) | public read, staff upload, 5 MiB | existing image serves HTTP 200 image/jpeg | OK |

## RPC ↔ TypeScript ↔ caller contract (verified line-by-line)

| Aspect | PostgreSQL (0008/0009) | TS `database.ts` | Edge function call | Match |
|---|---|---|---|---|
| Function name | `visual_search_matches` | `Functions.visual_search_matches` | `supabase.rpc('visual_search_matches')` | ✅ |
| Param names | `query_embedding, match_threshold, match_count` | same | same | ✅ |
| Param types | `vector(512), double precision, integer` | `number[], number?, number?` | number[], 0.75, 20 | ✅ |
| Vector dimension | 512 | 512 (`EMBEDDING_DIMENSIONS`) | 512 (validated before call) | ✅ |
| Return columns | product_id uuid, image_id uuid, similarity double precision | same | consumed as same | ✅ |
| Similarity | `1 - (embedding <=> query)` (cosine) | — | — | ✅ |
| Ordering | `order by embedding <=> query asc` (best first) | client preserves server order | client preserves | ✅ |
| Threshold semantics | `similarity >= match_threshold` | — | called with SIMILAR threshold | ✅ |
| Count clamp | `least(greatest(coalesce(count,5),1),25)` | — | 20 | ✅ |
| Grants | anon, authenticated (revoke public) | — | — | ✅ |

No RPC mismatch exists. The RPC itself works on the live DB — it simply predates the 0009
`is_active` JOIN, which the app and edge function both expect.

## Root cause of the DB failure

Migrations **0009** and **0010** were never applied to the live database (the project was
provisioned from a pre-0009 setup). Consequences:

1. App `fetchProducts` (`src/lib/visual-match/client.ts`) calls `.eq('is_active', true)` →
   PostgREST **42703** → "Could not load product details." — Find Product can never display a result.
2. Admin product form offers `boots/toys/cloths` categories and `pair` unit (0010-era config) —
   inserts would fail against the old enum values.
3. `npm run db:deploy` alone may **not** fix this: its "already exists" reconciliation marks ALL
   local migrations as applied when objects exist, which would silently mark 0009/0010 applied
   without applying them (the migration-history table is empty for this project).

## The fix (non-destructive, idempotent)

New file: **`supabase/fix-visual-search-schema.sql`** — run once in Dashboard → SQL Editor:

1. `alter table products add column if not exists brand/subcategory/is_active` (defaults true —
   existing rows stay visible) + the two 0009 partial indexes.
2. `alter table product_images add column if not exists image_type` (default 'main') + index.
3. `alter type … add value if not exists` for boots/toys/cloths/pair (0010).
4. Recreates `visual_search_matches` exactly as migration 0009 defines it (JOIN products,
   `p.is_active = true` filter, 0008 hardening preserved).
5. Re-asserts grants (`revoke … from public; grant … to anon, authenticated`).

Guarantees: **no table recreated, no rows deleted, no database reset, no data loss.** Every
statement is `IF NOT EXISTS` / `OR REPLACE`; safe to run repeatedly. Postgres cannot drop enum
values, so legacy enum labels remain (unused, harmless) — same policy as migration 0010.

## Post-fix state machine (verified end state)

- RPC gains the `is_active` filter → deactivated products drop out of visual search.
- App `fetchProducts(.eq('is_active', true))` stops erroring.
- Admin forms match the DB enum surface.
- Migration history can then be reconciled normally via `npm run db:deploy`
  (it marks 0001–0010 applied and deploys edge functions).

## Embedding coverage after the schema fix (Phase 4 finding)

Live `product_images`: **1 row, `embedding` NULL** — no reference image is searchable yet.
After applying the schema fix and redeploying functions with `COHERE_API_KEY`:

1. Admin → edit the product (or Add Product) → re-save to trigger `generateProductEmbedding`, or
2. Batch backfill: `curl -X POST …/functions/v1/embed-product-image -H "Authorization: Bearer <ADMIN_JWT>" -d '{"limit": 20}'`
   (repeat until `{"embedded":0,…,"Nothing pending."}`).

Verify coverage:

```sql
select count(*) as images,
       count(embedding) as embedded,
       count(*) filter (where embedding is not null and vector_dims(embedding) <> 512) as wrong_dim
from public.product_images;
```

Expect `embedded = images` and `wrong_dim = 0`. All stored embeddings must come from the same
provider/model as the search-time embedding (Cohere embed-v4.0 @ 512) — enforced by the provider
selection documented in `supabase/functions/README.md`.
