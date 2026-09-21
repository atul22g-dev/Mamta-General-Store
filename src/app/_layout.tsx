import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/providers/auth-provider';

/**
 * Root navigator: three branches —
 *  (tabs)         consumer app (Home / Products / Settings)
 *  find-product   scan-to-price flow (stacked on top of the tabs)
 *  admin          store-owner area (stacked, no tab bar)
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Web startup handoff: tell the pre-hydration boot splash (see +html.tsx)
  // that the app has mounted, so the splash fades out only when real
  // content is ready — not on a fixed timer that can outrun a slow bundle.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.__signalAppReady?.();
    }
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="find-product" />
          <Stack.Screen name="admin" />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
