/**
 * Palette: retail emerald primary with a warm orange CTA accent and
 * neutral slate text — per the ui-ux-pro-max retail design system
 * (primary #059669, CTA adjusted darker for 4.5:1 text contrast).
 *
 * Light values meet 4.5:1 contrast for body text; dark values are tuned
 * for deep green-black surfaces instead of pure black.
 *
 * `accentGlow` / `ctaGlow` are translucent companions of `accent` / `cta`
 * for tinted elevation shadows under colored blocks (hero cards, shutter).
 */
export const Colors = {
  light: {
    text: '#0F172A',
    background: '#F6F8F7',
    surface: '#FFFFFF',
    surfaceSecondary: '#F1F5F4',
    backgroundElement: '#F1F5F4',
    backgroundSelected: '#E4EBE8',
    textSecondary: '#475569',
    textTertiary: '#64748B',
    border: '#E2E8E6',
    accent: '#059669',
    accentSoft: '#D1FAE5',
    accentDark: '#047857',
    accentGlow: 'rgba(5, 150, 105, 0.30)',
    cta: '#C2410C',
    ctaDark: '#9A3412',
    ctaGlow: 'rgba(194, 65, 12, 0.32)',
    success: '#16A34A',
    successSoft: '#DCFCE7',
    warning: '#D97706',
    warningSoft: '#FEF3C7',
    error: '#DC2626',
    errorSoft: '#FEE2E2',
    white: '#ffffff',
    black: '#000000',
    /**
     * Photo-overlay scrim: a near-opaque slate used behind white text that
     * sits ON TOP of a product photo. A tinted token would be unreadable over
     * an arbitrary image, so this one is deliberately theme-independent —
     * white on it clears 12:1 whatever is underneath.
     */
    scrim: 'rgba(2, 6, 23, 0.78)',
    scrimSoft: 'rgba(2, 6, 23, 0.55)',
  },
  dark: {
    text: '#ECF3F0',
    background: '#0A0F0D',
    surface: '#101816',
    surfaceSecondary: '#1A2420',
    backgroundElement: '#16211D',
    backgroundSelected: '#24322D',
    textSecondary: '#94A3B8',
    textTertiary: '#64748B',
    border: '#1E2A26',
    accent: '#10B981',
    accentSoft: '#0C2E24',
    accentDark: '#6EE7B7',
    accentGlow: 'rgba(16, 185, 129, 0.35)',
    cta: '#F97316',
    ctaDark: '#EA580C',
    ctaGlow: 'rgba(249, 115, 22, 0.35)',
    success: '#22C55E',
    successSoft: '#143524',
    warning: '#F59E0B',
    warningSoft: '#33270E',
    error: '#EF4444',
    errorSoft: '#3B1414',
    white: '#ffffff',
    black: '#000000',
    /** Same photo scrim in both themes — see the light palette note. */
    scrim: 'rgba(2, 6, 23, 0.78)',
    scrimSoft: 'rgba(2, 6, 23, 0.55)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export type ColorScheme = 'light' | 'dark';
