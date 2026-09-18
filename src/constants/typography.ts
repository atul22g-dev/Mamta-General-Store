import { StyleSheet, Platform } from 'react-native';
import { Fonts } from '@/constants/theme';

export const Typography = StyleSheet.create({
  display: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: -0.8,
    fontFamily: Platform.select({ ios: Fonts?.sans, default: Fonts?.sans }),
  },
  h1: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontFamily: Platform.select({ ios: Fonts?.sans, default: Fonts?.sans }),
  },
  h2: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontFamily: Platform.select({ ios: Fonts?.sans, default: Fonts?.sans }),
  },
  h3: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    fontFamily: Platform.select({ ios: Fonts?.sans, default: Fonts?.sans }),
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: Fonts?.sans, default: Fonts?.sans }),
  },
  bodySmall: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: Fonts?.sans, default: Fonts?.sans }),
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    fontFamily: Platform.select({ ios: Fonts?.sans, default: Fonts?.sans }),
  },
  overline: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    fontFamily: Platform.select({ ios: Fonts?.sans, default: Fonts?.sans }),
  },
});

export type TypographyKey = keyof typeof Typography;
