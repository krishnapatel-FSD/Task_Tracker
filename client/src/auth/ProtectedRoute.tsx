import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Role } from '../types';
import { homePathFor, useAuth } from './AuthContext';

/**
 * Decides which screen to show. Not a security control: the API enforces access.
 * No session -> login. Wrong role -> the user's own home screen.
 */
export function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homePathFor(user.role)} replace />;
  return <>{children}</>;
}
