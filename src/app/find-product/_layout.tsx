import { Stack } from 'expo-router';

/**
 * Scan-to-price flow: index (entry) → camera → preview → searching → result.
 * Nested Stack so each step is pushed (never swallows the Android back
 * button — back pops the flow instead of leaving the app).
 */
export default function FindProductLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="camera" />
      <Stack.Screen name="preview" />
      <Stack.Screen name="searching" />
      <Stack.Screen name="result" />
    </Stack>
  );
}
