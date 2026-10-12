// Exact metric values on a fixed dataset (REPORT_TZ = Asia/Kolkata, UTC+5:30).
// Range: Mon 1 Jun to Sun 14 Jun 2026. Previous period: 18 to 31 May.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { notifications, taskEvents, tasks, weeklyReports } from '../src/db/schema.js';
import { env } from '../src/lib/env.js';
import { call, cleanupProjects, login, rawFetch, startServer, stopServer, uniqueName, type Session } from './helpers.js';

let admin: Session;
let asha: Session;
let projectId: string;

/** 10:00 IST on the given day, as a UTC Date. */
const ist = (day: string, time = '10:00') => new Date(`${day}T${time}:00+05:30`);
const range = 'from=2026-06-01&to=2026-06-14';

before(async () => {
  assert.equal(env.REPORT_TZ, 'Asia/Kolkata', 'these numbers assume REPORT_TZ=Asia/Kolkata');
  await startServer();
  admin = await login('admin@example.com');
  asha = await login('asha@example.com');
  projectId = (await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Report project') } })).body.id;

  const base = { description: 'Report fixture', assigneeId: asha.user.id, projectId, priority: 'medium' as const };
  const fixtures = [
    // T1: done on its deadline day -> on time; cycle 3.0 days; in progress 2.0 days
    { key: 'T1', title: 'T1', deadline: '2026-06-04', status: 'done', createdAt: ist('2026-06-01'), completedAt: ist('2026-06-04'), startedAt: ist('2026-06-02') },
    // T2: done 3 days late; cycle 6.0; in progress 3.0
    { key: 'T2', title: 'T2', deadline: '2026-06-05', status: 'done', createdAt: ist('2026-06-02'), completedAt: ist('2026-06-08'), startedAt: ist('2026-06-05') },
    // T3: done at 00:30 IST on 8 Jun (still 7 Jun in UTC) -> late, and in week 2
    { key: 'T3', title: 'T3', deadline: '2026-06-07', status: 'done', createdAt: ist('2026-06-03'), completedAt: new Date('2026-06-07T19:00:00Z') },
    // T4: open and overdue at the range end
    { key: 'T4', title: 'T4', deadline: '2026-06-12', status: 'in_progress', createdAt: ist('2026-06-09'), completedAt: null },
    // T5: open, not due yet
    { key: 'T5', title: 'T5', deadline: '2026-06-20', status: 'todo', createdAt: ist('2026-06-10'), completedAt: null },
    // T6: was done, then reopened (completed_at cleared) -> open
    { key: 'T6', title: 'T6', deadline: '2026-06-30', status: 'in_progress', createdAt: ist('2026-06-02'), completedAt: null },
    // T7: archived -> never counts
    { key: 'T7', title: 'T7', deadline: '2026-06-05', status: 'done', createdAt: ist('2026-06-03'), completedAt: ist('2026-06-04'), archived: true },
    // T8: created in the previous period, completed late in this one; cycle 21.0
    { key: 'T8', title: 'T8', deadline: '2026-05-28', status: 'done', createdAt: ist('2026-05-20'), completedAt: ist('2026-06-10') },
  ];

  for (const f of fixtures) {
    const [row] = await db
      .insert(tasks)
      .values({
        ...base,
        title: f.title,
        deadline: f.deadline,
        status: f.status as 'todo' | 'in_progress' | 'done',
        createdAt: f.createdAt,
        updatedAt: f.completedAt ?? f.createdAt,
        completedAt: f.completedAt,
        archivedAt: f.archived ? ist('2026-06-05') : null,
      })
      .returning({ id: tasks.id });
    if (f.startedAt) {
      await db.insert(taskEvents).values({
        taskId: row.id,
        actorId: asha.user.id,
        type: 'status_changed',
        data: { from: 'todo', to: 'in_progress' },
        createdAt: f.startedAt,
      });
    }
  }
});

after(async () => {
  await db.delete(weeklyReports).where(eq(weeklyReports.weekStart, '2026-06-01'));
  await db.delete(notifications).where(eq(notifications.dedupeKey, 'weekly_report:2026-06-01'));
  await cleanupProjects([projectId]);
  await stopServer();
});

const get = (path: string) => call('GET', path, { token: admin.token });

describe('summary', () => {
  test('current period numbers', async () => {
    const res = await get(`/reports/summary?${range}&projectId=${projectId}`);
    assert.equal(res.status, 200);
    const c = res.body.current;
    assert.equal(c.created, 6, 'T1-T6 (T7 archived, T8 created earlier)');
    assert.equal(c.completed, 4, 'T1, T2, T3, T8');
    assert.equal(c.onTimeRate, 0.25, 'only T1, finished on its deadline day');
    assert.ok(Math.abs(c.avgCycleDays - (3 + 6 + 4.6041667 + 21) / 4) < 1e-4, `avg cycle ${c.avgCycleDays}`);
    assert.equal(c.open, 3, 'T4, T5 and the reopened T6');
    assert.equal(c.overdue, 1, 'T4');
    assert.equal(res.body.range.measuredOn, '2026-06-14');
  });

  test('previous period numbers', async () => {
    const res = await get(`/reports/summary?${range}&projectId=${projectId}`);
    const p = res.body.previous;
    assert.deepEqual(res.body.range.previousFrom, '2026-05-18');
    assert.equal(p.created, 1, 'T8');
    assert.equal(p.completed, 0);
    assert.equal(p.onTimeRate, null, 'no completions means no rate, not 0%');
    assert.equal(p.avgCycleDays, null);
    assert.equal(p.open, 1, 'T8 was open on 31 May');
    assert.equal(p.overdue, 1, 'and already late');
  });

  test('time in progress only uses tasks with status history', async () => {
    const res = await get(`/reports/summary?${range}&projectId=${projectId}`);
    assert.equal(res.body.timeInProgress.sample, 2, 'T1 and T2 have in-progress events');
    assert.ok(Math.abs(res.body.timeInProgress.avgDays - 2.5) < 1e-6);
  });
});

describe('throughput', () => {
  test('weekly buckets in REPORT_TZ', async () => {
    const res = await get(`/reports/throughput?${range}&projectId=${projectId}`);
    assert.deepEqual(res.body, [
      { weekStart: '2026-06-01', created: 4, completed: 1, completedOnTime: 1 },
      { weekStart: '2026-06-08', created: 2, completed: 3, completedOnTime: 0 },
    ]);
  });
});

describe('tables', () => {
  test('per project and per employee agree with the summary', async () => {
    const [project] = (await get(`/reports/projects?${range}&projectId=${projectId}`)).body;
    assert.equal(project.id, projectId);
    assert.deepEqual(
      { open: project.open, overdue: project.overdue, created: project.created, completed: project.completed, onTimeRate: project.onTimeRate },
      { open: 3, overdue: 1, created: 6, completed: 4, onTimeRate: 0.25 },
    );

    const employees = (await get(`/reports/employees?${range}&projectId=${projectId}`)).body;
    const ashaRow = employees.find((e: { id: string }) => e.id === asha.user.id);
    assert.equal(ashaRow.completed, 4);
    assert.equal(ashaRow.open, 3);
    assert.deepEqual(ashaRow.workload, { high: 0, medium: 3, low: 0 });
    const others = employees.filter((e: { id: string }) => e.id !== asha.user.id);
    assert.ok(others.every((e: { completed: number; open: number }) => e.completed === 0 && e.open === 0));
  });

  test('status breakdown segments are mutually exclusive', async () => {
    const [row] = (await get(`/reports/status-breakdown?${range}&projectId=${projectId}&groupBy=project`)).body;
    assert.deepEqual({ overdue: row.overdue, inProgress: row.inProgress, todo: row.todo, done: row.done }, { overdue: 1, inProgress: 1, todo: 1, done: 4 });
  });

  test('overdue list', async () => {
    const list = (await get(`/reports/overdue?${range}&projectId=${projectId}`)).body;
    assert.deepEqual(list.map((r: { title: string; daysLate: number }) => [r.title, r.daysLate]), [['T4', 2]]);
  });
});

describe('csv export', () => {
  test('projects CSV has the same numbers and attachment headers', async () => {
    const res = await rawFetch(`/reports/export.csv?type=projects&${range}&projectId=${projectId}`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/csv/);
    assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="projects-2026-06-01-to-2026-06-14\.csv"/);
    const lines = (await res.text()).replace(/^\uFEFF/, '').trim().split('\r\n');
    assert.equal(lines[0], 'Project,Open,Overdue,Created,Completed,On-time %,Avg cycle (days)');
    assert.match(lines[1], /,3,1,6,4,25,8\.65$/);
  });

  test('cells that look like formulas are neutralised', async () => {
    const [row] = await db
      .insert(tasks)
      .values({ title: '=HYPERLINK("http://x")', description: 'x', assigneeId: asha.user.id, projectId, priority: 'low', deadline: '2026-06-10', createdAt: ist('2026-06-09') })
      .returning({ id: tasks.id });
    const res = await rawFetch(`/reports/export.csv?type=tasks&${range}&projectId=${projectId}`, { headers: { Authorization: `Bearer ${admin.token}` } });
    const text = await res.text();
    assert.ok(text.includes(`"'=HYPERLINK(""http://x"")"`), 'formula prefixed with a quote');
    assert.ok(row.id);
  });
});

describe('access and validation', () => {
  test('reports are admin-only', async () => {
    assert.equal((await call('GET', `/reports/summary?${range}`, { token: asha.token })).status, 403);
  });

  test('bad ranges are 400', async () => {
    assert.equal((await get('/reports/summary?from=2026-06-14&to=2026-06-01')).status, 400);
    assert.equal((await get('/reports/summary?from=2024-01-01&to=2026-06-01')).status, 400);
    assert.equal((await get('/reports/summary?from=2026-06-01')).status, 400);
    assert.equal((await get(`/reports/status-breakdown?${range}&groupBy=colour`)).status, 400);
    assert.equal((await get(`/reports/export.csv?${range}&type=everything`)).status, 400);
  });
});

describe('weekly report', () => {
  const week = '2026-06-01';

  test('generates the snapshot with the documented sections', async () => {
    const res = await call('POST', '/reports/weekly', { token: admin.token, body: { weekStart: week } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const data = res.body.data;
    assert.equal(data.weekEnd, '2026-06-07');
    assert.equal(data.kpis.current.completed, 1, 'only T1 finished in week 1');

    const mine = data.completed.find((g: { project: string }) => g.project.startsWith('Report project'));
    assert.deepEqual(mine.tasks.map((t: { title: string; onTime: boolean }) => [t.title, t.onTime]), [['T1', true]]);
    assert.deepEqual(data.slipped.map((t: { title: string }) => t.title), ['T2'], 'T2 passed its 5 Jun deadline unfinished');
    const ashaNext = data.comingUp.find((p: { assignee: string }) => p.assignee === asha.user.name);
    // (The CSV test above adds another open task; only the T1-T8 fixtures matter here.)
    assert.deepEqual(ashaNext.tasks.map((t: { title: string }) => t.title).filter((t: string) => /^T\d$/.test(t)), ['T4']);
    assert.ok(Array.isArray(data.employees) && Array.isArray(data.projects) && Array.isArray(data.notable));
  });

  test('the snapshot does not change when tasks are edited later', async () => {
    await db.update(tasks).set({ title: 'T1 renamed' }).where(eq(tasks.title, 'T1'));
    const res = await call('GET', `/reports/weekly/${week}`, { token: admin.token });
    const mine = res.body.data.completed.find((g: { project: string }) => g.project.startsWith('Report project'));
    assert.equal(mine.tasks[0].title, 'T1');
    await db.update(tasks).set({ title: 'T1' }).where(eq(tasks.title, 'T1 renamed'));
  });

  test('regenerating overwrites the same week and notifies admins once', async () => {
    await call('POST', '/reports/weekly', { token: admin.token, body: { weekStart: week } });
    const list = await call('GET', '/reports/weekly', { token: admin.token });
    assert.equal(list.body.filter((r: { weekStart: string }) => r.weekStart === week).length, 1);
    const sent = await db.select().from(notifications).where(eq(notifications.dedupeKey, `weekly_report:${week}`));
    assert.ok(sent.length >= 1);
    assert.equal(sent.filter((n) => n.userId === admin.user.id).length, 1);
    assert.equal(sent[0].link, `/admin/reports?tab=weekly&week=${week}`);
  });

  test('CSV export', async () => {
    const res = await rawFetch(`/reports/weekly/${week}/export.csv`, { headers: { Authorization: `Bearer ${admin.token}` } });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /Weekly report,2026-06-01 to 2026-06-07/);
    assert.match(text, /Completed task,Project,Assignee,Completed on,On time/);
  });

  test('validation and access', async () => {
    assert.equal((await call('POST', '/reports/weekly', { token: admin.token, body: { weekStart: '2026-06-03' } })).status, 400, 'not a Monday');
    assert.equal((await call('POST', '/reports/weekly', { token: admin.token, body: { weekStart: '2099-01-05' } })).status, 400, 'future week');
    assert.equal((await call('POST', '/reports/weekly', { token: asha.token, body: { weekStart: week } })).status, 403);
    assert.equal((await call('GET', '/reports/weekly/2020-01-06', { token: admin.token })).status, 404);
  });
});
