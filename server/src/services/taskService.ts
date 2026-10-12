import { and, asc, eq, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tasks, users } from '../db/schema.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import type { AuthUser } from '../lib/jwt.js';
import type { CreateTaskInput, ListTasksQuery, UpdateStatusInput } from '../validation/schemas.js';

/** The task shape returned by every task endpoint. */
const taskFields = {
  id: tasks.id,
  title: tasks.title,
  description: tasks.description,
  priority: tasks.priority,
  deadline: tasks.deadline,
  status: tasks.status,
  createdAt: tasks.createdAt,
  assignee: { id: users.id, name: users.name },
};

function selectTasks() {
  return db.select(taskFields).from(tasks).innerJoin(users, eq(tasks.assigneeId, users.id));
}

async function getTaskById(id: string) {
  const [task] = await selectTasks().where(eq(tasks.id, id)).limit(1);
  return task;
}

export async function listTasks(caller: AuthUser, query: ListTasksQuery) {
  const conditions: SQL[] = [];

  if (caller.role === 'employee') {
    // Employees only ever see their own tasks; any assigneeId they send is ignored.
    conditions.push(eq(tasks.assigneeId, caller.id));
  } else if (query.assigneeId) {
    conditions.push(eq(tasks.assigneeId, query.assigneeId));
  }

  if (query.status) {
    conditions.push(eq(tasks.status, query.status));
  }

  return selectTasks()
    .where(and(...conditions))
    .orderBy(asc(tasks.deadline), asc(tasks.createdAt));
}

export async function createTask(input: CreateTaskInput) {
  const [assignee] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, input.assigneeId))
    .limit(1);

  if (!assignee || assignee.role !== 'employee') {
    throw badRequest('Assignee must be an existing employee');
  }

  const [created] = await db.insert(tasks).values(input).returning({ id: tasks.id });
  return getTaskById(created.id);
}

export async function updateTaskStatus(caller: AuthUser, taskId: string, { status }: UpdateStatusInput) {
  const [task] = await db
    .select({ assigneeId: tasks.assigneeId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) {
    throw notFound('Task not found');
  }
  if (caller.role !== 'admin' && task.assigneeId !== caller.id) {
    throw forbidden('You can only update your own tasks');
  }

  await db.update(tasks).set({ status, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  return getTaskById(taskId);
}
