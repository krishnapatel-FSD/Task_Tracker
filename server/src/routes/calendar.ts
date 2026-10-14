import { and, asc, eq, gte, isNull, lte, ne, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { projectHolidays, projects, tasks, users } from '../db/schema.js';
import { env } from '../lib/env.js';
import { badRequest } from '../lib/errors.js';
import { buildCalendar } from '../lib/ical.js';
import { authenticate } from '../middleware/authenticate.js';

/** The calendar: days off for every project, and the .ics export. Open to the whole team. */
export const calendarRouter = Router();

calendarRouter.use(authenticate);

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeSchema = z
  .object({
    from: iso,
    to: iso,
    projectId: z.uuid().optional(),
    assigneeId: z.uuid().optional(),
    includeDone: z.enum(['true', 'false']).optional(),
  })
  .refine((v) => v.from <= v.to, 'from must be on or before to')
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 400, 'Export at most about a year at a time');

// Weekend settings and holidays, so the calendar can mark deadlines on days off.
calendarRouter.get('/days-off', async (_req, res) => {
  const [settings, holidays] = await Promise.all([
    db.select({ id: projects.id, skipWeekends: projects.skipWeekends }).from(projects).where(isNull(projects.archivedAt)),
    db
      .select({ projectId: projectHolidays.projectId, date: projectHolidays.date, name: projectHolidays.name })
      .from(projectHolidays)
      .innerJoin(projects, eq(projects.id, projectHolidays.projectId))
      .where(isNull(projects.archivedAt))
      .orderBy(asc(projectHolidays.date)),
  ]);
  res.json({ projects: settings, holidays });
});

// The deadlines in a date range (with the calendar's filters) as an .ics file.
calendarRouter.get('/deadlines.ics', async (req, res) => {
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid range');
  const q = parsed.data;

  const conditions: SQL[] = [isNull(tasks.archivedAt), gte(tasks.deadline, q.from), lte(tasks.deadline, q.to)];
  if (q.projectId) conditions.push(eq(tasks.projectId, q.projectId));
  if (q.assigneeId) conditions.push(eq(tasks.assigneeId, q.assigneeId));
  if (q.includeDone !== 'true') conditions.push(ne(tasks.status, 'done'));

  const rows = await db
    .select({ id: tasks.id, title: tasks.title, deadline: tasks.deadline, status: tasks.status, priority: tasks.priority, project: projects.name, assignee: users.name, assigneeId: users.id })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(users, eq(users.id, tasks.assigneeId))
    .where(and(...conditions))
    .orderBy(asc(tasks.deadline));

  const STATUS: Record<string, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
  const isAdmin = req.user!.role === 'admin';
  const ics = buildCalendar(
    'Task Tracker deadlines',
    rows.map((t) => ({
      uid: `${t.id}@task-tracker`,
      date: t.deadline,
      summary: `Due: ${t.title}`,
      description: `${t.project}. Assigned to ${t.assignee}. ${STATUS[t.status]}, ${t.priority} priority.`,
      url: `${env.APP_URL}${isAdmin ? '/admin/tasks' : t.assigneeId === req.user!.id ? '/tasks' : '/team'}?task=${t.id}`,
    })),
  );
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="deadlines-${q.from}-to-${q.to}.ics"`);
  res.send(ics);
});
