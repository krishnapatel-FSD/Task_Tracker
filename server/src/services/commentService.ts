import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '../db/index.js';
import { commentMentions, taskCommentRevisions, taskComments, tasks, users } from '../db/schema.js';
import { forbidden, notFound } from '../lib/errors.js';
import type { AuthUser } from '../lib/jwt.js';
import type { CommentInput } from '../validation/schemas.js';
import { insertNotifications, type NewNotification } from './notificationService.js';
import { loadTaskFor } from './taskService.js';

// Comments are open to the whole team (everyone can read every task). Authors edit and
// delete their own; the admin can also delete any comment and read every edit history.

/**
 * Keeps only real people whose "@Name" is still in the text. The client sends the ids
 * picked from the @ list; a name typed by hand or later removed from the text is ignored.
 */
async function resolveMentions(conn: DbOrTx, body: string, ids: string[], authorId: string) {
  const unique = [...new Set(ids)].filter((id) => id !== authorId);
  if (unique.length === 0) return [];
  const people = await conn.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, unique));
  return people.filter((p) => body.includes(`@${p.name}`));
}

async function loadComment(conn: DbOrTx, id: string) {
  const [row] = await conn
    .select({
      id: taskComments.id,
      taskId: taskComments.taskId,
      authorId: taskComments.authorId,
      body: taskComments.body,
      deletedAt: taskComments.deletedAt,
    })
    .from(taskComments)
    .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
    .where(and(eq(taskComments.id, id), isNull(tasks.archivedAt)))
    .limit(1);
  if (!row) throw notFound('Comment not found');
  return row;
}

/** Where a notification about this task should open, for this person. */
async function linkFor(conn: DbOrTx, userId: string, task: { id: string; assigneeId: string }) {
  const [u] = await conn.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (u?.role === 'admin') return `/admin/tasks?task=${task.id}`;
  return task.assigneeId === userId ? `/tasks?task=${task.id}` : `/team?task=${task.id}`;
}

function excerpt(body: string) {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 137)}...` : flat;
}

/**
 * Mentioned people get "mentioned you"; the assignee and the admin hear about other
 * new comments. Nobody is notified twice for one comment, and never about their own.
 */
async function notifyForComment(
  conn: DbOrTx,
  caller: AuthUser,
  task: { id: string; title: string; assigneeId: string },
  body: string,
  mentioned: { id: string }[],
  { mentionsOnly }: { mentionsOnly: boolean },
) {
  const [author] = await conn.select({ name: users.name }).from(users).where(eq(users.id, caller.id));
  const rows: NewNotification[] = [];
  const told = new Set<string>([caller.id]);
  for (const m of mentioned) {
    if (told.has(m.id)) continue;
    told.add(m.id);
    rows.push({
      userId: m.id,
      taskId: task.id,
      type: 'mentioned',
      title: `${author.name} mentioned you on ${task.title}`,
      body: excerpt(body),
      link: await linkFor(conn, m.id, task),
    });
  }
  if (!mentionsOnly) {
    const admins = await conn.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
    for (const id of [task.assigneeId, ...admins.map((a) => a.id)]) {
      if (told.has(id)) continue;
      told.add(id);
      rows.push({
        userId: id,
        taskId: task.id,
        type: 'comment_added',
        title: `${author.name} commented on ${task.title}`,
        body: excerpt(body),
        link: await linkFor(conn, id, task),
      });
    }
  }
  await insertNotifications(conn, rows);
}

/** Comments on a task, oldest first. Deleted ones stay as a placeholder without their text. */
export async function listComments(caller: AuthUser, taskId: string) {
  await loadTaskFor(caller, taskId, 'read');
  const rows = await db
    .select({
      id: taskComments.id,
      body: taskComments.body,
      createdAt: taskComments.createdAt,
      editedAt: taskComments.editedAt,
      deletedAt: taskComments.deletedAt,
      author: { id: users.id, name: users.name },
      revisionCount: sql<number>`(select count(*) from task_comment_revisions r where r.comment_id = ${taskComments.id})`.mapWith(Number),
    })
    .from(taskComments)
    .innerJoin(users, eq(users.id, taskComments.authorId))
    .where(eq(taskComments.taskId, taskId))
    .orderBy(asc(taskComments.createdAt), asc(taskComments.id));

  const ids = rows.map((r) => r.id);
  const mentions = ids.length
    ? await db
        .select({ commentId: commentMentions.commentId, id: users.id, name: users.name })
        .from(commentMentions)
        .innerJoin(users, eq(users.id, commentMentions.userId))
        .where(inArray(commentMentions.commentId, ids))
    : [];

  return rows.map((r) => ({
    ...r,
    body: r.deletedAt ? null : r.body,
    deleted: r.deletedAt !== null,
    mentions: r.deletedAt ? [] : mentions.filter((m) => m.commentId === r.id).map(({ id, name }) => ({ id, name })),
  }));
}

export async function addComment(caller: AuthUser, taskId: string, input: CommentInput) {
  return db.transaction(async (tx) => {
    const task = await loadTaskFor(caller, taskId, 'read', tx);
    const [created] = await tx
      .insert(taskComments)
      .values({ taskId, authorId: caller.id, body: input.body })
      .returning({ id: taskComments.id });
    const mentioned = await resolveMentions(tx, input.body, input.mentionIds, caller.id);
    if (mentioned.length) {
      await tx.insert(commentMentions).values(mentioned.map((m) => ({ commentId: created.id, userId: m.id })));
    }
    await notifyForComment(tx, caller, task, input.body, mentioned, { mentionsOnly: false });
    return { id: created.id };
  });
}

/** Only the author edits. The old text goes to the revisions table first. */
export async function editComment(caller: AuthUser, id: string, input: CommentInput) {
  return db.transaction(async (tx) => {
    const comment = await loadComment(tx, id);
    await loadTaskFor(caller, comment.taskId, 'read', tx);
    if (comment.authorId !== caller.id) throw forbidden('You can only edit your own comments');
    if (comment.deletedAt) throw notFound('Comment not found');
    if (comment.body === input.body) return { id };

    await tx.insert(taskCommentRevisions).values({ commentId: id, body: comment.body, editorId: caller.id });
    await tx.update(taskComments).set({ body: input.body, editedAt: new Date() }).where(eq(taskComments.id, id));

    // Mentions follow the new text; only people newly mentioned are told.
    const before = await tx.select({ userId: commentMentions.userId }).from(commentMentions).where(eq(commentMentions.commentId, id));
    const mentioned = await resolveMentions(tx, input.body, input.mentionIds, caller.id);
    await tx.delete(commentMentions).where(eq(commentMentions.commentId, id));
    if (mentioned.length) {
      await tx.insert(commentMentions).values(mentioned.map((m) => ({ commentId: id, userId: m.id })));
    }
    const fresh = mentioned.filter((m) => !before.some((b) => b.userId === m.id));
    if (fresh.length) {
      const task = await loadTaskFor(caller, comment.taskId, 'read', tx);
      await notifyForComment(tx, caller, task, input.body, fresh, { mentionsOnly: true });
    }
    return { id };
  });
}

/** The author, or the admin, can delete. The text is kept for the audit trail but no longer shown. */
export async function deleteComment(caller: AuthUser, id: string) {
  const comment = await loadComment(db, id);
  if (comment.deletedAt) return;
  if (caller.role !== 'admin' && comment.authorId !== caller.id) throw forbidden('You can only delete your own comments');
  await db.update(taskComments).set({ deletedAt: new Date(), deletedBy: caller.id }).where(eq(taskComments.id, id));
}

/** Undo for a delete. Same people who could delete it. */
export async function restoreComment(caller: AuthUser, id: string) {
  const comment = await loadComment(db, id);
  if (caller.role !== 'admin' && comment.authorId !== caller.id) throw forbidden('You can only restore your own comments');
  await db.update(taskComments).set({ deletedAt: null, deletedBy: null }).where(eq(taskComments.id, id));
}

/** Earlier versions of a comment, newest first. For the admin and the author. */
export async function listRevisions(caller: AuthUser, id: string) {
  const comment = await loadComment(db, id);
  if (caller.role !== 'admin' && comment.authorId !== caller.id) throw forbidden('Only the author and the admin can see edit history');
  return db
    .select({ id: taskCommentRevisions.id, body: taskCommentRevisions.body, createdAt: taskCommentRevisions.createdAt, editor: { id: users.id, name: users.name } })
    .from(taskCommentRevisions)
    .innerJoin(users, eq(users.id, taskCommentRevisions.editorId))
    .where(eq(taskCommentRevisions.commentId, id))
    .orderBy(sql`${taskCommentRevisions.createdAt} desc`);
}
