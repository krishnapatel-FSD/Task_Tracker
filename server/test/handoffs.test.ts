// Handoffs: draft, hand over, locked until accepted, accept, who may do what.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { call, cleanupProjects, login, startServer, stopServer, uniqueName, type Session } from './helpers.js';

let admin: Session;
let asha: Session;
let ben: Session;
let chen: Session;
let projectId: string;

async function makeTask(assigneeId = asha.user.id, checklist = ['Collect receipts', 'Enter them', 'Send to finance']) {
  const res = await call('POST', '/tasks', {
    token: admin.token,
    body: { title: uniqueName('Handoff task'), description: 'x', projectId, assigneeId, priority: 'medium', deadline: '2030-06-01', checklist },
  });
  assert.equal(res.status, 201);
  return res.body as { id: string };
}
const handoff = (token: string, taskId: string, body: Record<string, unknown>) => call('POST', `/tasks/${taskId}/handoffs`, { token, body });
const notes = async (s: Session, taskId: string) =>
  ((await call('GET', '/notifications?limit=50', { token: s.token })).body.items as { type: string; taskId: string; title: string }[]).filter((n) => n.taskId === taskId);

before(async () => {
  await startServer();
  admin = await login('admin@example.com');
  asha = await login('asha@example.com');
  ben = await login('ben@example.com');
  chen = await login('chen@example.com');
  projectId = (await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Handoff project') } })).body.id;
});

after(async () => {
  await cleanupProjects([projectId]);
  await stopServer();
});

describe('handoffs', () => {
  test('the draft lists finished and remaining steps and recent comments', async () => {
    const task = await makeTask();
    const items = (await call('GET', `/tasks/${task.id}/checklist`, { token: asha.token })).body;
    await call('PATCH', `/checklist/${items[0].id}`, { token: asha.token, body: { done: true } });
    await call('POST', `/tasks/${task.id}/comments`, { token: asha.token, body: { body: 'Finance wants PDFs, not photos.' } });

    const draft = await call('GET', `/tasks/${task.id}/handoffs/draft`, { token: asha.token });
    assert.equal(draft.status, 200);
    assert.deepEqual(draft.body.done, ['Collect receipts']);
    assert.deepEqual(draft.body.remaining, ['Enter them', 'Send to finance']);
    assert.match(draft.body.decisions, /Asha Patel: Finance wants PDFs/);
    assert.equal((await call('GET', `/tasks/${task.id}/handoffs/draft`, { token: ben.token })).status, 403);
  });

  test('the assignee hands off; the task moves and is locked until the new owner accepts', async () => {
    const task = await makeTask();
    const res = await handoff(asha.token, task.id, { toUserId: ben.user.id, done: ['Collected receipts'], remaining: ['Enter them'], blockers: 'Waiting on the March statement' });
    assert.equal(res.status, 201);
    assert.equal(res.body.assignee.id, ben.user.id);
    assert.equal(res.body.handoffPending, true);

    // Ben can't work on it yet; Asha no longer owns it
    assert.equal((await call('PATCH', `/tasks/${task.id}/status`, { token: ben.token, body: { status: 'in_progress' } })).status, 409);
    assert.equal((await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'in_progress' } })).status, 403);
    // a second handoff can't stack on top
    assert.equal((await handoff(admin.token, task.id, { toUserId: chen.user.id })).status, 409);

    assert.ok((await notes(ben, task.id)).some((n) => n.type === 'handoff_received'));
    assert.ok((await notes(admin, task.id)).some((n) => n.type === 'handoff_received'));

    // only Ben can accept
    assert.equal((await call('POST', `/tasks/${task.id}/handoffs/accept`, { token: chen.token })).status, 403);
    const accepted = await call('POST', `/tasks/${task.id}/handoffs/accept`, { token: ben.token });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.handoffPending, false);
    assert.equal((await call('PATCH', `/tasks/${task.id}/status`, { token: ben.token, body: { status: 'in_progress' } })).status, 200);
    assert.ok((await notes(asha, task.id)).some((n) => n.type === 'handoff_accepted'));

    const history = (await call('GET', `/tasks/${task.id}/handoffs`, { token: chen.token })).body;
    assert.equal(history.length, 1);
    assert.equal(history[0].from.id, asha.user.id);
    assert.equal(history[0].to.id, ben.user.id);
    assert.equal(history[0].blockers, 'Waiting on the March statement');
    assert.ok(history[0].acceptedAt);
  });

  test('the admin can hand off anyone’s task; others cannot', async () => {
    const task = await makeTask();
    assert.equal((await handoff(chen.token, task.id, { toUserId: chen.user.id })).status, 403);
    assert.equal((await handoff(admin.token, task.id, { toUserId: chen.user.id })).status, 201);
  });

  test('rules: not to the same person, not to the admin, not when finished', async () => {
    const task = await makeTask();
    assert.equal((await handoff(admin.token, task.id, { toUserId: asha.user.id })).status, 400);
    assert.equal((await handoff(admin.token, task.id, { toUserId: admin.user.id })).status, 400);
    await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done', note: { summary: 'Done', minutesSpent: 10 } } });
    assert.equal((await handoff(admin.token, task.id, { toUserId: ben.user.id })).status, 400);
  });

  test('only files from this task are attached', async () => {
    const task = await makeTask();
    const res = await handoff(admin.token, task.id, { toUserId: ben.user.id, attachmentIds: ['00000000-0000-4000-8000-000000000000'] });
    assert.equal(res.status, 201);
    const [h] = (await call('GET', `/tasks/${task.id}/handoffs`, { token: admin.token })).body;
    assert.deepEqual(h.files, []);
  });

  test('the activity log names both people', async () => {
    const task = await makeTask();
    await handoff(asha.token, task.id, { toUserId: ben.user.id });
    await call('POST', `/tasks/${task.id}/handoffs/accept`, { token: ben.token });
    const timeline = (await call('GET', `/tasks/${task.id}/events`, { token: admin.token })).body;
    const types = timeline.events.map((e: { type: string }) => e.type);
    assert.ok(types.includes('handed_off') && types.includes('handoff_accepted'));
    assert.equal(timeline.names[ben.user.id], 'Ben Carter');
  });
});
