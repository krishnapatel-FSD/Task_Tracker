import { and, asc, desc, eq, inArray, isNull, isNotNull, sql, type SQL } from 'drizzle-orm';
import { db, type DbOrTx } from '../db/index.js';
import { projects, taskEvents, taskNotes, tasks, users } from '../db/schema.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import type { AuthUser } from '../lib/jwt.js';
import type { CreateTaskInput, ListTasksQuery, UpdateStatusInput, UpdateTaskInput } from '../validation/schemas.js';
import { assertActiveProject } from './projectService.js';
import { recordEvent } from './taskEvents.js';

/** The task shape returned by every task endpoint. */
const taskFields = {
  id: tasks.id,
  title: tasks.title,
  description: tasks.description,
  priority: tasks.priority,
  deadline: tasks.deadline,
  status: tasks.status,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  completedAt: tasks.completedAt,
  assignee: { id: users.id, name: users.name },
  project: { id: projects.id, name: projects.name, colourIndex: projects.colourIndex },
  attachmentCount: sql<number>`(select count(*) from attachments a where a.task_id = ${tasks.id} and a.deleted_at is null)`.mapWith(Number),
  noteCount: sql<number>`(select count(*) from task_notes n where n.task_id = ${tasks.id})`.mapWith(Number),
};

function selectTasks(conn: DbOrTx = db) {
  return conn
    .select(taskFields)
    .from(tasks)
    .innerJoin(users, eq(tasks.assigneeId, users.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id));
}

export async function getTaskById(id: string, conn: DbOrTx = db) {
  const [task] = await selectTasks(conn)
    .where(and(eq(tasks.id, id), isNull(tasks.archivedAt)))
    .limit(1);
  return task;
}

/**
 * Loads a live task. Archived or missing tasks are 404.
 * Everyone signed in can `read` any task (the team board). Only the admin and the
 * assignee can `write` to it (status, files); anyone else gets 403.
 */
export async function loadTaskFor(caller: AuthUser, id: string, access: 'read' | 'write', conn: DbOrTx = db) {
  const [task] = await conn
    .select({ id: tasks.id, assigneeId: tasks.assigneeId, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.archivedAt)))
    .limit(1);
  if (!task) throw notFound('Task not found');
  if (access === 'write' && caller.role !== 'admin' && task.assigneeId !== caller.id) {
    throw forbidden('You can only update your own tasks');
  }
  return task;
}

async function assertEmployee(conn: DbOrTx, userId: string) {
  const [user] = await conn.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role !== 'employee') {
    throw badRequest('Assignee must be an existing employee');
  }
}

export async function listTasks(caller: AuthUser, query: ListTasksQuery) {
  const conditions: SQL[] = [isNull(tasks.archivedAt)];

  // The whole team can see every task; "My tasks" is just the assignee filter.
  if (query.assigneeId) conditions.push(eq(tasks.assigneeId, query.assigneeId));
  if (query.status) conditions.push(eq(tasks.status, query.status));
  if (query.projectId) conditions.push(eq(tasks.projectId, query.projectId));

  return selectTasks()
    .where(and(...conditions))
    .orderBy(asc(tasks.deadline), asc(tasks.createdAt));
}

export async function createTask(caller: AuthUser, input: CreateTaskInput) {
  return db.transaction(async (tx) => {
    await assertEmployee(tx, input.assigneeId);
    await assertActiveProject(tx, input.projectId);

    const [created] = await tx.insert(tasks).values(input).returning({ id: tasks.id });
    await recordEvent(tx, {
      taskId: created.id,
      actorId: caller.id,
      type: 'created',
      data: {
        title: input.title,
        assigneeId: input.assigneeId,
        projectId: input.projectId,
        priority: input.priority,
        deadline: input.deadline,
      },
    });
    return (await getTaskById(created.id, tx))!;
  });
}

const EDITABLE = ['title', 'description', 'priority', 'deadline', 'projectId'] as const;

export async function updateTask(caller: AuthUser, id: string, input: UpdateTaskInput) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), isNull(tasks.archivedAt)))
      .limit(1);
    if (!current) throw notFound('Task not found');

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of EDITABLE) {
      const next = input[field];
      if (next !== undefined && next !== current[field]) {
        changes[field] = { from: current[field], to: next };
      }
    }
    const reassigned = input.assigneeId !== undefined && input.assigneeId !== current.assigneeId;

    if (Object.keys(changes).length === 0 && !reassigned) {
      return (await getTaskById(id, tx))!;
    }
    if (changes.projectId) await assertActiveProject(tx, input.projectId!);
    if (reassigned) await assertEmployee(tx, input.assigneeId!);

    await tx
      .update(tasks)
      .set({
        ...Object.fromEntries(Object.entries(changes).map(([field, c]) => [field, c.to])),
        ...(reassigned && { assigneeId: input.assigneeId }),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));

    if (Object.keys(changes).length > 0) {
      await recordEvent(tx, { taskId: id, actorId: caller.id, type: 'updated', data: { changes } });
    }
    if (reassigned) {
      await recordEvent(tx, {
        taskId: id,
        actorId: caller.id,
        type: 'reassigned',
        data: { fromId: current.assigneeId, toId: input.assigneeId },
      });
    }
    return (await getTaskById(id, tx))!;
  });
}

export async function updateTaskStatus(caller: AuthUser, taskId: string, { status, note }: UpdateStatusInput) {
  return db.transaction(async (tx) => {
    const task = await loadTaskFor(caller, taskId, 'write', tx);
    if (task.status === status) return (await getTaskById(taskId, tx))!;

    // Finishing a task always records what was done and how long it took.
    let noteId: string | undefined;
    if (status === 'done' && note) {
      const [created] = await tx
        .insert(taskNotes)
        .values({ taskId, authorId: caller.id, summary: note.summary, minutesSpent: note.minutesSpent })
        .returning({ id: taskNotes.id });
      noteId = created.id;
    }

    await tx
      .update(tasks)
      .set({
        status,
        // completed_at follows the done state: set on entering it, cleared on leaving it.
        completedAt: status === 'done' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    await recordEvent(tx, {
      taskId,
      actorId: caller.id,
      type: 'status_changed',
      data: { from: task.status, to: status, ...(noteId && note ? { noteId, minutesSpent: note.minutesSpent } : {}) },
    });
    return (await getTaskById(taskId, tx))!;
  });
}

/** Soft delete. The task disappears from lists and reports but can be restored. */
export async function archiveTask(caller: AuthUser, id: string) {
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({ archivedAt: new Date(), archivedBy: caller.id, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), isNull(tasks.archivedAt)))
      .returning({ id: tasks.id });
    if (!updated) throw notFound('Task not found');
    await recordEvent(tx, { taskId: id, actorId: caller.id, type: 'archived' });
  });
}

export async function restoreTask(caller: AuthUser, id: string) {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), isNotNull(tasks.archivedAt)))
      .returning({ id: tasks.id });
    if (!updated) throw notFound('Task not found');
    await recordEvent(tx, { taskId: id, actorId: caller.id, type: 'restored' });
    return (await getTaskById(id, tx))!;
  });
}

/** Notes on a task, newest first. Same visibility as the task: the admin and the assignee. */
export async function listTaskNotes(caller: AuthUser, taskId: string) {
  await loadTaskFor(caller, taskId, 'read');
  return db
    .select({
      id: taskNotes.id,
      summary: taskNotes.summary,
      minutesSpent: taskNotes.minutesSpent,
      createdAt: taskNotes.createdAt,
      author: { id: users.id, name: users.name },
    })
    .from(taskNotes)
    .innerJoin(users, eq(taskNotes.authorId, users.id))
    .where(eq(taskNotes.taskId, taskId))
    .orderBy(desc(taskNotes.createdAt), desc(taskNotes.id));
}

/** The activity timeline, newest first. People and project names are resolved now, not stored. */
export async function listTaskEvents(caller: AuthUser, taskId: string) {
  await loadTaskFor(caller, taskId, 'read');

  const rows = await db
    .select({
      id: taskEvents.id,
      type: taskEvents.type,
      data: taskEvents.data,
      createdAt: taskEvents.createdAt,
      actor: { id: users.id, name: users.name },
    })
    .from(taskEvents)
    .innerJoin(users, eq(taskEvents.actorId, users.id))
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(desc(taskEvents.createdAt), desc(taskEvents.id));

  const userIds = new Set<string>();
  const projectIds = new Set<string>();
  for (const { type, data } of rows) {
    if (type === 'reassigned') {
      userIds.add(data.fromId as string);
      userIds.add(data.toId as string);
    }
    if (type === 'created') {
      userIds.add(data.assigneeId as string);
      projectIds.add(data.projectId as string);
    }
    const projectChange = (data.changes as Record<string, { from: string; to: string }> | undefined)?.projectId;
    if (projectChange) {
      projectIds.add(projectChange.from);
      projectIds.add(projectChange.to);
    }
  }

  const userNames = userIds.size
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...userIds]))
    : [];
  const projectNames = projectIds.size
    ? await db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, [...projectIds]))
    : [];

  return {
    events: rows,
    names: Object.fromEntries([...userNames, ...projectNames].map((r) => [r.id, r.name])),
  };
}
