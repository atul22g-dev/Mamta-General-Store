import { useWindowDimensions } from 'react-native';

import { Spacing } from '@/constants';

/**
 * Single source of responsive truth, driven by the REAL window dimensions
 * (updates live on rotation, split-screen and foldable posture changes).
 *
 * Breakpoints — device-class boundaries used across every screen:
 *   compact …………… < 360dp   small phones: tighten spacing, shrink hero art
 *   default ……………… 360–767dp  the overwhelming majority of Android phones
 *   tablet ……………… ≥ 768dp   tablets, unfolded foldables, desktop web:
 *                             content centers, stat tiles go 4-across
 *
 * Every value is derived from the same measurement so screens can never
 * disagree about the current device class.
 */
export interface Responsive {
  /** Live window width in dp. */
  width: number;
  /** Live window height in dp. */
  height: number;
  /** Small phones (< 360dp). */
  isCompact: boolean;
  /** Tablets, unfolded foldables and desktop web (≥ 768dp). */
  isTablet: boolean;
  /** Stat-tile grid density: 2-up on phones, 4-up on tablet+. */
  statColumns: 2 | 4;
  /** Flex-basis % for one stat tile inside a wrapping gap row. */
  statTileBasis: `${number}%`;
  /** Horizontal gutter that scales with the device class. */
  gutter: number;
  /** Hero-card padding: roomy normally, tightened on small phones. */
  heroPadding: number;
  /** Hero icon size: 56dp normally, 48dp on small phones. */
  heroIconSize: number;
  /** Hero headline size: keeps “Find Product” on ONE line at every width. */
  heroTitleSize: number;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  const isCompact = width < 360;
  const isTablet = width >= 768;
  const statColumns: 2 | 4 = isTablet ? 4 : 2;

  return {
    width,
    height,
    isCompact,
    isTablet,
    statColumns,
    statTileBasis: statColumns === 4 ? '23%' : '47%',
    gutter: isCompact ? Spacing.three : Spacing.four,
    heroPadding: isCompact ? Spacing.four : Spacing.five,
    heroIconSize: isCompact ? 48 : 56,
    heroTitleSize: width < 400 ? 26 : 34,
  };
}
