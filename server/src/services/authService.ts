import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { signupDomains, users } from '../db/schema.js';
import { env } from '../lib/env.js';
import { forbidden } from '../lib/errors.js';
import type { AuthClaims } from '../lib/supabaseAuth.js';

/** What the sign-in page offers: self sign-up, and for which email domains. */
export function signInOptions() {
  return { signupDomains: env.SIGNUP_EMAIL_DOMAINS };
}

/** Whether this email may create its own account. */
export function canSelfSignUp(email: string) {
  const domain = email.split('@').pop()?.toLowerCase() ?? '';
  return env.SIGNUP_EMAIL_DOMAINS.includes(domain);
}

/**
 * The app account behind a Supabase login, made on first sign-in. Supabase has already
 * confirmed the email (sign-up code) and the authenticator code by now.
 *  - Known login: that account.
 *  - Known email not linked yet (accounts moved over, or added before): link it.
 *  - New email from an allowed domain: a new employee.
 */
export async function accountFor(claims: AuthClaims) {
  const fields = { id: users.id, name: users.name, role: users.role };
  const [linked] = await db.select(fields).from(users).where(eq(users.authId, claims.authId)).limit(1);
  if (linked) return linked;

  const [byEmail] = await db
    .update(users)
    .set({ authId: claims.authId })
    .where(and(eq(users.email, claims.email), isNull(users.authId)))
    .returning(fields);
  if (byEmail) return byEmail;

  if (!canSelfSignUp(claims.email)) throw forbidden('No Task Tracker account for this email. Ask your admin to add you.');
  const name = claims.name ?? claims.email.split('@')[0];
  const [created] = await db
    .insert(users)
    .values({ name, email: claims.email, role: 'employee', authId: claims.authId })
    .onConflictDoNothing()
    .returning(fields);
  if (created) return created;
  // Two first requests at once: the other one made it.
  const [again] = await db.select(fields).from(users).where(eq(users.authId, claims.authId)).limit(1);
  if (!again) throw forbidden('This email belongs to another Task Tracker account. Ask your admin.');
  return again;
}

/** Copies SIGNUP_EMAIL_DOMAINS into the table the Supabase sign-up hook reads. */
export async function syncSignupDomains() {
  const domains = env.SIGNUP_EMAIL_DOMAINS;
  if (domains.length) {
    await db.insert(signupDomains).values(domains.map((domain) => ({ domain }))).onConflictDoNothing();
    await db.delete(signupDomains).where(notInArray(signupDomains.domain, domains));
  } else {
    await db.delete(signupDomains);
  }
}
