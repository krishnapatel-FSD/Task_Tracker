import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, type DbOrTx } from '../db/index.js';
import { attachments, taskChecklistItems, taskComments, taskHandoffs, tasks, users } from '../db/schema.js';
import { badRequest, conflict, forbidden } from '../lib/errors.js';
import type { AuthUser } from '../lib/jwt.js';
import type { HandoffInput } from '../validation/schemas.js';
import { recordEvent } from './taskEvents.js';
import { getTaskById, loadTaskFor } from './taskService.js';

// Handing a task to someone else. The admin or the current assignee writes a handoff
// (done so far, still to do, blockers, decisions, the files that matter); the task moves to
// the new person at once but stays locked for them until they accept it.

/** The open handoff on a task, if the new person hasn't accepted it yet. */
export async function pendingHandoff(conn: DbOrTx, taskId: string) {
  const [row] = await conn
    .select({ id: taskHandoffs.id, toUserId: taskHandoffs.toUserId })
    .from(taskHandoffs)
    .where(and(eq(taskHandoffs.taskId, taskId), isNull(taskHandoffs.acceptedAt)))
    .limit(1);
  return row;
}

function excerpt(text: string, max = 160) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}

/** A starting point for the handoff, built from the task's checklist, comments and files. */
export async function draftHandoff(caller: AuthUser, taskId: string) {
  const task = await loadTaskFor(caller, taskId, 'write');
  const items = await db
    .select({ text: taskChecklistItems.text, doneAt: taskChecklistItems.doneAt })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, taskId))
    .orderBy(asc(taskChecklistItems.position));
  const comments = await db
    .select({ body: taskComments.body, author: users.name })
    .from(taskComments)
    .innerJoin(users, eq(users.id, taskComments.authorId))
    .where(and(eq(taskComments.taskId, taskId), isNull(taskComments.deletedAt)))
    .orderBy(desc(taskComments.createdAt))
    .limit(3);
  const files = await db
    .select({ id: attachments.id, fileName: attachments.fileName })
    .from(attachments)
    .where(and(eq(attachments.taskId, taskId), isNull(attachments.deletedAt)))
    .orderBy(asc(attachments.createdAt));

  const done = items.filter((i) => i.doneAt).map((i) => i.text);
  if (task.status === 'in_progress' && done.length === 0) done.push('Work has started (status: In progress).');
  return {
    done,
    remaining: items.filter((i) => !i.doneAt).map((i) => i.text),
    blockers: '',
    decisions: comments
      .reverse()
      .map((c) => `${c.author}: ${excerpt(c.body)}`)
      .join('\n'),
    files,
  };
}

export async function createHandoff(caller: AuthUser, taskId: string, input: HandoffInput) {
  return db.transaction(async (tx) => {
    const task = await loadTaskFor(caller, taskId, 'write', tx);
    if (task.status === 'done') throw badRequest('This task is finished. Reopen it before handing it off.');
    if (await pendingHandoff(tx, taskId)) throw conflict('This task is already waiting for someone to accept it.');
    if (input.toUserId === task.assigneeId) throw badRequest('Pick someone other than the current owner.');
    const [to] = await tx.select({ role: users.role }).from(users).where(eq(users.id, input.toUserId)).limit(1);
    if (!to || to.role !== 'employee') throw badRequest('Hand the task to an existing employee.');

    // only files that belong to this task
    const fileIds = input.attachmentIds.length
      ? (
          await tx
            .select({ id: attachments.id })
            .from(attachments)
            .where(and(eq(attachments.taskId, taskId), isNull(attachments.deletedAt), inArray(attachments.id, input.attachmentIds)))
        ).map((f) => f.id)
      : [];

    const [handoff] = await tx
      .insert(taskHandoffs)
      .values({
        taskId,
        fromUserId: task.assigneeId,
        toUserId: input.toUserId,
        createdBy: caller.id,
        done: input.done,
        remaining: input.remaining,
        blockers: input.blockers || null,
        decisions: input.decisions || null,
        attachmentIds: fileIds,
      })
      .returning({ id: taskHandoffs.id });
    await tx.update(tasks).set({ assigneeId: input.toUserId, updatedAt: new Date() }).where(eq(tasks.id, taskId));
    await recordEvent(tx, {
      taskId,
      actorId: caller.id,
      type: 'handed_off',
      data: { fromId: task.assigneeId, toId: input.toUserId, handoffId: handoff.id },
    });
    return (await getTaskById(taskId, tx))!;
  });
}

/** Only the person receiving the task can accept it. */
export async function acceptHandoff(caller: AuthUser, taskId: string) {
  return db.transaction(async (tx) => {
    const open = await pendingHandoff(tx, taskId);
    if (!open) throw conflict('There is no handoff waiting on this task.');
    if (open.toUserId !== caller.id) throw forbidden('Only the person receiving the task can accept it.');
    await tx.update(taskHandoffs).set({ acceptedAt: new Date() }).where(eq(taskHandoffs.id, open.id));
    await recordEvent(tx, { taskId, actorId: caller.id, type: 'handoff_accepted', data: { handoffId: open.id } });
    return (await getTaskById(taskId, tx))!;
  });
}

/** Every handoff on a task, newest first, with names and the files it points to. */
export async function listHandoffs(caller: AuthUser, taskId: string) {
  await loadTaskFor(caller, taskId, 'read');
  const fromU = alias(users, 'from_user');
  const toU = alias(users, 'to_user');
  const byU = alias(users, 'by_user');
  const rows = await db
    .select({
      id: taskHandoffs.id,
      done: taskHandoffs.done,
      remaining: taskHandoffs.remaining,
      blockers: taskHandoffs.blockers,
      decisions: taskHandoffs.decisions,
      attachmentIds: taskHandoffs.attachmentIds,
      acceptedAt: taskHandoffs.acceptedAt,
      createdAt: taskHandoffs.createdAt,
      from: { id: fromU.id, name: fromU.name },
      to: { id: toU.id, name: toU.name },
      by: { id: byU.id, name: byU.name },
    })
    .from(taskHandoffs)
    .innerJoin(fromU, eq(fromU.id, taskHandoffs.fromUserId))
    .innerJoin(toU, eq(toU.id, taskHandoffs.toUserId))
    .innerJoin(byU, eq(byU.id, taskHandoffs.createdBy))
    .where(eq(taskHandoffs.taskId, taskId))
    .orderBy(desc(taskHandoffs.createdAt));

  const ids = [...new Set(rows.flatMap((r) => r.attachmentIds))];
  const files = ids.length
    ? await db
        .select({ id: attachments.id, fileName: attachments.fileName, deletedAt: attachments.deletedAt })
        .from(attachments)
        .where(inArray(attachments.id, ids))
    : [];
  return rows.map(({ attachmentIds, ...r }) => ({
    ...r,
    files: attachmentIds
      .map((id) => files.find((f) => f.id === id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f))
      .map((f) => ({ id: f.id, fileName: f.fileName, removed: f.deletedAt !== null })),
  }));
}

