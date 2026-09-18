/**
 * Elevation tokens.
 *
 * Uses the unified `boxShadow` string format supported natively since
 * RN 0.76 and required by react-native-web (the legacy `shadow*` props
 * are deprecated). Each level layers a tight contact shadow with a wide
 * ambient one — the modern way to get depth without gray mud.
 */
export const Shadows = {
  none: {},
  sm: {
    boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.05), 0 2px 8px 0 rgba(15, 23, 42, 0.06)',
  },
  md: {
    boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 8px 24px 0 rgba(15, 23, 42, 0.09)',
  },
  lg: {
    boxShadow: '0 2px 4px 0 rgba(15, 23, 42, 0.04), 0 16px 40px 0 rgba(15, 23, 42, 0.14)',
  },
} as const;

export type ShadowKey = keyof typeof Shadows;
