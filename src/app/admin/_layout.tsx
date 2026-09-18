import { Stack } from 'expo-router';

/**
 * Admin area: login → dashboard (index) → product management
 * (list, add, detail, edit). Nested Stack keeps the Android back button
 * popping screens inside the admin flow instead of exiting the app.
 */
export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="index" />
      <Stack.Screen name="products" />
      <Stack.Screen name="products/add" />
      <Stack.Screen name="products/[id]" />
      <Stack.Screen name="products/[id]/edit" />
    </Stack>
  );
}
