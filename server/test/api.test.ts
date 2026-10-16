// End-to-end API tests against the real database. Run `npm run db:seed` first.
// Each run creates its own project and tasks and hard-deletes them at the end.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { call, cleanupProjects, login, startServer, stopServer, tokenFor, uniqueName, type Session } from './helpers.js';

/** Marking a task done always carries a completion note. */
const DONE_NOTE = { summary: 'Finished and checked', minutesSpent: 45 };

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

  test('missing or invalid token is 401', async () => {
    assert.equal((await call('GET', '/tasks')).status, 401);
    assert.equal((await call('GET', '/tasks', { token: 'garbage' })).status, 401);
  });

  test('a session without its authenticator code (aal1) is refused', async () => {
    const res = await call('GET', '/tasks', { token: tokenFor({ authId: admin.user.id, aal: 'aal1' }) });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /authenticator/);
  });
});

describe('users', () => {
  test('admin gets employees only', async () => {
    const res = await call('GET', '/users', { token: admin.token });
    assert.equal(res.status, 200);
    assert.ok(!res.body.some((u: { id: string }) => u.id === admin.user.id));
    assert.deepEqual(Object.keys(res.body[0]).sort(), ['id', 'name']);
  });

  test('employees get the same list (names only) for the team board', async () => {
    const res = await call('GET', '/users', { token: asha.token });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body[0]).sort(), ['id', 'name']);
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

  test("employees see the whole team's tasks and can filter by person", async () => {
    const all = await call('GET', '/tasks', { token: asha.token });
    assert.ok(all.body.some((t: { id: string }) => t.id === ashaTask.id));
    assert.ok(all.body.some((t: { id: string }) => t.id === benTask.id));
    const bens = await call('GET', `/tasks?assigneeId=${ben.user.id}`, { token: asha.token });
    assert.ok(bens.body.every((t: { assignee: { id: string } }) => t.assignee.id === ben.user.id));
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
    const toDone = await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done', note: DONE_NOTE } });
    assert.equal(toDone.status, 200);
    assert.ok(toDone.body.completedAt, 'completedAt set on done');

    const back = await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'in_progress' } });
    assert.equal(back.body.status, 'in_progress');
    assert.equal(back.body.completedAt, null, 'completedAt cleared when leaving done');

    const events = (await eventsOf(task.id)).body.events;
    const changes = events
      .filter((e: { type: string }) => e.type === 'status_changed')
      .map((e: { data: Record<string, unknown> }) => ({ from: e.data.from, to: e.data.to, minutesSpent: e.data.minutesSpent }));
    assert.deepEqual(changes, [
      { from: 'done', to: 'in_progress', minutesSpent: undefined },
      { from: 'todo', to: 'done', minutesSpent: 45 },
    ]);
  });

  test('marking done without a note is 400', async () => {
    const task = await makeTask();
    for (const body of [{ status: 'done' }, { status: 'done', note: { summary: '', minutesSpent: 30 } }, { status: 'done', note: { summary: 'Done it', minutesSpent: 0 } }]) {
      const res = await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body });
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal((await call('GET', `/tasks`, { token: asha.token })).body.find((t: { id: string }) => t.id === task.id).status, 'todo');
  });

  test('completion note is stored and visible to the assignee and the admin only', async () => {
    const task = await makeTask();
    const done = await call('PATCH', `/tasks/${task.id}/status`, {
      token: asha.token,
      body: { status: 'done', note: { summary: '  Sent the invoices  ', minutesSpent: 90 } },
    });
    assert.equal(done.status, 200);
    assert.equal(done.body.noteCount, 1);

    for (const token of [asha.token, admin.token]) {
      const notes = await call('GET', `/tasks/${task.id}/notes`, { token });
      assert.equal(notes.status, 200);
      assert.equal(notes.body.length, 1);
      assert.equal(notes.body[0].summary, 'Sent the invoices');
      assert.equal(notes.body[0].minutesSpent, 90);
      assert.equal(notes.body[0].author.id, asha.user.id);
    }
    // the team board: other employees can read it too
    assert.equal((await call('GET', `/tasks/${task.id}/notes`, { token: ben.token })).status, 200);
  });

  test('reopening keeps the note; finishing again adds another', async () => {
    const task = await makeTask();
    await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done', note: DONE_NOTE } });
    await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'todo' } });
    await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done', note: { summary: 'Fixed the follow-up', minutesSpent: 20 } } });
    const notes = (await call('GET', `/tasks/${task.id}/notes`, { token: admin.token })).body;
    assert.deepEqual(notes.map((n: { summary: string }) => n.summary), ['Fixed the follow-up', 'Finished and checked']);
  });

  test('setting the same status writes no event', async () => {
    const task = await makeTask();
    await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'todo' } });
    assert.equal((await eventsOf(task.id)).body.events.length, 1);
  });

  test("employee changing another employee's task is 403", async () => {
    const task = await makeTask({ assigneeId: ben.user.id });
    const res = await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done', note: DONE_NOTE } });
    assert.equal(res.status, 403);
  });

  test('unknown or malformed id is 404', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const res = await call('PATCH', `/tasks/${id}/status`, { token: admin.token, body: { status: 'done', note: DONE_NOTE } });
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
    assert.equal((await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: { status: 'done', note: DONE_NOTE } })).status, 400);
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

  test('the previous assignee can still read but no longer change it after reassignment', async () => {
    const task = await makeTask();
    await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: { assigneeId: ben.user.id } });

    assert.equal((await eventsOf(task.id, asha.token)).status, 200);
    const mine = await call('GET', `/tasks?assigneeId=${asha.user.id}`, { token: asha.token });
    assert.ok(!mine.body.some((t: { id: string }) => t.id === task.id));
    assert.equal((await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done', note: DONE_NOTE } })).status, 403);
    assert.equal((await eventsOf(task.id, ben.token)).status, 200);
  });

  test("employees can read another employee's timeline but not change its status", async () => {
    const task = await makeTask({ assigneeId: ben.user.id });
    assert.equal((await eventsOf(task.id, asha.token)).status, 200);
    assert.equal((await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'in_progress' } })).status, 403);
  });
});

describe('delete and restore', () => {
  test('delete hides the task everywhere; restore brings it back', async () => {
    const task = await makeTask();
    assert.equal((await call('DELETE', `/tasks/${task.id}`, { token: admin.token })).status, 204);

    const list = await call('GET', `/tasks?projectId=${projectId}`, { token: admin.token });
    assert.ok(!list.body.some((t: { id: string }) => t.id === task.id));
    assert.equal((await call('DELETE', `/tasks/${task.id}`, { token: admin.token })).status, 404);
    assert.equal((await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done', note: DONE_NOTE } })).status, 404);
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

describe('projects board', () => {
  let boardProjectId: string;

  before(async () => {
    const created = await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Board project') } });
    boardProjectId = created.body.id;
    projectIds.push(boardProjectId);
    const base = { description: 'Board fixture', projectId: boardProjectId, priority: 'low' };
    const add = (body: Record<string, unknown>) => call('POST', '/tasks', { token: admin.token, body: { ...base, ...body } });
    await add({ title: 'Late for Asha', assigneeId: asha.user.id, deadline: '2020-01-01' });
    await add({ title: 'Later for Asha', assigneeId: asha.user.id, deadline: '2099-01-01' });
    await add({ title: 'For Ben', assigneeId: ben.user.id, deadline: '2099-02-01' });
  });

  test('admin gets team-wide counts', async () => {
    const res = await call('GET', '/projects?board=true', { token: admin.token });
    assert.equal(res.status, 200);
    const row = res.body.find((p: { id: string }) => p.id === boardProjectId);
    assert.equal(row.totalTasks, 3);
    assert.equal(row.openTasks, 3);
    assert.equal(row.lateTasks, 1);
    assert.equal(row.nextDeadline, '2020-01-01');
  });

  test('employee sees team-wide counts and only their own changes', async () => {
    const res = await call('GET', '/projects?board=true', { token: asha.token });
    assert.equal(res.status, 200);
    const row = res.body.find((p: { id: string }) => p.id === boardProjectId);
    assert.equal(row.totalTasks, 3);
    assert.equal(row.lateTasks, 1);
    // both tasks were assigned to Asha, so both carry an unread notification
    assert.equal(row.changedTasks, 2);
  });

  test('employee does not see projects without their tasks', async () => {
    const empty = await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Empty project') } });
    projectIds.push(empty.body.id);
    const res = await call('GET', '/projects?board=true', { token: asha.token });
    assert.ok(!res.body.some((p: { id: string }) => p.id === empty.body.id));
    const adminRes = await call('GET', '/projects?board=true', { token: admin.token });
    assert.ok(adminRes.body.some((p: { id: string }) => p.id === empty.body.id));
  });
});
