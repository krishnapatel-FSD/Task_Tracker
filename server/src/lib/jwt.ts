import jwt from 'jsonwebtoken';
import type { Role } from '../db/schema.js';
import { env } from './env.js';

export interface AuthUser {
  id: string;
  role: Role;
}

const EXPIRES_IN = '8h';

export function signToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: EXPIRES_IN,
    algorithm: 'HS256',
  });
}

/** Returns the user encoded in the token, or null if it is missing, expired or invalid. */
export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) return null;
    if (payload.role !== 'admin' && payload.role !== 'employee') return null;
    return { id: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}
