import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, weeklyReports } from '../db/schema.js';
import { addDays, formatDay, formatRange, todayIn, weekStartOf } from '../lib/dates.js';
import { env } from '../lib/env.js';
import { badRequest, notFound } from '../lib/errors.js';
import { appLink, sendMail } from '../lib/mailer.js';
import { insertNotifications } from './notificationService.js';
import { employeeTable, projectTable, summary, toCsv, type Metrics } from './reportService.js';

const tz = () => sql.raw(`'${env.REPORT_TZ.replace(/'/g, '')}'`);

async function rows<T>(query: ReturnType<typeof sql>) {
  return (await db.execute(query)).rows as T[];
}

export interface WeeklySnapshot {
  weekStart: string;
  weekEnd: string;
  kpis: { current: Metrics; previous: Metrics };
  completed: { project: string; tasks: { title: string; assignee: string; completedOn: string; onTime: boolean }[] }[];
  slipped: { title: string; assignee: string; project: string; deadline: string; stillOpen: boolean }[];
  comingUp: { assignee: string; tasks: { title: string; project: string; deadline: string; priority: string }[] }[];
  employees: Awaited<ReturnType<typeof employeeTable>>;
  projects: Awaited<ReturnType<typeof projectTable>>;
  notable: { kind: 'reassigned' | 'deadline_moved'; title: string; actor: string; detail: string; at: string }[];
}

/** Builds one week's report from the same functions the reports page uses. */
export async function buildSnapshot(weekStart: string): Promise<WeeklySnapshot> {
  const weekEnd = addDays(weekStart, 6);
  const range = { from: weekStart, to: weekEnd };
  const cd = sql`(t.completed_at at time zone ${tz()})::date`;

  const kpis = await summary(range);

  const completedRows = await rows<{ project: string; title: string; assignee: string; completedOn: string; onTime: boolean }>(sql`
    select p.name as project, t.title, u.name as assignee, ${cd}::text as "completedOn", ${cd} <= t.deadline as "onTime"
    from tasks t join projects p on p.id = t.project_id join users u on u.id = t.assignee_id
    where t.archived_at is null and ${cd} between ${weekStart}::date and ${weekEnd}::date
    order by p.name, ${cd}, t.title
  `);

  // Became overdue this week: the day after the deadline falls in the week,
  // and the task wasn't finished on or before its deadline.
  const slipped = await rows<WeeklySnapshot['slipped'][number]>(sql`
    select t.title, u.name as assignee, p.name as project, t.deadline::text as deadline, t.completed_at is null as "stillOpen"
    from tasks t join projects p on p.id = t.project_id join users u on u.id = t.assignee_id
    where t.archived_at is null
      and t.deadline between ${addDays(weekStart, -1)}::date and ${addDays(weekEnd, -1)}::date
      and (t.completed_at is null or ${cd} > t.deadline)
    order by t.deadline, t.title
  `);

  const upcoming = await rows<{ assignee: string; title: string; project: string; deadline: string; priority: string }>(sql`
    select u.name as assignee, t.title, p.name as project, t.deadline::text as deadline, t.priority::text as priority
    from tasks t join projects p on p.id = t.project_id join users u on u.id = t.assignee_id
    where t.archived_at is null and t.status <> 'done'
      and t.deadline between ${addDays(weekEnd, 1)}::date and ${addDays(weekEnd, 7)}::date
    order by u.name, t.deadline, t.title
  `);

  const notableRows = await rows<{ type: string; title: string; actor: string; data: any; at: string; fromName: string | null; toName: string | null }>(sql`
    select e.type::text as type, t.title, a.name as actor, e.data, e.created_at as at,
      fu.name as "fromName", tu.name as "toName"
    from task_events e
    join tasks t on t.id = e.task_id
    join users a on a.id = e.actor_id
    left join users fu on e.type = 'reassigned' and fu.id = (e.data->>'fromId')::uuid
    left join users tu on e.type = 'reassigned' and tu.id = (e.data->>'toId')::uuid
    where t.archived_at is null
      and (e.created_at at time zone ${tz()})::date between ${weekStart}::date and ${weekEnd}::date
      and (e.type = 'reassigned' or (e.type = 'updated' and e.data->'changes' ? 'deadline'))
    order by e.created_at
  `);

  const group = <T, K extends string>(list: T[], key: (t: T) => K) => {
    const map = new Map<K, T[]>();
    for (const item of list) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
    return [...map.entries()];
  };

  return {
    weekStart,
    weekEnd,
    kpis: { current: kpis.current, previous: kpis.previous },
    completed: group(completedRows, (r) => r.project).map(([project, list]) => ({
      project,
      tasks: list.map(({ title, assignee, completedOn, onTime }) => ({ title, assignee, completedOn, onTime })),
    })),
    slipped,
    comingUp: group(upcoming, (r) => r.assignee).map(([assignee, list]) => ({
      assignee,
      tasks: list.map(({ title, project, deadline, priority }) => ({ title, project, deadline, priority })),
    })),
    employees: await employeeTable(range),
    projects: await projectTable(range),
    notable: notableRows.map((r) =>
      r.type === 'reassigned'
        ? { kind: 'reassigned' as const, title: r.title, actor: r.actor, detail: `${r.fromName ?? 'someone'} to ${r.toName ?? 'someone'}`, at: new Date(r.at).toISOString() }
        : {
            kind: 'deadline_moved' as const,
            title: r.title,
            actor: r.actor,
            detail: `${formatDay(r.data.changes.deadline.from)} to ${formatDay(r.data.changes.deadline.to)}`,
            at: new Date(r.at).toISOString(),
          },
    ),
  };
}

export function assertMonday(weekStart: string) {
  if (weekStartOf(weekStart) !== weekStart) throw badRequest('weekStart must be a Monday (YYYY-MM-DD)');
  if (weekStart > todayIn()) throw badRequest("That week hasn't started yet");
}

/**
 * Generates (or regenerates) one week's snapshot. Unique on week_start, so reruns
 * overwrite rather than duplicate. Admins get an in-app notification once per week.
 */
export async function generateWeeklyReport(weekStart: string, generatedBy: string | null = null) {
  assertMonday(weekStart);
  const weekEnd = addDays(weekStart, 6);
  let status: 'ready' | 'failed' = 'ready';
  let data: Record<string, unknown>;
  try {
    data = (await buildSnapshot(weekStart)) as unknown as Record<string, unknown>;
  } catch (err) {
    console.error(`[weekly] building ${weekStart} failed`, err);
    status = 'failed';
    data = { error: 'Report generation failed' };
  }

  const [saved] = await db
    .insert(weeklyReports)
    .values({ weekStart, weekEnd, generatedBy, status, data })
    .onConflictDoUpdate({ target: weeklyReports.weekStart, set: { weekEnd, generatedBy, status, data, generatedAt: new Date() } })
    .returning();

  if (status === 'ready') {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
    await insertNotifications(
      db,
      admins.map((a) => ({
        userId: a.id,
        type: 'weekly_report' as const,
        title: `Weekly report for ${formatRange(weekStart, weekEnd)} is ready`,
        link: `/admin/reports?tab=weekly&week=${weekStart}`,
        dedupeKey: `weekly_report:${weekStart}`,
      })),
    );
  }
  return saved;
}

export async function listWeeklyReports() {
  return db
    .select({
      weekStart: weeklyReports.weekStart,
      weekEnd: weeklyReports.weekEnd,
      generatedAt: weeklyReports.generatedAt,
      status: weeklyReports.status,
      completed: sql<number | null>`(${weeklyReports.data}->'kpis'->'current'->>'completed')::int`,
      overdue: sql<number | null>`(${weeklyReports.data}->'kpis'->'current'->>'overdue')::int`,
    })
    .from(weeklyReports)
    .orderBy(desc(weeklyReports.weekStart));
}

export async function getWeeklyReport(weekStart: string) {
  const [row] = await db.select().from(weeklyReports).where(eq(weeklyReports.weekStart, weekStart)).limit(1);
  if (!row) throw notFound('No report for that week');
  return row;
}

const pct = (r: number | null) => (r === null ? null : Math.round(r * 1000) / 10);

export function weeklyCsv(snapshot: WeeklySnapshot) {
  const sections = [
    toCsv(['Weekly report', `${snapshot.weekStart} to ${snapshot.weekEnd}`], []),
    toCsv(
      ['Employee', 'Open', 'Overdue', 'Created', 'Completed', 'On-time %', 'Avg cycle (days)'],
      snapshot.employees.map((r) => [r.name, r.open, r.overdue, r.created, r.completed, pct(r.onTimeRate), r.avgCycleDays]),
    ),
    toCsv(
      ['Project', 'Open', 'Overdue', 'Created', 'Completed', 'On-time %', 'Avg cycle (days)'],
      snapshot.projects.map((r) => [r.name, r.open, r.overdue, r.created, r.completed, pct(r.onTimeRate), r.avgCycleDays]),
    ),
    toCsv(
      ['Completed task', 'Project', 'Assignee', 'Completed on', 'On time'],
      snapshot.completed.flatMap((g) => g.tasks.map((t) => [t.title, g.project, t.assignee, t.completedOn, t.onTime ? 'yes' : 'no'])),
    ),
  ];
  return sections.join('\r\n');
}

// ---- Email -----------------------------------------------------------------------

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** HTML with inline styles only (works in Gmail and Outlook): headline numbers plus sections 2 to 4. */
export function weeklyEmailHtml(s: WeeklySnapshot) {
  const c = s.kpis.current;
  const cell = 'padding:8px 16px 8px 0;font:14px Arial,sans-serif;color:#141c2e';
  const head = 'font:700 16px Arial,sans-serif;color:#141c2e;margin:24px 0 8px';
  const muted = 'font:13px Arial,sans-serif;color:#636c80';
  const rate = c.onTimeRate === null ? 'no data' : `${Math.round(c.onTimeRate * 100)}%`;
  const list = (items: string[]) =>
    items.length ? `<ul style="margin:0;padding-left:20px">${items.map((i) => `<li style="${cell};padding:2px 0">${i}</li>`).join('')}</ul>` : `<p style="${muted}">None.</p>`;

  return `<div style="max-width:640px">
  <p style="font:700 20px Arial,sans-serif;color:#141c2e;margin:0 0 4px">Weekly report: ${escapeHtml(formatRange(s.weekStart, s.weekEnd))}</p>
  <table style="border-collapse:collapse;margin-top:12px"><tr>
    <td style="${cell}"><b>${c.completed}</b> completed</td>
    <td style="${cell}"><b>${rate}</b> on time</td>
    <td style="${cell}"><b>${c.open}</b> open</td>
    <td style="${cell};color:${c.overdue ? '#b42318' : '#141c2e'}"><b>${c.overdue}</b> overdue</td>
  </tr></table>
  <p style="${head}">Completed</p>
  ${list(s.completed.flatMap((g) => g.tasks.map((t) => `${escapeHtml(t.title)} <span style="${muted}">(${escapeHtml(g.project)}, ${escapeHtml(t.assignee)}${t.onTime ? '' : ', late'})</span>`)))}
  <p style="${head}">Slipped this week</p>
  ${list(s.slipped.map((t) => `${escapeHtml(t.title)} <span style="${muted}">(${escapeHtml(t.assignee)}, due ${formatDay(t.deadline)})</span>`))}
  <p style="${head}">Coming up next week</p>
  ${list(s.comingUp.flatMap((p) => p.tasks.map((t) => `${escapeHtml(t.title)} <span style="${muted}">(${escapeHtml(p.assignee)}, ${formatDay(t.deadline)})</span>`)))}
  <p style="font:14px Arial,sans-serif;margin-top:24px"><a href="${appLink(`/admin/reports?tab=weekly&week=${s.weekStart}`)}">Open the full report</a></p>
</div>`;
}

/** Emails the snapshot to every admin, with the CSV attached. Failures are logged, never thrown. */
export async function emailWeeklyReport(weekStart: string) {
  const report = await getWeeklyReport(weekStart);
  if (report.status !== 'ready') return;
  const snapshot = report.data as unknown as WeeklySnapshot;
  const admins = await db.select({ email: users.email }).from(users).where(eq(users.role, 'admin'));
  for (const admin of admins) {
    try {
      await sendMail({
        to: admin.email,
        subject: `Weekly report: ${formatRange(snapshot.weekStart, snapshot.weekEnd)}`,
        text: `Weekly report for ${formatRange(snapshot.weekStart, snapshot.weekEnd)}: ${snapshot.kpis.current.completed} completed, ${snapshot.kpis.current.overdue} overdue.\n\nOpen it: ${appLink(`/admin/reports?tab=weekly&week=${weekStart}`)}\n`,
        html: weeklyEmailHtml(snapshot),
        attachments: [{ filename: `weekly-report-${weekStart}.csv`, content: '\uFEFF' + weeklyCsv(snapshot), contentType: 'text/csv' }],
      });
    } catch (err) {
      console.error(`[weekly] emailing ${admin.email} failed`, err);
    }
  }
}

/** The Monday 08:00 job: last week's report, then the email. */
export async function runWeeklyReportJob() {
  const lastMonday = addDays(weekStartOf(todayIn()), -7);
  const saved = await generateWeeklyReport(lastMonday, null);
  if (saved.status === 'ready') await emailWeeklyReport(lastMonday);
  return saved;
}
