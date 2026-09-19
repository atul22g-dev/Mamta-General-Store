import { Platform } from 'react-native';

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
/** Clearance for the floating web tab bar (pills + padding). */
export const WebTopBarInset = Platform.select({ web: 76, default: 0 });
export const MaxContentWidth = 800;

/**
 * Minimum interactive touch target — 44pt on iOS (HIG), 48dp on Android
 * (Material), 44px on web (WCAG 2.5.8 best practice). Every tappable
 * primitive should be at least this size, or expand its hit area.
 */
export const MinTouchTarget = Platform.select({ ios: 44, android: 48, default: 44 });
