import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { env } from '../lib/env.js';
import { badRequest, conflict, forbidden, unauthorized } from '../lib/errors.js';
import { signToken } from '../lib/jwt.js';
import type { LoginInput, SignupInput } from '../validation/schemas.js';

// Compared against when the email is unknown, so a missing account
// takes about as long to reject as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

type UserRow = typeof users.$inferSelect;

function session(user: Pick<UserRow, 'id' | 'name' | 'role'>) {
  return {
    token: signToken({ id: user.id, role: user.role }),
    user: { id: user.id, name: user.name, role: user.role },
  };
}

/** What the sign-in page offers: self sign-up (and for which domains) and Google. */
export function signInOptions() {
  return {
    signupDomains: env.SIGNUP_EMAIL_DOMAINS,
    googleClientId: env.GOOGLE_CLIENT_ID || null,
  };
}

/** Whether this email may create its own account. */
export function canSelfSignUp(email: string) {
  const domain = email.split('@').pop()?.toLowerCase() ?? '';
  return env.SIGNUP_EMAIL_DOMAINS.includes(domain);
}

function signUpRefusal() {
  const domains = env.SIGNUP_EMAIL_DOMAINS;
  return forbidden(
    domains.length === 0
      ? 'Sign-up is closed. Ask your admin to add you.'
      : `Sign-up is only open to ${domains.map((d) => '@' + d).join(', ')} email addresses. Ask your admin to add you.`,
  );
}

export async function login({ email, password }: LoginInput) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw unauthorized('Invalid email or password');
  }

  return session(user);
}

/** Inserts an account, or 409 when the email is taken. */
export async function insertUser(input: { name: string; email: string; role: UserRow['role']; passwordHash: string }) {
  const [created] = await db.insert(users).values(input).onConflictDoNothing({ target: users.email }).returning();
  if (!created) throw conflict('An account with this email already exists');
  return created;
}

/** Self sign-up: allowed domains only, and always as an employee. */
export async function signup({ name, email, password }: SignupInput) {
  if (!canSelfSignUp(email)) throw signUpRefusal();
  const created = await insertUser({ name, email, role: 'employee', passwordHash: await bcrypt.hash(password, 10) });
  return session(created);
}

const google = new OAuth2Client();

/** Checks a Google ID token; swapped out in tests. */
export const googleVerifier = {
  async verify(credential: string) {
    const ticket = await google.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    return ticket.getPayload() ?? null;
  },
};

/**
 * Sign in with a Google ID token. A known email signs in; a new one from an allowed domain
 * gets an employee account. Google-only accounts get a random password nobody knows.
 */
export async function loginWithGoogle(credential: string) {
  if (!env.GOOGLE_CLIENT_ID) throw badRequest('Google sign-in is not set up');
  let payload: { email?: string; email_verified?: boolean; name?: string } | null;
  try {
    payload = await googleVerifier.verify(credential);
  } catch {
    throw unauthorized('Google sign-in failed. Try again.');
  }
  if (!payload?.email || !payload.email_verified) throw unauthorized('Your Google account has no verified email');

  const email = payload.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return session(existing);

  if (!canSelfSignUp(email)) throw signUpRefusal();
  const name = (payload.name ?? email.split('@')[0]).slice(0, 100);
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
  try {
    return session(await insertUser({ name, email, role: 'employee', passwordHash }));
  } catch {
    // Two first sign-ins at once: the other one created it.
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) throw unauthorized('Google sign-in failed. Try again.');
    return session(user);
  }
}
