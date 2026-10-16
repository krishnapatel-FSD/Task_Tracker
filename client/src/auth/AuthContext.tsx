import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { api, ApiError, setAccessToken, setUnauthorizedHandler } from '../api';
import { supabase } from '../supabase';
import type { Role, User } from '../types';

/**
 * Where the person is in signing in. 2FA is required for everyone:
 *  - signedOut: no Supabase session
 *  - enroll: password OK, no authenticator set up yet
 *  - challenge: password OK, authenticator code needed
 *  - ready: fully signed in, with the app account loaded
 */
export type Stage = 'loading' | 'signedOut' | 'enroll' | 'challenge' | 'ready';

interface AuthContextValue {
  stage: Stage;
  user: User | null;
  /** Shown on the sign-in page after a forced sign-out (e.g. no account for this email). */
  notice: string | null;
  email: string | null;
  /** Re-reads the Supabase session, e.g. after the authenticator code is accepted. */
  refresh: () => Promise<void>;
  logout: (notice?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Both roles land on the projects home.
export const homePathFor = (_role: Role) => '/projects';

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = useRef(0);

  const logout = useCallback(
    (message?: string) => {
      setNotice(message ?? null);
      setUser(null);
      setStage('signedOut');
      setAccessToken(null);
      supabase.auth.signOut().catch(() => undefined);
      navigate('/login', { replace: true });
    },
    [navigate],
  );

  const evaluate = useCallback(
    async (session: Session | null) => {
      const mine = ++run.current;
      setAccessToken(session?.access_token ?? null);
      setEmail(session?.user.email ?? null);
      if (!session) {
        setUser(null);
        setStage('signedOut');
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (mine !== run.current) return;
      if (aal?.currentLevel !== 'aal2') {
        setUser(null);
        setStage(aal?.nextLevel === 'aal2' ? 'challenge' : 'enroll');
        return;
      }
      try {
        const me = await api.me();
        if (mine !== run.current) return;
        setUser(me);
        setNotice(null);
        setStage('ready');
      } catch (err) {
        if (mine !== run.current) return;
        logout(err instanceof ApiError && err.status === 403 ? err.message : "We couldn't reach the server. Try again in a moment.");
      }
    },
    [logout],
  );

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await evaluate(data.session);
  }, [evaluate]);

  useEffect(() => {
    // Supabase warns against awaiting its own calls inside this callback, so defer.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        setAccessToken(session?.access_token ?? null);
        return;
      }
      setTimeout(() => void evaluate(session), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [evaluate]);

  // An expired or invalid token anywhere in the app ends the session.
  useEffect(() => {
    setUnauthorizedHandler(() => logout('Your session ended. Sign in again.'));
  }, [logout]);

  const value = useMemo(() => ({ stage, user, notice, email, refresh, logout }), [stage, user, notice, email, refresh, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
