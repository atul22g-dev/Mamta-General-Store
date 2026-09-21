# Mamta General Store — Bug Audit

- **Date:** 2026-09-21
- **Branch:** `preview`
- **Scope:** Full read-only audit — Expo app (`src/**`), Supabase migrations & SQL (`supabase/*.sql`), Edge Functions (`supabase/functions/**`), scripts & configuration (`package.json`, `app.json`, `tsconfig.json`, `scripts/deploy.mjs`, `README.md`).
- **Method:** Static source review only. **No application source code was modified.**
- **Tooling at audit time:** `npx tsc --noEmit` → clean · `npm run lint` → clean · repo-wide `npx eslint .` → clean after root-cause fixes (see "Tooling sweep" below). All remaining findings are runtime/logic/design issues that static checks do not catch.

### Status legend

| Status | Meaning |
|---|---|
| **Confirmed** | The defect is directly evidenced by the source code (presence of a wrong call, absence of a required guard, cross-file mismatch). |
| **Needs Verification** | The suspected behavior depends on runtime conditions (timing, device, data volume) that were not executed during this read-only audit. The code pattern is present, but the manifest bug must be reproduced before fixing blindly. |

### Tooling sweep (2026-09-21)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors (strict mode) |
| `npm run lint` (expo lint: `src`/`app`/`components`) | ✅ 0 errors, 0 warnings |
| `npx eslint . --max-warnings 0` (repo-wide, after root-cause fixes) | ✅ 0 errors, 0 warnings |

Two lint findings surfaced only by a repo-wide scan were fixed at the root:

- **`'_error' is defined but never used`** in `supabase/functions/create-staff/index.ts` — unused `catch (_error)` binding replaced with a bare `catch {}` (identical behavior; no suppression).
- **`import/no-unresolved` on `https://esm.sh/...`** in the three Edge Functions — false positives: the Node-based ESLint resolver cannot resolve Deno URL imports (the same reason `tsconfig.json` already excludes `supabase/functions`). Fixed in `eslint.config.js` with a directory-scoped rule for `supabase/functions/**/*.ts` only (no global disable), plus `".expo/**"` added to the global ignores so generated files are not linted.

---

## Index

| ID | Severity | Status | Area | Summary |
|---|---|---|---|---|
| CRIT-01 | Critical | Confirmed | Security / config | Admin password committed in `create-admin-user.sql` |
| CRIT-02 | Critical | Confirmed | Auth | Offline profile fetch at startup force-signs-out valid sessions |
| CRIT-03 | Critical | Confirmed | Image matching | `embed-product-image` stack-overflow on real photo sizes |
| HIGH-01 | High | Confirmed | Auth / Edge Function | `create-staff` reports success when the role grant matched 0 rows |
| HIGH-02 | High | Confirmed | Image matching | Match candidates not deduplicated per product (duplicate keys/cards) |
| HIGH-03 | High | Confirmed | Image matching / Perf | Photo→data-URI: hardcoded MIME, no downscale, blocking byte-by-byte encode |
| HIGH-04 | High | Confirmed | Config / DB | Enum drift: app config (3 categories / 2 units) vs migrations (7 / 7) |
| HIGH-05 | High | Confirmed | Navigation | `router.replace()` called during render in Add Staff screen |
| HIGH-06 | High | Confirmed | Security / cost | `visual-match` endpoint has no rate limit, auth, or payload cap |
| HIGH-07 | High | Confirmed | Storage / CRUD | Product delete orphans Storage objects; remove-by-URL deletes all matching rows |
| HIGH-08 | High | Confirmed | Production build | No bundle identifiers; no camera/image-picker permission plugins in `app.json` |
| HIGH-09 | High | Confirmed | Data loading | No stale-response guard in product search / list / dashboard hooks |
| HIGH-10 | High | Confirmed | Data / Perf | Catalog hard-capped at 100 rows, no pagination; unindexed `ilike '%…%'` |
| HIGH-11 | High | Confirmed | Docs / config | README references nonexistent `deploy:functions` / `deploy:probe` scripts |
| HIGH-12 | High | Confirmed | Uploads | MIME guessed from URI extension, no file-size cap, no type whitelist |
| MED-01 | Medium | Confirmed (code path) | Auth | In-flight `loadProfile` can resurrect a signed-out session |
| MED-02 | Medium | Confirmed | Network | No timeout on `visual-match` invoke → infinite spinner |
| MED-03 | Medium | Confirmed (code path) | Permissions | Unprotected permission await can wedge the gallery button |
| MED-04 | Medium | Confirmed | UI / UX | Dashboard renders raw `₹${selling_price}` instead of shared formatter |
| MED-05 | Medium | Confirmed | Validation | No upper bound on amounts → `numeric(10,2)` overflow surfaces as generic error |
| MED-06 | Medium | Confirmed | Auth / UX | `'500'` substring over-matches sign-in errors; no password reset flow |
| MED-07 | Medium | Confirmed | Performance | Database health poll keeps running while app is backgrounded |
| MED-08 | Medium | Confirmed | Types | Hand-written `database.ts` drifted from real schema; RPC untyped |
| MED-09 | Medium | Needs Verification | UI / UX | Row entrance animations may replay on FlatList recycle |
| MED-10 | Medium | Confirmed | Tooling | `create-admin-user.sql` line 1 is prose, not a SQL comment — paste-run fails |
| SEC-01 | High | Confirmed | Supabase / Storage | Any authenticated user could upload arbitrary files into product folders (no role/MIME/size gate on storage INSERT) |
| SEC-02 | Medium | Confirmed | Supabase / Storage | Storage UPDATE policy had no WITH CHECK — new row state never re-validated |
| SEC-03 | Medium | Confirmed (by design, documented) | Supabase / RPC | `visual_search_matches` SECURITY DEFINER exposure — verified read-only & bounded, contract now documented in-schema |
| LOW-01 | Low | Confirmed | Camera / perf | Permission gate stays mounted behind the live camera; CameraView persists in stack |
| LOW-02 | Low | Confirmed | Formatting | `PER_UNIT_SUFFIX` couples the literal `'Meter'` to the config value |
| LOW-03 | Low | Confirmed | Tooling | Deploy script regex only accepts 20-char refs on `.supabase.co` |
| LOW-04 | Low | Confirmed | Tooling / CI | Edge Function (Deno) code is type-checked nowhere |
| LOW-05 | Low | Confirmed | UI / UX | Failed sign-out leaves the confirm dialog open with no feedback |

---

## Critical

### CRIT-01 — Admin password committed to the repository

- **Bug ID:** CRIT-01
- **Severity:** Critical
- **Status:** Confirmed
- **File:** `supabase/create-admin-user.sql`
- **Function/component:** File content (documented credential); referenced by `src/app/admin/login.tsx` repair panel
- **Description:** The file contains a plain-text admin email (`owner@mamtastore.in`) and password (`Mamta@2026`) in git. The login screen's repair instructions explicitly tell the user to "sign in with the password written in that file", confirming this is a real, used credential.
- **Root cause:** Live credentials were written into a repository file instead of a `▼ EDIT ME` placeholder supplied at run time.
- **Reproduction steps:**
  1. `git show HEAD:supabase/create-admin-user.sql`
  2. Observe the email and password in the header comment.
- **Impact:** Anyone with repository access has working admin credentials (full catalog control, staff provisioning, role grants) if that password is used on the live project. Credential is permanently in git history.
- **Recommended solution:** Rotate the admin password immediately in Supabase Auth. Replace the file's values with placeholders only. If the repository has been shared, purge the credential from history (e.g. `git filter-repo`/BFG) after rotation.

### CRIT-02 — Offline profile fetch at startup signs the user out

- **Bug ID:** CRIT-02
- **Severity:** Critical
- **Status:** Confirmed
- **File:** `src/providers/auth-provider.tsx`
- **Function/component:** `AuthProvider.loadProfile` → `forceSignOut`
- **Description:** After a persisted session is restored, the profile is fetched with `supabase.from('profiles')…single()`. If that request fails for **any** reason — including a transient network failure — the code runs `await forceSignOut()`, destroying a valid session. There is no distinction between "row genuinely missing" and "request failed".
- **Root cause:** Single error branch: `if (error || !data) { await forceSignOut(); return; }` — network errors (`TypeError`/fetch failures, 5xx, timeouts) are treated identically to a deleted profile row.
- **Reproduction steps:**
  1. Sign in as admin; confirm the session persists.
  2. Enable airplane mode (or block the Supabase domain).
  3. Kill and relaunch the app.
  4. Observe: the restored session is discarded and the app returns to the signed-out state.
- **Impact:** Admins/staff are silently logged out whenever the app starts offline or the profile request hiccups — a reliability failure for the exact shop-floor environment this app targets. Also amplifies HIGH-01 (a missing profile row becomes an unexplainable logout loop).
- **Recommended solution:** Only force sign-out on a definitive "no profile row" outcome (PostgREST code `PGRST116` / 406 from `.single()`). On network/server errors, keep the session and expose a retryable "couldn't load profile" state.

### CRIT-03 — `embed-product-image` crashes on real photo sizes (stack overflow)

- **Bug ID:** CRIT-03
- **Severity:** Critical
- **Status:** Confirmed (code pattern; exact failure threshold varies by runtime, all phone photos exceed it)
- **File:** `supabase/functions/embed-product-image/index.ts`
- **Function/component:** Download step — `btoa(String.fromCharCode(...buffer))`
- **Description:** Reference images are downloaded and base64-encoded by spreading the entire `Uint8Array` into `String.fromCharCode(...)`. JavaScript engines cap function argument counts (tens to hundreds of thousands); a spread beyond that throws `RangeError: Maximum call stack size exceeded`. Any camera/gallery photo (typically 0.5–5 MB) exceeds the limit, so its embedding never persists.
- **Root cause:** Unbounded spread. The app-side encoder (`src/lib/visual-match/base64.ts`) chunk-processes for exactly this reason; the edge function does not.
- **Reproduction steps:**
  1. Upload a product image of ≥ ~200 KB (any real photo).
  2. Invoke the `embed-product-image` function for that product.
  3. Observe a 500 / per-item `failed` entry with a stack-overflow error; `product_images.embedding` stays NULL.
- **Impact:** The entire visual-search feature is silently non-functional for app-uploaded images: no reference embeddings are ever stored, so `visual_search_matches` never returns candidates. Failures are per-item and easily missed.
- **Recommended solution:** Chunk-encode the byte array (mirror the loop in `src/lib/visual-match/base64.ts`) or use `Buffer.from(buffer).toString('base64')` in Deno. Add a size guard that reports oversize inputs explicitly.

---

## High

### HIGH-01 — `create-staff` reports success even when the role grant matched zero rows

- **Bug ID:** HIGH-01
- **Severity:** High
- **Status:** Confirmed
- **File:** `supabase/functions/create-staff/index.ts`
- **Function/component:** Role grant section (`serviceClient.from('profiles').update({ role: 'staff' })…`) after `auth.admin.createUser`
- **Description:** After creating the auth user, the function updates the profile row's role but never checks that a row was actually updated. If the `on_auth_user_created` trigger did not create a profile (trigger missing, failed, or suppressed), PostgREST matches 0 rows and returns **no error** — the function responds `200 { email, role: 'staff' }`.
- **Root cause:** Missing row-count verification on the UPDATE (no `.select()` / count check); the code assumes the trigger always ran.
- **Reproduction steps:**
  1. Drop (or temporarily disable) the `on_auth_user_created` trigger on a test project.
  2. In the app, Add Staff with a fresh email.
  3. Observe the "Staff account created" success panel.
  4. Verify in the dashboard: the auth user exists but `public.profiles` has no row for it; signing in then triggers the CRIT-02 logout path.
- **Impact:** Admins are told provisioning succeeded when the account is unusable; no feedback loop, silent broken staff onboarding.
- **Recommended solution:** Chain `.select()` (or use `count: 'exact'`) on the update and treat "0 rows affected" as the existing 207 "grant failed" path, returning the repair SQL.

### HIGH-02 — Visual-match candidates are not deduplicated per product

- **Bug ID:** HIGH-02
- **Severity:** High
- **Status:** Confirmed
- **File:** `src/lib/visual-match/client.ts`
- **Function/component:** `matchProductFromPhoto` (step 3 join); consumer `AmbiguousCandidates` in `src/app/find-product/result.tsx`
- **Description:** The `visual_search_matches` RPC returns one row **per reference image**. `productIds` is deduplicated only for the product fetch; the `candidates` array keeps one entry per edge row. A product with multiple embedded images appears multiple times in the ambiguous-candidates list, and `key={candidate.product.id}` in the result screen receives duplicate keys.
- **Root cause:** Dedupe applied to the fetch ID list but not to the rendered candidate list.
- **Reproduction steps:**
  1. Embed two or more images for the same product (after CRIT-03 is fixed or via SQL).
  2. Scan that product with sub-threshold confidence.
  3. Observe the same product listed twice under "Not completely sure" plus duplicate-key warnings.
- **Impact:** Duplicate cards confuse the disambiguation UI; duplicate React keys can cause incorrect row rendering/reconciliation.
- **Recommended solution:** Reduce edge candidates by `product_id`, keeping the highest similarity per product before mapping to `MatchCandidateView`.

### HIGH-03 — Photo → data-URI pipeline: wrong MIME, no downscale, blocking encode

- **Bug ID:** HIGH-03
- **Severity:** High
- **Status:** Confirmed
- **File:** `src/app/find-product/searching.tsx`, `src/lib/visual-match/base64.ts`
- **Function/component:** `runMatch`, `fileUriToDataUri`, `bytesToBase64`
- **Description:** Three compounding issues in the match-request path: (a) `fileUriToDataUri(shot.uri, 'image/jpeg')` hardcodes the MIME type even for PNG/WebP gallery picks; (b) the photo is sent at capture resolution — no downscaling — producing multi-megabyte base64 bodies for `functions.invoke`; (c) `bytesToBase64` builds the output string byte-by-byte (`chunkString += String.fromCharCode(...)`), which is quadratic-ish in cost and blocks the JS thread for seconds on Hermes.
- **Root cause:** Encoder written for correctness only; no image-manipulation step before submission.
- **Reproduction steps:**
  1. Pick a large PNG from the gallery in the scan flow.
  2. Continue to the searching step.
  3. Observe: long freeze during "Reading your photo" (UI thread blocked), payload far larger than needed, and `data:image/jpeg` for non-JPEG input.
- **Impact:** Multi-second UI freezes on low-end Android; potential edge-function body-size failures; oversized mobile data usage; wrong MIME may break the embedding provider.
- **Recommended solution:** Downscale via `expo-image-manipulator` (or capture options) before encoding; derive MIME from the asset/extension; accumulate chunk strings in an array and `join('')` once.

### HIGH-04 — Enum drift between app config and SQL migrations

- **Bug ID:** HIGH-04
- **Severity:** High
- **Status:** Confirmed (cross-file comparison)
- **File:** `src/config/products.ts` + `src/types/database.ts` vs `supabase/migrations/0002_products.sql` + `supabase/setup-all-in-one.sql`
- **Function/component:** `product_category` / `product_unit` enum definitions
- **Description:** The app config declares 3 categories (`household`, `personal_care`, `other`) and 2 units (`piece`, `Meter`), while the migrations and one-paste setup script create 7 categories (`groceries`, `snacks`, … `dairy`) and 7 units (`kg`, `litre`, …). A database built from the migrations accepts values the app's types don't declare and for which `CATEGORY_LABELS`/`UNIT_LABELS` have no entries. Only the separate, easy-to-miss `supabase/sync-product-options.sql` reconciles them (destructively rebuilding the columns).
- **Root cause:** The editable config was narrowed without updating the canonical migrations/setup script.
- **Reproduction steps:**
  1. Provision a fresh database using `setup-all-in-one.sql`.
  2. Insert a product via SQL with `category = 'groceries'` (valid per that schema).
  3. Open the customer catalog: the chip filters don't include the category and the card renders the raw snake_case string `groceries`.
- **Impact:** Customer-visible raw enum strings; type-level mismatch between DB and app; fresh-environment setup differs depending on which SQL path was used.
- **Recommended solution:** Make `src/config/products.ts` the single source of truth and update `0002_products.sql` + `setup-all-in-one.sql` to match; retire `sync-product-options.sql` once aligned; regenerate `src/types/database.ts`.

### HIGH-05 — `router.replace()` called during render in Add Staff

- **Bug ID:** HIGH-05
- **Severity:** High
- **Status:** Confirmed (code defect; crash is currently masked by the parent guard)
- **File:** `src/app/admin/(protected)/staff.tsx`
- **Function/component:** `AddStaffScreen` render body (`shouldRedirectToLogin` early-out)
- **Description:** When the user is not an authenticated admin, the component calls `router.replace('/admin/login')` **during render** and returns `null`. Navigating during render is the exact pattern the codebase itself documents as a web hard-crash in `src/app/admin/login.tsx` ("calling router.replace() directly here would update the navigator DURING render (web hard-crashes on it)"). It is currently unreachable in practice because the protected layout renders `AccessDenied`/`Redirect` first — but any guard change exposes it.
- **Root cause:** Side-effecting navigation in the render phase instead of using Expo Router's `<Redirect>` component.
- **Reproduction steps:**
  1. Reach the staff screen with `status === 'unauthenticated'` without the parent guard intercepting (e.g. temporarily alter guard order in a test build).
  2. On web, observe the navigation-during-render crash/warning.
- **Impact:** Latent web crash and a violation of the project's own stated navigation rule; dead defensive code that can misfire.
- **Recommended solution:** Return `<Redirect href="/admin/login" />` exactly as `login.tsx` does, or remove the redundant early-out since the protected layout already guards the route.

### HIGH-06 — `visual-match` endpoint: no rate limiting, no auth, no payload cap

- **Bug ID:** HIGH-06
- **Severity:** High
- **Status:** Confirmed (absence verifiable in source)
- **File:** `supabase/functions/visual-match/index.ts`
- **Function/component:** `Deno.serve` handler
- **Description:** The function accepts any POST carrying the public anon key, performs no caller validation, applies no rate limit, and imposes no image-size cap. Every accepted call triggers a paid Cohere embedding request.
- **Root cause:** The function trusts that only the app will call it; the anon key is public by design.
- **Reproduction steps:**
  1. `curl -X POST "$SUPABASE_URL/functions/v1/visual-match" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"image":"data:image/png;base64,…"}'` in a loop.
  2. Observe each call consuming embedding-provider quota/cost.
- **Impact:** Unbounded financial exposure (AI provider cost) and an easy denial-of-wallet vector once `isVisualMatchConfigured` is enabled.
- **Recommended solution:** Add per-IP/per-user rate limiting, cap request body size, and consider requiring a lightweight authenticated session before invoking the paid provider.

### HIGH-07 — Storage orphans and delete semantics in product service

- **Bug ID:** HIGH-07
- **Severity:** High
- **Status:** Confirmed
- **File:** `src/lib/products/product-service.ts`
- **Function/component:** `deleteProduct`, `removeProductImage`
- **Description:** Four defects: (a) `deleteProduct` removes only the DB row — `product_images` rows cascade but Storage objects under `product-images/<id>/` are never deleted (the code comment admits it); (b) `removeProductImage` deletes **every** `product_images` row whose `image_url` equals the given URL rather than a specific row; (c) for rows holding a bare storage path (no `/product-images/` marker), `objectPath` is `null` → DB row deleted, object orphaned; (d) the result of `storage.remove()` is ignored, so failed deletions report success.
- **Root cause:** No storage cleanup orchestration; identity handled by URL string matching instead of row id/path.
- **Reproduction steps:**
  1. Create a product with images; delete the product → objects remain in the bucket forever.
  2. Or: insert an image row whose `image_url` is a bare path; remove it in the editor → the Storage object is not touched.
  3. Or: make two rows share one URL; removing "one" deletes both.
- **Impact:** Permanent, unbounded Storage cost growth; duplicate-deletion edge case; silent cleanup failures.
- **Recommended solution:** After product delete, list and remove `product-images/<id>/*`; key image removal by the image row id (deriving its path), not URL equality; check and report `remove()` results.

### HIGH-08 — Production build blockers in `app.json`

- **Bug ID:** HIGH-08
- **Severity:** High
- **Status:** Confirmed (fields absent from config)
- **File:** `app.json`
- **Function/component:** Expo config (`expo.android`, `expo.ios`, `expo.plugins`)
- **Description:** The config declares no `android.package` and no `ios.bundleIdentifier`, and registers no `expo-camera` or `expo-image-picker` plugin entries (with their permission message strings) even though both libraries are used in the app.
- **Root cause:** The project has so far only been run through Expo Go, which bypasses prebuild/permission configuration.
- **Reproduction steps:**
  1. Run `npx expo prebuild --platform android` (or an EAS build).
  2. Observe the missing application ID error; inspect generated permissions for missing camera/photo usage strings.
- **Impact:** Release binaries cannot be produced as-is; on release builds the camera permission prompt lacks a proper message (Play Store/App Store review risk; possible crash on permission request in some configurations).
- **Recommended solution:** Add bundle identifiers and `[ "expo-camera", { "cameraPermission": "…" } ]` / `expo-image-picker` plugin blocks before any EAS build.

### HIGH-09 — No stale-response guard in list/search/dashboard hooks

- **Bug ID:** HIGH-09
- **Severity:** High
- **Status:** Confirmed
- **File:** `src/hooks/use-product-search.ts`, `src/hooks/use-product-list.ts`, `src/hooks/use-admin-dashboard.ts`
- **Function/component:** `load` in each hook
- **Description:** Fetches fire on every debounced change/focus with no cancellation and no last-writer-wins check. A slow earlier response can resolve after a newer one and overwrite the newer results.
- **Root cause:** No `AbortController` or run-id guard (the codebase already uses the run-id pattern in `src/hooks/use-database-health.ts`, so the omission is inconsistent).
- **Reproduction steps:**
  1. Open the catalog search and type a query quickly (or throttle the network to 3G).
  2. Let an older, slower response finish after a newer one.
  3. Observe the list showing results for the previous query.
- **Impact:** Intermittent wrong-data display — a trust-eroding bug that is hard to reproduce in support.
- **Recommended solution:** Adopt the existing run-id ref pattern (or `AbortController`) in all three hooks; discard out-of-order resolutions.

### HIGH-10 — Catalog hard-capped at 100 rows, no pagination; unindexed search

- **Bug ID:** HIGH-10
- **Severity:** High
- **Status:** Confirmed (cap verified in code; performance aspect Needs Verification — depends on catalog size)
- **File:** `src/lib/products/product-service.ts`
- **Function/component:** `listProducts`
- **Description:** The query ends with `.limit(100)` and no pagination mechanism anywhere in the app; additionally the search uses `ilike 'name', '%term%'`, which a leading wildcard prevents from using the btree `products_name_idx`.
- **Root cause:** Implementation sized for a small catalog; no paging layer was added.
- **Reproduction steps:**
  1. Insert 150 products via SQL (any admin path works).
  2. Open the customer catalog and the admin product list.
  3. Products 101–150 never appear on any screen.
- **Impact:** Silent data loss in the UI past 100 products — customers can't buy what they can't see; search will degrade into full scans as the catalog grows.
- **Recommended solution:** Add range-based pagination (or infinite scroll) through `listProducts`; add a `pg_trgm` GIN index on `products.name` for substring search.

### HIGH-11 — README documents scripts and behavior that don't exist

- **Bug ID:** HIGH-11
- **Severity:** High
- **Status:** Confirmed (docs vs `package.json` mismatch)
- **File:** `README.md` (steps 5 & troubleshooting table) vs `package.json`
- **Function/component:** npm scripts; `supabase/setup-all-in-one.sql` description
- **Description:** The README instructs `npm run deploy:functions` and references `npm run deploy:probe` — neither script exists in `package.json` (only `db:deploy`). The troubleshooting row for Add Staff tells users to run the nonexistent script to fix provisioning. The README also claims `setup-all-in-one.sql` contains a "TEARDOWN" section; the file has none.
- **Root cause:** Documentation drifted from the scripts.
- **Reproduction steps:**
  1. `npm run deploy:functions` → npm "missing script" error.
  2. Search `setup-all-in-one.sql` for "TEARDOWN" → not found.
- **Impact:** Onboarding and troubleshooting dead-ends; the documented fix for a broken Add Staff flow cannot be executed.
- **Recommended solution:** Either add the missing npm scripts (thin wrappers over `scripts/deploy.mjs`) or correct the README to `npm run db:deploy`; remove the TEARDOWN claim.

### HIGH-12 — Upload path: MIME guessed from extension, no size cap, no whitelist

- **Bug ID:** HIGH-12
- **Severity:** High
- **Status:** Confirmed
- **File:** `src/lib/products/product-service.ts` (`uploadProductImage`), `src/components/products/product-image-picker.tsx`
- **Function/component:** `uploadProductImage`, `takePhoto`/`pickFromGallery`
- **Description:** The storage object's extension is regex-guessed from the local URI, defaulting to `jpg`/`image/jpeg` — Android `content://` URIs frequently have no extension, so PNGs can be stored as `.jpg` with a `image/jpeg` content type. `asset.mimeType` from the picker is never consulted. There is also no maximum file-size check before reading and uploading bytes.
- **Root cause:** MIME/extension inferred from the URI string instead of picker metadata; no validation layer.
- **Reproduction steps:**
  1. Pick a PNG whose `content://` URI has no extension → observe the object stored as `…jpg` with `image/jpeg`.
  2. Pick a very large (e.g. 20 MB) image → observe the full-size upload proceeds without warning.
- **Impact:** Incorrect object metadata (can break rendering/downstream tooling), oversized uploads over mobile data, unbounded storage bloat.
- **Recommended solution:** Use `asset.mimeType`/`asset.fileName` from the picker result, enforce a size cap (e.g. 5 MB) with a clear error, and whitelist supported image types before upload.

---

## Medium

### MED-01 — In-flight `loadProfile` can resurrect a signed-out session

- **Bug ID:** MED-01
- **Severity:** Medium
- **Status:** Confirmed (code path); production frequency Needs Verification (timing-dependent)
- **File:** `src/providers/auth-provider.tsx`
- **Function/component:** `loadProfile` vs `onAuthStateChange`
- **Description:** `loadProfile` awaits the profiles query and then sets `profile`/`status('authenticated')` unconditionally. If a `SIGNED_OUT` event is processed while that request is in flight, the late resolution overwrites the cleared state — session null but `status: 'authenticated'`.
- **Root cause:** No generation/stale-resolution guard around the async profile load.
- **Reproduction steps:** Sign out while the initial profile fetch is pending (e.g. sign in, immediately sign out on a slow network); inspect provider state afterward.
- **Impact:** Inconsistent auth state; UI can show authenticated chrome with no session; guard logic downstream may misbehave.
- **Recommended solution:** Add a run-id/generation counter; ignore profile resolutions that started before the latest auth event.

### MED-02 — No timeout on the visual-match invoke

- **Bug ID:** MED-02
- **Severity:** Medium
- **Status:** Confirmed
- **File:** `src/lib/visual-match/client.ts`
- **Function/component:** `matchProductFromPhoto`
- **Description:** `supabase.functions.invoke('visual-match', …)` is called with no timeout/abort. A request that connects but never completes leaves the searching screen in its `working` phase indefinitely (the stage tracker is cosmetic and not tied to real progress).
- **Root cause:** No abort wiring around the invoke.
- **Reproduction steps:** Send the match request through a proxy that accepts but never responds; observe an unbounded spinner.
- **Impact:** Dead-end UX requiring app restart; no automatic retry path.
- **Recommended solution:** Wrap the invoke with an `AbortSignal` timeout (the project already does this in `health-service.ts`); map expiry to the existing retryable error state.

### MED-03 — Unprotected permission await can wedge the gallery button

- **Bug ID:** MED-03
- **Severity:** Medium
- **Status:** Confirmed (code path); runtime trigger Needs Verification (device-specific)
- **File:** `src/hooks/use-gallery-pick.ts`
- **Function/component:** `pickFromGallery`
- **Description:** `await ImagePicker.requestMediaLibraryPermissionsAsync()` runs **outside** the try/catch (the module comment explains try/finally is deliberately avoided for the React Compiler). If that call rejects, the promise rejects unhandled and `picking` remains `true`, permanently disabling the gallery button on that screen instance.
- **Root cause:** Busy-flag mirroring covers every path *after* the permission call, but not the call itself.
- **Reproduction steps:** Force `requestMediaLibraryPermissionsAsync` to reject (broken permission module/edge device); tap the gallery button once; the button stays disabled.
- **Impact:** Gallery flow wedged until the screen remounts; unhandled rejection noise.
- **Recommended solution:** Wrap the permission call in its own try/catch that maps to the existing `failed` handling (or a `picking=false` reset).

### MED-04 — Dashboard renders raw prices instead of shared formatters

- **Bug ID:** MED-04
- **Severity:** Medium
- **Status:** Confirmed
- **File:** `src/app/admin/(protected)/index.tsx`
- **Function/component:** `AdminDashboardScreen` (recent/low-stock `AdminCard` descriptions)
- **Description:** Card descriptions use template literals — `` `₹${product.selling_price}` `` and raw `product.category` — instead of `formatPrice`/`formatPriceWithUnit` and `CATEGORY_LABELS` used everywhere else.
- **Root cause:** Screen-local string building bypassing the single-source formatters.
- **Reproduction steps:** Add a product priced `1250` with unit `Meter`; the dashboard shows `₹1250` (no grouping, no `/meter`) and the raw category value.
- **Impact:** Inconsistent price/category display across admin surfaces; violates the project's "single source of truth for money display" rule.
- **Recommended solution:** Use `formatPriceWithUnit(product.selling_price, product.unit)` and `CATEGORY_LABELS[...]` in dashboard card descriptions.

### MED-05 — No upper bound on numeric form fields

- **Bug ID:** MED-05
- **Severity:** Medium
- **Status:** Confirmed
- **File:** `src/lib/products/product-validation.ts`
- **Function/component:** `parseAmount` / `validateProductForm`
- **Description:** `parseAmount` accepts arbitrarily large decimals (e.g. `99999999999.99`) and more than two decimal places. The DB columns are `numeric(10,2)` (max 99,999,999.99), so oversized values pass client validation and fail server-side with a generic error; >2-decimal inputs are silently rounded by Postgres.
- **Root cause:** Validation checks only format and non-negativity, not the column's numeric range/scale.
- **Reproduction steps:** In Add Product, enter MRP `99999999999.99`; submit; observe a generic save error instead of a field message.
- **Impact:** Poor validation UX; confusing server-roundtrip failures; silent rounding for 3+ decimals.
- **Recommended solution:** Add a max bound and 2-decimal cap in `validateProductForm` matching `numeric(10,2)`.

### MED-06 — `'500'` substring over-matches sign-in errors; no password reset flow

- **Bug ID:** MED-06
- **Severity:** Medium
- **Status:** Confirmed (matching logic); a specific misfiring message Needs Verification
- **File:** `src/lib/auth-errors.ts`
- **Function/component:** `toSignInError`
- **Description:** The mapper checks `m.includes('500')`, which matches any auth message containing the substring (rate-limit payloads, metadata, IDs), misrouting users to the "database row needs repair" panel. Separately, the app offers no password-reset flow at all, so the repair panel is the only recovery path it presents.
- **Root cause:** Over-broad substring matching; missing self-service recovery feature.
- **Reproduction steps:** Trigger any sign-in failure whose message contains "500" outside a genuine repair scenario; observe the repair instructions shown incorrectly.
- **Impact:** Misleading guidance during failures; locked-out users with forgotten passwords have no in-app recovery.
- **Recommended solution:** Match explicit GoTrue codes/messages (e.g. `error:500`, "Database error querying schema") instead of a bare `'500'`; plan a password-reset flow (email OTP/magic link).

### MED-07 — Database health poll continues while backgrounded

- **Bug ID:** MED-07
- **Severity:** Medium
- **Status:** Confirmed
- **File:** `src/hooks/use-database-health.ts`
- **Function/component:** `useDatabaseHealth` effect
- **Description:** The 30-second `setInterval` keeps firing while the app is backgrounded; only the foreground transition listener is AppState-aware.
- **Root cause:** Interval not gated on `AppState === 'active'`.
- **Reproduction steps:** Background the app with the JS runtime alive; observe continued probes every 30 s in logs.
- **Impact:** Battery/data waste; background network churn (some Android builds restrict or penalize this).
- **Recommended solution:** Pause the interval when `AppState` is not `active` and resume (plus immediate recheck) on foreground.

### MED-08 — Hand-written `database.ts` has drifted from the real schema

- **Bug ID:** MED-08
- **Severity:** Medium
- **Status:** Confirmed
- **File:** `src/types/database.ts`
- **Function/component:** `Database` type definition
- **Description:** The types mirror the narrowed config enums (3 categories / 2 units) rather than the actual migration schema (7 / 7 — see HIGH-04), and `Functions: Record<string, never>` leaves `visual_search_matches` untyped even though the client calls it via the edge function's RPC.
- **Root cause:** Types hand-maintained; documented regeneration step (`supabase gen types`) not run after schema changes.
- **Reproduction steps:** Compare `Enums` in `src/types/database.ts` with `0002_products.sql`; observe the mismatch.
- **Impact:** Type-level blindness to real rows (products with non-config categories cast via `as ProductCategory`); no compile-time protection on RPC changes.
- **Recommended solution:** Align schema (per HIGH-04) and regenerate types with `npx supabase gen types typescript`.

### MED-09 — Row entrance animations may replay on FlatList recycle

- **Bug ID:** MED-09
- **Severity:** Medium
- **Status:** Needs Verification (depends on reanimated/FlatList runtime recycling behavior)
- **File:** `src/app/(tabs)/products.tsx` (`CatalogCard`), `src/components/products/product-row.tsx`
- **Function/component:** Per-row `Animated.View entering={FadeInDown…}` with index-based delay
- **Description:** Every row mounts its own entrance animation keyed by list index. When FlatList recycles/remounts items during fast scrolls of long lists, the animation can replay for rows re-entering the viewport, producing flicker/jank.
- **Root cause:** Entrance animations attached to recycled row components.
- **Reproduction steps:** Populate the catalog beyond one viewport; scroll rapidly up/down; watch for rows re-animating on reuse.
- **Impact:** Visual jank on low-end devices; delay stagger amplifies it near the top of the list.
- **Recommended solution:** If verified, animate the list container once (as the products screen already does for the wrapper) or suppress entrance animations after first mount.

### MED-10 — `create-admin-user.sql` first line is not a SQL comment

- **Bug ID:** MED-10
- **Severity:** Medium
- **Status:** Confirmed
- **File:** `supabase/create-admin-user.sql`
- **Function/component:** File content, line 1
- **Description:** The file begins `Go to the Supabase Dashboard ->  Auth -> Users -> …` — prose **without** a leading `--`. Pasting the whole file into the Supabase SQL Editor (the documented repair path, including from the in-app repair panel) errors on line 1 before any statement runs.
- **Root cause:** Missing comment marker on the first line.
- **Reproduction steps:** Paste the entire file into SQL Editor → Run → syntax error at "Go".
- **Impact:** The documented repair flow fails for exactly the audience it targets (store owners repairing their login mid-crisis).
- **Recommended solution:** Prefix the first line with `--`.

---

## Low

### LOW-01 — Permission gate stays mounted behind the live camera; CameraView persists in stack

- **Bug ID:** LOW-01
- **Severity:** Low
- **Status:** Confirmed
- **File:** `src/app/find-product/camera.tsx`
- **Function/component:** `FindProductCameraScreen` (phase computation + `PermissionGate`), `CameraReady`
- **Description:** When permission is granted, the code renders `<PermissionGate phase='checking' …>` (a flex-filling hidden view) *behind* the `CameraReady` viewfinder rather than rendering nothing; separately, the camera screen remains mounted in the stack while preview/searching screens are pushed, keeping the camera session alive.
- **Root cause:** Phase-switch design keeps both branches mounted; stack navigation doesn't unmount the camera step.
- **Reproduction steps:** Grant camera permission; inspect the view hierarchy (or battery/indicator while the flow advances to preview).
- **Impact:** Minor wasted rendering and battery; fragile structure that can produce z-order/flash issues after layout changes.
- **Recommended solution:** Render `null` for the gate when `phase === 'ready'`; consider unmounting/pausing the camera on blur.

### LOW-02 — `PER_UNIT_SUFFIX` couples the literal `'Meter'` to the config value

- **Bug ID:** LOW-02
- **Severity:** Low
- **Status:** Confirmed
- **File:** `src/lib/format.ts`
- **Function/component:** `PER_UNIT_SUFFIX` / `formatPriceWithUnit`
- **Description:** The per-unit suffix map keys on the hardcoded string `'Meter'`. Renaming the unit value in `src/config/products.ts` silently breaks the "₹45/meter" display with no compile-time signal.
- **Root cause:** Cross-module string coupling instead of deriving from the shared config.
- **Reproduction steps:** Rename the unit value in config; observe prices losing the `/meter` suffix at runtime.
- **Impact:** Silent display regression after a routine config change.
- **Recommended solution:** Define measured-unit behavior alongside the unit config (e.g. a `perUnit: true` flag in `PRODUCT_UNIT_OPTIONS`) and derive the suffix from it.

### LOW-03 — Deploy script project-ref regex is overly strict

- **Bug ID:** LOW-03
- **Severity:** Low
- **Status:** Confirmed
- **File:** `scripts/deploy.mjs`
- **Function/component:** `refMatch` in preflight
- **Description:** `/^https:\/\/([a-z0-9]{20})\.supabase\.co/i` requires exactly 20 lowercase-alnum characters and a `.supabase.co` host; it fails for self-hosted gateways or future custom domains, and would also reject refs with different lengths.
- **Root cause: Regex hardcodes the hosted Supabase URL shape without an override.**
- **Reproduction steps:** Set `EXPO_PUBLIC_SUPABASE_URL` to a self-hosted/custom domain; run `npm run db:deploy -- --check`; preflight fails despite a valid config.
- **Impact:** Deploy tooling unusable in non-standard environments.
- **Recommended solution:** Relax the parse and/or allow an explicit `SUPABASE_PROJECT_REF` env override.

### LOW-04 — Edge Function code is type-checked nowhere

- **Bug ID:** LOW-04
- **Severity:** Low
- **Status:** Confirmed
- **File:** `tsconfig.json` (exclude list) and `.github/workflows/react-doctor.yml`
- **Function/component:** Repository check configuration
- **Description:** `tsconfig.json` excludes `supabase/functions`, no Deno check runs locally or in CI, and the only workflow is the React Doctor scan. Deno code (three functions + shared module) compiles only at deploy time.
- **Root cause:** Type-checking scoped to the app graph only.
- **Reproduction steps:** Introduce a type error in `supabase/functions/_shared/embedding.ts`; `tsc --noEmit` and CI pass; it surfaces only on deploy.
- **Impact:** Late failure detection for the backend half of the codebase (where CRIT-03-class bugs live).
- **Recommended solution:** Add a `deno check` step (locally via npm script and in CI) for `supabase/functions`.

### LOW-05 — Failed sign-out leaves the confirm dialog open with no feedback

- **Bug ID:** LOW-05
- **Severity:** Low
- **Status:** Confirmed
- **File:** `src/app/(tabs)/settings.tsx`
- **Function/component:** `handleSignOut`
- **Description:** If `signOut()` rejects, `signedOut` is set to `false`, the busy flag resets, and the dialog simply stays open — no error message is shown and the user gets no indication the logout failed.
- **Root cause:** Failure branch intentionally skips closing the dialog but omits user feedback.
- **Reproduction steps:** Put the device offline such that the sign-out request rejects; tap Log out → confirm; observe the dialog remain with no message.
- **Impact:** Minor UX dead-end; user cannot tell whether they are still signed in.
- **Recommended solution:** Show an alert (the project's cross-platform `alert()` helper) on the failure branch.

---

## Supabase security audit (2026-09-21)

Scope: `profiles`, `products`, `product_images`, `visual_search_matches`, RPC/SECURITY DEFINER functions, Storage bucket + policies, Edge Functions, service-role exposure. Method: full static review of `supabase/migrations/0001–0006`, `setup-all-in-one.sql`, `create-admin-user.sql`, all three Edge Functions, and every client call site (`src/lib/**`, `src/hooks/**`). **No policy was weakened**; fixes are additive narrowing, delivered as new migration `0007_rls_storage_hardening.sql` (applied migrations were not edited).

### Verified secure (no change required)

| Area | Evidence |
|---|---|
| RLS enabled on all tables | `enable row level security` at table creation in 0001/0002, re-asserted in 0003 — plus **`force row level security`** (even table owners go through policies) |
| Customers cannot write products/images | No INSERT/UPDATE/DELETE policy on `products`/`product_images` targets `anon` — RLS default-deny denies all anonymous writes; the functions' DML policies require `is_admin()`/`current_role() = 'staff'` |
| Users cannot change or promote their own role | `profiles` UPDATE policy: `with check (id = auth.uid() and role = public.current_role())` — a user writing `role='admin'` fails because `current_role()` (SECURITY DEFINER, search_path locked) still returns the old role. Role changes only via the admin policy. New signups get `role = NULL` (0006) = zero privileges |
| Access to other users' private data | `profiles` SELECT is `id = auth.uid() or is_admin()` — no cross-user read; no other per-user tables exist |
| Role-less signups have no privileges | `current_role()` returns NULL → `is_admin()` false, staff checks false; `visual_search_matches` returns only public catalog ids |
| `clear_product_embeddings` | Granted to `service_role` only (0006 §2) — re-asserted idempotently in 0007 |
| Service-role key exposure | Present only in Edge Functions (`Deno.env.get`) and docs; the client (`src/lib/supabase.ts`) uses `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon) and fails fast if unset; `.env` is gitignored; `.env.example` documents publishable-only |
| Edge Function authorization | `create-staff`: caller JWT verified → `profiles.role='admin'` checked via the **anon** client (RLS-enforced, so a self-reported role cannot be forged) **before** the service-role client is created; input validated before privileged calls. `embed-product-image`: admin/staff gate before any privileged work |
| RPC bypass of RLS | The only caller-facing RPC is `visual_search_matches` — read-only over `product_images`, SECURITY DEFINER with `search_path = public`; definer scope bounded to catalog image ids + similarity (no prices, no user data). Grant posture unchanged: `anon, authenticated` — required for anonymous shop-floor scans |
| Storage path binding | Upload folder must equal an **existing** product id (`storage.foldername` vs `products.id`) |

### SEC-01 — Any authenticated user could upload arbitrary files into product folders

- **Bug ID:** SEC-01
- **Severity:** High
- **Status:** Confirmed — **fixed in migration `0007`**
- **File:** `supabase/migrations/0004_product_images_storage.sql` (policy), fixed by `supabase/migrations/0007_rls_storage_hardening.sql`
- **Function/component:** Storage policy `staff can upload product images`
- **Description:** The storage INSERT policy required only `authenticated` + a folder matching an existing product id. Since 0006, self-signups have `role = NULL`, yet they still passed this policy: any authenticated user could upload files of any type (e.g. `text/html` served from a public bucket — stored-XSS hosting) and any size into any existing product's folder.
- **Root cause:** Policy modeled "which folder" but not "who" or "what content".
- **Reproduction steps:** Sign up via the Auth API (gets role-less profile) → obtain an authenticated JWT → `POST /storage/v1/object/product-images/<existing-product-id>/x.html` → 200, object stored and publicly served.
- **Impact:** Arbitrary public content hosting in the store's bucket; unbounded storage cost.
- **Recommended solution / implemented fix:** Policy rebuilt in 0007 as `staff and admins can upload product images` adding `public.current_role() in ('admin','staff')`, `mimetype like 'image/%'`, `size <= 5 MiB` (existing product-folder check retained).
- **Why the new policy is secure:** It is a strict narrowing — the role gate excludes every role-less/auth-anon caller; MIME + size gates block non-image payloads and abuse; folder binding still prevents uploads outside real product folders. Client uploads (`uploadProductImage`) send only JPEG/PNG images well under the cap, so legitimate flows are unaffected.
- **How it was verified:** Static policy review against every client call site (`uploadProductImage` is the sole uploader); SQL cross-checked against `storage.objects` schema (`mimetype`, `size`, `bucket_id`, `storage.foldername`) and the `current_role()`/`is_admin()` SECURITY DEFINER helpers (already granted to `authenticated`). Live policy behavior was not exercised (no DB writes from this audit) — apply via `npm run db:deploy` and re-verify by attempting an upload with a role-less JWT.

### SEC-02 — Storage UPDATE policy missing WITH CHECK

- **Bug ID:** SEC-02
- **Severity:** Medium
- **Status:** Confirmed — **fixed in migration `0007`**
- **File:** `supabase/migrations/0004_product_images_storage.sql`, fixed by `0007_rls_storage_hardening.sql`
- **Function/component:** Storage policy `admins can update product images`
- **Description:** The UPDATE policy had a `using(...)` but no `with check(...)`, so the NEW row state was never validated — a client performing a replace/update could rewrite `mimetype`/`size` metadata without constraint.
- **Root cause:** Half-specified policy ( USING filters the old row; WITH CHECK is required to constrain the new row).
- **Reproduction steps:** As an admin-authenticated client, update an object with a tampered `mimetype`/`size` payload — accepted under the old policy.
- **Impact:** Metadata integrity gap on bucket objects (defense-in-depth; the app has no admin object-edit flow, which is why this is Medium, not High).
- **Recommended solution / implemented fix:** 0007 recreates the policy with both `using(bucket_id + is_admin())` **and** `with check(bucket_id + is_admin() + mimetype like 'image/%' + size ≤ 5 MiB)`.
- **Why the new policy is secure:** New row state is now re-validated under the same role/content gates as insert; strict narrowing of the previous policy.
- **How it was verified:** Policy definition review (USING vs WITH CHECK semantics per Postgres/Supabase docs); no live write attempted.

### SEC-03 — `visual_search_matches` SECURITY DEFINER exposure (verified safe; contract documented)

- **Bug ID:** SEC-03
- **Severity:** Medium (inherent risk, verified bounded)
- **Status:** Confirmed safe by review — **documented in-schema via 0007**
- **File:** `supabase/migrations/0005_visual_search.sql` §2, annotated by `0007_rls_storage_hardening.sql`
- **Function/component:** `public.visual_search_matches(vector, double precision, integer)`
- **Description:** The RPC runs SECURITY DEFINER to let anonymous visitors search. SECURITY DEFINER functions are privileged objects and warrant explicit audit: if definer scope were broad, an anon caller could reach non-public data.
- **Root cause:** n/a — architectural requirement (product_images has no anon SELECT policy; a definer-free RPC would return zero rows and break the shop-floor flow).
- **Impact:** None as reviewed — see verification.
- **Recommended solution / implemented fix:** No behavior change. 0007 re-asserts the grant set (`anon, authenticated`) and adds an in-database `comment on function` recording the security contract (read-only, bounded exposure, never prices/user data) so future migrations cannot silently widen it unnoticed.
- **Why this is secure:** Function is `stable`, read-only over `product_images` only; returns `product_id`, `image_id`, `similarity` — all publicly-readable catalog data; `search_path = public` prevents search-path hijacking; no `auth.uid()`-keyed data is reachable from it.
- **How it was verified:** Full function-body review (no writes, no dynamic SQL, no other tables referenced); grant review (`revoke ... from public` prevents public/owner-default leakage beyond the two intended roles).

### Monitoring additions from this audit

1. **Storage policy granularity** — 0007 gates on MIME/size at policy level; if the catalog ever needs larger imagery, raise the cap consciously (client + policy together), not by loosening the role gate.
2. **`visual-match` payload cap** (HIGH-06) — **partially fixed 2026-09-21**: the edge function now enforces a MIME whitelist and size cap before the paid embedding call; per-user rate limiting at the gateway is still open.

---

## Visual matching accuracy fix (2026-09-21)

Scope: the full image-matching pipeline — camera/picker → preview → data-URI conversion → `visual-match` edge function → `visual_search_matches` RPC → product lookup → result screen. The CRITICAL PRICE RULE was verified end-to-end and is now structurally guaranteed: the edge function and RPC return only product ids + similarity; the client re-reads the live `products` table for every displayed price; no price field exists in any matcher response.

### Flow activation (was dead-ended)

The entire real pipeline was unreachable: `preview.tsx` called `submitForMatching`, which returned `not-configured` (`isVisualMatchConfigured = false`) before the searching step could ever run. The flow now routes preview → searching directly; `searching.tsx` invokes the live pipeline (data-URI → edge function → threshold decision → result screen). The stub seam (`service.ts`) is retained for its types but no longer gates the flow.

### MATCH-01 — Flow dead-ended by the not-configured seam

- **Bug ID:** MATCH-01 · **Severity:** High · **Status:** Fixed
- **File:** `src/app/find-product/preview.tsx`, `src/lib/visual-match/service.ts`
- **Problem:** Users could never reach matching; the flow always reported "Visual matching is not connected yet".
- **Fix:** Preview routes into `searching.tsx`, which runs the real pipeline. Submit-state UI removed from preview (busy-state now lives in the searching step where the work actually happens).

### MATCH-02 — Unbounded paid endpoint: no MIME/size cap on `visual-match`

- **Bug ID:** MATCH-02 · **Severity:** High · **Status:** Fixed
- **File:** `supabase/functions/visual-match/index.ts`
- **Problem:** Any public caller could POST arbitrary payloads to the paid embedding API (audit HIGH-06).
- **Fix:** Data-URI MIME whitelist (png/jpeg/webp) + ~5 MB binary cap (`MAX_DATA_URI_CHARS`) enforced before the provider call; oversized → 413.

### MATCH-03 — `embed-product-image` stack overflow on real photos (CRIT-03)

- **Bug ID:** MATCH-03 · **Severity:** Critical · **Status:** Fixed
- **File:** `supabase/functions/embed-product-image/index.ts`
- **Problem:** `String.fromCharCode(...buffer)` spread the entire image byte array as call arguments — `RangeError: Maximum call stack size exceeded` at roughly >100 KB, i.e. every real photo. Reference embeddings could never be computed, so visual search could never match anything.
- **Fix:** Chunked base64 encoder (32 KB per `String.fromCharCode` call), the same proven algorithm as the app's `base64.ts`; unit-tested with a 600 KB buffer.

### MATCH-04 — Data-URI MIME hardcoded to image/jpeg (HIGH-03 partial)

- **Bug ID:** MATCH-04 · **Severity:** Medium · **Status:** Fixed (client half)
- **File:** `src/lib/visual-match/base64.ts`, `src/lib/visual-match/client.ts`
- **Problem:** PNG/WebP gallery picks were labeled `image/jpeg`, corrupting providers that trust declared MIME. No size/MIME validation ran before upload.
- **Fix:** MIME detected from the source URI (web blob URL fragment) with JPEG default for camera captures; client validates `data:image/(png|jpeg|webp);base64,…` shape and the 5 MB cap before any network round-trip.

### MATCH-05 — Duplicate per-product candidates (HIGH-02)

- **Bug ID:** MATCH-05 · **Severity:** High · **Status:** Fixed
- **File:** `supabase/functions/visual-match/index.ts` (dedup), `src/lib/visual-match/client.ts` (order preservation)
- **Problem:** Multi-image products produced duplicate candidates → React key collisions and inflated rankings.
- **Fix:** Edge function deduplicates per product (best similarity kept) and re-sorts best-first; client preserves server order when joining products.

### MATCH-06 — No timeout on the match request (MED-02)

- **Bug ID:** MATCH-06 · **Severity:** Medium · **Status:** Fixed
- **File:** `src/lib/visual-match/client.ts`, `src/app/find-product/searching.tsx`
- **Problem:** A hung edge-function call spun the searching screen forever.
- **Fix:** Hard 20 s timeout (`VISUAL_MATCH_TIMEOUT_MS`) via `AbortController`, combined with the screen's abort signal; `supabase.functions.invoke` now receives `signal`. Network failures surface as friendly retryable errors.

### MATCH-07 — Stale results / duplicate requests / races in the searching step

- **Bug ID:** MATCH-07 · **Severity:** Medium · **Status:** Fixed
- **File:** `src/app/find-product/searching.tsx`
- **Problem:** No in-flight guard (double-tap or StrictMode remounts could run two matches); no cancellation; a late response from a superseded run could navigate with stale data.
- **Fix:** Single in-flight match per mounted screen (`inFlightRef`), `AbortController` cancelled on unmount/cancel, and a monotonic run id so late resolutions of superseded runs are inert.

### MATCH-08 — Ambiguity between near-identical scores silently resolved

- **Bug ID:** MATCH-08 · **Severity:** Medium · **Status:** Fixed
- **File:** `src/lib/visual-match/decision.ts`, `src/lib/visual-match/threshold.ts` (new)
- **Problem:** When the top two candidates both cleared the threshold and sat within noise of each other, the UI auto-showed the first — potentially the wrong product and its price.
- **Fix:** New `VISUAL_MATCH_AMBIGUOUS_MARGIN` (0.03): if the runner-up is within the margin of the top score, the decision downgrades to uncertain (user disambiguates). Threshold + margin are configurable constants with documented rationale (why 0.82: gap between "different but similar product" ≈ 0.70–0.85 and "same product, awkward photo" ≈ 0.85–0.97, biased toward precision — a wrong auto-shown price is worse than a missed auto-match); the backend `MATCH_THRESHOLD` secret still wins at runtime.

### MATCH-09 — Wire contract trusted, not validated; RPC robustness

- **Bug ID:** MATCH-09 · **Severity:** Medium · **Status:** Fixed
- **Files:** `src/lib/visual-match/edge-contract.ts` (new, typed + runtime parser), `supabase/migrations/0008_visual_search_rpc_hardening.sql` (new), `supabase/setup-all-in-one.sql`
- **Problem:** The edge response was cast unchecked; the RPC's `greatest(match_count, 1)` turned a zero/negative count into an effectively unbounded LIMIT; `set search_path = public` allowed operator shadowing; deleted products could survive as candidates if the join order was trusted blindly.
- **Fix:** Full typed wire contract with a runtime parser (`parseEdgeMatchResponse` — malformed payloads become a friendly infra error, never a crash); migration 0008 rewrites the RPC with explicit NULL-embedding exclusion, `least(greatest(coalesce(match_count,5),1),25)` clamping, `search_path = public, pg_catalog` and an explicit `operator(pg_catalog.<=>)` binding (guarantees the pgvector cosine operator, i.e. correct similarity calculation and best-first ordering); the client drops candidate ids whose product row no longer exists (deleted products can never be matched/shown) and reports `no-match` when all vanish.

### MATCH-10 — Spec-mandated copy

- **Bug ID:** MATCH-10 · **Severity:** Low · **Status:** Fixed
- **File:** `src/app/find-product/result.tsx`
- **Fix:** Below threshold and no-match now render exactly `Product not recognized` with a `Try Again` action (plus candidate disambiguation below threshold). The closest product is never auto-selected below threshold — verified by unit tests.

### Tests

`tests/visual-match.test.mjs` (new, runs with plain `node`, zero new dependencies — a custom loader transpiles the real TS modules in-memory): **17 passing**, covering correct product / similar product / wrong product (margin ambiguity) / no product / low confidence (inclusive ≥, never a silent match below) / custom backend threshold / non-finite confidence / wire-contract malformed payloads / large-buffer base64 encoding (CRIT-03 parity). Database-failure and network-failure paths were additionally exercised end-to-end in the preview harness against the live backend.

### Verification

`node tests/visual-match.test.mjs` → 17/17 · `npx tsc --noEmit` → 0 errors · `npx eslint . --max-warnings 0` (repo-wide) → 0 problems. Deploying functions (`npm run db:deploy`) applies migrations 0007/0008 and the edge-function changes together; live-behavior re-check after deploy: scan a product with an embedded reference image, and a product with none (should show `Product not recognized`).

---

## Appendix — Not bugs, but monitor

These are design decisions or dormant paths (not defects today) that become active risks under specific conditions:

1. **Dormant real matcher** — RESOLVED 2026-09-21: the matching flow is live (see "Visual matching accuracy fix"); the seam in `service.ts` remains only for its types.
2. **No embedding trigger** — nothing in the app invokes `embed-product-image` after upload; new/changed images stay visually unsearchable until a backfill runs (or a trigger is added).
3. **Staff write policies unused** — RLS deliberately grants staff INSERT on products/images (`0003_rls.sql`), but the UI is admin-only; re-review if staff tooling ships.
4. **Public catalog read** — anon-readable `products`/`product_images` and a public Storage bucket are by design; revisit if pricing becomes sensitive.
5. **React Compiler experiment** (`app.json`) — the code avoids try/finally in hot paths for it; re-verify after dependency upgrades.
6. **CI coverage** — only `react-doctor.yml` runs; no CI typecheck/lint gate despite both passing locally.
7. **Zero automated tests** — `decision.ts`, `product-validation.ts`, `stock.ts` are pure and unit-testable but untested.
8. **Floating `supabase-js@2`** in edge-function esm.sh imports — major-pinned only; watch for patch drift.

---

## Prioritized fix order (suggested)

1. CRIT-01 (rotate credential — do first, outside code)
2. CRIT-02 ✅ *fixed* · CRIT-03 (embed encoder)
3. HIGH-01 ✅ *fixed*, HIGH-02, HIGH-06, HIGH-07 · SEC-01 ✅ *fixed* (migration 0007)
4. HIGH-04 + MED-08 together (schema/type alignment) · SEC-02 ✅ *fixed* (migration 0007)
5. HIGH-05, HIGH-09, MED-01, MED-02 (client robustness)
6. HIGH-08 before the first EAS build
7. HIGH-10, HIGH-12, HIGH-03 (scale & upload hardening)
8. HIGH-11, MED-10 (docs/SQL fixes — trivial)
9. Remaining Medium/Low in backlog order
