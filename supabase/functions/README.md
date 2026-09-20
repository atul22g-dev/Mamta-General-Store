# Edge Functions — Visual Search Backend

All AI-provider code lives here, in Supabase Edge Functions (Deno).
**No AI API keys exist inside the Expo app** — the app only ever talks to
these functions with its publishable anon key.

## Functions

| Function | Purpose | Caller |
|---|---|---|
| `visual-match` | User photo → embedding → pgvector similarity → product candidates + confidence. **Never returns prices.** | App (anon OK) |
| `embed-product-image` | Backfills embeddings for product reference images. | Admin/staff only |

## One-time setup

```bash
supabase login
supabase link --project-ref YOUR-REF

# Secrets live in Supabase — never in the app or this repo
supabase secrets set COHERE_API_KEY=your-key
supabase secrets set MATCH_THRESHOLD=0.82
supabase secrets set MATCH_CANDIDATES=5

# Deploy
supabase functions deploy visual-match
supabase functions deploy embed-product-image
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically by the platform.

## Provider

**Mistral is NOT used in this project** — neither for embeddings nor for any
other AI operation. The sole AI provider is:

`_shared/embedding.ts` wraps **Cohere `embed-v4.0`** at **512 dimensions**
(`input_type: "image"`, data-URI inputs), verified to match the pgvector
column `vector(512)` exactly — a runtime guard in the same file fails
loudly if a response ever arrives with a different dimension (no silent
truncation/padding). To swap providers (OpenAI, self-hosted CLIP, …):

1. Implement `EmbeddingProvider` in `_shared/embedding.ts`.
2. Keep the output dimension equal to the pgvector column (`vector(512)`)
   and update `EMBEDDING_DIMENSIONS` + the column together.

If Mistral (or any other AI) is adopted later, it must follow the same
rule as Cohere: **edge-function secret only** (`supabase secrets set …`),
never an `EXPO_PUBLIC_` var, never inside the Expo bundle.
   or migrate the column + re-embed everything.
3. Redeploy both functions. The app and the RPC need no changes.

## Embedding reference images

After uploading product photos (admin app or SQL), backfill embeddings:

```bash
# One product
curl -X POST "https://YOUR-REF.supabase.co/functions/v1/embed-product-image" \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"product_id": "…uuid…"}'

# Batch (no product_id → oldest 20 without embeddings, repeat until "Nothing pending.")
curl -X POST "https://YOUR-REF.supabase.co/functions/v1/embed-product-image" \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"limit": 20}'
```

## Threshold tuning

- `MATCH_THRESHOLD` (default **0.82** cosine similarity) decides
  `identified` vs `uncertain`.
- Raise it (0.86+) when false positives are costly; lower it (0.75–0.8)
  if valid matches are being rejected. The app displays the value the
  function used — tune with real store photos.

## Price invariant

The matching pipeline stops at **product IDs + similarity**. The app then
reads `selling_price` from the `products` table at display time, so the
price shown is always the current database value — the AI cannot invent,
store, or influence it.
