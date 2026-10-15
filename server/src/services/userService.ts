import bcrypt from 'bcryptjs';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';
import type { AuthUser } from '../lib/jwt.js';
import type { CreateUserInput, UpdateUserInput } from '../validation/schemas.js';
import { insertUser } from './authService.js';

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
  const [account] = await db.select(accountFields).from(users).where(eq(users.id, id)).limit(1);
  if (!account) throw notFound('Person not found');
  return account;
}

export async function createAccount({ password, ...input }: CreateUserInput) {
  const created = await insertUser({ ...input, passwordHash: await bcrypt.hash(password, 10) });
  return getAccount(created.id);
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
  await db
    .update(users)
    .set({ ...changes, ...(password && { passwordHash: await bcrypt.hash(password, 10) }) })
    .where(eq(users.id, id));
  return getAccount(id);
}
