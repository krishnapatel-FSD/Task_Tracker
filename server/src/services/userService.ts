import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

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
