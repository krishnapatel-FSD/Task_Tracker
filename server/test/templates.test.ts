// Templates, the repeat schedule job, days off and checklists, against the real database.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { addDays, todayIn } from '../src/lib/dates.js';
import { runRecurringTasks } from '../src/services/templateService.js';
import { call, cleanupProjects, login, startServer, stopServer, uniqueName, type Session } from './helpers.js';

let admin: Session;
let asha: Session;
let ben: Session;
let projectId: string;
const today = todayIn();

const template = (overrides: Record<string, unknown> = {}) => ({
  name: uniqueName('Template'),
  title: 'Payroll check',
  description: 'Check the payroll export against the timesheets.',
  projectId,
  assigneeId: asha.user.id,
  priority: 'high',
  checklist: ['Export payroll', 'Compare with timesheets', 'Sign off'],
  repeat: 'none',
  startDate: today,
  ...overrides,
});

async function tasksFromTemplate(templateId: string) {
  const all = (await call('GET', `/tasks?projectId=${projectId}`, { token: admin.token })).body as { templateId: string | null; deadline: string; repeats: boolean; checklistTotal: number }[];
  return all.filter((t) => t.templateId === templateId);
}

before(async () => {
  await startServer();
  admin = await login('admin@example.com');
  asha = await login('asha@example.com');
  ben = await login('ben@example.com');
  const res = await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Templates project') } });
  projectId = res.body.id;
  // This project works weekends, so dates in the tests below don't move.
  await call('PATCH', `/projects/${projectId}`, { token: admin.token, body: { skipWeekends: false } });
});

after(async () => {
  await cleanupProjects([projectId]);
  await stopServer();
});

describe('templates', () => {
  test('admin only', async () => {
    assert.equal((await call('GET', '/templates', { token: asha.token })).status, 403);
    assert.equal((await call('POST', '/templates', { token: asha.token, body: template() })).status, 403);
  });

  test('a repeating template needs an assignee and the right fields for its kind', async () => {
    assert.equal((await call('POST', '/templates', { token: admin.token, body: template({ repeat: 'daily', assigneeId: null }) })).status, 400);
    assert.equal((await call('POST', '/templates', { token: admin.token, body: template({ repeat: 'weekly', weekdays: [] }) })).status, 400);
    assert.equal((await call('POST', '/templates', { token: admin.token, body: template({ repeat: 'monthly' }) })).status, 400);
    assert.equal((await call('POST', '/templates', { token: admin.token, body: template({ endDate: addDays(today, -1) }) })).status, 400);
  });

  test('a task made from a template starts with its checklist', async () => {
    const created = await call('POST', '/tasks', {
      token: admin.token,
      body: { title: 'From template', description: 'x', projectId, assigneeId: asha.user.id, priority: 'low', deadline: addDays(today, 5), checklist: ['One', 'Two'] },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.checklistTotal, 2);
    const items = await call('GET', `/tasks/${created.body.id}/checklist`, { token: ben.token });
    assert.deepEqual(items.body.map((i: { text: string }) => i.text), ['One', 'Two']);
  });

  test('preview lists the next deadlines in plain words', async () => {
    const res = await call('POST', '/templates/preview', { token: admin.token, body: { projectId, repeat: 'interval', intervalDays: 7, startDate: today } });
    assert.equal(res.status, 200);
    assert.equal(res.body.schedule, 'Every 7 days');
    assert.deepEqual(res.body.dates, [0, 7, 14, 21, 28].map((n) => addDays(today, n)));
  });

  test('the job creates each task once, however often it runs', async () => {
    const { body } = await call('POST', '/templates', {
      token: admin.token,
      body: template({ repeat: 'daily', leadDays: 2 }),
    });
    await runRecurringTasks(today);
    await runRecurringTasks(today);
    await Promise.all([runRecurringTasks(today), runRecurringTasks(today)]);

    const made = await tasksFromTemplate(body.id);
    assert.deepEqual(made.map((t) => t.deadline).sort(), [today, addDays(today, 1), addDays(today, 2)]);
    assert.ok(made.every((t) => t.repeats && t.checklistTotal === 3));

    const listed = (await call('GET', '/templates', { token: admin.token })).body.find((t: { id: string }) => t.id === body.id);
    assert.equal(listed.schedule, 'Every working day');
    assert.equal(listed.lastDeadline, addDays(today, 2));
  });

  test('a holiday moves a weekly deadline to the next working day', async () => {
    const day = addDays(today, 1);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    assert.equal((await call('POST', `/projects/${projectId}/holidays`, { token: admin.token, body: { date: day, name: 'Office closed' } })).status, 201);
    const { body } = await call('POST', '/templates', { token: admin.token, body: template({ repeat: 'weekly', weekdays: [weekday], leadDays: 3 }) });
    await runRecurringTasks(today);
    assert.deepEqual((await tasksFromTemplate(body.id)).map((t) => t.deadline), [addDays(today, 2)]);
    await call('DELETE', `/projects/${projectId}/holidays/${day}`, { token: admin.token });
  });

  test('paused and archived templates make nothing', async () => {
    const paused = (await call('POST', '/templates', { token: admin.token, body: template({ repeat: 'daily', leadDays: 1, paused: true }) })).body;
    const gone = (await call('POST', '/templates', { token: admin.token, body: template({ repeat: 'daily', leadDays: 1 }) })).body;
    assert.equal((await call('DELETE', `/templates/${gone.id}`, { token: admin.token })).status, 204);
    await runRecurringTasks(today);
    assert.equal((await tasksFromTemplate(paused.id)).length, 0);
    assert.equal((await tasksFromTemplate(gone.id)).length, 0);
  });
});

describe('checklists', () => {
  test('the assignee and the admin tick and edit; the rest of the team only reads', async () => {
    const task = (
      await call('POST', '/tasks', {
        token: admin.token,
        body: { title: 'Checklist task', description: 'x', projectId, assigneeId: asha.user.id, priority: 'low', deadline: addDays(today, 3) },
      })
    ).body;
    const add = await call('POST', `/tasks/${task.id}/checklist`, { token: asha.token, body: { text: 'Call the supplier' } });
    assert.equal(add.status, 201);
    assert.equal((await call('POST', `/tasks/${task.id}/checklist`, { token: ben.token, body: { text: 'Nope' } })).status, 403);
    assert.equal((await call('PATCH', `/checklist/${add.body.id}`, { token: ben.token, body: { done: true } })).status, 403);

    assert.equal((await call('PATCH', `/checklist/${add.body.id}`, { token: asha.token, body: { done: true } })).status, 204);
    const [item] = (await call('GET', `/tasks/${task.id}/checklist`, { token: ben.token })).body;
    assert.equal(item.done, true);
    assert.equal(item.doneBy.id, asha.user.id);

    const refreshed = (await call('GET', `/tasks?projectId=${projectId}`, { token: admin.token })).body.find((t: { id: string }) => t.id === task.id);
    assert.equal(refreshed.checklistDone, 1);

    assert.equal((await call('DELETE', `/checklist/${add.body.id}`, { token: admin.token })).status, 204);
    assert.equal((await call('GET', `/tasks/${task.id}/checklist`, { token: asha.token })).body.length, 0);
  });
});
