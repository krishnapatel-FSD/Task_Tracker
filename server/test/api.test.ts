// End-to-end API tests against the real database. Run `npm run db:seed` first.
// Tasks created here are deleted again in the after() hook.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';
import { tasks } from '../src/db/schema.js';

const TEST_DESCRIPTION = 'Created by the API test suite';

let base: string;
let server: ReturnType<ReturnType<typeof createApp>['listen']>;

async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, body: await res.json() };
}

async function login(email: string) {
  const res = await call('POST', '/auth/login', { body: { email, password: 'password123' } });
  assert.equal(res.status, 200);
  return res.body as { token: string; user: { id: string; name: string; role: string } };
}

let admin: Awaited<ReturnType<typeof login>>;
let asha: Awaited<ReturnType<typeof login>>;
let ben: Awaited<ReturnType<typeof login>>;

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
  admin = await login('admin@example.com');
  asha = await login('asha@example.com');
  ben = await login('ben@example.com');
});

after(async () => {
  await db.delete(tasks).where(eq(tasks.description, TEST_DESCRIPTION));
  server.close();
  await pool.end();
});

const validTask = () => ({
  title: 'Test task',
  description: TEST_DESCRIPTION,
  assigneeId: asha.user.id,
  priority: 'medium',
  deadline: '2026-12-01',
});

describe('auth', () => {
  test('login returns token and user', () => {
    assert.equal(admin.user.role, 'admin');
    assert.equal(asha.user.role, 'employee');
    assert.ok(admin.token);
  });

  test('wrong password is 401', async () => {
    const res = await call('POST', '/auth/login', { body: { email: 'admin@example.com', password: 'nope' } });
    assert.equal(res.status, 401);
    assert.equal(typeof res.body.error, 'string');
  });

  test('unknown email is 401', async () => {
    const res = await call('POST', '/auth/login', { body: { email: 'ghost@example.com', password: 'x' } });
    assert.equal(res.status, 401);
  });

  test('missing token is 401', async () => {
    assert.equal((await call('GET', '/tasks')).status, 401);
  });

  test('invalid token is 401', async () => {
    assert.equal((await call('GET', '/tasks', { token: 'garbage' })).status, 401);
  });
});

describe('users', () => {
  test('admin gets employees only', async () => {
    const res = await call('GET', '/users', { token: admin.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 3);
    assert.ok(!res.body.some((u: { id: string }) => u.id === admin.user.id));
    assert.deepEqual(Object.keys(res.body[0]).sort(), ['id', 'name']);
  });

  test('employee is 403', async () => {
    assert.equal((await call('GET', '/users', { token: asha.token })).status, 403);
  });
});

describe('task list', () => {
  test('admin sees tasks from several employees, ordered by deadline', async () => {
    const res = await call('GET', '/tasks', { token: admin.token });
    assert.equal(res.status, 200);
    const assignees = new Set(res.body.map((t: { assignee: { id: string } }) => t.assignee.id));
    assert.ok(assignees.size > 1);
    const deadlines = res.body.map((t: { deadline: string }) => t.deadline);
    assert.deepEqual(deadlines, [...deadlines].sort());
  });

  test('task has the documented shape', async () => {
    const [task] = (await call('GET', '/tasks', { token: admin.token })).body;
    for (const key of ['id', 'title', 'description', 'priority', 'deadline', 'status', 'createdAt', 'assignee']) {
      assert.ok(key in task, `missing ${key}`);
    }
    assert.deepEqual(Object.keys(task.assignee).sort(), ['id', 'name']);
  });

  test('employee only sees own tasks, even when passing another assigneeId', async () => {
    const res = await call('GET', `/tasks?assigneeId=${ben.user.id}`, { token: asha.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.length > 0);
    assert.ok(res.body.every((t: { assignee: { id: string } }) => t.assignee.id === asha.user.id));
  });

  test('admin filters by assignee and status combined', async () => {
    const res = await call('GET', `/tasks?assigneeId=${asha.user.id}&status=in_progress`, { token: admin.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.length > 0);
    assert.ok(
      res.body.every(
        (t: { status: string; assignee: { id: string } }) => t.status === 'in_progress' && t.assignee.id === asha.user.id,
      ),
    );
  });

  test('filter with no matches returns empty list', async () => {
    const res = await call('GET', `/tasks?assigneeId=${admin.user.id}`, { token: admin.token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  test('invalid status filter is 400', async () => {
    assert.equal((await call('GET', '/tasks?status=blocked', { token: admin.token })).status, 400);
  });
});

describe('create task', () => {
  test('admin creates a task as todo (201)', async () => {
    const res = await call('POST', '/tasks', { token: admin.token, body: validTask() });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'todo');
    assert.equal(res.body.assignee.id, asha.user.id);
    assert.equal(res.body.deadline, '2026-12-01');
  });

  test('employee is 403', async () => {
    assert.equal((await call('POST', '/tasks', { token: asha.token, body: validTask() })).status, 403);
  });

  const invalid: [string, Record<string, unknown>][] = [
    ['empty title', { title: '  ' }],
    ['title over 150 chars', { title: 'x'.repeat(151) }],
    ['empty description', { description: '' }],
    ['bad priority', { priority: 'urgent' }],
    ['bad deadline format', { deadline: '01/12/2026' }],
    ['impossible deadline', { deadline: '2026-02-30' }],
    ['non-uuid assignee', { assigneeId: '123' }],
    ['unknown assignee', { assigneeId: '00000000-0000-4000-8000-000000000000' }],
  ];
  for (const [name, patch] of invalid) {
    test(`${name} is 400`, async () => {
      const res = await call('POST', '/tasks', { token: admin.token, body: { ...validTask(), ...patch } });
      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  }

  test('assigning to an admin is 400', async () => {
    const res = await call('POST', '/tasks', { token: admin.token, body: { ...validTask(), assigneeId: admin.user.id } });
    assert.equal(res.status, 400);
  });
});

describe('update status', () => {
  const firstTaskOf = async (token: string) => (await call('GET', '/tasks', { token })).body[0];

  test('assignee can change status in any direction', async () => {
    const task = await firstTaskOf(asha.token);
    const original = task.status;
    for (const status of ['done', 'in_progress', 'todo', original]) {
      const res = await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status } });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, status);
    }
  });

  test('admin can change any task', async () => {
    const task = await firstTaskOf(ben.token);
    const res = await call('PATCH', `/tasks/${task.id}/status`, { token: admin.token, body: { status: task.status } });
    assert.equal(res.status, 200);
  });

  test("employee changing another employee's task is 403", async () => {
    const task = await firstTaskOf(ben.token);
    const res = await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done' } });
    assert.equal(res.status, 403);
  });

  test('unknown task is 404', async () => {
    const res = await call('PATCH', '/tasks/00000000-0000-4000-8000-000000000000/status', {
      token: admin.token,
      body: { status: 'done' },
    });
    assert.equal(res.status, 404);
  });

  test('malformed id is 404', async () => {
    const res = await call('PATCH', '/tasks/not-a-uuid/status', { token: admin.token, body: { status: 'done' } });
    assert.equal(res.status, 404);
  });

  test('invalid status is 400', async () => {
    const task = await firstTaskOf(asha.token);
    const res = await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'blocked' } });
    assert.equal(res.status, 400);
  });
});

describe('gateway', () => {
  test('health check', async () => {
    assert.deepEqual((await call('GET', '/health')).body, { status: 'ok' });
  });

  test('unknown route is 404 JSON', async () => {
    const res = await call('GET', '/nope');
    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
  });
});
