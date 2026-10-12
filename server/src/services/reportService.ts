import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { addDays, daysBetween, todayIn } from '../lib/dates.js';
import { env } from '../lib/env.js';

/*
 * Metric definitions. Every chart, table, CSV and weekly report goes through this file,
 * so they always agree. All dates are calendar days in REPORT_TZ; archived tasks never count.
 *
 *   Open            status is not done, measured at the range's end day E
 *                   (E = the range end, or today if the range runs past today).
 *                   Reconstructed as: created on or before E, and not completed by E.
 *   Overdue         open at E, and deadline < E
 *   Created         created_at falls in the range
 *   Completed       completed_at falls in the range
 *   On-time rate    of tasks completed in the range, the share completed on or before the deadline day
 *   Avg cycle time  mean of completed_at - created_at, in days, for tasks completed in the range
 *   Time in progress  first move to in_progress until completed_at; only tasks that have status history
 *   Workload        open tasks per person (at E), split by priority
 *
 * The previous period is the same number of days immediately before the range.
 * A task that changed project counts under its current project.
 */

export interface ReportFilters {
  from: string;
  to: string;
  projectId?: string;
  assigneeId?: string;
}

const tz = () => sql.raw(`'${env.REPORT_TZ.replace(/'/g, '')}'`);
const localDate = (column: SQL) => sql`(${column} at time zone ${tz()})::date`;
const CD = localDate(sql`t.completed_at`); // completed day
const CRD = localDate(sql`t.created_at`); // created day

function periods(f: ReportFilters) {
  const today = todayIn();
  const days = daysBetween(f.from, f.to) + 1;
  const prevTo = addDays(f.from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  const end = f.to < today ? f.to : today;
  return { today, days, prevFrom, prevTo, end, prevEnd: prevTo };
}

/** WHERE fragment shared by every query: live tasks, plus optional project/person. */
function taskFilter(f: Pick<ReportFilters, 'projectId' | 'assigneeId'>, opts: { skipProject?: boolean; skipAssignee?: boolean } = {}) {
  const parts: SQL[] = [sql`t.archived_at is null`];
  if (f.projectId && !opts.skipProject) parts.push(sql`t.project_id = ${f.projectId}`);
  if (f.assigneeId && !opts.skipAssignee) parts.push(sql`t.assignee_id = ${f.assigneeId}`);
  return sql.join(parts, sql` and `);
}

const openAt = (day: string) => sql`(${CRD} <= ${day}::date and (t.completed_at is null or ${CD} > ${day}::date))`;
const overdueAt = (day: string) => sql`(${openAt(day)} and t.deadline < ${day}::date)`;
const inRange = (col: SQL, from: string, to: string) => sql`(${col} between ${from}::date and ${to}::date)`;
const onTime = sql`(${CD} <= t.deadline)`;
const cycleDays = sql`(extract(epoch from (t.completed_at - t.created_at)) / 86400.0)`;

/** The metric columns, as SQL select items, for one range. */
function metricColumns(f: ReportFilters, prefix = '') {
  const p = periods(f);
  const c = (name: string) => sql.raw(`"${prefix}${name}"`);
  return sql`
    count(t.id) filter (where ${openAt(p.end)})::int as ${c('open')},
    count(t.id) filter (where ${overdueAt(p.end)})::int as ${c('overdue')},
    count(t.id) filter (where ${inRange(CRD, f.from, f.to)})::int as ${c('created')},
    count(t.id) filter (where ${inRange(CD, f.from, f.to)})::int as ${c('completed')},
    count(t.id) filter (where ${inRange(CD, f.from, f.to)} and ${onTime})::int as ${c('completedOnTime')},
    avg(${cycleDays}) filter (where ${inRange(CD, f.from, f.to)})::float as ${c('avgCycleDays')}
  `;
}

const rate = (onTimeCount: number, completed: number) => (completed === 0 ? null : onTimeCount / completed);

function shapeMetrics(row: Record<string, any>, prefix = '') {
  const completed = row[`${prefix}completed`] ?? 0;
  return {
    open: row[`${prefix}open`] ?? 0,
    overdue: row[`${prefix}overdue`] ?? 0,
    created: row[`${prefix}created`] ?? 0,
    completed,
    onTimeRate: rate(row[`${prefix}completedOnTime`] ?? 0, completed),
    avgCycleDays: row[`${prefix}avgCycleDays`] ?? null,
  };
}

export type Metrics = ReturnType<typeof shapeMetrics>;

async function rows<T = Record<string, any>>(query: SQL) {
  return (await db.execute(query)).rows as T[];
}

/** KPI tiles, each with the previous period's value for a delta. */
export async function summary(f: ReportFilters) {
  const p = periods(f);
  const previous = { ...f, from: p.prevFrom, to: p.prevTo };
  const [row] = await rows(sql`
    select ${metricColumns(f)}, ${metricColumns(previous, 'prev_')},
      avg(extract(epoch from (t.completed_at - ip.first_at)) / 86400.0)
        filter (where ${inRange(CD, f.from, f.to)} and ip.first_at is not null)::float as "avgInProgressDays",
      count(t.id) filter (where ${inRange(CD, f.from, f.to)} and ip.first_at is not null)::int as "inProgressSample"
    from tasks t
    left join lateral (
      select min(e.created_at) as first_at from task_events e
      where e.task_id = t.id and e.type = 'status_changed' and e.data->>'to' = 'in_progress'
    ) ip on true
    where ${taskFilter(f)}
  `);
  const [history] = await rows<{ since: string | null }>(sql`
    select min((created_at at time zone ${tz()})::date)::text as since from task_events where type = 'status_changed'
  `);

  return {
    range: { from: f.from, to: f.to, measuredOn: p.end, previousFrom: p.prevFrom, previousTo: p.prevTo },
    current: shapeMetrics(row),
    previous: shapeMetrics(row, 'prev_'),
    timeInProgress: { avgDays: row.avgInProgressDays, sample: row.inProgressSample, historySince: history?.since ?? null },
  };
}

/** Created vs completed per week (weeks start on Monday). */
export async function throughput(f: ReportFilters) {
  return rows<{ weekStart: string; created: number; completed: number; completedOnTime: number }>(sql`
    with weeks as (
      select generate_series(date_trunc('week', ${f.from}::date), date_trunc('week', ${f.to}::date), interval '1 week')::date as week
    ),
    c as (
      select date_trunc('week', ${CRD})::date as week, count(*)::int as n
      from tasks t where ${taskFilter(f)} and ${inRange(CRD, f.from, f.to)} group by 1
    ),
    d as (
      select date_trunc('week', ${CD})::date as week, count(*)::int as n, count(*) filter (where ${onTime})::int as on_time
      from tasks t where ${taskFilter(f)} and ${inRange(CD, f.from, f.to)} group by 1
    )
    select weeks.week::text as "weekStart", coalesce(c.n, 0) as created, coalesce(d.n, 0) as completed,
           coalesce(d.on_time, 0) as "completedOnTime"
    from weeks left join c on c.week = weeks.week left join d on d.week = weeks.week
    order by weeks.week
  `);
}

/**
 * Per group: mutually exclusive segments for a stacked bar. Open work is split by its
 * current status; overdue is measured at the range's end day; done means completed in range.
 */
export async function statusBreakdown(f: ReportFilters, groupBy: 'project' | 'employee') {
  const p = periods(f);
  const group =
    groupBy === 'project'
      ? sql`p.id, p.name as label, p.colour_index as "colourIndex"`
      : sql`u.id, u.name as label, null::int as "colourIndex"`;
  const join = groupBy === 'project' ? sql`join projects p on p.id = t.project_id` : sql`join users u on u.id = t.assignee_id`;
  const groupCols = groupBy === 'project' ? sql`p.id, p.name, p.colour_index` : sql`u.id, u.name`;
  return rows(sql`
    select ${group},
      count(*) filter (where ${overdueAt(p.end)})::int as overdue,
      count(*) filter (where ${openAt(p.end)} and not ${overdueAt(p.end)} and t.status = 'in_progress')::int as "inProgress",
      count(*) filter (where ${openAt(p.end)} and not ${overdueAt(p.end)} and t.status <> 'in_progress')::int as todo,
      count(*) filter (where ${inRange(CD, f.from, f.to)})::int as done
    from tasks t ${join}
    where ${taskFilter(f)}
    group by ${groupCols}
    having count(*) filter (where ${openAt(p.end)} or ${inRange(CD, f.from, f.to)}) > 0
    order by label
  `);
}

/** One row per project with the standard metrics. */
export async function projectTable(f: ReportFilters) {
  const result = await rows(sql`
    select p.id, p.name, p.colour_index as "colourIndex", p.archived_at is not null as archived, ${metricColumns(f)}
    from projects p
    left join tasks t on t.project_id = p.id and ${taskFilter(f, { skipProject: true })}
    ${f.projectId ? sql`where p.id = ${f.projectId}` : sql``}
    group by p.id
    having p.archived_at is null or count(t.id) > 0
    order by p.name
  `);
  return result.map((r) => ({ id: r.id, name: r.name, colourIndex: r.colourIndex, archived: r.archived, ...shapeMetrics(r) }));
}

/** One row per employee with the standard metrics and current workload by priority. */
export async function employeeTable(f: ReportFilters) {
  const p = periods(f);
  const result = await rows(sql`
    select u.id, u.name, ${metricColumns(f)},
      count(t.id) filter (where ${openAt(p.end)} and t.priority = 'high')::int as "openHigh",
      count(t.id) filter (where ${openAt(p.end)} and t.priority = 'medium')::int as "openMedium",
      count(t.id) filter (where ${openAt(p.end)} and t.priority = 'low')::int as "openLow"
    from users u
    left join tasks t on t.assignee_id = u.id and ${taskFilter(f, { skipAssignee: true })}
    where u.role = 'employee' ${f.assigneeId ? sql`and u.id = ${f.assigneeId}` : sql``}
    group by u.id
    order by u.name
  `);
  return result.map((r) => ({
    id: r.id,
    name: r.name,
    ...shapeMetrics(r),
    workload: { high: r.openHigh, medium: r.openMedium, low: r.openLow },
  }));
}

/** The most overdue open tasks right now. */
export async function overdueList(f: ReportFilters, limit = 10) {
  const p = periods(f);
  return rows(sql`
    select t.id, t.title, t.deadline::text as deadline, (${p.end}::date - t.deadline)::int as "daysLate",
      u.id as "assigneeId", u.name as "assigneeName", pr.id as "projectId", pr.name as "projectName"
    from tasks t
    join users u on u.id = t.assignee_id
    join projects pr on pr.id = t.project_id
    where ${taskFilter(f)} and ${overdueAt(p.end)}
    order by t.deadline, t.created_at
    limit ${limit}
  `);
}

/** Recent activity on matching tasks (for an employee: what they did or what happened to their work). */
export async function recentActivity(f: ReportFilters, limit = 15) {
  return rows(sql`
    select e.id, e.type, e.data, e.created_at as "createdAt", a.name as "actorName", t.id as "taskId", t.title as "taskTitle"
    from task_events e
    join tasks t on t.id = e.task_id
    join users a on a.id = e.actor_id
    where ${taskFilter(f, { skipAssignee: true })}
      ${f.assigneeId ? sql`and (t.assignee_id = ${f.assigneeId} or e.actor_id = ${f.assigneeId})` : sql``}
      and ${inRange(localDate(sql`e.created_at`), f.from, f.to)}
    order by e.created_at desc
    limit ${limit}
  `);
}

/** Every matching task with its outcome, for the tasks CSV. */
export async function taskRows(f: ReportFilters) {
  return rows(sql`
    select t.title, pr.name as project, u.name as assignee, t.priority, t.status, t.deadline::text as deadline,
      ${CRD}::text as created, ${CD}::text as completed,
      case when t.completed_at is null then null when ${onTime} then 'on time' else 'late' end as outcome
    from tasks t
    join users u on u.id = t.assignee_id
    join projects pr on pr.id = t.project_id
    where ${taskFilter(f)} and (${inRange(CRD, f.from, f.to)} or ${inRange(CD, f.from, f.to)} or ${openAt(periods(f).end)})
    order by t.deadline, t.created_at
  `);
}

// ---- CSV -----------------------------------------------------------------------

/** RFC 4180 quoting, plus a guard so spreadsheet apps never run a cell as a formula. */
function csvCell(value: unknown) {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], data: unknown[][]) {
  return [header, ...data].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const pct = (r: number | null) => (r === null ? null : Math.round(r * 1000) / 10);

export async function exportCsv(type: 'projects' | 'employees' | 'tasks', f: ReportFilters) {
  if (type === 'projects') {
    const data = await projectTable(f);
    return toCsv(
      ['Project', 'Open', 'Overdue', 'Created', 'Completed', 'On-time %', 'Avg cycle (days)'],
      data.map((r) => [r.name, r.open, r.overdue, r.created, r.completed, pct(r.onTimeRate), r.avgCycleDays]),
    );
  }
  if (type === 'employees') {
    const data = await employeeTable(f);
    return toCsv(
      ['Employee', 'Open', 'Overdue', 'Created', 'Completed', 'On-time %', 'Avg cycle (days)', 'Open high', 'Open medium', 'Open low'],
      data.map((r) => [r.name, r.open, r.overdue, r.created, r.completed, pct(r.onTimeRate), r.avgCycleDays, r.workload.high, r.workload.medium, r.workload.low]),
    );
  }
  const data = await taskRows(f);
  return toCsv(
    ['Task', 'Project', 'Assignee', 'Priority', 'Status', 'Deadline', 'Created', 'Completed', 'Outcome'],
    data.map((r) => [r.title, r.project, r.assignee, r.priority, r.status, r.deadline, r.created, r.completed, r.outcome]),
  );
}
