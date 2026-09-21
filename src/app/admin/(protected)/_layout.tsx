import { StyleSheet } from 'react-native';
import { Redirect, Stack } from 'expo-router';

import { AccessDenied } from '@/components/admin/access-denied';
import { Loading } from '@/components/ui/loading';
import { ErrorState } from '@/components/ui/error-state';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/use-auth';

/**
 * Guard for every privileged /admin route.
 *
 *  status = loading            → neutral loading gate (no flash of content)
 *  status = unauthenticated    → redirect to /admin/login
 *    ↳ includes the invalid-session case (restored session whose profile row
 *      is gone): the provider signs it out, which flips status and lands here
 *  profile unavailable         → device offline / server unreachable: the
 *                                session is intact; offer retry instead of
 *                                kicking the admin out (fail-closed, not
 *                                fail-open — nothing renders until a verdict)
 *  authenticated + admin       → render the admin stack
 *  authenticated + non-admin   → Access denied panel (Sign Out to leave)
 *
 * Authorization is enforced at three layers — this UI gate is only the first:
 *   1. this layout (direct deep links to /admin/** never render content)
 *   2. Postgres RLS (products/images writes are admin-only; profile role
 *      changes are impossible for the row owner — see supabase/migrations)
 *   3. the create-staff edge function (re-verifies the admin role server-side
 *      before using the service-role key)
 */
export default function ProtectedAdminLayout() {
  const { status, isAdmin, profile, profileUnavailable, retryProfile, signOut } = useAuth();

  if (status === 'loading') {
    return (
      <ThemedView style={styles.center}>
        <Loading text="Checking your access…" showIcon />
      </ThemedView>
    );
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/admin/login" />;
  }

  // Session is valid but the profile could not be fetched (offline, server
  // error). Deliberately NOT a redirect to login: the admin did nothing
  // wrong and their role is unknown, not missing. Keep them signed in and
  // offer a retry — fail-closed: no admin UI renders until the role is known.
  if (profileUnavailable) {
    return (
      <ThemedView style={styles.center}>
        <ErrorState
          title="Can't verify your access"
          description="The store server couldn't be reached to confirm your account. Check your connection and try again."
          onRetry={retryProfile}
          retryLabel="Retry"
        />
      </ThemedView>
    );
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
