# Find Product Image Pipeline Fixes

## Summary

The Find Product image capture and preprocessing pipeline had several gaps:
no file existence validation, fragile MIME detection, no size checks before
conversion, and missing error states for invalid images. These issues could
cause silent failures, confusing error messages, or corrupted payloads
reaching the embedding engine.

## Pipeline Traced

```
Find Product
  → Camera (takePictureAsync) or Gallery (launchImageLibraryAsync)
  → scanSession.setShot(uri)
  → Preview (display shot)
  → Searching (validateAndConvert → matchProductFromPhoto)
  → Edge Function (embed → vector search → products)
```

### Step-by-step:

1. **Camera/Gallery** captures or picks an image → local `file://` URI
2. **scanSession** stores the URI in memory (not route params)
3. **Preview** displays the image from the URI
4. **Searching** calls `validateAndConvert(uri)`:
   a. Validates file exists via `expo-file-system` `File` API
   b. Checks file size ≤ 5 MB
   c. Detects MIME from URI extension (`.jpg` → JPEG, `.png` → PNG)
   d. Reads binary bytes
   e. Converts to base64 data URI
   f. Validates data URI size ≤ ~7 MB
5. **Client** validates data URI format (JPEG/PNG only, no WebP)
6. **Edge Function** receives `data:image/...;base64,...` → MobileCLIP-S0

## Issues Found and Fixed

### 1. No file existence check before reading (HIGH)

**Before:** `fileUriToDataUri` called `new File(uri).arrayBuffer()` without
checking `file.exists`. If the file was deleted between capture and
conversion (e.g. app backgrounded, OS purged temp files), the read would
throw an opaque error.

**After:** Both `validateImageFile()` and `fileUriToDataUri()` now check
`file.exists` before reading. Clear error message: "The image file is no
longer available."

### 2. No file size validation before conversion (MEDIUM)

**Before:** Large images (>5 MB) were fully read into memory, converted to
base64 (~33% larger), and only then checked against the size limit. On
low-memory devices this could cause OOM crashes.

**After:** `validateImageFile()` checks `buffer.byteLength` immediately
after reading. Rejected early with "Image is too large (X MB)."

### 3. Gallery picker didn't validate picked images (MEDIUM)

**Before:** `useGalleryPick` passed the URI directly to `scanSession`
without checking if the file existed or was a supported format.

**After:** Gallery picks are validated via `validateImageFile()` before
proceeding. Invalid images show an alert and stay on the current screen.

### 4. Camera capture didn't validate format (MEDIUM)

**Before:** Camera captures were trusted without validation. HEIC/HEIF
images (common on iOS) were passed through with no format normalization.

**After:** Camera captures are validated via `validateImageFile()`. HEIC/HEIF
extensions are mapped to `image/jpeg` by `detectMimeTypeFromUri()` (they're
transcoded by expo-image-picker before reaching the pipeline).

### 5. MIME detection was fragile (LOW)

**Before:** `fileUriToDataUri` tried to detect MIME from a `type=image/...`
URL parameter fragment, which is unreliable across platforms and often absent.

**After:** MIME is detected from the file extension (`.jpg`→JPEG, `.png`→PNG,
`.heic`→JPEG). HEIC/HEIF are always treated as JPEG since expo-image-picker
transcodes them. WebP falls back to JPEG with a clear downstream error.

### 6. Empty file not handled (LOW)

**Before:** A 0-byte file would produce an empty base64 string, creating a
data URI that passes regex validation but fails at the edge function.

**After:** `fileUriToDataUri` checks `bytes.length === 0` and throws
"The image file is empty. Try capturing a new photo."

### 7. Searching screen used generic error messages (LOW)

**Before:** `searching.tsx` caught all errors with "Could not read the
captured photo. Try again." regardless of the actual cause.

**After:** Uses `validateAndConvert()` which returns specific messages:
- "No image selected"
- "The image file is no longer available"
- "Image is too large (X MB)"
- "Image is too large for analysis"

## Architecture: `image-pipeline.ts`

New module `src/lib/image-pipeline.ts` — shared image validation and
conversion utilities with zero React Native UI dependencies:

| Function | Purpose |
|---|---|
| `validateImageFile(uri)` | Check file exists + size ≤ 5 MB |
| `detectMimeTypeFromUri(uri)` | Extension → MIME type |
| `detectMimeTypeFromDataUri(uri)` | Parse data URI MIME |
| `validateAndConvert(uri)` | Full pipeline: validate → read → convert |
| `isValidEmbeddingDataUri(uri)` | Validate data URI for embedding engine |

`client.ts` uses `isValidEmbeddingDataUri()` instead of its local copy.
`searching.tsx` uses `validateAndConvert()` instead of raw `fileUriToDataUri`.

## Format Support

| Format | Camera | Gallery | Embedding Engine | Notes |
|---|---|---|---|---|
| JPEG | ✓ | ✓ | ✓ | Default on Android |
| PNG | ✓ | ✓ | ✓ | Supported everywhere |
| HEIC/HEIF | — | ✓ (iOS) | ✓ (as JPEG) | Transcoded by expo-image-picker |
| WebP | — | ✓ | ✗ | Falls back to JPEG → edge function rejects |
| GIF | — | ✓ | ✗ | Rejected by isValidEmbeddingDataUri |

## Tests Added

`tests/image-pipeline.test.mjs` — 27 tests covering:

- `detectMimeTypeFromUri`: JPEG, PNG, HEIC, HEIF, unknown, no extension, paths, case insensitivity
- `detectMimeTypeFromDataUri`: JPEG, PNG, invalid, empty
- `isValidEmbeddingDataUri`: valid JPEG/PNG, WebP/GIF rejection, empty base64, non-base64 chars, size limits
- Constants: SUPPORTED_MIME_TYPES, MAX_IMAGE_BYTES, MAX_DATA_URI_CHARS
- `bytesToBase64`: large buffer round-trip, empty input

## Verification

- `npx tsc --noEmit` — 0 errors
- `npm run lint` — 0 problems
- `node tests/image-pipeline.test.mjs` — 27 passed, 0 failed
- `node tests/embedding-generation.test.mjs` — 14 passed, 0 failed
