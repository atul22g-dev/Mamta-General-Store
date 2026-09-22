# Mamta General Store 🛒

Shop-floor price lookup for a general store. Customers snap one product photo and see its **current selling price from the store's database** — never a guessed price. Admins and staff manage the catalog through a protected dashboard.

**Stack:** Expo (React Native) · Expo Router · Supabase (Postgres, Auth, Storage, Edge Functions) · TypeScript

---

## Setup (5 steps)

### 1. Install & run

```bash
npm install
npx expo start        # press w for web, a for Android
```

### 2. Configure `.env`

Copy `.env.example` → `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

> ⚠️ Publishable key only — never a `service_role` / `sb_secret_…` key. Secrets live in Edge Functions only.

### 3. Set up the database (one paste)

Dashboard → [supabase.com/dashboard](https://supabase.com/dashboard) → **SQL Editor → New query** → paste **all** of [`supabase/setup-all-in-one.sql`](supabase/setup-all-in-one.sql) → **Run**.

The file is a **development reset** script (its TEARDOWN deletes catalog data). On an existing production database, use only the non-destructive [`create-admin-user.sql`](supabase/create-admin-user.sql) repair — never the reset script.

Creates everything: `profiles`, `products`, `product_images`, Row Level Security, the `product-images` storage bucket, and pgvector visual search. Re-running is **fully clean** — the TEARDOWN drops the old schema first, so no "already exists" errors.

<details>
<summary>What each migration stage creates</summary>

| Stage | Creates |
|---|---|
| 0001 | `profiles` (1:1 with `auth.users`), `is_admin()` helpers, auto-profile signup trigger |
| 0002 | `products` + `product_images` — category/unit enums, `selling_price <= mrp` check, indexes |
| 0003 | Forced **Row Level Security** — catalog public-read; writes staff-only; role changes admin-only |
| 0004 | `product-images` Storage bucket + policies (public read, staff upload into valid product folders) |
| 0005 | pgvector: `embedding vector(512)`, HNSW index, `visual_search_matches` RPC |
| 0006 | Hardening: new signups get **no role**; maintenance functions locked to service role |
| 0007 | Storage hardening — image-only, size-capped uploads; admin-only replace/delete |
| 0008 | `visual_search_matches` hardening — NULL-vector guard, `match_count` clamp, search path |
| 0009 | `brand` / `subcategory` / `is_active` + `image_type`; RPC filters to active products |
| 0010 | Categories/units for this store (`boots`, `toys`, `cloths`, `pair`) |
| 0011 | Backfills profile rows for auth users that predate the signup trigger |
| 0012 | Storage policy fix — image/size enforced at bucket level, replace/delete admin-only |
| 0013 | `visual_search_matches` also returns `product_name`, `selling_price`, `mrp`, `image_url` (one call = identity + price + image + score) |
| 0014 | Security audit fixes — explicit function EXECUTE grants, full RLS + storage policy contract re-asserted (RLS stays ON/forced) |

CLI alternative for production schema changes: `npx supabase link --project-ref <ref> && npx supabase db push`
</details>

### 4. Create your admin

1. Dashboard → **Authentication → Users → Add user** (email + password, tick **Auto Confirm User**).
   Use the same email you put in `.env`/`create-admin-user.sql` — or any email you like.
2. Open [`supabase/create-admin-user.sql`](supabase/create-admin-user.sql), set its one
   **▼ EDIT ME** email to that account, paste the whole file into **SQL Editor** and **Run**.
   It creates the missing `profiles` row and grants `admin` — and is safe to re-run.

Then sign in at `/admin/login`. More users? Use **Add Staff** in the app (staff accounts need no SQL).

### 5. Deploy the backend (schema + all Edge Functions)

One command does init → login → link → migrate → deploy → live-verify:

> Required whenever the Edge Function code changes: editing
> `supabase/functions/**` in this repo does nothing to the already-deployed
> functions until this runs.

```bash
npm run db:deploy            # status check only: npm run db:deploy -- --check
```

> On a database that already has objects but a missing migration history, first run the
> idempotent [`supabase/fix-visual-search-schema.sql`](supabase/fix-visual-search-schema.sql)
> in Dashboard → SQL Editor (non-destructive), then `npm run db:deploy`.

---

## Catalog export & import (admin)

**Admin dashboard → Export / Import** (also the icon in the Products header) moves the whole catalog in and out of a file.

| | |
|---|---|
| **Export catalog** | CSV to edit in Excel/Google Sheets, or JSON for a full backup (JSON keeps internal ids and timestamps). Hidden products are included — it doubles as a backup |
| **Download a blank template** | One example row, so the expected columns are visible |
| **Import products** | Pick a CSV/JSON file, read the **preview** (New / Update / Unchanged / Skipped, with a reason per row), then confirm |

How it behaves, so nothing is a surprise:

- **Nothing is written until you confirm.** Choosing a file only *plans*: it compares the file against the live catalog and shows exactly what would change. The confirm button says how many products it will write, and is disabled when the answer is "nothing".
- **Products are matched by name.** A name already in the catalog is updated in place (its id, and therefore its photos, are kept); a new name is added.
- **Photos never travel in a file.** Put a public image link in the `image_url` column and the app attaches it (only when the product has no photo of its own) and makes it searchable by image. An existing uploaded photo is never replaced by a spreadsheet.
- **Unchanged rows are skipped**, so re-importing a file you just exported is a no-op — a safe round trip.
- **A bad row fails alone.** Rows are written in small batches; a row the database refuses is reported by file line and name, and the rest still go through.
- **Limits:** 5 MB and 1000 rows per import. Columns: `name, category, unit, mrp, selling_price, stock, description, brand, subcategory, is_active, image_url`.

---

## Troubleshooting

The app self-diagnoses: **Settings → Store database → tap the row** shows live status plus the real server error.

| Symptom | Meaning | Fix |
|---|---|---|
| `PGRST002` | API can't reach its database | Self-hosted: `docker compose up -d`; hosted: check project health |
| `PGRST205` | Database reachable but **schema empty** | Run `setup-all-in-one.sql` (step 3) |
| Sign-in "does nothing": you land back on the login form with a yellow *"This account isn't set up yet"* panel | Credentials were fine, but `profiles` has **no row** for that account, so it has no role | Run [`create-admin-user.sql`](supabase/create-admin-user.sql) (set its `▼ EDIT ME` email) — or `npm run db:deploy`, which backfills it (0009/0011) |
| Login: `500 Database error querying schema` | Admin's auth row is malformed (NULL tokens / missing identity) | Delete the user and re-create it in Dashboard → Authentication → Users (**never** hand-insert auth rows with SQL) |
| Find Product fails with any `Embedding failed: …`, `Could not compare candidates: …` or a non-2xx error | The deployed `visual-match` function is stale/broken — the code is fixed, the running copy is not | `npm run db:deploy` (step 5) redeploys `visual-match` + `embed-product-image` |
| Find Product always says "Product not found" | No searchable data yet: the catalog is empty, or images have no embedding (findings: `supabase/functions/visual-match/index.ts` logs `candidates=0`) | Add products in the app; each saved image is embedded automatically. For images uploaded before a fix, re-embed them (see [`FIND_PRODUCT_FIX.md`](FIND_PRODUCT_FIX.md)) |
| Find Product found the **wrong** product | It now refuses lookalikes (same shape/other colour, same colour/other shape) — if it still picks one, the thresholds no longer sit inside the measured gap | Re-run `npm run test:all`; `tests/image-descriptor.test.mjs` fails when the thresholds drift, and prints the measured table |
| Product **images don't show**: saved product appears with a letter tile (or an empty box) instead of its photo | The photo was never uploaded. Migration 0007's Storage `INSERT` policy checked `metadata->>'mimetype'`, which storage-api does not populate when the policy runs — so *every* upload was rejected (the product row still saved, hence the confusing half-state). Fixed by migration **0012**, which enforces type/size on the bucket instead | `npm run db:deploy` (applies 0012), then edit the product and re-attach the photo |
| Upload fails with `new row violates row-level security policy` | Same cause as above: the storage policy, not your login. A `NULL`-role profile is now the only other trigger | `npm run db:deploy`, and confirm `select public.current_role()` returns `admin` while signed in |
| Image upload now succeeds but the tile is still a letter | The `product_images` row survived while its Storage object is gone, so the tile is showing its *fallback* on purpose | Re-attach the photo in the product's edit screen |
| "Access denied" after login | Profile has no `admin`/`staff` role | Run the step-4 promotion SQL |
| Import preview: every row is *Skipped* with a value not allowed (`category`/`unit`) | The file uses a word the database's own enums don't accept | Use the values the app offers; export the catalog first to copy a known-good row |
| Import finished but a new product has a letter tile instead of its photo | A file can only carry an image **link**. Either the `image_url` was empty, or the link doesn't return an image | Open the product and upload the photo, or fix the link in the file and import again |
| Import finished with *N failed* rows | The database refused those rows; each failure names its file line and reason | Fix those rows in the file and import it again — the successful rows are not re-applied |

---

## Development checks

```bash
npx tsc --noEmit          # TypeScript (app sources)
npm run lint              # ESLint
npm run test:all          # unit tests, incl. the edge-function provider contract
npx react-doctor@latest   # React correctness/perf scan
npm run db:deploy -- --check   # Supabase preflight + link check (changes nothing)
```

> `tsconfig.json` excludes `supabase/functions` (Deno code), so `tsc` cannot see a
> mistake inside an Edge Function — `npm run test:all` covers that gap: it loads the
> real `_shared/embedding.ts` and the real descriptor/decision code under Node (only
> the image codecs are stubbed), so an undefined identifier, a broken descriptor or
> thresholds that no longer separate lookalikes fail locally instead of as an HTTP 500
> in the app. Run it before every `npm run db:deploy`.

---

## One command: migrate + deploy the backend

```bash
npm run db:deploy
```

| Step | What it does |
|---|---|
| 1. Preflight | Verifies `.env`, derives the project ref from the URL |
| 2. Auth | Uses `SUPABASE_ACCESS_TOKEN` if set, otherwise browser login |
| 3. Link | Connects the folder to your Supabase project |
| 4. Migrate | Applies `supabase/migrations/*.sql`; if objects already exist it reconciles the migration history automatically |
| 5. Deploy | Deploys every Edge Function in `supabase/functions/` (no Docker needed) |
| 6. Verify | Probes each live function endpoint |

Status check only: `npm run db:deploy -- --check`.

<details>
<summary>Which SQL file to use, when?</summary>

- **`supabase/migrations/`** — the normal path; `npm run db:deploy` applies them. Safe on any database.
- **`supabase/create-admin-user.sql`** — create or repair the admin login (idempotent; edit the two `▼ EDIT ME` values).
- **`supabase/setup-all-in-one.sql`** — full manual setup for an **empty** database only (one paste in Dashboard → SQL Editor).
</details>

---

## Project structure & architecture

<details>
<summary>Structure</summary>

```
src/
  app/                    # Expo Router routes (file-based)
    (tabs)/               #   customer tabs: home, products, settings
    find-product/         #   camera → preview → searching → result → search
    admin/                #   login + (protected)/ dashboard, products, staff, transfer
  components/
    ui/                   # design-system primitives (Button, Card, Input, …)
    products/             # ProductForm, ProductImagePicker, ProductRow
  constants/              # design tokens: colors, spacing, typography, motion…
  hooks/                  # useAuth, useDatabaseHealth, useProductList, …
  lib/
    supabase.ts           # the single Supabase client (env-configured)
    auth-storage(.native).ts   # platform-split session storage
    products/             #   catalog services incl. CSV/JSON export & import
    health-service · visual-match/
supabase/
  migrations/             # 0001–0013 SQL migrations
  setup-all-in-one.sql    # ← one-paste complete database setup
  functions/create-staff/ # admin-only account provisioning (Deno)
                          #   server-side only — the app has no staff UI
scripts/                  # smoke tests + deploy script
```
</details>

<details>
<summary>Architecture rules</summary>

- **Screens → components → tokens** — dependencies point one way; no ad-hoc styling in screens
- **No database logic in components** — all Supabase access lives in `src/services/**` (Screen → Hook → Service → Supabase)
- **Prices come only from the `products` table** — the visual-match layer identifies products; it never invents prices
- **Secrets stay server-side** — the app bundle holds only the publishable key; account provisioning runs in an Edge Function that verifies the caller's admin role
- **Theme tokens, never literals** — colours, radii, shadows and type sizes come from `src/constants/**`, so light and dark mode stay in step; a hardcoded `'white'` card is what made the result screen unreadable in dark mode

<details>
<summary>Design system</summary>

Every surface reads from one token set, so a change there restyles the whole app:

| Token | File | Notes |
|---|---|---|
| Palette (light + dark) | `src/constants/colors.ts` | Retail emerald primary `#059669`, warm orange CTA, slate text; `accentDark` is the accessible accent *on* a light surface, `scrim` is the photo-overlay slate |
| Radius | `src/constants/radius.ts` | `sm 12 · md 16 · lg 20 · xl 28` — soft, block-based geometry |
| Elevation | `src/constants/shadows.ts` | `sm … xl`; `xl` is the hero level (the matched product, the scan CTA) |
| Type scale | `src/constants/typography.ts` | `display 36 · h1 30 · h2 21 · h3 17 · body 15 · caption 12` |
| Prices | `src/components/common/price-text.tsx` | Prices have their own scale (`hero 40 / card 18 / compact 15`) and tabular figures |
| Motion | `src/constants/motion.ts` | `fast 150 · base 220 · slow 320`; entrances are skipped when the OS asks for reduced motion |

The palette and style direction come from the bundled **ui-ux-pro-max** skill (`.freebuff/skills/ui-ux-pro-max`), which also carries the review checklists: 4.5:1 text contrast, 44pt touch targets, animated elements kept to one or two per view, and no emoji-as-icon.
</details>
</details>

---

## Learn more

[Expo docs](https://docs.expo.dev/) · [Expo Router](https://docs.expo.dev/router/introduction/) · [Supabase docs](https://supabase.com/docs) — [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Edge Functions](https://supabase.com/docs/guides/functions) · [Storage](https://supabase.com/docs/guides/storage)
