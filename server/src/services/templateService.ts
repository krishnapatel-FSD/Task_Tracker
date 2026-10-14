import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { db, type DbOrTx } from '../db/index.js';
import { projectHolidays, projects, taskOccurrences, taskTemplates, users } from '../db/schema.js';
import { addDays, todayIn } from '../lib/dates.js';
import { badRequest, notFound } from '../lib/errors.js';
import type { AuthUser } from '../lib/jwt.js';
import { deadlinesBetween, describeRule, nextDeadlines, type RepeatRule, type WorkCalendar } from '../lib/recurrence.js';
import type { PreviewRuleInput, TemplateInput } from '../validation/schemas.js';
import { assertActiveProject } from './projectService.js';
import { insertTask } from './taskService.js';

// Task templates (admin only) and the repeat schedule job that turns them into tasks.

/** A project's working days: its weekend setting plus its holidays. */
export async function workCalendar(conn: DbOrTx, projectId: string): Promise<WorkCalendar> {
  const [project] = await conn.select({ skipWeekends: projects.skipWeekends }).from(projects).where(eq(projects.id, projectId)).limit(1);
  const holidays = await conn.select({ date: projectHolidays.date }).from(projectHolidays).where(eq(projectHolidays.projectId, projectId));
  return { skipWeekends: project?.skipWeekends ?? true, holidays: new Set(holidays.map((h) => h.date)) };
}

const ruleOf = (t: Pick<typeof taskTemplates.$inferSelect, 'repeat' | 'weekdays' | 'monthDay' | 'intervalDays' | 'startDate' | 'endDate'>): RepeatRule => ({
  repeat: t.repeat,
  weekdays: t.weekdays,
  monthDay: t.monthDay,
  intervalDays: t.intervalDays,
  startDate: t.startDate,
  endDate: t.endDate,
});

async function assertEmployeeOrNull(conn: DbOrTx, id: string | null) {
  if (!id) return;
  const [u] = await conn.select({ role: users.role }).from(users).where(eq(users.id, id)).limit(1);
  if (!u || u.role !== 'employee') throw badRequest('Assignee must be an existing employee');
}

export async function listTemplates() {
  const rows = await db
    .select({
      template: taskTemplates,
      project: { id: projects.id, name: projects.name, colourIndex: projects.colourIndex },
      assignee: { id: users.id, name: users.name },
    })
    .from(taskTemplates)
    .innerJoin(projects, eq(projects.id, taskTemplates.projectId))
    .leftJoin(users, eq(users.id, taskTemplates.assigneeId))
    .where(isNull(taskTemplates.archivedAt))
    .orderBy(asc(taskTemplates.name));

  const today = todayIn();
  return Promise.all(
    rows.map(async ({ template: t, project, assignee }) => {
      const rule = ruleOf(t);
      const next = t.repeat === 'none' || t.paused ? [] : nextDeadlines(rule, await workCalendar(db, t.projectId), today, 1);
      const [last] = await db
        .select({ deadline: taskOccurrences.deadline })
        .from(taskOccurrences)
        .where(eq(taskOccurrences.templateId, t.id))
        .orderBy(desc(taskOccurrences.deadline))
        .limit(1);
      return {
        ...t,
        project,
        assignee: assignee?.id ? assignee : null,
        schedule: describeRule(rule),
        nextDeadline: next[0] ?? null,
        lastDeadline: last?.deadline ?? null,
      };
    }),
  );
}

export async function createTemplate(caller: AuthUser, input: TemplateInput) {
  await assertActiveProject(db, input.projectId);
  await assertEmployeeOrNull(db, input.assigneeId);
  const [created] = await db.insert(taskTemplates).values({ ...input, createdBy: caller.id }).returning({ id: taskTemplates.id });
  return created;
}

export async function updateTemplate(id: string, input: TemplateInput) {
  const [existing] = await db.select({ id: taskTemplates.id }).from(taskTemplates).where(and(eq(taskTemplates.id, id), isNull(taskTemplates.archivedAt)));
  if (!existing) throw notFound('Template not found');
  await assertActiveProject(db, input.projectId);
  await assertEmployeeOrNull(db, input.assigneeId);
  await db.update(taskTemplates).set({ ...input, updatedAt: new Date() }).where(eq(taskTemplates.id, id));
  return { id };
}

/** Templates are archived, not deleted: tasks already made from them keep their link. */
export async function archiveTemplate(id: string) {
  const [row] = await db.update(taskTemplates).set({ archivedAt: new Date() }).where(and(eq(taskTemplates.id, id), isNull(taskTemplates.archivedAt))).returning({ id: taskTemplates.id });
  if (!row) throw notFound('Template not found');
}

/** The next five deadlines a rule would produce in this project, for the form preview. */
export async function previewRule(input: PreviewRuleInput) {
  const rule: RepeatRule = { ...input };
  const dates = nextDeadlines(rule, await workCalendar(db, input.projectId), todayIn(), 5);
  return { schedule: describeRule(rule), dates };
}

/**
 * The repeat schedule job. For every active repeating template it creates the tasks whose
 * deadline is within `leadDays` from today. Each task is created in one transaction with
 * its occurrence row; the occurrence's primary key (template, deadline) means a rerun or a
 * retry finds the row already there and creates nothing.
 */
export async function runRecurringTasks(today = todayIn()) {
  const templates = await db
    .select()
    .from(taskTemplates)
    .innerJoin(projects, eq(projects.id, taskTemplates.projectId))
    .where(and(isNull(taskTemplates.archivedAt), eq(taskTemplates.paused, false), isNull(projects.archivedAt)));

  let created = 0;
  for (const { task_templates: t } of templates) {
    if (t.repeat === 'none' || !t.assigneeId) continue;
    const cal = await workCalendar(db, t.projectId);
    for (const deadline of deadlinesBetween(ruleOf(t), cal, today, addDays(today, t.leadDays))) {
      try {
        const made = await db.transaction(async (tx) => {
          const [occ] = await tx.insert(taskOccurrences).values({ templateId: t.id, deadline }).onConflictDoNothing().returning({ deadline: taskOccurrences.deadline });
          if (!occ) return false;
          const task = await insertTask(tx, t.createdBy, {
            title: t.title,
            description: t.description,
            projectId: t.projectId,
            assigneeId: t.assigneeId!,
            priority: t.priority,
            deadline,
            checklist: t.checklist,
            templateId: t.id,
          });
          await tx.update(taskOccurrences).set({ taskId: task.id }).where(and(eq(taskOccurrences.templateId, t.id), eq(taskOccurrences.deadline, deadline)));
          return true;
        });
        if (made) created++;
      } catch (err) {
        // e.g. the assignee is no longer an employee: skip this one, keep the rest going
        console.error(`[jobs] recurring task for template ${t.id} on ${deadline} failed`, err);
      }
    }
  }
  return { created };
}
