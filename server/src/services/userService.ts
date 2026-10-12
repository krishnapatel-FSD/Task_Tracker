import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

/** Employees for the assignee dropdown and filter. */
export async function listEmployees() {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.role, 'employee'))
    .orderBy(asc(users.name));
}
