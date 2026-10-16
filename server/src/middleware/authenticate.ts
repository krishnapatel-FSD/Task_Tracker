import type { Request, RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import type { AuthUser } from '../lib/jwt.js';
import { authProvider, type AuthClaims } from '../lib/supabaseAuth.js';

// authId → app user, for a minute, so each request doesn't look the person up again.
const cache = new Map<string, { user: AuthUser; at: number }>();
const CACHE_MS = 60_000;

/** Forget a person's cached role, e.g. after the admin changes it. */
export function forgetCachedUser(authId: string | null | undefined) {
  if (authId) cache.delete(authId);
}

/**
 * The Supabase login behind the Bearer token. 2FA is required for everyone, so a session
 * that hasn't entered its authenticator code yet (aal1) is refused.
 */
export async function verifyCaller(req: Request): Promise<AuthClaims> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
  const claims = token ? await authProvider.verifyAccessToken(token) : null;
  if (!claims) throw unauthorized('Missing or invalid token');
  if (claims.aal !== 'aal2') throw forbidden('Enter the code from your authenticator app to continue');
  return claims;
}

/** Verifies the Supabase token, requires 2FA, and sets req.user to the app's account. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const claims = await verifyCaller(req);
    const hit = cache.get(claims.authId);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      req.user = hit.user;
      return next();
    }
    const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.authId, claims.authId)).limit(1);
    if (!user) return next(forbidden('No Task Tracker account for this login'));
    cache.set(claims.authId, { user, at: Date.now() });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
