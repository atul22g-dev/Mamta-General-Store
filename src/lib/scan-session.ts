/**
 * In-memory handoff for one scan-to-price session.
 *
 * The captured photo is a local file URI that must not go through route
 * params (they are strings, get serialized, and bloat history). A module
 * store keeps the flow self-contained: camera writes, preview reads,
 * searching clears. No persistence — a scan is ephemeral by design.
 */

export type ScanShot = {
  /** Local file URI of the single captured photo. */
  uri: string;
  /** Epoch ms when the shutter fired. */
  capturedAt: number;
};

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
