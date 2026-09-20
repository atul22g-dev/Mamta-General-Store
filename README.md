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

CLI alternative for production schema changes: `npx supabase link --project-ref <ref> && npx supabase db push`
</details>

### 4. Create your admin

**One-paste option:** SQL Editor → run [`supabase/create-admin-user.sql`](supabase/create-admin-user.sql) after editing the email + password inside — creates the user **and** grants admin in one run.

**Or the two-step dashboard path:**

1. Dashboard → **Authentication → Users → Add user** (email + password, tick **Auto Confirm User**)
2. SQL Editor: run the promotion line from [`supabase/create-admin-user.sql`](supabase/create-admin-user.sql) with your email

Then sign in at `/admin/login`. More users (staff/admin)? See [`supabase/create-user.sql`](supabase/create-user.sql) or use **Add Staff** in the app.

### 5. Deploy the staff-provisioning function

One command does init → login → link → deploy → live-verify:

```bash
npm run deploy:functions     # probe-only check: npm run deploy:probe
```

---

## Troubleshooting

The app self-diagnoses: **Settings → Store database → tap the row** shows live status plus the real server error.

| Symptom | Meaning | Fix |
|---|---|---|
| `PGRST002` | API can't reach its database | Self-hosted: `docker compose up -d`; hosted: check project health |
| `PGRST205` | Database reachable but **schema empty** | Run `setup-all-in-one.sql` (step 3) |
| Login: `500 Database error querying schema` | Admin's auth row is malformed (NULL tokens / missing identity) | Run [`create-admin-user.sql`](supabase/create-admin-user.sql) (edit its two `▼ EDIT ME` values) |
| Add Staff: "account service is not deployed" | `create-staff` function missing | `npm run deploy:functions` (step 5) |
| Add Staff: "email already exists" | Duplicate signup | Different email, or manage in Dashboard → Authentication |
| "Access denied" after login | Profile has no `admin`/`staff` role | Run the step-4 promotion SQL |

---

## Development checks

```bash
npx tsc --noEmit          # TypeScript
npm run lint              # ESLint
npx react-doctor@latest   # React correctness/perf scan
npm run db:deploy -- --check   # Supabase preflight + link check (changes nothing)
```

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
    admin/                #   login + (protected)/ dashboard, products, staff
  components/
    ui/                   # design-system primitives (Button, Card, Input, …)
    products/             # ProductForm, ProductImagePicker, ProductRow
  constants/              # design tokens: colors, spacing, typography, motion…
  hooks/                  # useAuth, useDatabaseHealth, useProductList, …
  lib/
    supabase.ts           # the single Supabase client (env-configured)
    auth-storage(.native).ts   # platform-split session storage
    products/ · staff-service · health-service · visual-match/
supabase/
  migrations/             # 0001–0006 SQL migrations
  setup-all-in-one.sql    # ← one-paste complete database setup
  functions/create-staff/ # admin-only account provisioning (Deno)
scripts/                  # smoke tests + deploy script
```
</details>

<details>
<summary>Architecture rules</summary>

- **Screens → components → tokens** — dependencies point one way; no ad-hoc styling in screens
- **No database logic in components** — all Supabase access lives in `src/lib/**` services and hooks
- **Prices come only from the `products` table** — the visual-match layer identifies products; it never invents prices
- **Secrets stay server-side** — the app bundle holds only the publishable key; account provisioning runs in an Edge Function that verifies the caller's admin role
</details>

---

## Learn more

[Expo docs](https://docs.expo.dev/) · [Expo Router](https://docs.expo.dev/router/introduction/) · [Supabase docs](https://supabase.com/docs) — [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Edge Functions](https://supabase.com/docs/guides/functions) · [Storage](https://supabase.com/docs/guides/storage)
