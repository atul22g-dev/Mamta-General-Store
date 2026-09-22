/**
 * Ephemeral in-memory session stores for the Find Product flow.
 *
 * One module for both handoffs — the captured photo and the computed match
 * result — because they are two halves of the same scan-to-price session.
 * No persistence and no route params: photo URIs and result objects must
 * not be serialized into navigation history, and a scan is ephemeral by
 * design. camera/gallery writes the shot, preview reads/clears it,
 * searching computes the outcome, result reads it.
 */

import type { VisualMatchOutcome } from '@/services/product-search.service';
import type { ProductWithImages } from '@/services/product.service';

export type ScanShot = {
  /** Local file URI of the single captured photo. */
  uri: string;
  /** Epoch ms when the shutter fired. */
  capturedAt: number;
};

// --- Photo handoff: camera/gallery → preview → searching -------------------

let currentShot: ScanShot | null = null;

export const scanSession = {
  getShot(): ScanShot | null {
    return currentShot;
  },
  setShot(uri: string): ScanShot {
    currentShot = { uri, capturedAt: Date.now() };
    return currentShot;
  },
  clearShot(): void {
    currentShot = null;
  },
};

// --- Result handoff: searching → result ------------------------------------

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
