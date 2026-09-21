# Price Display Fixes

## Summary

Audited the full Product → Price flow from the Supabase `products` table to
the result screen UI. The price column (`selling_price`) is correct, the DB
constraint enforces `NOT NULL` and `>= 0`, and `formatPrice()` handles
non-finite values. Two issues were found and fixed:

1. Supabase may return `numeric` columns as strings in some configurations —
   `formatPrice` previously returned '—' instead of formatting the value.
2. Discount calculations (`hasDiscount`, `savePercent`) used direct comparison
   which would produce wrong results with string prices.

## Price Flow Verified

```
products.selling_price (numeric(10,2) NOT NULL)
  → fetchProducts() .select('*') → ProductWithImages.selling_price
  → formatPriceWithUnit(selling_price, unit) → formatPrice(selling_price)
  → PriceText component renders the formatted string
```

### Every layer checked:

| Layer | Column/Field | Type | Status |
|---|---|---|---|
| SQL migration | `selling_price numeric(10,2) not null` | numeric | ✅ |
| SQL constraint | `check (selling_price >= 0 and selling_price <= mrp)` | constraint | ✅ |
| TypeScript type | `selling_price: number` | number | ✅ |
| Supabase query | `.select('*, product_images(id, image_url)')` | wildcard | ✅ |
| RLS policy | `"catalog is readable by everyone" to anon, authenticated` | public read | ✅ |
| Format function | `formatPrice(value)` | handles string/number/null | ✅ FIXED |
| Discount calc | `hasDiscount(product)` | handles string/number | ✅ FIXED |
| UI rendering | `PriceText` + `formatPriceWithUnit()` | formatted string | ✅ |

## Issues Found and Fixed

### 1. String prices not formatted (MEDIUM)

**Before:** `formatPrice` checked `Number.isFinite(value)` which returns `false`
for strings. A string price like `"28.00"` would show '—' instead of '₹28'.

**After:** Added `Number()` coercion:
```typescript
const num = typeof value === 'string' ? Number(value) : value;
```
Strings like `"28.00"` are now correctly formatted as '₹28'.

### 2. Dev logging for non-numeric prices (LOW)

**Before:** Non-finite values silently returned '—' with no diagnostic trace.

**After:** `console.warn` in development when price is a string, null, or
undefined:
```
[formatPrice] Non-numeric price value: "abc" — check products.selling_price column
```
Logs the actual bad value so developers can identify data issues immediately.

### 3. Discount calculations wrong with string prices (MEDIUM)

**Before:** `hasDiscount` and `savePercent` used `product.mrp !== product.selling_price`
which does string comparison for strings — `"28" !== "28"` is `false` (correct)
but `"9" > "24"` is `true` (alphabetical, wrong).

**After:** Added `toNum()` helper that coerces strings to numbers before
comparison. Discount calculations now work correctly regardless of value type.

## Edge Cases Verified

| Scenario | `formatPrice` | `hasDiscount` | Result Screen |
|---|---|---|---|
| `selling_price = 28` (number) | '₹28' | works | ✅ Shows ₹28 |
| `selling_price = "28"` (string) | '₹28' (coerced) | works (coerced) | ✅ Shows ₹28 |
| `selling_price = 0` | '₹0' | false (no discount) | ✅ Shows ₹0 |
| `selling_price = null` | '—' + dev warning | false | ✅ Shows '—' |
| `selling_price = undefined` | '—' + dev warning | false | ✅ Shows '—' |
| `selling_price = "abc"` | '—' + dev warning | false | ✅ Shows '—' |
| `selling_price = NaN` | '—' | false | ✅ Shows '—' |
| `selling_price = Infinity` | '—' | false | ✅ Shows '—' |
| Product deleted from DB | N/A (skipped) | N/A | ✅ Not shown |
| Product deactivated | N/A (filtered) | N/A | ✅ Not shown |
| Similar products have prices | Each formatted independently | Each checked | ✅ All show prices |

## Files Changed

| File | Change |
|---|---|
| `src/lib/format.ts` | Add string-to-number coercion, dev logging for non-numeric values |
| `src/app/find-product/result.tsx` | Add `toNum()` helper for `hasDiscount`/`savePercent` string safety |

## Verification

- `npx tsc --noEmit` — 0 errors
- `npm run lint` — 0 problems
- `node tests/search-embedding.test.mjs` — 28 passed
- `node tests/embedding-generation.test.mjs` — 14 passed
- `node tests/image-pipeline.test.mjs` — 27 passed
