import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type PropsWithChildren } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { toSignInError } from '@/lib/auth-errors';
import { isNetworkError } from '@/lib/errors';
import type { Profile } from '@/types/database';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

/** PostgREST code for "zero rows returned" (from `.single()`). */
const PGRST_NO_ROWS = 'PGRST116';
/** PostgREST code for an expired/invalid JWT that could not be refreshed. */
const PGRST_JWT_INVALID = 'PGRST301';

type SignInResult = { ok: true } | { ok: false; error: string };

type AuthContextValue = {
  /** Current Supabase session (null when signed out). */
  session: Session | null;
  /** Profile row for the signed-in user (role included). */
  profile: Profile | null;
  status: AuthStatus;
  role: Profile['role'] | null;
  isAdmin: boolean;
  /**
   * Profile could not be loaded because the device is offline / the server
   * is unreachable. The session stays intact; the caller offers a retry.
   * Never true when the profile is simply missing or the user is signed out.
   */
  profileUnavailable: boolean;
  /** Re-runs the profile fetch (used after a network failure). */
  retryProfile: () => void;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [profileUnavailable, setProfileUnavailable] = useState(false);

  /** Monotonic guard: stale profile resolutions never clobber newer state. */
  const loadIdRef = useRef(0);

  const resetToSignedOut = useCallback(() => {
    // Invalidate any in-flight profile load: without this, a load that
    // started before sign-out would resolve afterwards and resurrect an
    // "authenticated" state with no session (the stale-load race).
    loadIdRef.current += 1;
    setProfile(null);
    setSession(null);
    setStatus('unauthenticated');
    setProfileUnavailable(false);
  }, []);

  /**
   * The profile row is definitively gone while a session exists (deleted by
   * an admin, auth data drift). The session cannot identify any store user,
   * so it is signed out rather than pretending. This is the ONLY profile
   * failure that ends a session.
   */
  const forceSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    resetToSignedOut();
  }, [resetToSignedOut]);

  /**
   * Loads the profile for `current` and applies the result to state.
   *
   * Error handling is branched by KIND — this was the root cause of the
   * startup-logout bug: a transient network failure used to be treated
   * identically to a missing row and destroyed valid sessions. Now:
   *   missing row      → sign out (the session identifies no user)
   *   network failure  → keep the session, surface a retryable state
   *   server error     → keep the session, surface a retryable state
   * A monotonic load id makes late responses from superseded loads
   * (rapid sign-in/out, refresh cycles) harmless.
   */
  const loadProfile = useCallback(
    async (current: Session | null) => {
      const loadId = ++loadIdRef.current;

      if (!current) {
        resetToSignedOut();
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', current.user.id)
        .single();

      // A newer load (sign-out, token refresh, retry) superseded this one.
      if (loadId !== loadIdRef.current) return;

      if (error || !data) {
        const code = (error as { code?: string } | null)?.code;
        if (code === PGRST_JWT_INVALID) {
          // Expired/invalid JWT that could NOT be refreshed (auto-refresh
          // already ran before this query) — the session is dead and only
          // re-authentication fixes it. End it so the guards route to login
          // instead of looping on a Retry that can never succeed.
          await forceSignOut();
          return;
        }
        if (error && isNetworkError(error)) {
          // Offline / unreachable: the session itself is still valid.
          // status leaves 'loading' (the auth state IS known — a session
          // exists) and profileUnavailable tells the guards the ROLE is
          // unknown; admin screens stay fail-closed behind the retry panel.
          setProfileUnavailable(true);
          setStatus('authenticated');
          return;
        }
        if (!error || code === PGRST_NO_ROWS) {
          // Definitive "no profile row": the session identifies nobody.
          // forceSignOut clears all state; the SIGNED_OUT event that follows
          // keeps the guard layout redirecting to /admin/login.
          await forceSignOut();
          return;
        }
        // Server-side failure (5xx, PGRST2xx, ...): keep the session and
        // let the UI offer a retry — same posture as network failures.
        setProfileUnavailable(true);
        setStatus('authenticated');
        return;
      }

      setProfile(data);
      setProfileUnavailable(false);
      setStatus('authenticated');
    },
    [forceSignOut, resetToSignedOut],
  );

  const retryProfile = useCallback(() => {
    setProfileUnavailable(false);
    void loadProfile(session);
  }, [loadProfile, session]);

  useEffect(() => {
    // Restore the persisted session (AsyncStorage on native, localStorage on
    // web). A rejection here means the local store itself failed — treat as
    // signed out rather than looping on an unreadable session.
    supabase.auth
      .getSession()
      .then(({ data }) => loadProfile(data.session))
      .catch(() => {
        resetToSignedOut();
      });

    // Keep state in sync: sign-ins, sign-outs AND expired sessions —
    // when the refresh token can't be renewed, supabase-js emits
    // SIGNED_OUT, which lands here and flips status.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      setSession(nextSession);
      if (event === 'SIGNED_OUT' || !nextSession) {
        resetToSignedOut();
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setProfileUnavailable(false);
        void loadProfile(nextSession);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile, resetToSignedOut]);

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, error: toSignInError(error.message) };
    // Session/profile state updates arrive via onAuthStateChange.
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // onAuthStateChange(SIGNED_OUT) clears session + profile via
    // resetToSignedOut, which also invalidates any in-flight profile load.
    // signOut() itself is awaited by callers (login screen, settings, guard)
    // and its local cleanup runs even if the remote revoke fails, so the UI
    // never stays authenticated on a dead session.
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      status,
      role: profile?.role ?? null,
      isAdmin: profile?.role === 'admin',
      profileUnavailable,
      retryProfile,
      signIn,
      signOut,
    }),
    [session, profile, status, profileUnavailable, retryProfile, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
