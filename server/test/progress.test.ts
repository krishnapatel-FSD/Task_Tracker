// Progress per employee: states, counts, time logged and who may see what.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { addDays, todayIn } from '../src/lib/dates.js';
import { call, cleanupProjects, login, startServer, stopServer, uniqueName, type Session } from './helpers.js';

let admin: Session;
let asha: Session;
let ben: Session;
let projectId: string;
const today = todayIn();
const from = addDays(today, -40);
const to = addDays(today, 40);

async function add(title: string, deadline: string, assigneeId: string) {
  const res = await call('POST', '/tasks', { token: admin.token, body: { title, description: 'x', projectId, assigneeId, priority: 'low', deadline } });
  assert.equal(res.status, 201);
  return res.body.id as string;
}
const finish = (id: string, token: string, minutesSpent: number) =>
  call('PATCH', `/tasks/${id}/status`, { token, body: { status: 'done', note: { summary: 'Done', minutesSpent } } });
const progress = (token: string, extra = '') => call('GET', `/progress?from=${from}&to=${to}&projectId=${projectId}${extra}`, { token });

before(async () => {
  await startServer();
  admin = await login('admin@example.com');
  asha = await login('asha@example.com');
  ben = await login('ben@example.com');
  projectId = (await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Progress project') } })).body.id;

  // Asha: one done on time, one done late, one in progress, one to do, one late
  await finish(await add('On time', addDays(today, 5), asha.user.id), asha.token, 60);
  await finish(await add('Finished late', addDays(today, -3), asha.user.id), asha.token, 30);
  const started = await add('Started', addDays(today, 7), asha.user.id);
  await call('PATCH', `/tasks/${started}/status`, { token: asha.token, body: { status: 'in_progress' } });
  await add('Not started', addDays(today, 9), asha.user.id);
  await add('Overdue', addDays(today, -2), asha.user.id);
  // Ben: one task, and one outside the period
  await add('Ben task', addDays(today, 2), ben.user.id);
  await add('Far away', addDays(today, 90), ben.user.id);
});

after(async () => {
  await cleanupProjects([projectId]);
  await stopServer();
});

describe('progress', () => {
  test('counts each state, percent done and time logged', async () => {
    const res = await progress(admin.token);
    assert.equal(res.status, 200);
    const a = res.body.people.find((p: { id: string }) => p.id === asha.user.id);
    assert.deepEqual(
      { total: a.total, done: a.done, doneLate: a.doneLate, inProgress: a.inProgress, todo: a.todo, late: a.late, percentDone: a.percentDone, minutesLogged: a.minutesLogged },
      { total: 5, done: 1, doneLate: 1, inProgress: 1, todo: 1, late: 1, percentDone: 40, minutesLogged: 90 },
    );
    assert.deepEqual(a.tasks.map((t: { deadline: string }) => t.deadline), [...a.tasks.map((t: { deadline: string }) => t.deadline)].sort());
  });

  test('the admin sees every employee; tasks outside the period are left out', async () => {
    const res = await progress(admin.token);
    const b = res.body.people.find((p: { id: string }) => p.id === ben.user.id);
    assert.equal(b.total, 1);
    assert.ok(res.body.people.length >= 2);
    assert.ok(!res.body.people.some((p: { id: string }) => p.id === admin.user.id));
  });

  test('an employee sees only their own progress', async () => {
    const mine = await progress(asha.token);
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.people.map((p: { id: string }) => p.id), [asha.user.id]);
    assert.equal((await progress(asha.token, `&userId=${ben.user.id}`)).status, 403);
    assert.equal((await progress(asha.token, `&userId=${asha.user.id}`)).status, 200);
  });

  test('someone with no tasks in the period has no percentage', async () => {
    const res = await call('GET', `/progress?from=2001-01-01&to=2001-01-31&projectId=${projectId}`, { token: asha.token });
    assert.equal(res.body.people[0].total, 0);
    assert.equal(res.body.people[0].percentDone, null);
  });

  test('rejects a bad period and needs a login', async () => {
    assert.equal((await call('GET', `/progress?from=${to}&to=${from}`, { token: admin.token })).status, 400);
    assert.equal((await call('GET', `/progress?from=${from}&to=${to}`)).status, 401);
  });
});
