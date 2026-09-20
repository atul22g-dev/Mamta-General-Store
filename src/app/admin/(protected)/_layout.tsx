import { StyleSheet } from 'react-native';
import { Redirect, Stack } from 'expo-router';

import { AccessDenied } from '@/components/admin/access-denied';
import { Loading } from '@/components/ui/loading';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/use-auth';

/**
 * Guard for every privileged /admin route.
 *
 *  status = loading          → neutral loading gate (no flash of content)
 *  status = unauthenticated  → redirect to /admin/login
 *  authenticated + admin     → render the admin stack
 *  authenticated + non-admin → Access denied panel (Sign Out to leave)
 */
export default function ProtectedAdminLayout() {
  const { status, isAdmin, profile, signOut } = useAuth();

  if (status === 'loading') {
    return (
      <ThemedView style={styles.center}>
        <Loading />
      </ThemedView>
    );
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/admin/login" />;
  }

  if (!isAdmin) {
    return <AccessDenied email={profile?.email} onSignOut={() => void signOut()} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="products" />
      <Stack.Screen name="products/add" />
      <Stack.Screen name="products/[id]" />
      <Stack.Screen name="products/[id]/edit" />
      <Stack.Screen name="staff" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
