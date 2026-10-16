import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import type { AuthUser } from '../lib/jwt.js';
import type { CreateUserInput, UpdateUserInput } from '../validation/schemas.js';
import { authProvider } from '../lib/supabaseAuth.js';
import { forgetCachedUser } from '../middleware/authenticate.js';

/** Everyone who can be @mentioned: the whole team, admin included. */
export async function listPeople() {
  return db.select({ id: users.id, name: users.name, role: users.role }).from(users).orderBy(asc(users.name));
}

/** Employees for the assignee dropdown and filter. */
export async function listEmployees() {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.role, 'employee'))
    .orderBy(asc(users.name));
}

const accountFields = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  createdAt: users.createdAt,
  openTasks: sql<number>`(select count(*) from tasks t where t.assignee_id = ${users.id} and t.archived_at is null and t.status <> 'done')`.mapWith(Number),
};

/** The admin's People page: every account with its email. */
export async function listAccounts() {
  return db.select(accountFields).from(users).orderBy(asc(users.role), asc(users.name));
}

async function getAccount(id: string) {
  const [account] = await db.select({ ...accountFields, authId: users.authId }).from(users).where(eq(users.id, id)).limit(1);
  if (!account) throw notFound('Person not found');
  return account;
}

const publicAccount = ({ authId: _authId, ...account }: Awaited<ReturnType<typeof getAccount>>) => account;

/** The admin adds someone: a confirmed Supabase login with a starting password, plus the app account. */
export async function createAccount({ password, ...input }: CreateUserInput) {
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (taken) throw conflict('An account with this email already exists');
  let login;
  try {
    login = await authProvider.createUser({ email: input.email, name: input.name, password });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 422 || status === 409) throw conflict('This email already has a login. Ask them to sign in, or remove it in Supabase first.');
    throw err;
  }
  const [created] = await db.insert(users).values({ ...input, authId: login.id }).returning({ id: users.id });
  return publicAccount(await getAccount(created.id));
}

export async function updateAccount(caller: AuthUser, id: string, { password, ...changes }: UpdateUserInput) {
  const account = await getAccount(id);
  if (changes.role && changes.role !== account.role) {
    if (id === caller.id) throw badRequest("You can't change your own role. Ask another admin.");
    if (changes.role === 'employee') {
      const [{ admins }] = await db
        .select({ admins: sql<number>`count(*)`.mapWith(Number) })
        .from(users)
        .where(and(eq(users.role, 'admin'), ne(users.id, id)));
      if (admins === 0) throw badRequest('Keep at least one admin');
    }
  }
  if (password) {
    if (!account.authId) throw badRequest("This person hasn't signed in with the new sign-in yet, so there's no password to reset.");
    await authProvider.setPassword(account.authId, password);
  }
  if (Object.keys(changes).length) {
    await db.update(users).set(changes).where(eq(users.id, id));
    forgetCachedUser(account.authId);
  }
  return publicAccount(await getAccount(id));
}

/** Lost phone: removes their authenticator, so they set up a new one at next sign-in. */
export async function resetTwoFactor(id: string) {
  const account = await getAccount(id);
  if (!account.authId) throw badRequest("This person hasn't set up the new sign-in yet.");
  const removed = await authProvider.resetTwoFactor(account.authId);
  return { removed };
}
