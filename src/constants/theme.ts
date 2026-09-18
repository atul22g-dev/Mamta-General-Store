/**
 * Theme configuration for the app.
 * Centralized design tokens live in their own files.
 */

import '@/global.css';

import { Platform } from 'react-native';

import { Colors, ThemeColor } from './colors';
import { Spacing } from './spacing';
import { Radius } from './radius';
import { BottomTabInset, MaxContentWidth } from './platform';

export { Colors, ThemeColor };
export { Spacing };
export { Radius };
export { BottomTabInset, MaxContentWidth };

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});



