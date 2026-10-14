// Comments: the whole team can talk on any task, @mentions notify, edits keep an audit trail.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { call, cleanupProjects, login, startServer, stopServer, uniqueName, type Session } from './helpers.js';

let admin: Session;
let asha: Session;
let ben: Session;
let chen: Session;
let projectId: string;

async function makeTask(assigneeId = asha.user.id) {
  const res = await call('POST', '/tasks', {
    token: admin.token,
    body: { title: uniqueName('Comment task'), description: 'Comment tests', assigneeId, projectId, priority: 'low', deadline: '2026-12-01' },
  });
  assert.equal(res.status, 201);
  return res.body as { id: string; title: string };
}

const comment = (token: string, taskId: string, body: string, mentionIds: string[] = []) =>
  call('POST', `/tasks/${taskId}/comments`, { token, body: { body, mentionIds } });
const commentsOf = async (token: string, taskId: string) => (await call('GET', `/tasks/${taskId}/comments`, { token })).body;

async function notificationsFor(s: Session, taskId: string) {
  const res = await call('GET', '/notifications?limit=50', { token: s.token });
  return (res.body.items as { type: string; taskId: string; title: string; body: string; link: string }[]).filter((n) => n.taskId === taskId);
}

before(async () => {
  await startServer();
  admin = await login('admin@example.com');
  asha = await login('asha@example.com');
  ben = await login('ben@example.com');
  chen = await login('chen@example.com');
  const res = await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Comments project') } });
  projectId = res.body.id;
});

after(async () => {
  await cleanupProjects([projectId]);
  await stopServer();
});

describe('comments', () => {
  test('anyone on the team can comment on any task; the count shows on the task', async () => {
    const task = await makeTask();
    assert.equal((await comment(ben.token, task.id, 'Do we have the old logo files?')).status, 201);
    assert.equal((await comment(asha.token, task.id, 'Yes, in the shared drive.')).status, 201);
    const list = await commentsOf(chen.token, task.id);
    assert.deepEqual(list.map((c: { body: string }) => c.body), ['Do we have the old logo files?', 'Yes, in the shared drive.']);
    const tasks = (await call('GET', `/tasks?projectId=${projectId}`, { token: admin.token })).body;
    assert.equal(tasks.find((t: { id: string }) => t.id === task.id).commentCount, 2);
  });

  test('empty comments are 400', async () => {
    const task = await makeTask();
    assert.equal((await comment(asha.token, task.id, '   ')).status, 400);
  });

  test('a mention notifies that person once, with a link they can open', async () => {
    const task = await makeTask();
    const res = await comment(ben.token, task.id, '@Chen Li can you check the numbers?', [chen.user.id]);
    assert.equal(res.status, 201);

    const chens = await notificationsFor(chen, task.id);
    assert.equal(chens.length, 1);
    assert.equal(chens[0].type, 'mentioned');
    assert.match(chens[0].title, /Ben Carter mentioned you/);
    assert.equal(chens[0].link, `/team?task=${task.id}`);

    // the assignee and the admin hear about the comment, Ben does not hear about his own
    assert.equal((await notificationsFor(asha, task.id)).filter((n) => n.type === 'comment_added').length, 1);
    assert.ok((await notificationsFor(admin, task.id)).some((n) => n.type === 'comment_added' && n.link === `/admin/tasks?task=${task.id}`));
    assert.equal((await notificationsFor(ben, task.id)).filter((n) => n.type === 'comment_added' || n.type === 'mentioned').length, 0);

    const [c] = await commentsOf(asha.token, task.id);
    assert.deepEqual(c.mentions.map((m: { id: string }) => m.id), [chen.user.id]);
  });

  test('a mention id whose name is not in the text is ignored', async () => {
    const task = await makeTask();
    await comment(ben.token, task.id, 'No names here', [chen.user.id]);
    assert.equal((await notificationsFor(chen, task.id)).length, 0);
  });

  test('only the author can edit; edits keep the old text for the author and the admin', async () => {
    const task = await makeTask();
    const { body } = await comment(asha.token, task.id, 'Draft is ready');
    assert.equal((await call('PATCH', `/comments/${body.id}`, { token: ben.token, body: { body: 'hijack' } })).status, 403);
    assert.equal((await call('PATCH', `/comments/${body.id}`, { token: asha.token, body: { body: 'Draft is ready for review' } })).status, 200);

    const [c] = await commentsOf(ben.token, task.id);
    assert.equal(c.body, 'Draft is ready for review');
    assert.ok(c.editedAt);
    assert.equal(c.revisionCount, 1);

    const history = await call('GET', `/comments/${body.id}/revisions`, { token: admin.token });
    assert.equal(history.status, 200);
    assert.deepEqual(history.body.map((r: { body: string }) => r.body), ['Draft is ready']);
    assert.equal((await call('GET', `/comments/${body.id}/revisions`, { token: ben.token })).status, 403);
  });

  test('editing in a new mention notifies only the newly mentioned person', async () => {
    const task = await makeTask();
    const { body } = await comment(asha.token, task.id, '@Ben Carter please look', [ben.user.id]);
    await call('PATCH', `/comments/${body.id}`, {
      token: asha.token,
      body: { body: '@Ben Carter and @Chen Li please look', mentionIds: [ben.user.id, chen.user.id] },
    });
    assert.equal((await notificationsFor(ben, task.id)).filter((n) => n.type === 'mentioned').length, 1);
    assert.equal((await notificationsFor(chen, task.id)).filter((n) => n.type === 'mentioned').length, 1);
  });

  test('delete hides the text, keeps a placeholder, and can be undone', async () => {
    const task = await makeTask();
    const { body } = await comment(ben.token, task.id, 'Wrong task, sorry');
    assert.equal((await call('DELETE', `/comments/${body.id}`, { token: asha.token })).status, 403);
    assert.equal((await call('DELETE', `/comments/${body.id}`, { token: ben.token })).status, 204);

    const [gone] = await commentsOf(asha.token, task.id);
    assert.equal(gone.deleted, true);
    assert.equal(gone.body, null);
    const tasks = (await call('GET', `/tasks?projectId=${projectId}`, { token: admin.token })).body;
    assert.equal(tasks.find((t: { id: string }) => t.id === task.id).commentCount, 0);

    assert.equal((await call('POST', `/comments/${body.id}/restore`, { token: ben.token })).status, 204);
    assert.equal((await commentsOf(asha.token, task.id))[0].body, 'Wrong task, sorry');
  });

  test('the admin can delete anyone’s comment', async () => {
    const task = await makeTask();
    const { body } = await comment(asha.token, task.id, 'Off topic');
    assert.equal((await call('DELETE', `/comments/${body.id}`, { token: admin.token })).status, 204);
  });

  test('completion notes stay separate from comments', async () => {
    const task = await makeTask();
    await comment(asha.token, task.id, 'Starting now');
    await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done', note: { summary: 'All done', minutesSpent: 30 } } });
    assert.equal((await commentsOf(asha.token, task.id)).length, 1);
    assert.equal((await call('GET', `/tasks/${task.id}/notes`, { token: asha.token })).body.length, 1);
  });

  test('everyone, admin included, can be mentioned', async () => {
    const res = await call('GET', '/users/people', { token: asha.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.some((p: { id: string }) => p.id === admin.user.id));
  });
});
