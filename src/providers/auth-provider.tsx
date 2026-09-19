import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type PropsWithChildren } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { toSignInError } from '@/lib/auth-errors';
import type { Profile } from '@/types/database';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

type SignInResult = { ok: true } | { ok: false; error: string };

type AuthContextValue = {
  /** Current Supabase session (null when signed out). */
  session: Session | null;
  /** Profile row for the signed-in user (role included). */
  profile: Profile | null;
  status: AuthStatus;
  role: Profile['role'] | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const loadProfile = useCallback(async (current: Session | null) => {
    if (!current) {
      setProfile(null);
      setStatus('unauthenticated');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', current.user.id)
        .single();

      if (error) throw error;
      setProfile(data);
      setStatus('authenticated');
    } catch {
      // Session exists but the profile is gone/unreadable (e.g. row deleted,
      // RLS change) — treat as signed out rather than pretending.
      await supabase.auth.signOut();
      setProfile(null);
      setSession(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    // Restore the persisted session (expo-sqlite localStorage).
    supabase.auth
      .getSession()
      .then(({ data }) => loadProfile(data.session))
      .catch(() => {
        setSession(null);
        setStatus('unauthenticated');
      });

    // Keep state in sync: sign-ins, sign-outs AND expired sessions —
    // when the refresh token can't be renewed, supabase-js emits
    // SIGNED_OUT, which lands here and flips status.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      setSession(nextSession);
      if (event === 'SIGNED_OUT' || !nextSession) {
        setProfile(null);
        setStatus('unauthenticated');
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void loadProfile(nextSession);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

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
    // onAuthStateChange(SIGNED_OUT) clears session + profile.
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      status,
      role: profile?.role ?? null,
      isAdmin: profile?.role === 'admin',
      signIn,
      signOut,
    }),
    [session, profile, status, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
