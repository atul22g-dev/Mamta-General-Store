# Find Product UI Flow — Audit & Fixes

**Date:** 2026-09-22
**Scope:** Complete state machine analysis of the Find Product feature (5 screens + 2 session stores + 1 shared hook)

---

## Screens Analyzed

| Screen | Path | Responsibility |
|--------|------|----------------|
| **index.tsx** | `/find-product` | Entry point — camera + gallery buttons, tips |
| **camera.tsx** | `/find-product/camera` | Live viewfinder, permission flow, capture |
| **preview.tsx** | `/find-product/preview` | Photo review, Use Photo / Retake |
| **searching.tsx** | `/find-product/searching` | Embedding + vector search, stage progress |
| **result.tsx** | `/find-product/result` | Match display, similar products, actions |

---

## State Machine

```
index ──(shutter tap)──→ camera ──(capture OK)──→ preview ──(Use Photo)──→ searching ──(success)──→ result
  │                        │                         │                         │
  │                        │                         │                         ├─(error)──→ retry / cancel / manual search
  │                        │                         │                         │
  │                        │                         │                         └─(cancel)──→ tabs
  │                        │                         │
  │                        │                         └──(Retake)──→ camera
  │                        │
  │                        └──(gallery pick)──→ preview
  │
  └──(gallery pick)──→ preview
```

---

## Guard Inventory — Every Concurrency / Race / Leak Path

### 1. Camera double-tap guard (`camera.tsx:266`)
```typescript
if (capturing) return; // double-tap guard — exactly one photo per press
```
- `capturing` state disables the shutter button AND prevents `handleCapture` re-entry
- Gallery button also disabled during capture: `disabled={picking || capturing}`
- **Verdict:** Solid. No double-capture possible.

### 2. Gallery pick busy flag (`use-gallery-pick.ts:25`)
```typescript
if (picking) return; // guard against double taps
```
- `picking` state disables gallery button AND prevents re-entry
- Both index.tsx and camera.tsx pass `picking` to `disabled` prop on their gallery buttons
- **Verdict:** Solid. No double-pick possible.

### 3. In-flight guard (`searching.tsx:108`)
```typescript
if (inFlightRef.current) return;
inFlightRef.current = true;
```
- Prevents duplicate match runs from StrictMode remounts or retry taps
- Reset on every exit path (success, error, no-shot, stale)
- **Verdict:** Solid. At most one match runs per screen mount.

### 4. StrictMode / effect guard (`searching.tsx:169-173`)
```typescript
if (startedRef.current) return;
startedRef.current = true;
void runMatch();
```
- `startedRef` ensures `runMatch` fires exactly once per mount even in StrictMode
- Combined with `inFlightRef`, this is defense-in-depth
- **Verdict:** Solid.

### 5. AbortController cleanup (`searching.tsx:97-104`)
```typescript
useEffect(() => {
  return () => {
    abortRef.current?.abort();
    runIdRef.current += 1;
  };
}, []);
```
- Unmount cancels the network request
- `runId` bump makes late resolutions of the superseded run inert
- **Verdict:** Solid. No memory leak or stale navigation.

### 6. Stale result prevention (`searching.tsx:126, 154`)
```typescript
const isStale = () => runId !== runIdRef.current;
// ... after async work:
if (isStale()) return; // superseded/cancelled run — touch nothing
```
- Every state-setting path after an async boundary checks `isStale()`
- Prevents late edge function responses from navigating to result or setting error state
- **Verdict:** Solid. No stale data reaches the result screen.

### 7. Scan session handoff (`scan-session.ts`)
- Module-level singleton: `let currentShot: ScanShot | null = null`
- Camera/galerry writes via `setShot()`, searching reads via `getShot()`, searching clears via `clearShot()`
- Result screen reads via `matchSession` (separate store)
- No route-param serialization of file URIs
- **Verdict:** Clean. Ephemeral by design, no persistence.

### 8. Match session handoff (`session.ts`)
- Module-level singleton with `setResult()`, `getResult()`, `setManualResult()`, `getManualResult()`, `clear()`
- `setResult` clears manual result and vice versa (mutual exclusion)
- Result screen reads once on mount, never re-reads
- **Verdict:** Clean. No stale data across sessions.

---

## Error Handling Inventory

### Camera capture failure (`camera.tsx:274-287`)
- `takePictureAsync` failure → caught, `photo` set to `null` → user sees "Capture failed — try again."
- No try/finally (React Compiler compatibility — busy flag mirrored on every path)
- **Verdict:** Handled. User gets actionable error.

### Image validation failure (`camera.tsx:290-295`, `use-gallery-pick.ts:70-75`)
- `validateImageFile()` checks file existence, size, MIME type
- Camera: error shown inline below the viewfinder
- Gallery: shown as an alert
- **Verdict:** Handled. Specific, actionable errors.

### No photo in session (`searching.tsx:117-124`)
- If `scanSession.getShot()` returns null → immediate error state
- **Verdict:** Handled.

### Data URI conversion failure (`searching.tsx:132-150`)
- `validateAndConvert()` checks file, size, MIME before reading bytes
- Errors shown inline in error state
- **Verdict:** Handled.

### Edge function failure (`client.ts:126-128`)
- Network error, timeout, or edge function error → `ok: false` with user-friendly message
- Timeout via `withTimeout()` — hard limit at `VISUAL_MATCH_TIMEOUT_MS`
- **Verdict:** Handled. No infinite spinner possible.

### Product not found in DB (`client.ts:162-165`)
- Products deactivated between RPC and fetch → logged, excluded from results
- Status recalculated based on what DB actually returned
- **Verdict:** Handled. Defense in depth.

### Result screen empty state (`result.tsx:353-368`)
- No session data → "No result yet" with scan action
- **Verdict:** Handled.

### Result screen no-match (`result.tsx:371-412`)
- `decision.kind === 'none'` → "Product not found" with search/scan actions
- **Verdict:** Handled.

---

## Navigation Safety

| Transition | Method | Safety |
|-----------|--------|--------|
| Camera → Preview | `router.push` | After `scanSession.setShot()` — URI is in memory |
| Preview → Searching | `router.push` | After confirming `shot` exists |
| Searching → Result | `router.replace` | After `matchSession.setResult()` — replaces history entry |
| Searching → Tabs | `router.dismissTo` | On cancel — clears entire Find Product stack |
| Result → Tabs | `router.dismissTo` | On done — clears stack |
| Result → Camera | `router.replace` | On scan again — fresh start |
| Any → Back | `router.back` / `router.canGoBack()` | Graceful fallback if can't go back |

**Verdict:** Navigation is clean. `replace` used correctly for state transitions, `dismissTo` for exits, `push` for linear flow.

---

## Memory / Resource Leaks

| Resource | Lifecycle | Cleanup |
|----------|-----------|---------|
| `AbortController` | Per match run | Aborted on unmount + stale runId bump |
| `StageList` timer | Per searching mount | `clearInterval` on unmount |
| `scanSession.currentShot` | Per scan flow | `clearShot()` on searching success + cancel |
| `matchSession` state | Per result display | `clear()` on done / scan again / manual search |
| Camera ref | Per camera mount | Unmounted with component |

**Verdict:** No leaks. All resources cleaned up on every exit path.

---

## UX Quality Observations

1. **Stage progress indicator** (`searching.tsx:31-72`): `StageList` advances on a 1.4s cadence so the wait communicates progress instead of a silent spinner. Visual-only — not tied to actual pipeline stages. Acceptable for UX.

2. **Error retry flow** (`searching.tsx:196-209`): Error state offers three options — retry (re-runs match), search manually (navigates to text search), cancel (goes to tabs). Comprehensive.

3. **Result screen similar product selection** (`result.tsx:348-350`): Clicking a similar product promotes it to the main card. "View original match" button restores the original. Duplicate display prevented by filtering `selectedCandidate` from the similar list (`result.tsx:327-329`).

4. **Gallery pick from denied camera** (`camera.tsx:85-90`): If camera is denied, the user can still pick from gallery — graceful degradation.

5. **Photo preview no-shot state** (`preview.tsx:50-67`): If the user navigates to preview without a photo (deep link, back button edge case), they see "No photo yet" with a camera action. Not a dead end.

---

## Verdict

The Find Product UI flow is **well-engineered**:

- **Concurrency:** 4 overlapping guards (`capturing`, `picking`, `inFlightRef`, `startedRef`) prevent every double-action scenario
- **Stale data:** `runId` + `isStale()` checks at every async boundary
- **Cleanup:** AbortController, timers, session stores all cleaned on every exit path
- **Errors:** Every failure mode has a specific, actionable user message + retry path
- **Navigation:** `replace` for state transitions, `dismissTo` for exits, no dead ends
- **Compiler safety:** No try/finally patterns — busy flags mirrored on every path (React Compiler compatible)

**No code changes required.** The flow handles all edge cases correctly.

---

## Prior Fixes in This Session

The following files were fixed in earlier commits (not UI flow, but supporting infrastructure):

| Commit | File | Fix |
|--------|------|-----|
| `8183fbb` | `src/types/database.ts` | `embedding: string \| null` |
| `f27c167` | `src/types/database.ts` | `query_embedding: number[]` |
| `13db253` | `src/lib/products/embedding-service.ts` | Shared `generateProductEmbedding()` |
| `f3db125` | `src/lib/image-pipeline.ts` | Shared `validateAndConvert()` |
| `bb88f16` | `supabase/functions/_shared/embedding.ts` | `validateEmbeddingVector()` |
| `5fae491` | `supabase/functions/visual-match/index.ts` | Structured logging |
| `264664e` | `src/app/find-product/result.tsx` | Duplicate display fix, `MAX_SIMILAR_PRODUCTS` |
| `cde587b` | `src/lib/format.ts` | String-to-number coercion, dev logging |
