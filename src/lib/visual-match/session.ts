import type { VisualMatchOutcome } from '@/lib/visual-match/client';
import type { ScanShot } from '@/lib/scan-session';
import type { ProductWithImages } from '@/lib/products/product-service';

/**
 * Session result store: searching writes the computed outcome + the photo,
 * result reads it. Same ephemeral pattern as scanSession — no persistence,
 * no route-param serialization of complex data.
 */

let currentOutcome: VisualMatchOutcome | null = null;
let currentPhoto: ScanShot | null = null;

/**
 * Product picked via MANUAL SEARCH (the fallback path). The result screen
 * renders it exactly like a visual match — with the current DB price —
 * but without a fabricated similarity score.
 */
let manualProduct: ProductWithImages | null = null;

export const matchSession = {
  setResult(outcome: VisualMatchOutcome, photo: ScanShot | null): void {
    currentOutcome = outcome;
    currentPhoto = photo;
    manualProduct = null;
  },
  getResult(): { outcome: VisualMatchOutcome; photo: ScanShot | null } | null {
    if (!currentOutcome) return null;
    return { outcome: currentOutcome, photo: currentPhoto };
  },

  /** Manual fallback: search screen stores the chosen product. */
  setManualResult(product: ProductWithImages): void {
    manualProduct = product;
    currentOutcome = null;
    currentPhoto = null;
  },
  getManualResult(): ProductWithImages | null {
    return manualProduct;
  },

  clear(): void {
    currentOutcome = null;
    currentPhoto = null;
    manualProduct = null;
  },
};
