// Supabase Auth owns logins: passwords, the emailed sign-up code and authenticator-app 2FA.
// This API only checks the access tokens it issues, and uses the service-role key for the
// admin's People page (add person, reset password, reset 2FA).
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from './env.js';

/** What a valid Supabase access token tells us about the caller. */
export interface AuthClaims {
  authId: string;
  email: string;
  /** "aal2" once the authenticator code has been entered this session. */
  aal: 'aal1' | 'aal2';
  name: string | null;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function verifySupabaseToken(token: string): Promise<AuthClaims | null> {
  if (!env.SUPABASE_URL) return null;
  jwks ??= createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: `${env.SUPABASE_URL}/auth/v1`, audience: 'authenticated' });
    if (!payload.sub || typeof payload.email !== 'string') return null;
    const meta = (payload.user_metadata ?? {}) as { name?: unknown };
    return {
      authId: payload.sub,
      email: payload.email.toLowerCase(),
      aal: payload.aal === 'aal2' ? 'aal2' : 'aal1',
      name: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim().slice(0, 100) : null,
    };
  } catch {
    return null;
  }
}

interface AdminUser {
  id: string;
  email: string;
}

async function admin<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to manage logins');
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = body?.msg ?? body?.message ?? body?.error_description ?? `Supabase Auth error (${res.status})`;
    throw Object.assign(new Error(message), { status: res.status });
  }
  return body as T;
}

/** The Supabase side of logins. Swapped for a stand-in in tests. */
export const authProvider = {
  verifyAccessToken: verifySupabaseToken,

  /**
   * Creates a confirmed login. Either a password or an existing bcrypt hash (moving older
   * accounts over). Marked as added by the admin, so the sign-up domain rule lets it through.
   */
  async createUser(input: { email: string; name: string; password?: string; passwordHash?: string }) {
    return admin<AdminUser>('/users', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        email_confirm: true,
        ...(input.password && { password: input.password }),
        ...(input.passwordHash && { password_hash: input.passwordHash }),
        user_metadata: { name: input.name },
        app_metadata: { added_by_admin: true },
      }),
    });
  },

  async setPassword(authId: string, password: string) {
    await admin(`/users/${authId}`, { method: 'PUT', body: JSON.stringify({ password }) });
  },

  async findUserByEmail(email: string): Promise<AdminUser | null> {
    for (let page = 1; page < 50; page++) {
      const { users } = await admin<{ users: AdminUser[] }>(`/users?page=${page}&per_page=200`);
      const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (hit) return hit;
      if (users.length < 200) return null;
    }
    return null;
  },

  /** Removes every authenticator the person set up; they set up a new one at next sign-in. */
  async resetTwoFactor(authId: string) {
    const { factors = [] } = await admin<{ factors?: { id: string }[] }>(`/users/${authId}`);
    for (const f of factors) await admin(`/users/${authId}/factors/${f.id}`, { method: 'DELETE' });
    return factors.length;
  },
};
