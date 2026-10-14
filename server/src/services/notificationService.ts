import { and, desc, eq, gt, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { db, type DbOrTx, type Tx } from '../db/index.js';
import {
  notificationPreferences,
  notifications,
  taskNotes,
  tasks,
  users,
  type NotificationType,
  type Status,
} from '../db/schema.js';
import { formatDay, formatMinutes } from '../lib/dates.js';
import { notFound } from '../lib/errors.js';
import { onTaskEvent, type TaskEventRow } from './taskEvents.js';

/** A delete is held back for the client's 8 s Undo window plus a margin. */
export const UNDO_HOLD_MS = 10_000;

const STATUS_LABELS: Record<Status, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export interface NewNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  taskId?: string | null;
  eventId?: string | null;
  dedupeKey?: string | null;
  deliverAfter?: Date;
}

export async function insertNotifications(conn: DbOrTx, rows: NewNotification[]) {
  if (rows.length === 0) return;
  // Duplicate dedupe keys are skipped, which makes scheduled jobs safe to rerun.
  await conn.insert(notifications).values(rows).onConflictDoNothing();
}

async function adminIds(conn: DbOrTx) {
  const rows = await conn.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
  return rows.map((r) => r.id);
}

const taskLink = (taskId: string, forAdmin: boolean) => (forAdmin ? `/admin/tasks?task=${taskId}` : `/tasks?task=${taskId}`);

/**
 * Turns one activity-log event into notifications, inside the same transaction,
 * so a rolled-back change never leaves a notification behind. Never notifies the actor.
 */
export async function notifyForEvent(tx: Tx, event: TaskEventRow) {
  const [task] = await tx
    .select({ id: tasks.id, title: tasks.title, assigneeId: tasks.assigneeId, deadline: tasks.deadline })
    .from(tasks)
    .where(eq(tasks.id, event.taskId))
    .limit(1);
  if (!task) return;

  const [actor] = await tx.select({ name: users.name, role: users.role }).from(users).where(eq(users.id, event.actorId));
  const admins = await adminIds(tx);
  const isAdmin = (id: string) => admins.includes(id);
  const base = { taskId: task.id, eventId: event.id };
  const rows: NewNotification[] = [];
  const d = event.data as Record<string, any>;

  switch (event.type) {
    case 'created':
      rows.push({
        ...base,
        userId: task.assigneeId,
        type: 'task_assigned',
        title: `New task: ${task.title}`,
        body: `Due ${formatDay(task.deadline)}. Assigned by ${actor.name}.`,
        link: taskLink(task.id, false),
      });
      break;

    case 'reassigned': {
      const [to] = await tx.select({ name: users.name }).from(users).where(eq(users.id, d.toId));
      rows.push(
        {
          ...base,
          userId: d.toId,
          type: 'task_assigned',
          title: `${actor.name} assigned you ${task.title}`,
          body: `Due ${formatDay(task.deadline)}.`,
          link: taskLink(task.id, false),
        },
        {
          ...base,
          userId: d.fromId,
          type: 'task_unassigned',
          title: `${task.title} was moved to ${to?.name ?? 'someone else'}`,
          // They can no longer open the task, so the link goes to their list.
          link: '/tasks',
        },
      );
      break;
    }

    case 'updated': {
      const changes = d.changes as Record<string, { from: string; to: string }>;
      const parts: string[] = [];
      if (changes.deadline) parts.push(`Deadline for ${task.title} moved to ${formatDay(changes.deadline.to)}`);
      if (changes.priority) parts.push(`${task.title} is now ${PRIORITY_LABELS[changes.priority.to]} priority`);
      if (parts.length > 0) {
        rows.push({
          ...base,
          userId: task.assigneeId,
          type: 'task_updated',
          title: parts.length === 1 ? parts[0] : `${task.title} was updated`,
          body: parts.length === 1 ? `Changed by ${actor.name}.` : `${parts.join('. ')}.`,
          link: taskLink(task.id, false),
        });
      }
      break;
    }

    case 'archived':
      rows.push({
        ...base,
        userId: task.assigneeId,
        type: 'task_removed',
        title: `${task.title} was removed`,
        body: `Removed by ${actor.name}.`,
        link: '/tasks',
        deliverAfter: new Date(Date.now() + UNDO_HOLD_MS),
      });
      break;

    case 'restored':
      // An undone delete never reaches anyone: drop removal notices still on hold.
      await tx
        .delete(notifications)
        .where(and(eq(notifications.taskId, task.id), eq(notifications.type, 'task_removed'), gt(notifications.deliverAfter, new Date())));
      break;

    case 'status_changed': {
      const label = STATUS_LABELS[d.to as Status];
      // A completion carries its note: say how long it took and what was done.
      const minutes = typeof d.minutesSpent === 'number' ? d.minutesSpent : null;
      let body: string | undefined;
      if (minutes !== null && typeof d.noteId === 'string') {
        const [note] = await tx.select({ summary: taskNotes.summary }).from(taskNotes).where(eq(taskNotes.id, d.noteId)).limit(1);
        body = `Took ${formatMinutes(minutes)}.${note ? ` ${note.summary}` : ''}`;
      }
      if (isAdmin(event.actorId)) {
        rows.push({
          ...base,
          userId: task.assigneeId,
          type: 'status_changed',
          title: `${actor.name} moved ${task.title} to ${label}`,
          body,
          link: taskLink(task.id, false),
        });
      } else {
        for (const adminId of admins) {
          rows.push({ ...base, userId: adminId, type: 'status_changed', title: `${actor.name} marked ${task.title} as ${label}`, body, link: taskLink(task.id, true) });
        }
      }
      break;
    }

    case 'attachment_added': {
      const title = `${actor.name} added ${d.fileName} to ${task.title}`;
      if (isAdmin(event.actorId)) {
        rows.push({ ...base, userId: task.assigneeId, type: 'attachment_added', title, link: taskLink(task.id, false) });
      } else {
        for (const adminId of admins) {
          rows.push({ ...base, userId: adminId, type: 'attachment_added', title, link: taskLink(task.id, true) });
        }
      }
      break;
    }
  }

  await insertNotifications(
    tx,
    rows.filter((r) => r.userId !== event.actorId),
  );
}

onTaskEvent(notifyForEvent);

// ---- Reading -----------------------------------------------------------------

const delivered = () => lte(notifications.deliverAfter, new Date());

const PAGE_SIZE = 20;

export async function listNotifications(userId: string, opts: { unread?: boolean; before?: string; limit?: number }) {
  const conditions: SQL[] = [eq(notifications.userId, userId), delivered()];
  if (opts.unread) conditions.push(isNull(notifications.readAt));
  if (opts.before) conditions.push(lt(notifications.createdAt, new Date(opts.before)));

  const limit = Math.min(opts.limit ?? PAGE_SIZE, 50);
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      taskId: notifications.taskId,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null };
}

export async function unreadCount(userId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), delivered()));
  return count;
}

export async function markRead(userId: string, id: string) {
  const [row] = await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId), delivered()))
    .returning({ id: notifications.id });
  if (!row) throw notFound('Notification not found');
}

export async function markAllRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), delivered()));
}

// ---- Preferences -------------------------------------------------------------

export async function getPreferences(userId: string) {
  const [prefs] = await db
    .select({ emailEnabled: notificationPreferences.emailEnabled, emailFrequency: notificationPreferences.emailFrequency })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  return prefs ?? { emailEnabled: true, emailFrequency: 'instant' as const };
}

export async function setPreferences(userId: string, prefs: { emailEnabled: boolean; emailFrequency: 'instant' | 'daily' }) {
  await db
    .insert(notificationPreferences)
    .values({ userId, ...prefs })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: { ...prefs, updatedAt: new Date() } });
  return getPreferences(userId);
}

/** Notifications still waiting for an instant email (used by the outbox job). */
export function outboxCondition() {
  return and(
    isNull(notifications.emailedAt),
    delivered(),
    gt(notifications.createdAt, sql`now() - interval '1 day'`),
    or(isNull(notificationPreferences.userId), eq(notificationPreferences.emailEnabled, true)),
  );
}
