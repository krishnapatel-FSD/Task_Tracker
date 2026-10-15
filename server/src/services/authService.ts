import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { signupCodes, users } from '../db/schema.js';
import { env } from '../lib/env.js';
import { badRequest, conflict, forbidden, HttpError, unauthorized } from '../lib/errors.js';
import { mailEnabled, sendMail } from '../lib/mailer.js';
import { signToken } from '../lib/jwt.js';
import type { LoginInput, SignupInput, VerifySignupInput } from '../validation/schemas.js';

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

/**
 * Sign-up emails a code, so on a host it needs working email. Locally the code is printed
 * in the server log instead.
 */
const signupUsable = () => mailEnabled || !env.IS_HOSTED;

/** What the sign-in page offers: self sign-up (and for which domains) and Google. */
export function signInOptions() {
  return {
    signupDomains: signupUsable() ? env.SIGNUP_EMAIL_DOMAINS : [],
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

const CODE_MINUTES = 10;
const MAX_CODE_TRIES = 5;
const RESEND_AFTER_SECONDS = 60;

const hashCode = (email: string, code: string) => createHmac('sha256', env.JWT_SECRET).update(`${email}:${code}`).digest('hex');

/** Emails the sign-up code; swapped out in tests. */
export const signupCodeMailer = {
  async send(to: string, name: string, code: string) {
    // On a laptop the code is also printed, so sign-up works without a mailbox.
    if (!env.IS_HOSTED) console.log(`[sign-up code] ${to}: ${code}`);
    await sendMail({
      to,
      subject: `${code} is your Task Tracker code`,
      text: `Hi ${name},\n\nYour code to finish creating your Task Tracker account is ${code}.\nIt works for ${CODE_MINUTES} minutes.\n\nIf you didn't try to sign up, ignore this email.\n`,
      html: `<p style="font:15px system-ui,sans-serif;margin:0 0 12px">Hi ${name.replace(/[<>&"]/g, '')},</p><p style="font:15px system-ui,sans-serif;margin:0 0 8px">Your code to finish creating your Task Tracker account:</p><p style="font:700 32px/1.2 system-ui,sans-serif;letter-spacing:6px;margin:0 0 12px">${code}</p><p style="font:14px system-ui,sans-serif;color:#465065;margin:0">It works for ${CODE_MINUTES} minutes. If you didn't try to sign up, ignore this email.</p>`,
    });
  },
};

/**
 * Step 1 of self sign-up (allowed domains only): emails a 6-digit code. Nothing is created
 * until the code comes back, so nobody can claim an inbox they can't read.
 */
export async function startSignup({ name, email, password }: SignupInput) {
  if (!canSelfSignUp(email) || !signupUsable()) throw signUpRefusal();
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (taken) throw conflict('An account with this email already exists. Sign in instead.');

  const [pending] = await db.select({ sentAt: signupCodes.sentAt }).from(signupCodes).where(eq(signupCodes.email, email)).limit(1);
  if (pending && Date.now() - pending.sentAt.getTime() < RESEND_AFTER_SECONDS * 1000) {
    throw new HttpError(429, 'We just sent a code. Wait a minute before asking for another.');
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const row = {
    name,
    passwordHash: await bcrypt.hash(password, 10),
    codeHash: hashCode(email, code),
    attempts: 0,
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
    sentAt: new Date(),
  };
  await db.insert(signupCodes).values({ email, ...row }).onConflictDoUpdate({ target: signupCodes.email, set: row });

  try {
    await signupCodeMailer.send(email, name, code);
  } catch (err) {
    console.error('Sign-up code email failed', err);
    await db.delete(signupCodes).where(eq(signupCodes.email, email));
    throw new HttpError(502, "We couldn't send the email. Try again in a moment.");
  }
  return { email, expiresInMinutes: CODE_MINUTES };
}

/** Step 2: the right code creates the employee account and signs them in. */
export async function verifySignup({ email, code }: VerifySignupInput) {
  const [pending] = await db.select().from(signupCodes).where(eq(signupCodes.email, email)).limit(1);
  if (!pending || pending.expiresAt.getTime() < Date.now()) throw badRequest('This code has expired. Ask for a new one.');
  if (pending.attempts >= MAX_CODE_TRIES) throw badRequest('Too many wrong codes. Ask for a new one.');

  const expected = Buffer.from(pending.codeHash, 'hex');
  const given = Buffer.from(hashCode(email, code), 'hex');
  if (!timingSafeEqual(expected, given)) {
    await db.update(signupCodes).set({ attempts: pending.attempts + 1 }).where(eq(signupCodes.email, email));
    const left = MAX_CODE_TRIES - pending.attempts - 1;
    throw badRequest(left > 0 ? `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.');
  }

  const created = await insertUser({ name: pending.name, email, role: 'employee', passwordHash: pending.passwordHash });
  await db.delete(signupCodes).where(eq(signupCodes.email, email));
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
