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

# The embedding provider secret (see “Provider” below).
# The DEFAULT provider (MobileCLIP-S0, free, self-hosted in the function)
# needs NO secret at all. Only set COHERE_API_KEY if you switch to Cohere:
# supabase secrets set COHERE_API_KEY=your-key
# Optional model override for the default free path:
# supabase secrets set MOBILECLIP_MODEL_URL=<public-url-of-512dim-vision.onnx>
# Optional tuning (defaults shown):
# supabase secrets set MAIN_MATCH_THRESHOLD=0.90
# supabase secrets set SIMILAR_PRODUCT_THRESHOLD=0.75
# supabase secrets set AMBIGUOUS_MARGIN=0.03
# supabase secrets set EDGE_CANDIDATE_LIMIT=20

# Deploy
supabase functions deploy visual-match
supabase functions deploy embed-product-image
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically by the platform.

## Provider

**Mistral is NOT used in this project** — neither for embeddings nor for any
other AI operation. The provider is selected by the `EMBEDDING_PROVIDER`
edge secret:

1. **MobileCLIP-S0 (DEFAULT, free)** — `_shared/embedding-engine.ts` runs
   the quantized MobileCLIP-S0 vision tower (`Xenova/mobileclip_s0` on the
   HF Hub, 11.8 MB) **inside the edge function** via `onnxruntime-web`
   (WASM from esm.sh). No API key, no native addons. Verified live
   end-to-end (2026-09-22): ~1 s inference per image, 512-dim output
   matching the pgvector column `vector(512)`. Requires no secrets.

2. **Cohere `embed-v4.0` (opt-in)** — set `EMBEDDING_PROVIDER=cohere`
   and `COHERE_API_KEY=<key>`; `_shared/embedding.ts` selects it.
   Both providers output 512-dim L2-normalized vectors, but they are
   **different models**: embeddings are not comparable across providers.
   Never mix: after switching providers, clear and re-embed all reference
   images before searching.

To swap providers (OpenAI, self-hosted CLIP, …):

1. Implement `EmbeddingProvider` in `_shared/embedding.ts`.
2. Keep the output dimension equal to the pgvector column (`vector(512)`)
   and update `EMBEDDING_DIMENSIONS` + the column together.
   (Platform notes: onnxruntime-node is a native addon and cannot run on
   Supabase Edge; transformers.js exceeds the deploy-time bundler — use
   `onnxruntime-web` from esm.sh + a plain ONNX from the HF Hub, as the
   default engine does.)
3. **Clear and regenerate every stored reference embedding** — search and
   reference embeddings must come from the same model.
4. Redeploy both functions. The app and the RPC need no changes.

If Mistral (or any other AI) is adopted later, it must follow the same
rule as Cohere: **edge-function secret only** (`supabase secrets set …`),
never an `EXPO_PUBLIC_` var, never inside the Expo bundle.

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

- The edge function groups image-level results and decides
  `identified` vs `uncertain` vs `no-match` (see `visual-match/index.ts`).
- Defaults (overridable via secrets of the same names):
  **MAIN_MATCH_THRESHOLD** 0.90 (auto-show a product),
  **SIMILAR_PRODUCT_THRESHOLD** 0.75 (candidate pool + "similar" list),
  **AMBIGUOUS_MARGIN** 0.03 (two near-equal top candidates → user picks),
  **EDGE_CANDIDATE_LIMIT** 20 (rows fetched from pgvector per search).
- The RPC's own `match_threshold` parameter is called with
  SIMILAR_PRODUCT_THRESHOLD; raise/lower the secrets to tune with real
  store photos. The app displays the thresholds the function used.

## Price invariant

The matching pipeline stops at **product IDs + similarity**. The app then
reads `selling_price` from the `products` table at display time, so the
price shown is always the current database value — the AI cannot invent,
store, or influence it.
