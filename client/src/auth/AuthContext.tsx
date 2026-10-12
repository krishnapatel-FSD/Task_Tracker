import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, loadSession, saveSession, setUnauthorizedHandler, type Session } from '../api';
import type { Role, User } from '../types';

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const homePathFor = (role: Role) => (role === 'admin' ? '/admin/tasks' : '/tasks');

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(loadSession);

  const logout = useCallback(() => {
    saveSession(null);
    setSession(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  // An expired or invalid token anywhere in the app ends the session.
  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const next = await api.login(email, password);
    saveSession(next);
    setSession(next);
    return next.user;
  }, []);

  const value = useMemo(() => ({ user: session?.user ?? null, login, logout }), [session, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
