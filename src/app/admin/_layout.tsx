import { Stack } from 'expo-router';

/**
 * Admin area layout: `login` renders publicly; the `(protected)` group
 * (nested below with its own guarding layout) wraps every privileged
 * screen. Keeping them as sibling slots means the guard can redirect to
 * login without ever unmounting the login screen itself.
 */
export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(protected)" />
    </Stack>
  );
}

