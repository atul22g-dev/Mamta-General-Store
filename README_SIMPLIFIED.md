# Mamta General Store — Simplified Find Product

## What changed

- Simplified the Find Product searching screen.
- Kept one visual-search service boundary.
- MobileCLIP-S0 is the only embedding model: free and no AI API key.
- Price is always loaded from the Supabase `products` table.
- Fixed image-size error handling.
- Avoided duplicate image file reads during validation/conversion.
- Added `npm run test:all`.
- Added `supabase/REPAIR_FIND_PRODUCT.sql` for database schema/RPC repair.
- Removed generated Expo output, installed dependencies, git metadata, old audit archives, and local tooling artifacts from this delivery ZIP.

## Install

```bash
npm install
```

Create `.env` from `.env.example` and set:

```text
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

## Test

```bash
npm run test:all
npx tsc --noEmit
```

## Run

```bash
npx expo start -c
```

## Backend

Log in and link the Supabase project, then run:

```bash
npm run db:deploy
```

The visual-search backend uses MobileCLIP-S0 and pgvector. Every searchable product image must have a non-null `product_images.embedding` with 512 dimensions.

If the remote database is behind the code, run `supabase/REPAIR_FIND_PRODUCT.sql` in Supabase SQL Editor, then deploy the Edge Functions.

After adding product images, generate their embeddings with the `embed-product-image` Edge Function.

## Important: deploy the Supabase backend

The mobile ZIP and the remote Supabase backend are separate. After extracting the project, run `npm install` and `npm run db:deploy` so the fixed `visual-match` Edge Function is actually deployed.
