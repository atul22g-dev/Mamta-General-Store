import { StyleSheet, Platform } from 'react-native';
import { Fonts } from '@/constants/theme';

export const Typography = StyleSheet.create({
  display: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -0.9,
    fontFamily: Platform.select({ ios: Fonts?.sans, default: Fonts?.sans }),
  },
  h1: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.5,
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
    // 16px floor for primary reading text (readable-font-size rule).
    fontSize: 16,
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
