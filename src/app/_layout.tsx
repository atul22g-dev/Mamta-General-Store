import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

/**
 * Root navigator: three branches —
 *  (tabs)         consumer app (Home / Products / Settings)
 *  find-product   scan-to-price flow (stacked on top of the tabs)
 *  admin          store-owner area (stacked, no tab bar)
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="find-product" />
        <Stack.Screen name="admin" />
      </Stack>
    </ThemeProvider>
  );
}
