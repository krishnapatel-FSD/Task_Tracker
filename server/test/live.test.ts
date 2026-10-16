// Live updates: a change by one person reaches everyone else's open stream at once.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { call, cleanupProjects, login, rawFetch, startServer, stopServer, uniqueName, type Session } from './helpers.js';

let admin: Session;
let asha: Session;
const projectIds: string[] = [];

before(async () => {
  await startServer();
  admin = await login('admin@example.com');
  asha = await login('asha@example.com');
});

after(async () => {
  await cleanupProjects(projectIds);
  await stopServer();
});

/** Opens a stream and collects its messages until stopped. */
async function listen(token: string) {
  const controller = new AbortController();
  const res = await rawFetch('/live', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
  const messages: Record<string, string>[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = block.split('\n').find((l) => l.startsWith('data: '));
          if (data) messages.push(JSON.parse(data.slice(6)));
        }
      }
    } catch {
      // aborted
    }
  })();
  return { messages, stop: () => controller.abort() };
}

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
  return check();
};

describe('live updates', () => {
  test('a stream needs a signed-in person', async () => {
    assert.equal((await rawFetch('/live')).status, 401);
  });

  test("an employee's status change reaches the admin's stream straight away", async () => {
    const stream = await listen(admin.token);
    try {
      const project = await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Live project') } });
      projectIds.push(project.body.id);
      assert.ok(await waitFor(() => stream.messages.some((m) => m.scope === 'projects')), 'project change announced');

      const task = await call('POST', '/tasks', {
        token: admin.token,
        body: { title: 'Live task', description: 'Watch me move', assigneeId: asha.user.id, projectId: project.body.id, priority: 'low', deadline: '2026-12-01' },
      });
      await call('PATCH', `/tasks/${task.body.id}/status`, { token: asha.token, body: { status: 'in_progress' } });
      assert.ok(
        await waitFor(() => stream.messages.some((m) => m.scope === 'tasks' && m.taskId === task.body.id && m.actorId === asha.user.id)),
        JSON.stringify(stream.messages),
      );

      // Refused changes and reads are not announced.
      const count = stream.messages.length;
      await call('PATCH', `/tasks/${task.body.id}/status`, { token: admin.token, body: { status: 'todo' } });
      await call('GET', '/tasks', { token: asha.token });
      await new Promise((r) => setTimeout(r, 150));
      assert.equal(stream.messages.length, count);
    } finally {
      stream.stop();
    }
  });
});
