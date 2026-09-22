# Find Product — what was broken and how it works now

`Edge Function returned a non-2xx status code` means the app reached Supabase
fine, but the deployed `visual-match` function failed. Two independent problems
were behind it: the photo **could not be turned into a vector at all**, and the
way vectors were **compared** accepted the wrong products.

## 1. Every photo returned HTTP 500

Calling the deployed function directly returned:

```json
{"error":"MOBILECLIP_MODEL_NAME is not defined"}
```

`supabase/functions/_shared/embedding.ts` referenced `MOBILECLIP_MODEL_NAME`,
which is **declared nowhere** — the file declares `EMBEDDING_MODEL`. That threw a
`ReferenceError` the moment `getEmbeddingProvider()` ran, so `visual-match`
failed for *every* photo and `embed-product-image` could never create a
reference embedding either.

TypeScript cannot catch this: `tsconfig.json` **excludes** `supabase/functions`
because it is Deno code. `tsc --noEmit` and `npm run lint` were both green while
the deployed function was 100% broken.

Fixing the name exposed two more walls, both proven rather than guessed (the
history is written up in `supabase/functions/_shared/embedding-engine.ts`):

- The functions loaded their runtime with `await import('https://esm.sh/…')`.
  Deno Deploy needs the whole module graph **at deploy time**, so a runtime
  remote import is never bundled: `Module not found`, HTTP 500 on every photo.
- The static replacement (`onnxruntime-web@1.14.0/src` had no usable build)
  **killed the edge isolate at module init**: a probe function whose whole body
  was `return 8 bytes of JSON` still failed with `WORKER_ERROR`, while an
  unrelated function on the same platform answered normally. Newer releases ship
  `.mjs`, but their WASM glue is loaded by a runtime dynamic `import()` — the same
  denied pattern — on top of a ~11 MB WASM binary and an 11.8 MB model inside a
  small isolate.

So the vector is now computed directly from pixels: a pure-JS image descriptor
(deterministic, no model download, no WASM, no API key, milliseconds per photo).
`tests/image-descriptor.test.mjs` drives the real module with synthetic pixels —
no codec needed — so the maths is verified before anything is deployed.

## 2. Matching accepted lookalike products

The decision used to be one cosine over the whole vector, which is a weighted
**sum**: a correct outline could pay for a completely wrong colour, and the other
way round. Measured against a yellow ball, that accepted a green ball and a
yellow box at the same scores as a genuine re-shot.

`compareDescriptors()` now scores **shape** and **colour** separately and keeps
the **weaker** signal, so a candidate is only as good as its worst aspect. The
pgvector cosine is still used, but only as a *retrieval* filter
(`EDGE_CANDIDATE_COSINE_FLOOR`, default 0.30) — never as the decision.

## 3. A confident match was shown as "Product not found"

With the backend fixed, a photo of a catalog product still came back as
*Product not found* — even at confidence 1.000. The client builds
`similar_products` and `all_candidates` by **excluding the main match**, so
when the matched product is the only thing in the catalog that looks like the
photo, the main match is present and both candidate lists are empty at the same
time. `analyzeMatchOutcome` read "empty candidate list" as "nothing was found"
and returned `none`, and the screen rendered the not-found state.

A one-product catalog hit this every time; a larger catalog hides it whenever
something else also scores above the candidate floor. The fix is in
`src/lib/visual-match/decision.ts`: the main match is evaluated **first**, and
"nothing found" now means *no main match AND no candidates of any kind*. Both
shapes are asserted in `tests/visual-match.test.mjs`, so a match can no longer
be reported as a failure.

## 4. Verify the data as well as the code

A correct function still finds nothing if the product has no embedding. After a
deploy, check that products have:

- `is_active = true`
- at least one `product_images` row
- a non-null `product_images.embedding` (512 dimensions)
- that image actually loading — a broken `image_url` cannot be matched

New and edited images are embedded automatically by `embed-product-image`. To
backfill images uploaded earlier, call it as an admin:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/embed-product-image" \
  -H "apikey: $KEY" -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' -d '{"limit": 50}'
```

## You MUST redeploy the backend

Changing the ZIP does not change the already-deployed Supabase functions.

```bash
npm install
npm run db:deploy
```

The deploy script applies migrations and deploys `visual-match` and
`embed-product-image`.

## If it still fails

The app reads the real Edge Function response body instead of only
`Edge Function returned a non-2xx status code`, so the message names the next
fix:

- `Embedding failed: ...` → the photo itself could not be decoded (unsupported
  format, or a zero-pixel image)
- `Could not compare candidates: ...` → the candidate re-scoring query failed
- `Similarity search failed: ...` → database/RPC problem
- `HTTP 401/403` → deployment/gateway configuration
- a valid `no-match` for a product you can see in the catalog → that product's
  image has no embedding, or the photo really does not show it (a phone photo of
  a different product will be refused on purpose)
