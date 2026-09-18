/**
 * Palette: trust-blue primary with a warm orange CTA, soft slate neutrals.
 * Light values meet 4.5:1 contrast for body text; dark values tuned for
 * deep navy surfaces instead of pure black.
 */
export const Colors = {
  light: {
    text: '#0F172A',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceSecondary: '#F1F5F9',
    backgroundElement: '#F1F5F9',
    backgroundSelected: '#E2E8F0',
    textSecondary: '#475569',
    textTertiary: '#64748B',
    border: '#E2E8F0',
    accent: '#2563EB',
    accentSoft: '#DBEAFE',
    accentDark: '#1D4ED8',
    cta: '#EA580C',
    success: '#16A34A',
    successSoft: '#DCFCE7',
    warning: '#D97706',
    warningSoft: '#FEF3C7',
    error: '#DC2626',
    errorSoft: '#FEE2E2',
    white: '#ffffff',
    black: '#000000',
  },
  dark: {
    text: '#F1F5F9',
    background: '#0B1220',
    surface: '#111B2E',
    surfaceSecondary: '#1E293B',
    backgroundElement: '#16213A',
    backgroundSelected: '#24344F',
    textSecondary: '#94A3B8',
    textTertiary: '#64748B',
    border: '#1E293B',
    accent: '#3B82F6',
    accentSoft: '#1E3A5F',
    accentDark: '#93C5FD',
    cta: '#F97316',
    success: '#22C55E',
    successSoft: '#143524',
    warning: '#F59E0B',
    warningSoft: '#33270E',
    error: '#EF4444',
    errorSoft: '#3B1414',
    white: '#ffffff',
    black: '#000000',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export type ColorScheme = 'light' | 'dark';
