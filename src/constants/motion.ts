import { Easing } from 'react-native-reanimated';

/**
 * Motion tokens — one shared vocabulary for micro-interactions and
 * entrances, so every screen moves with the same rhythm.
 *
 * - fast (150ms): press feedback, toggles
 * - base (220ms): hovers, small state changes
 * - slow (320ms): screen/section entrances
 */
export const Motion = {
  fast: 150,
  base: 220,
  slow: 320,
  easing: {
    /** Standard deceleration for entrances and movement. */
    standard: Easing.out(Easing.cubic),
    /** Gentle linear-ish motion for looping elements (pulses, shimmer). */
    ambient: Easing.inOut(Easing.quad),
  },
} as const;
