import { useCallback, useState } from 'react';

import {
  describePlan,
  type ExportFormat,
  type ImportPlan,
} from '@/services/product-transfer-rules';
import {
  applyImportPlan,
  exportCatalog,
  exportEmptyTemplate,
  readImportPlan,
  type ImportOutcome,
} from '@/services/product-transfer.service';
import { pickTransferFile, saveTransferFile } from '@/utils/transfer-file';
import { alert } from '@/utils/alert';

/** The import workflow's phases, in order. */
export type ImportPhase = 'idle' | 'picking' | 'preview' | 'applying' | 'done';

/** Human sentence for a successful export (module-level: pure, testable). */
function exportSuccessMessage(
  empty: boolean,
  count: number,
  location: string,
): string {
  if (empty) {
    return 'Template ready — fill in one row per product and import it back.';
  }
  return `${count} product${count === 1 ? '' : 's'} exported. ${location}`;
}

/**
 * All export/import state and actions for the transfer screen, so the screen
 * itself stays a pure view (Screen → Hook → Service). Behavior is identical
 * to the previous inline implementation:
 *
 *   • runExport     — export the catalog or an empty template, hand the file
 *                     to the share sheet, and report the outcome.
 *   • chooseFile    — pick a file, plan the import, land on the preview.
 *   • confirmImport — apply the previewed plan.
 *   • reset         — clear everything back to idle.
 */
export function useProductTransfer() {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const busy = exporting || phase === 'picking' || phase === 'applying';

  // --- Export --------------------------------------------------------------
  const runExport = useCallback(
    async (empty: boolean) => {
      if (busy) return;
      setExporting(true);
      setExportMessage(null);

      const exported = empty ? await exportEmptyTemplate() : await exportCatalog(format);

      if (!exported.ok) {
        setExporting(false);
        alert('Export failed', exported.error);
        return;
      }

      const saved = await saveTransferFile(exported.data);
      setExporting(false);

      if (!saved.ok) {
        alert('Could not hand over the file', saved.error);
        return;
      }

      setExportMessage(
        exportSuccessMessage(empty, exported.data.count, saved.data),
      );
    },
    [busy, format],
  );

  // --- Import: choose + plan ----------------------------------------------
  const chooseFile = useCallback(async () => {
    if (busy) return;
    setPhase('picking');
    setImportError(null);
    setOutcome(null);

    const picked = await pickTransferFile();
    if (!picked.ok) {
      setPhase('idle');
      alert('Could not open that file', picked.error);
      return;
    }
    if (picked.data === null) {
      setPhase('idle'); // cancelled — not an error
      return;
    }

    const planned = await readImportPlan(picked.data.text, picked.data.name);
    if (!planned.ok) {
      setPhase('idle');
      setImportError(planned.error);
      setFileName(picked.data.name);
      return;
    }

    setFileName(picked.data.name);
    setPlan(planned.data.plan);
    setPhase('preview');
  }, [busy]);

  const reset = useCallback(() => {
    setPlan(null);
    setFileName(null);
    setOutcome(null);
    setImportError(null);
    setPhase('idle');
  }, []);

  // --- Import: apply -------------------------------------------------------
  const confirmImport = useCallback(async () => {
    if (!plan || phase === 'applying') return;
    setPhase('applying');

    const applied = await applyImportPlan(plan);

    if (!applied.ok) {
      setPhase('preview');
      alert('Import failed', applied.error);
      return;
    }

    setOutcome(applied.data);
    setPlan(null);
    setPhase('done');
  }, [plan, phase]);

  return {
    // export state
    format,
    setFormat,
    exporting,
    exportMessage,
    runExport,
    // import state
    phase,
    fileName,
    plan,
    outcome,
    importError,
    busy,
    writableCount: plan?.writable.length ?? 0,
    // import actions
    chooseFile,
    reset,
    confirmImport,
    // presentation helpers (re-exported for the cards)
    describePlan,
  };
}
