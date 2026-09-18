/**
 * Elevation tokens.
 *
 * Uses the unified `boxShadow` string format supported natively since
 * RN 0.76 and required by react-native-web (the legacy `shadow*` props
 * are deprecated). Colors are fixed (deep slate) so shadows read
 * consistently on both light surfaces and tinted accents.
 */
export const Shadows = {
  none: {},
  sm: {
    boxShadow: '0 2px 8px 0 rgba(15, 23, 42, 0.06)',
  },
  md: {
    boxShadow: '0 8px 24px 0 rgba(15, 23, 42, 0.08)',
  },
  lg: {
    boxShadow: '0 16px 32px 0 rgba(15, 23, 42, 0.16)',
  },
} as const;

export type ShadowKey = keyof typeof Shadows;
