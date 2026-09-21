# DEAD CODE REPORT (Phases 11–12)

**Method:** every candidate was checked against (1) all static imports, (2) dynamic imports,
(3) Expo Router route conventions, (4) test files, (5) config/scripts references, (6) docs,
(7) string-based references — via full-repository text search (grep + `git grep`). Deletion was
followed by re-running `npx tsc --noEmit`, `npm run lint`, and all four node test suites.

## Classification

| Candidate | Evidence checked | Classification | Action |
|---|---|---|---|
| `src/components/products/product-card.tsx` | zero imports of the file; zero usages of the `ProductCard` symbol anywhere in `src/` or `tests/` (grep hits were the unrelated `SimilarProductCard` in `find-product/result.tsx`); superseded by `product-row.tsx` (used by admin products list) and inline cards | **SAFE_TO_DELETE** | **DELETED** — re-verified: no references remain, tsc 0 errors, lint clean, 83/83 tests pass |
| `src/types/css.d.ts` | `src/constants/theme.ts` imports `@/global.css`; without this ambient module declaration `tsc` fails | **KEEP** | kept |
| `supabase/sync-product-options.sql` | no code references; but it is a Dashboard-paste SQL tool, self-marked DEPRECATED with an explicit "do not run on production" warning, and referenced by `docs/BUG-AUDIT.md` / `SECURITY_AUDIT.md` as historical record | **UNCERTAIN** | kept (deletion is the owner's call; it is documentation-grade history, not runtime code) |
| `supabase/fix-product-images.sql` | no code references; standalone idempotent repair script for a real, documented RLS failure mode (referenced in `docs/BUG-AUDIT.md`, `FINAL_BUG_REPORT.md`, `SECURITY_AUDIT.md`) | **KEEP** (repair tooling) | kept |
| `scripts/export-mobileclip-onnx.mjs` | only path to produce the MobileCLIP ONNX artifact for the opt-in provider; needs dev deps not currently installed | **KEEP** (required if the free local-model path is ever enabled) | kept |
| `supabase/setup-all-in-one.sql` | referenced by README (setup + troubleshooting), deploy script failure hints | **KEEP** | kept |
| All `src/app/**` files | Expo Router file-based routes — route files must never be deleted; every screen is reachable (`find-product/*` stack verified in `_layout.tsx`) | **KEEP** | kept |
| `tests/*.mjs` + `tests/alias-loader*.mjs` | executed test suites (83 assertions, all passing); loaders are registered by the tests | **KEEP** | kept |
| `src/components/animated-icon(.web).tsx`, `app-tabs(.web).tsx`, `auth-storage(.native).ts`, `use-color-scheme(.web).ts` | platform-split implementations — Metro resolves the extension variants at graph level; the base file *is* the reference | **KEEP** | kept |
| `src/hooks/*`, `src/lib/*`, `src/constants/*` | every file resolved to at least one importer in the orphan sweep (scripted import-graph check over `src/`) | **KEEP** | kept |
| Historical docs (`BUG_AUDIT.md`, `docs/BUG-AUDIT.md`, `*_FIXES.md`, `FINAL_BUG_REPORT.md`, `SECURITY_AUDIT.md`, `FIND_PRODUCT_*.md`) | documentation/history, zero runtime impact | **KEEP** | kept |
| `.expo/`, `.expo-fulltest/`, `.claude/`, `.freebuff/`, `.vscode/`, `.github/` | tooling/IDE/CI config; `.expo*` are gitignored build artifacts | **KEEP** | kept |
| `assets/` | referenced by `app.json` (icons/splash) | **KEEP** | kept |

## Summary

- **Deleted:** 1 file — `src/components/products/product-card.tsx` (proven unused component).
- **Kept with rationale:** everything else, including two UNCERTAIN SQL scripts whose disposal
  belongs to the project owner.
- **Post-deletion verification:** `npx tsc --noEmit` → 0 errors; `npm run lint` → clean;
  `node tests/visual-match.test.mjs` 18/18 · `image-pipeline` 23/23 · `search-embedding` 28/28 ·
  `embedding-generation` 14/14.

---

# PASS 2 — full sweep: unused files, dependencies, config drift

Second pass after the Find Product fix: every tracked file, every dependency, and every
npm-script/doc reference re-verified with the same reference-analysis method.

## Dependencies removed (package.json 31 → 26 deps, lockfile pruned via npm uninstall)

| Package | Evidence | Verdict |
|---|---|---|
| `expo-application` | 0 imports in src/tests/scripts/config; 0 installed packages depend on it; not an SDK peer | REMOVED |
| `expo-device` | same checks | REMOVED |
| `expo-status-bar` | same checks; no `StatusBar` component anywhere in src | REMOVED |
| `expo-system-ui` | same checks; 0 transitive users | REMOVED |
| `expo-web-browser` | same checks | REMOVED |

**Explicitly kept after verification (looked unused but are not):**
- `expo-glass-effect`, `expo-symbols` — direct **dependencies of expo-router** (its package.json).
- `expo-font` — peer of `@expo/vector-icons`.
- `react-native-worklets` — imported by `animated-icon.tsx` AND the reanimated-4 worklet runtime.
- `expo-linking`, `react-dom`, `react-native-web`, `expo-splash-screen`, `expo-constants`,
  `expo-sqlite`, `@react-native-async-storage/async-storage` — all directly imported
  (router/peer/web platform split/session storage) or SDK peers of installed packages.
- `expo-doctor` 21/21 checks passed after removal — SDK version contract intact.

## Files removed / moved

| Candidate | Evidence | Verdict |
|---|---|---|
| 11 root-level historical reports (`BUG_AUDIT.md`, `DATABASE_FIXES.md`, `EMBEDDING_FIXES.md`, `FIND_PRODUCT_IMAGE_FIXES.md`, `FIND_PRODUCT_UI_FIXES.md`, `MATCH_RESULT_FIXES.md`, `PRICE_DISPLAY_FIXES.md`, `RPC_FIXES.md`, `SEARCH_EMBEDDING_FIXES.md`, `SECURITY_AUDIT.md`, `FINAL_BUG_REPORT.md`) | zero references from code/config/README; superseded by the current AUDIT/ROOT-CAUSE/DATABASE_FIX/TEST/FINAL reports; kept out of the repo root | MOVED to `docs/archive/` (history preserved, not deleted) |
| `.claude/settings.json` (tracked) | tool-personal config; zero references anywhere in the repo | DELETED |
| `.expo-fulltest/`, `.freebuff/`, `.vscode/`, `.github/`, `assets/*`, `expo-env.d.ts` | tool/CI/IDE/build artifacts; assets referenced by app.json | KEEP |
| `src/hooks/use-responsive.ts`, `src/constants/motion.ts`, `src/components/animated-icon(.web).tsx` + `.module.css`, `src/types/css.d.ts`, `src/config/products.ts` | re-checked with import-graph sweep — ALL referenced (home/admin screens, splash overlay, `@/global.css` typing, form config) | KEEP |
| `supabase/sync-product-options.sql`, `supabase/fix-product-images.sql` | still UNCERTAIN per pass 1 (deprecated-but-documented Dashboard tools) | KEEP |

## Config drift fixed (optimization)

- README documented `npm run deploy:functions` / `npm run deploy:probe` — **these scripts never
  existed in any commit**. Replaced with the real command (`npm run db:deploy [-- --check]`) plus
  the schema-repair note, so onboarding instructions match reality.
- `client.ts` re-exported `analyzeMatchOutcome` while the only consumer imports it directly from
  `decision.ts` — redundant re-export removed.

## Final verification (after all pass-2 changes)

`npx tsc --noEmit` → 0 errors · `npm run lint` → clean · 83/83 unit tests ·
`npx expo-doctor` → **21/21 checks passed** · working tree clean, changes in
`cleanup: remove unused files, dependencies, and doc drift`.

## Rollback

The deletion is a single file removal captured in its own commit
(`cleanup: remove verified dead code`). If any environment proves otherwise,
`git revert` of that commit restores it instantly.
