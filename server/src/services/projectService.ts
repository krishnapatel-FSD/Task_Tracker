import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '../db/index.js';
import { notifications, projects, tasks } from '../db/schema.js';
import { todayIn } from '../lib/dates.js';
import { badRequest, notFound } from '../lib/errors.js';
import type { CreateProjectInput, UpdateProjectInput } from '../validation/schemas.js';

const COLOURS = 8;

/** Active projects, for selects, filters and row chips. Visible to everyone logged in. */
export async function listActiveProjects() {
  return db
    .select({ id: projects.id, name: projects.name, colourIndex: projects.colourIndex })
    .from(projects)
    .where(isNull(projects.archivedAt))
    .orderBy(asc(projects.name));
}

/** All projects with live task counts, for the admin projects page. */
export async function listAllProjects() {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      colourIndex: projects.colourIndex,
      archivedAt: projects.archivedAt,
      createdAt: projects.createdAt,
      openTasks: sql<number>`count(${tasks.id}) filter (where ${tasks.status} <> 'done')`.mapWith(Number),
      totalTasks: count(tasks.id),
    })
    .from(projects)
    .leftJoin(tasks, and(eq(tasks.projectId, projects.id), isNull(tasks.archivedAt)))
    .groupBy(projects.id)
    .orderBy(sql`${projects.archivedAt} is not null`, asc(projects.name));
}

/**
 * The projects home: one row per active project with counts of live tasks.
 * Counts are team-wide for everyone (the team board). Employees see only projects
 * that have tasks; the admin also sees empty ones. `changedTasks` counts
 * tasks with unread notifications for the viewer.
 */
export async function listProjectBoard(viewer: { id: string; role: 'admin' | 'employee' }) {
  const today = todayIn();
  const isAdmin = viewer.role === 'admin';
  const taskJoin = and(eq(tasks.projectId, projects.id), isNull(tasks.archivedAt));
  const open = sql`${tasks.status} <> 'done'`;

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      colourIndex: projects.colourIndex,
      totalTasks: count(tasks.id),
      openTasks: sql<number>`count(${tasks.id}) filter (where ${open})`.mapWith(Number),
      lateTasks: sql<number>`count(${tasks.id}) filter (where ${open} and ${tasks.deadline} < ${today})`.mapWith(Number),
      dueToday: sql<number>`count(${tasks.id}) filter (where ${open} and ${tasks.deadline} = ${today})`.mapWith(Number),
      doneTasks: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'done')`.mapWith(Number),
      nextDeadline: sql<string | null>`min(${tasks.deadline}) filter (where ${open})`,
      changedTasks: sql<number>`count(distinct ${tasks.id}) filter (where exists (
        select 1 from ${notifications}
        where ${notifications.taskId} = ${tasks.id}
          and ${notifications.userId} = ${viewer.id}
          and ${notifications.readAt} is null
          and ${notifications.deliverAfter} <= now()
      ))`.mapWith(Number),
    })
    .from(projects)
    .leftJoin(tasks, taskJoin)
    .where(isNull(projects.archivedAt))
    .groupBy(projects.id)
    .orderBy(asc(projects.name));

  // Employees see the projects that have work in them; the admin sees every project.
  return isAdmin ? rows : rows.filter((r) => r.totalTasks > 0);
}

/** Throws 400 unless the project exists and is not archived. */
export async function assertActiveProject(conn: DbOrTx, projectId: string) {
  const [project] = await conn
    .select({ archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project || project.archivedAt) {
    throw badRequest('Project must be an existing, active project');
  }
}

async function assertNameFree(name: string, exceptId?: string) {
  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(sql`lower(${projects.name}) = lower(${name})`)
    .limit(1);
  if (existing && existing.id !== exceptId) {
    throw badRequest('A project with this name already exists');
  }
}

export async function createProject(input: CreateProjectInput) {
  await assertNameFree(input.name);
  const [{ total }] = await db.select({ total: count() }).from(projects);
  const [created] = await db
    .insert(projects)
    .values({
      name: input.name,
      description: input.description ?? null,
      colourIndex: input.colourIndex ?? total % COLOURS,
    })
    .returning();
  return created;
}

export async function updateProject(id: string, input: UpdateProjectInput) {
  const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!existing) throw notFound('Project not found');
  if (input.name !== undefined) await assertNameFree(input.name, id);

  const [updated] = await db
    .update(projects)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.colourIndex !== undefined && { colourIndex: input.colourIndex }),
      ...(input.archived !== undefined && { archivedAt: input.archived ? new Date() : null }),
    })
    .where(eq(projects.id, id))
    .returning();
  return updated;
}
