import { and, asc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects, taskNotes, tasks, users } from '../db/schema.js';
import { todayIn } from '../lib/dates.js';
import { env } from '../lib/env.js';
import { forbidden } from '../lib/errors.js';
import type { AuthUser } from '../lib/jwt.js';

// Progress per person: the tasks due in a period, each with where it stands.
// The admin sees every employee; an employee sees only themselves.

export type ProgressState = 'done' | 'doneLate' | 'inProgress' | 'todo' | 'late';

export interface ProgressQuery {
  from: string;
  to: string;
  projectId?: string;
  userId?: string;
}

const tz = () => sql.raw(`'${env.REPORT_TZ.replace(/'/g, '')}'`);

export async function getProgress(caller: AuthUser, q: ProgressQuery) {
  if (caller.role !== 'admin' && q.userId && q.userId !== caller.id) {
    throw forbidden('You can only see your own progress');
  }
  const onlyUser = caller.role === 'admin' ? q.userId : caller.id;

  const people = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(onlyUser ? eq(users.id, onlyUser) : eq(users.role, 'employee'))
    .orderBy(asc(users.name));
  if (people.length === 0) return { from: q.from, to: q.to, people: [] };

  const conditions: SQL[] = [
    isNull(tasks.archivedAt),
    gte(tasks.deadline, q.from),
    lte(tasks.deadline, q.to),
    inArray(tasks.assigneeId, people.map((p) => p.id)),
  ];
  if (q.projectId) conditions.push(eq(tasks.projectId, q.projectId));

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      deadline: tasks.deadline,
      status: tasks.status,
      assigneeId: tasks.assigneeId,
      // finished on or before its deadline, as a calendar day in the office's time zone
      onTime: sql<boolean>`(${tasks.completedAt} at time zone ${tz()})::date <= ${tasks.deadline}`,
      minutes: sql<number>`coalesce((select sum(${taskNotes.minutesSpent}) from ${taskNotes} where ${taskNotes.taskId} = ${tasks.id}), 0)`.mapWith(Number),
      project: { id: projects.id, name: projects.name, colourIndex: projects.colourIndex },
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(...conditions))
    .orderBy(asc(tasks.deadline), asc(tasks.createdAt));

  const today = todayIn();
  const stateOf = (r: (typeof rows)[number]): ProgressState => {
    if (r.status === 'done') return r.onTime ? 'done' : 'doneLate';
    if (r.deadline < today) return 'late';
    return r.status === 'in_progress' ? 'inProgress' : 'todo';
  };

  return {
    from: q.from,
    to: q.to,
    people: people.map((p) => {
      const mine = rows.filter((r) => r.assigneeId === p.id).map((r) => ({ ...r, state: stateOf(r) }));
      const count = (s: ProgressState) => mine.filter((t) => t.state === s).length;
      const finished = count('done') + count('doneLate');
      return {
        id: p.id,
        name: p.name,
        total: mine.length,
        done: count('done'),
        doneLate: count('doneLate'),
        inProgress: count('inProgress'),
        todo: count('todo'),
        late: count('late'),
        percentDone: mine.length === 0 ? null : Math.round((finished / mine.length) * 100),
        minutesLogged: mine.reduce((sum, t) => sum + t.minutes, 0),
        tasks: mine.map(({ id, title, deadline, state, project }) => ({ id, title, deadline, state, project })),
      };
    }),
  };
}
