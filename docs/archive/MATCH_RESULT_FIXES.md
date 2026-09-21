# Match Result Processing Fixes

## Summary

Audited the full product match result pipeline from edge function response to
UI display. The pipeline was fundamentally sound — product IDs are correctly
mapped to DB rows, prices come from the `products` table, similarity scores are
preserved, and deleted/deactivated products are handled. Three issues were found
and fixed.

## Pipeline Traced

```
Edge function response
  → parseEdgeMatchResponse() (edge-contract.ts)
  → matchProductFromPhoto() (client.ts)
    → collect all product IDs
    → fetchProducts() → Supabase products table (live selling_price!)
    → build MatchCandidateView[] (product + similarity)
  → matchSession.setResult() (session.ts)
  → result.tsx → analyzeMatchOutcome() (decision.ts) → render
```

### Data flow for prices:

1. Edge function returns `product_id` + `best_similarity` (NO prices)
2. Client collects all product IDs from main_match, similar_products, all_candidates
3. Client queries `products` table: `.select('*, product_images(id, image_url)').in('id', productIds).eq('is_active', true)`
4. DB returns `selling_price`, `mrp`, `name`, `brand`, `unit`, etc.
5. Client joins edge results with DB products into `MatchCandidateView`
6. Result screen renders `product.selling_price` via `formatPrice()`

**Price never comes from the edge function or AI. Always from the DB.**

## Issues Found and Fixed

### 1. Duplicate product display when user selects a similar product (HIGH)

**Before:** When the user taps a similar product, it becomes the "main" product
at the top of the screen, but it ALSO remains in the similar products list
below. The same product appeared twice — once as the main card and once in the
similar list.

**After:** `similarProducts` now filters out the main product's ID:
```typescript
const similarProducts = (outcome?.similar_products ?? []).filter(
  (c) => c.product.id !== mainProduct?.product.id,
);
```

This ensures the selected product only appears once — as the main card.

### 2. Hardcoded similar products limit (LOW)

**Before:** `products.slice(0, 10)` hardcoded the limit to 10.

**After:** Uses `MAX_SIMILAR_PRODUCTS` from `thresholds.ts` (currently 10):
```typescript
import { MAX_SIMILAR_PRODUCTS } from '@/lib/visual-match/thresholds';
// ...
{products.slice(0, MAX_SIMILAR_PRODUCTS).map(...)}
```

Single source of truth — change the limit in one file.

### 3. No logging when products are missing from DB (LOW)

**Before:** If a product ID from the edge function wasn't found in the DB
(deleted/deactivated between RPC and fetch), it was silently dropped. No way
to diagnose in development.

**After:** Console warning lists missing product IDs:
```typescript
if (products.size < allProductIds.length) {
  const missing = allProductIds.filter((id) => !products.has(id));
  console.warn(`[visual-match] ${missing.length} product(s) not found in DB: ${missing.join(', ')}`);
}
```

## Verification: Edge Cases

| Scenario | Result |
|---|---|
| Product ID from RPC not in DB | Skipped, warning logged, status adjusted |
| Product deactivated between RPC and fetch | Skipped, `is_active` filter in both RPC and client |
| `selling_price` is null/undefined | `formatPrice()` returns '—' (non-finite guard) |
| `selling_price` is 0 | Shows '₹0' (valid free item) |
| Multiple similar products | All preserved, sorted by similarity, limited to MAX_SIMILAR_PRODUCTS |
| User selects a similar product | Shown as main card, excluded from similar list |
| No products match | Shows "Product not found" + Scan Again / Search Manually |
| Edge function returns empty results | `noMatch()` returned, shows "Product not found" |
| All products deleted from DB | Status re-derived to 'no-match', shows "Product not found" |

## Files Changed

| File | Change |
|---|---|
| `src/app/find-product/result.tsx` | Import `MAX_SIMILAR_PRODUCTS`; filter selected candidate from similar list; use constant for slice |
| `src/lib/visual-match/client.ts` | Add dev logging when products are missing from DB fetch |

## Verification

- `npx tsc --noEmit` — 0 errors
- `npm run lint` — 0 problems
- `node tests/search-embedding.test.mjs` — 28 passed
- `node tests/embedding-generation.test.mjs` — 14 passed
- `node tests/image-pipeline.test.mjs` — 27 passed
