// End-to-end API tests against the real database. Run `npm run db:seed` first.
// Each run creates its own project and tasks and hard-deletes them at the end.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { call, cleanupProjects, login, startServer, stopServer, uniqueName, type Session } from './helpers.js';

let admin: Session;
let asha: Session;
let ben: Session;
let projectId: string;
const projectIds: string[] = [];

/** Creates a task in the fixture project as the admin. */
async function makeTask(overrides: Record<string, unknown> = {}) {
  const res = await call('POST', '/tasks', {
    token: admin.token,
    body: {
      title: 'Fixture task',
      description: 'Created by the API test suite',
      assigneeId: asha.user.id,
      projectId,
      priority: 'medium',
      deadline: '2026-12-01',
      ...overrides,
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function eventsOf(taskId: string, token = admin.token) {
  return call('GET', `/tasks/${taskId}/events`, { token });
}

before(async () => {
  await startServer();
  admin = await login('admin@example.com');
  asha = await login('asha@example.com');
  ben = await login('ben@example.com');
  const res = await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Test project') } });
  assert.equal(res.status, 201);
  projectId = res.body.id;
  projectIds.push(projectId);
});

after(async () => {
  await cleanupProjects(projectIds);
  await stopServer();
});

describe('auth', () => {
  test('login returns token and user', () => {
    assert.equal(admin.user.role, 'admin');
    assert.equal(asha.user.role, 'employee');
  });

  test('wrong password is 401', async () => {
    const res = await call('POST', '/auth/login', { body: { email: 'admin@example.com', password: 'nope' } });
    assert.equal(res.status, 401);
    assert.equal(typeof res.body.error, 'string');
  });

  test('unknown email is 401', async () => {
    assert.equal((await call('POST', '/auth/login', { body: { email: 'ghost@example.com', password: 'x' } })).status, 401);
  });

  test('missing or invalid token is 401', async () => {
    assert.equal((await call('GET', '/tasks')).status, 401);
    assert.equal((await call('GET', '/tasks', { token: 'garbage' })).status, 401);
  });
});

describe('users', () => {
  test('admin gets employees only', async () => {
    const res = await call('GET', '/users', { token: admin.token });
    assert.equal(res.status, 200);
    assert.ok(!res.body.some((u: { id: string }) => u.id === admin.user.id));
    assert.deepEqual(Object.keys(res.body[0]).sort(), ['id', 'name']);
  });

  test('employee is 403', async () => {
    assert.equal((await call('GET', '/users', { token: asha.token })).status, 403);
  });
});

describe('projects', () => {
  test('everyone can list active projects', async () => {
    const res = await call('GET', '/projects', { token: asha.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.some((p: { id: string }) => p.id === projectId));
    assert.deepEqual(Object.keys(res.body[0]).sort(), ['colourIndex', 'id', 'name']);
  });

  test('only admins see the full list with counts', async () => {
    assert.equal((await call('GET', '/projects?all=true', { token: asha.token })).status, 403);
    const res = await call('GET', '/projects?all=true', { token: admin.token });
    assert.equal(res.status, 200);
    assert.ok('openTasks' in res.body[0]);
  });

  test('employee cannot create projects', async () => {
    assert.equal((await call('POST', '/projects', { token: asha.token, body: { name: 'Nope' } })).status, 403);
  });

  test('duplicate name (any case) is 400', async () => {
    const [p] = (await call('GET', '/projects', { token: admin.token })).body.filter((x: { id: string }) => x.id === projectId);
    const res = await call('POST', '/projects', { token: admin.token, body: { name: p.name.toUpperCase() } });
    assert.equal(res.status, 400);
  });

  test('archived project hides from the active list and rejects new tasks', async () => {
    const created = await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Archived project') } });
    projectIds.push(created.body.id);
    const archived = await call('PATCH', `/projects/${created.body.id}`, { token: admin.token, body: { archived: true } });
    assert.equal(archived.status, 200);
    assert.ok(archived.body.archivedAt);

    const list = await call('GET', '/projects', { token: admin.token });
    assert.ok(!list.body.some((p: { id: string }) => p.id === created.body.id));

    const res = await call('POST', '/tasks', {
      token: admin.token,
      body: { title: 'x', description: 'x', assigneeId: asha.user.id, projectId: created.body.id, priority: 'low', deadline: '2026-12-01' },
    });
    assert.equal(res.status, 400);
  });
});

describe('task list', () => {
  let ashaTask: { id: string };
  let benTask: { id: string };

  before(async () => {
    ashaTask = await makeTask({ title: 'Asha list task', deadline: '2026-11-20' });
    benTask = await makeTask({ title: 'Ben list task', assigneeId: ben.user.id, deadline: '2026-11-10' });
    await call('PATCH', `/tasks/${ashaTask.id}/status`, { token: asha.token, body: { status: 'in_progress' } });
  });

  test('task has the documented shape', async () => {
    const res = await call('GET', `/tasks?projectId=${projectId}`, { token: admin.token });
    const task = res.body[0];
    for (const key of ['id', 'title', 'description', 'priority', 'deadline', 'status', 'createdAt', 'updatedAt', 'completedAt', 'assignee', 'project']) {
      assert.ok(key in task, `missing ${key}`);
    }
    assert.deepEqual(Object.keys(task.project).sort(), ['colourIndex', 'id', 'name']);
  });

  test('admin filters by project, ordered by deadline', async () => {
    const res = await call('GET', `/tasks?projectId=${projectId}`, { token: admin.token });
    assert.ok(res.body.every((t: { project: { id: string } }) => t.project.id === projectId));
    const deadlines = res.body.map((t: { deadline: string }) => t.deadline);
    assert.deepEqual(deadlines, [...deadlines].sort());
  });

  test('employee only sees own tasks, even when passing another assigneeId', async () => {
    const res = await call('GET', `/tasks?assigneeId=${ben.user.id}`, { token: asha.token });
    assert.ok(res.body.some((t: { id: string }) => t.id === ashaTask.id));
    assert.ok(res.body.every((t: { assignee: { id: string } }) => t.assignee.id === asha.user.id));
    assert.ok(!res.body.some((t: { id: string }) => t.id === benTask.id));
  });

  test('filters combine', async () => {
    const res = await call('GET', `/tasks?projectId=${projectId}&assigneeId=${asha.user.id}&status=in_progress`, { token: admin.token });
    assert.deepEqual(res.body.map((t: { id: string }) => t.id), [ashaTask.id]);
  });

  test('filter with no matches returns empty list', async () => {
    const res = await call('GET', `/tasks?assigneeId=${admin.user.id}`, { token: admin.token });
    assert.deepEqual(res.body, []);
  });

  test('invalid filter is 400', async () => {
    assert.equal((await call('GET', '/tasks?status=blocked', { token: admin.token })).status, 400);
    assert.equal((await call('GET', '/tasks?projectId=123', { token: admin.token })).status, 400);
  });
});

describe('create task', () => {
  test('admin creates a task as todo, with a created event', async () => {
    const task = await makeTask();
    assert.equal(task.status, 'todo');
    assert.equal(task.project.id, projectId);
    assert.equal(task.completedAt, null);
    const events = await eventsOf(task.id);
    assert.deepEqual(events.body.events.map((e: { type: string }) => e.type), ['created']);
  });

  test('employee is 403', async () => {
    const res = await call('POST', '/tasks', {
      token: asha.token,
      body: { title: 'x', description: 'x', assigneeId: asha.user.id, projectId, priority: 'low', deadline: '2026-12-01' },
    });
    assert.equal(res.status, 403);
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
    ['missing project', { projectId: undefined }],
    ['unknown project', { projectId: '00000000-0000-4000-8000-000000000000' }],
  ];
  for (const [name, patch] of invalid) {
    test(`${name} is 400`, async () => {
      const body = {
        title: 'Valid',
        description: 'Valid',
        assigneeId: asha.user.id,
        projectId,
        priority: 'medium',
        deadline: '2026-12-01',
        ...patch,
      };
      const res = await call('POST', '/tasks', { token: admin.token, body });
      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  }

  test('assigning to an admin is 400', async () => {
    const res = await call('POST', '/tasks', {
      token: admin.token,
      body: { title: 'x', description: 'x', assigneeId: admin.user.id, projectId, priority: 'low', deadline: '2026-12-01' },
    });
    assert.equal(res.status, 400);
  });
});

describe('update status', () => {
  test('assignee can change status in any direction; completedAt follows done', async () => {
    const task = await makeTask();
    const toDone = await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done' } });
    assert.equal(toDone.status, 200);
    assert.ok(toDone.body.completedAt, 'completedAt set on done');

    const back = await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'in_progress' } });
    assert.equal(back.body.status, 'in_progress');
    assert.equal(back.body.completedAt, null, 'completedAt cleared when leaving done');

    const events = (await eventsOf(task.id)).body.events;
    assert.deepEqual(
      events.filter((e: { type: string }) => e.type === 'status_changed').map((e: { data: unknown }) => e.data),
      [{ from: 'done', to: 'in_progress' }, { from: 'todo', to: 'done' }],
    );
  });

  test('setting the same status writes no event', async () => {
    const task = await makeTask();
    await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'todo' } });
    assert.equal((await eventsOf(task.id)).body.events.length, 1);
  });

  test("employee changing another employee's task is 403", async () => {
    const task = await makeTask({ assigneeId: ben.user.id });
    const res = await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done' } });
    assert.equal(res.status, 403);
  });

  test('unknown or malformed id is 404', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const res = await call('PATCH', `/tasks/${id}/status`, { token: admin.token, body: { status: 'done' } });
      assert.equal(res.status, 404);
    }
  });

  test('invalid status is 400', async () => {
    const task = await makeTask();
    const res = await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'blocked' } });
    assert.equal(res.status, 400);
  });
});

describe('edit and reassign', () => {
  test('admin edit returns new values and logs only the changed fields', async () => {
    const task = await makeTask({ title: 'Before', priority: 'low' });
    const res = await call('PATCH', `/tasks/${task.id}`, {
      token: admin.token,
      body: { title: 'After', priority: 'low', deadline: '2026-12-05' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'After');
    assert.equal(res.body.deadline, '2026-12-05');

    const updated = (await eventsOf(task.id)).body.events.filter((e: { type: string }) => e.type === 'updated');
    assert.equal(updated.length, 1);
    assert.deepEqual(updated[0].data.changes, {
      title: { from: 'Before', to: 'After' },
      deadline: { from: '2026-12-01', to: '2026-12-05' },
    });
  });

  test('an edit that changes nothing writes no event', async () => {
    const task = await makeTask({ title: 'Same' });
    const res = await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: { title: 'Same' } });
    assert.equal(res.status, 200);
    assert.equal((await eventsOf(task.id)).body.events.length, 1);
  });

  test('empty or unknown fields are 400', async () => {
    const task = await makeTask();
    assert.equal((await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: {} })).status, 400);
    assert.equal((await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: { status: 'done' } })).status, 400);
  });

  test('employee cannot edit (403)', async () => {
    const task = await makeTask();
    assert.equal((await call('PATCH', `/tasks/${task.id}`, { token: asha.token, body: { title: 'Mine now' } })).status, 403);
  });

  test('reassign to an admin or unknown user is 400', async () => {
    const task = await makeTask();
    for (const assigneeId of [admin.user.id, '00000000-0000-4000-8000-000000000000']) {
      assert.equal((await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: { assigneeId } })).status, 400);
    }
  });

  test('reassigning writes a reassigned event with resolved names', async () => {
    const task = await makeTask();
    const res = await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: { assigneeId: ben.user.id } });
    assert.equal(res.body.assignee.id, ben.user.id);

    const { events, names } = (await eventsOf(task.id)).body;
    assert.equal(events[0].type, 'reassigned');
    assert.deepEqual(events[0].data, { fromId: asha.user.id, toId: ben.user.id });
    assert.equal(names[asha.user.id], asha.user.name);
    assert.equal(names[ben.user.id], ben.user.name);
    assert.equal(events[0].actor.id, admin.user.id);
  });

  test('the previous assignee loses access after reassignment', async () => {
    const task = await makeTask();
    assert.equal((await eventsOf(task.id, asha.token)).status, 200);
    await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: { assigneeId: ben.user.id } });

    assert.equal((await eventsOf(task.id, asha.token)).status, 404);
    const list = await call('GET', '/tasks', { token: asha.token });
    assert.ok(!list.body.some((t: { id: string }) => t.id === task.id));
    assert.equal((await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done' } })).status, 403);
    assert.equal((await eventsOf(task.id, ben.token)).status, 200);
  });

  test("employees can't read another employee's timeline", async () => {
    const task = await makeTask({ assigneeId: ben.user.id });
    assert.equal((await eventsOf(task.id, asha.token)).status, 404);
  });
});

describe('delete and restore', () => {
  test('delete hides the task everywhere; restore brings it back', async () => {
    const task = await makeTask();
    assert.equal((await call('DELETE', `/tasks/${task.id}`, { token: admin.token })).status, 204);

    const list = await call('GET', `/tasks?projectId=${projectId}`, { token: admin.token });
    assert.ok(!list.body.some((t: { id: string }) => t.id === task.id));
    assert.equal((await call('DELETE', `/tasks/${task.id}`, { token: admin.token })).status, 404);
    assert.equal((await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done' } })).status, 404);
    assert.equal((await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: { title: 'x' } })).status, 404);
    assert.equal((await eventsOf(task.id)).status, 404);

    const restored = await call('POST', `/tasks/${task.id}/restore`, { token: admin.token });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.id, task.id);
    const types = (await eventsOf(task.id)).body.events.map((e: { type: string }) => e.type);
    assert.deepEqual(types, ['restored', 'archived', 'created']);
  });

  test('restoring a live task is 404', async () => {
    const task = await makeTask();
    assert.equal((await call('POST', `/tasks/${task.id}/restore`, { token: admin.token })).status, 404);
  });

  test('employees cannot delete or restore (403)', async () => {
    const task = await makeTask();
    assert.equal((await call('DELETE', `/tasks/${task.id}`, { token: asha.token })).status, 403);
    assert.equal((await call('POST', `/tasks/${task.id}/restore`, { token: asha.token })).status, 403);
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
