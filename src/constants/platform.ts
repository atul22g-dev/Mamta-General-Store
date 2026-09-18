import { Platform } from 'react-native';

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
/** Clearance for the floating web tab bar (pills + padding). */
export const WebTopBarInset = Platform.select({ web: 76, default: 0 });
export const MaxContentWidth = 800;
