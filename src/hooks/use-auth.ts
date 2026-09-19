import { useAuthContext } from '@/providers/auth-provider';

/**
 * Reusable auth hook: { session, profile, status, role, isAdmin, signIn,
 * signOut }. Throws when used outside <AuthProvider>.
 */
export function useAuth() {
  return useAuthContext();
}

export type { AuthStatus } from '@/providers/auth-provider';
