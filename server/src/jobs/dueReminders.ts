import { and, eq, isNull, lt, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tasks, users } from '../db/schema.js';
import { addDays, daysBetween, todayIn } from '../lib/dates.js';
import { insertNotifications, type NewNotification } from '../services/notificationService.js';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Daily digest of "due tomorrow" and "overdue" work. One notification per person per
 * kind per day: the dedupe key carries the date, so a rerun on the same day adds nothing.
 */
export async function runDueReminders(opts: { today?: string } = {}) {
  const today = opts.today ?? todayIn();
  const tomorrow = addDays(today, 1);

  const open = and(isNull(tasks.archivedAt), ne(tasks.status, 'done'));
  const dueTomorrow = await db
    .select({ id: tasks.id, title: tasks.title, assigneeId: tasks.assigneeId })
    .from(tasks)
    .where(and(open, eq(tasks.deadline, tomorrow)));
  const overdue = await db
    .select({ id: tasks.id, title: tasks.title, assigneeId: tasks.assigneeId, deadline: tasks.deadline, assigneeName: users.name })
    .from(tasks)
    .innerJoin(users, eq(users.id, tasks.assigneeId))
    .where(and(open, lt(tasks.deadline, today)))
    .orderBy(tasks.deadline);
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));

  const rows: NewNotification[] = [];
  const byAssignee = <T extends { assigneeId: string }>(list: T[]) => {
    const map = new Map<string, T[]>();
    for (const item of list) map.set(item.assigneeId, [...(map.get(item.assigneeId) ?? []), item]);
    return map;
  };

  for (const [userId, list] of byAssignee(dueTomorrow)) {
    rows.push({
      userId,
      type: 'due_tomorrow',
      title: list.length === 1 ? `${list[0].title} is due tomorrow` : `${list.length} tasks due tomorrow`,
      body: list.length === 1 ? null : list.map((t) => t.title).join('; '),
      link: list.length === 1 ? `/tasks?task=${list[0].id}` : '/tasks',
      taskId: list.length === 1 ? list[0].id : null,
      dedupeKey: `due_tomorrow:${today}`,
    });
  }

  for (const [userId, list] of byAssignee(overdue)) {
    const late = daysBetween(list[0].deadline, today);
    rows.push({
      userId,
      type: 'overdue',
      title:
        list.length === 1
          ? `${list[0].title} is ${late} ${plural(late, 'day', 'days')} late`
          : `${list.length} of your tasks are past their deadline`,
      body: list.length === 1 ? null : list.map((t) => t.title).join('; '),
      link: list.length === 1 ? `/tasks?task=${list[0].id}` : '/tasks',
      taskId: list.length === 1 ? list[0].id : null,
      dedupeKey: `overdue:${today}`,
    });
  }

  if (overdue.length > 0) {
    const perPerson = [...byAssignee(overdue).values()].map((list) => `${list[0].assigneeName}: ${list.length}`);
    for (const admin of admins) {
      rows.push({
        userId: admin.id,
        type: 'overdue',
        title: `${overdue.length} ${plural(overdue.length, 'task is', 'tasks are')} overdue`,
        body: perPerson.join(', '),
        link: '/admin/tasks',
        dedupeKey: `overdue:${today}`,
      });
    }
  }

  await insertNotifications(db, rows);
  return { dueTomorrow: dueTomorrow.length, overdue: overdue.length, notifications: rows.length, today };
}

/** For tests: how many reminder notifications exist for a dedupe key. */
export async function countByDedupeKey(dedupeKey: string) {
  const result = await db.execute<{ count: string }>(sql`select count(*) from notifications where dedupe_key = ${dedupeKey}`);
  return Number(result.rows[0].count);
}
