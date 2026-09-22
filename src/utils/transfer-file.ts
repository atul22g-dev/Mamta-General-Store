/**
 * Getting an exported catalog OUT of the app, and an edited file BACK IN —
 * the only place that touches a file system, a download, or a share sheet.
 *
 * ▼ WHY IT IS ITS OWN MODULE
 *   The two platforms could hardly be more different, and both paths have to
 *   survive being unplugged from each other:
 *
 *   SAVE   web    → a Blob download (no permission, opens in the browser's
 *                   Downloads, and the user's own spreadsheet app can open it)
 *          device → written to the app's cache directory and handed to the
 *                   system share sheet (WhatsApp, Drive, Files…): a sandboxed
 *                   phone app has no "save as" of its own
 *
 *   PICK   web    → expo-document-picker returns a data: URI (the file's own
 *                   bytes), which fetch reads directly
 *          device → returns a file:// path, read through expo-file-system
 *
 *   Everything above is why the two errors a user can actually hit are
 *   reported in their own words ("Sharing is not available on this device")
 *   rather than as a generic failure.
 *
 * ▼ ONE FILE AT A TIME, AND NEVER SILENTLY
 *   Picking is cancellable, and a cancelled pick is NOT an error — it returns
 *   `{ ok: true, data: null }` so the screen can simply do nothing.
 */
import { Platform } from 'react-native';
import { MAX_IMPORT_BYTES } from '@/services/product-transfer-rules';

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type PickedFile = { name: string; text: string; size: number | null };

/** What the import picker accepts. `text/*` covers the odd CSV mime types
 *  Android file managers report (application/vnd.ms-excel, text/plain…). */
const IMPORT_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'text/plain',
  'text/*',
  'application/json',
  'application/csv',
  'application/vnd.ms-excel',
];

function isDevicePath(uri: string): boolean {
  return /^file:|^content:/i.test(uri);
}

// ---------------------------------------------------------------------------
// Save (export)
// ---------------------------------------------------------------------------

/**
 * Hands an exported file to the user: a download on web, the share sheet on a
 * device. Returns a short description of what happened, for the status line.
 */
export async function saveTransferFile(file: {
  filename: string;
  mimeType: string;
  text: string;
}): Promise<ServiceResult<string>> {
  if (Platform.OS === 'web') {
    try {
      const blob = new Blob([file.text], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoke on the next tick: revoking synchronously can cancel the download
      // in some browsers before it has read the blob.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return { ok: true, data: `Downloaded ${file.filename}` };
    } catch {
      return { ok: false, error: 'The browser blocked the download. Try again, or open the app on a phone.' };
    }
  }

  try {
    const { File, Paths } = await import('expo-file-system');
    const target = new File(Paths.cache, file.filename);
    if (target.exists) target.delete();
    target.create();
    target.write(file.text);

    const Sharing = await import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) {
      return {
        ok: false,
        error: `Sharing is not available on this device. The file was saved to the app's cache as ${file.filename}.`,
      };
    }

    await Sharing.shareAsync(target.uri, {
      mimeType: file.mimeType,
      dialogTitle: 'Save or send your product file',
      UTI: file.mimeType === 'text/csv' ? 'public.comma-separated-values-text' : 'public.json',
    });

    return { ok: true, data: `Ready to share ${file.filename}` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `Could not create the file: ${error.message}` : 'Could not create the file.',
    };
  }
}

// ---------------------------------------------------------------------------
// Pick (import)
// ---------------------------------------------------------------------------

/** Reads a picked file's text, whichever kind of URI the picker returned. */
async function readText(uri: string): Promise<string> {
  if (isDevicePath(uri)) {
    const { File } = await import('expo-file-system');
    const file = new File(uri);
    if (!file.exists) throw new Error('That file is no longer available. Pick it again.');
    return await file.text();
  }

  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Could not read the file (HTTP ${response.status}).`);
  return await response.text();
}

/**
 * Opens the file picker for a CSV/JSON product file.
 * A cancelled pick is a success with no data.
 */
export async function pickTransferFile(): Promise<ServiceResult<PickedFile | null>> {
  try {
    const DocumentPicker = await import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({
      type: IMPORT_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { ok: true, data: null };
    }

    const asset = result.assets[0];

    if (typeof asset.size === 'number' && asset.size > MAX_IMPORT_BYTES) {
      const mb = (asset.size / (1024 * 1024)).toFixed(1);
      return { ok: false, error: `That file is ${mb} MB. The limit is 5 MB — split it into smaller files.` };
    }

    let text: string;
    try {
      text = await readText(asset.uri);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Could not read that file.',
      };
    }

    return {
      ok: true,
      data: { name: asset.name ?? 'products.csv', text, size: typeof asset.size === 'number' ? asset.size : null },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `Could not open the file picker: ${error.message}` : 'Could not open the file picker.',
    };
  }
}
