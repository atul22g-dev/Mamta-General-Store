export const Radius = {
  none: 0,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 26,
  full: 9999,
} as const;

export type RadiusKey = keyof typeof Radius;
