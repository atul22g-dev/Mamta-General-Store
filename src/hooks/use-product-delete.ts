import { useCallback, useState } from 'react';

import { deleteProductWithStorage } from '@/services/product.service';

export type DeleteOutcome = { ok: true } | { ok: false; error: string };

/**
 * Storage-aware product delete for the admin detail screen.
 * Screen → Hook → Service → Supabase: the screen confirms with the user and
 * renders the busy state; this hook owns the in-flight guard and outcome;
 * the service owns row delete + cascade + Storage cleanup.
 *
 * Retention rule (see deleteProductWithStorage): the product's Storage
 * objects are removed with the row — rows and their files die together, so
 * no orphaned images linger and no half-state can survive a successful call.
 */
export function useProductDelete(): {
  deletingId: string | null;
  /** Runs the delete; returns a result (never throws). */
  deleteProduct: (productId: string) => Promise<DeleteOutcome>;
} {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteProduct = useCallback(async (productId: string): Promise<DeleteOutcome> => {
    setDeletingId(productId);

    // Service errors come back as results, not throws — an unexpected
    // rejection (offline, crash mid-request) becomes a failed result so
    // the busy flag always resets below, on every path.
    let result: Awaited<ReturnType<typeof deleteProductWithStorage>>;
    try {
      result = await deleteProductWithStorage(productId);
    } catch {
      result = { ok: false, error: 'Something went wrong. Please try again.' };
    }

    setDeletingId(null);

    if (result.ok) return { ok: true };
    return { ok: false, error: result.error };
  }, []);

  return { deletingId, deleteProduct };
}
