import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { taskChecklistItems, tasks, users } from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';
import type { AuthUser } from '../lib/jwt.js';
import { loadTaskFor } from './taskService.js';

// Checklist steps inside a task. Everyone can read them (team board); the admin and the
// assignee add, tick, rename and remove them.

const MAX_ITEMS = 50;

export async function listItems(caller: AuthUser, taskId: string) {
  await loadTaskFor(caller, taskId, 'read');
  return db
    .select({
      id: taskChecklistItems.id,
      text: taskChecklistItems.text,
      done: sql<boolean>`${taskChecklistItems.doneAt} is not null`,
      doneAt: taskChecklistItems.doneAt,
      doneBy: { id: users.id, name: users.name },
    })
    .from(taskChecklistItems)
    .leftJoin(users, eq(users.id, taskChecklistItems.doneBy))
    .where(eq(taskChecklistItems.taskId, taskId))
    .orderBy(asc(taskChecklistItems.position), asc(taskChecklistItems.createdAt));
}

export async function addItem(caller: AuthUser, taskId: string, text: string) {
  await loadTaskFor(caller, taskId, 'write');
  const [{ count, maxPos }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number), maxPos: sql<number>`coalesce(max(${taskChecklistItems.position}), -1)`.mapWith(Number) })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, taskId));
  if (count >= MAX_ITEMS) throw badRequest(`A checklist can have at most ${MAX_ITEMS} items`);
  const [created] = await db.insert(taskChecklistItems).values({ taskId, text, position: maxPos + 1 }).returning({ id: taskChecklistItems.id });
  return created;
}

async function loadItem(caller: AuthUser, id: string) {
  const [item] = await db
    .select({ id: taskChecklistItems.id, taskId: taskChecklistItems.taskId })
    .from(taskChecklistItems)
    .innerJoin(tasks, eq(tasks.id, taskChecklistItems.taskId))
    .where(and(eq(taskChecklistItems.id, id), isNull(tasks.archivedAt)))
    .limit(1);
  if (!item) throw notFound('Checklist item not found');
  await loadTaskFor(caller, item.taskId, 'write');
  return item;
}

export async function updateItem(caller: AuthUser, id: string, changes: { text?: string; done?: boolean }) {
  await loadItem(caller, id);
  await db
    .update(taskChecklistItems)
    .set({
      ...(changes.text !== undefined && { text: changes.text }),
      ...(changes.done !== undefined && { doneAt: changes.done ? new Date() : null, doneBy: changes.done ? caller.id : null }),
    })
    .where(eq(taskChecklistItems.id, id));
}

export async function removeItem(caller: AuthUser, id: string) {
  await loadItem(caller, id);
  await db.delete(taskChecklistItems).where(eq(taskChecklistItems.id, id));
}
