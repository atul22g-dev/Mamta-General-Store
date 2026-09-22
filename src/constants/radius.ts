/**
 * Corner radius scale.
 *
 * Tuned for the "vibrant & block-based" retail style: shapes are noticeably
 * rounded, so a card, a chip and an image tile read as one family. Every
 * surface in the app takes its radius from here, which is why one change
 * here modernises all of them at once.
 */
export const Radius = {
  none: 0,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  full: 9999,
} as const;

export type RadiusKey = keyof typeof Radius;
