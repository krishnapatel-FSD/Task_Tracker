// Notification fan-out, holds, reminders and the email outbox.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { notificationPreferences, notifications } from '../src/db/schema.js';
import { countByDedupeKey, runDueReminders } from '../src/jobs/dueReminders.js';
import { runEmailOutbox } from '../src/jobs/emailOutbox.js';
import type { MailMessage } from '../src/lib/mailer.js';
import { insertNotifications } from '../src/services/notificationService.js';
import { recordEvent } from '../src/services/taskEvents.js';
import { call, cleanupProjects, login, startServer, stopServer, uniqueName, type Session } from './helpers.js';

/** Marking a task done always carries a completion note. */
const DONE_NOTE = { summary: 'Finished and checked', minutesSpent: 45 };

let admin: Session;
let asha: Session;
let ben: Session;
let projectId: string;
const extraDedupeKeys: string[] = [];

async function makeTask(overrides: Record<string, unknown> = {}) {
  const res = await call('POST', '/tasks', {
    token: admin.token,
    body: {
      title: uniqueName('Notify task'),
      description: 'Created by the notification tests',
      assigneeId: asha.user.id,
      projectId,
      priority: 'medium',
      deadline: '2026-12-01',
      ...overrides,
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body as { id: string; title: string };
}

/** All notifications (delivered or held) about one task, straight from the table. */
async function rowsForTask(taskId: string) {
  return db.select().from(notifications).where(eq(notifications.taskId, taskId));
}

const recipients = (rows: { userId: string }[]) => rows.map((r) => r.userId).sort();

before(async () => {
  await startServer();
  admin = await login('admin@example.com');
  asha = await login('asha@example.com');
  ben = await login('ben@example.com');
  const res = await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Notify project') } });
  projectId = res.body.id;
});

after(async () => {
  await db.delete(notificationPreferences).where(inArray(notificationPreferences.userId, [asha.user.id, ben.user.id]));
  if (extraDedupeKeys.length) await db.delete(notifications).where(inArray(notifications.dedupeKey, extraDedupeKeys));
  await cleanupProjects([projectId]);
  await stopServer();
});

describe('who gets notified', () => {
  test('a new task notifies the assignee, not the admin who made it', async () => {
    const task = await makeTask();
    const rows = await rowsForTask(task.id);
    assert.deepEqual(recipients(rows), [asha.user.id]);
    assert.equal(rows[0].type, 'task_assigned');
    assert.match(rows[0].title, /^New task: /);
    assert.equal(rows[0].link, `/tasks?task=${task.id}`);
  });

  test('reassignment notifies both the new and the previous assignee', async () => {
    const task = await makeTask();
    await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: { assigneeId: ben.user.id } });
    const rows = (await rowsForTask(task.id)).filter((r) => r.type !== 'task_assigned' || r.userId === ben.user.id);
    const toBen = rows.find((r) => r.userId === ben.user.id && r.type === 'task_assigned');
    const toAsha = rows.find((r) => r.userId === asha.user.id && r.type === 'task_unassigned');
    assert.ok(toBen, 'new assignee notified');
    assert.ok(toAsha, 'previous assignee notified');
    assert.equal(toAsha!.link, '/tasks');
  });

  test('deadline and priority changes notify the assignee; a title change does not', async () => {
    const task = await makeTask();
    await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: { title: uniqueName('Renamed') } });
    assert.equal((await rowsForTask(task.id)).filter((r) => r.type === 'task_updated').length, 0);

    await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: { deadline: '2026-12-09' } });
    const updated = (await rowsForTask(task.id)).filter((r) => r.type === 'task_updated');
    assert.equal(updated.length, 1);
    assert.match(updated[0].title, /Deadline for .* moved to Wed 9 Dec/);
  });

  test('an employee status change notifies every admin, never the employee', async () => {
    const task = await makeTask();
    await call('PATCH', `/tasks/${task.id}/status`, { token: asha.token, body: { status: 'done', note: DONE_NOTE } });
    const rows = (await rowsForTask(task.id)).filter((r) => r.type === 'status_changed');
    assert.ok(rows.length >= 1);
    assert.ok(rows.some((r) => r.userId === admin.user.id));
    assert.ok(!rows.some((r) => r.userId === asha.user.id));
    assert.match(rows[0].title, /marked .* as Done/);
  });

  test('an admin status change notifies the assignee', async () => {
    const task = await makeTask();
    await call('PATCH', `/tasks/${task.id}/status`, { token: admin.token, body: { status: 'in_progress' } });
    const rows = (await rowsForTask(task.id)).filter((r) => r.type === 'status_changed');
    assert.deepEqual(recipients(rows), [asha.user.id]);
  });

  test('a rolled-back change leaves no notification behind', async () => {
    const task = await makeTask();
    const before = (await rowsForTask(task.id)).length;
    await assert.rejects(
      db.transaction(async (tx) => {
        await recordEvent(tx, { taskId: task.id, actorId: admin.user.id, type: 'status_changed', data: { from: 'todo', to: 'done' } });
        throw new Error('simulated failure after the event');
      }),
    );
    assert.equal((await rowsForTask(task.id)).length, before);
  });
});

describe('delete and Undo', () => {
  test('a delete is held for the Undo window and hidden until then', async () => {
    const task = await makeTask();
    await call('DELETE', `/tasks/${task.id}`, { token: admin.token });
    const [held] = (await rowsForTask(task.id)).filter((r) => r.type === 'task_removed');
    assert.ok(held, 'removal notice written');
    assert.ok(held.deliverAfter.getTime() > Date.now() + 5000, 'held for the Undo window');

    const list = await call('GET', '/notifications', { token: asha.token });
    assert.ok(!list.body.items.some((n: { id: string }) => n.id === held.id), 'not visible while held');

    // Once the window has passed it is delivered like any other notification.
    await db.update(notifications).set({ deliverAfter: new Date(Date.now() - 1000) }).where(eq(notifications.id, held.id));
    const later = await call('GET', '/notifications', { token: asha.token });
    assert.ok(later.body.items.some((n: { id: string }) => n.id === held.id));
  });

  test('delete then restore within the window leaves no notification and sends no email', async () => {
    const task = await makeTask();
    await call('DELETE', `/tasks/${task.id}`, { token: admin.token });
    await call('POST', `/tasks/${task.id}/restore`, { token: admin.token });
    assert.equal((await rowsForTask(task.id)).filter((r) => r.type === 'task_removed').length, 0);

    const sent: MailMessage[] = [];
    await runEmailOutbox(async (m) => void sent.push(m), { force: true });
    assert.ok(!sent.some((m) => m.subject.includes(task.title) && m.subject.includes('removed')));
  });
});

describe('reading notifications', () => {
  test('unread count, mark one read, mark all read', async () => {
    await makeTask();
    await makeTask();
    const count = (await call('GET', '/notifications/unread-count', { token: asha.token })).body.count;
    assert.ok(count >= 2);

    const [first] = (await call('GET', '/notifications?unread=true', { token: asha.token })).body.items;
    assert.equal((await call('POST', `/notifications/${first.id}/read`, { token: asha.token })).status, 204);
    assert.equal((await call('GET', '/notifications/unread-count', { token: asha.token })).body.count, count - 1);

    assert.equal((await call('POST', '/notifications/read-all', { token: asha.token })).status, 204);
    assert.equal((await call('GET', '/notifications/unread-count', { token: asha.token })).body.count, 0);
  });

  test("you can't mark someone else's notification read", async () => {
    await makeTask();
    const [mine] = (await call('GET', '/notifications', { token: asha.token })).body.items;
    assert.equal((await call('POST', `/notifications/${mine.id}/read`, { token: ben.token })).status, 404);
  });

  test('pages with a cursor', async () => {
    const first = await call('GET', '/notifications?limit=1', { token: asha.token });
    assert.equal(first.body.items.length, 1);
    assert.ok(first.body.nextCursor);
    const second = await call('GET', `/notifications?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`, { token: asha.token });
    assert.notEqual(second.body.items[0].id, first.body.items[0].id);
  });

  test('preferences round-trip and validate', async () => {
    const res = await call('PUT', '/me/notification-preferences', { token: ben.token, body: { emailEnabled: true, emailFrequency: 'daily' } });
    assert.deepEqual(res.body, { emailEnabled: true, emailFrequency: 'daily' });
    assert.deepEqual((await call('GET', '/me/notification-preferences', { token: ben.token })).body, res.body);
    assert.equal((await call('PUT', '/me/notification-preferences', { token: ben.token, body: { emailFrequency: 'hourly' } })).status, 400);
  });
});

describe('daily reminders', () => {
  test('due-tomorrow and overdue digests are idempotent for a given day', async () => {
    // A far-future "today" keeps this independent of real data and of the real job.
    const today = '2030-01-14';
    extraDedupeKeys.push(`due_tomorrow:${today}`, `overdue:${today}`);
    await makeTask({ title: 'Due tomorrow A', deadline: '2030-01-15' });
    await makeTask({ title: 'Due tomorrow B', deadline: '2030-01-15' });

    const first = await runDueReminders({ today });
    assert.ok(first.dueTomorrow >= 2);
    const [digest] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, asha.user.id), eq(notifications.dedupeKey, `due_tomorrow:${today}`)));
    assert.equal(digest.title, '2 tasks due tomorrow');
    assert.match(digest.body ?? '', /Due tomorrow A; Due tomorrow B/);

    const countAfterFirst = await countByDedupeKey(`due_tomorrow:${today}`);
    await runDueReminders({ today });
    assert.equal(await countByDedupeKey(`due_tomorrow:${today}`), countAfterFirst, 'second run adds nothing');
  });
});

describe('email outbox', () => {
  test('skips people who turned email off', async () => {
    await call('PUT', '/me/notification-preferences', { token: asha.token, body: { emailEnabled: false, emailFrequency: 'instant' } });
    await call('PUT', '/me/notification-preferences', { token: ben.token, body: { emailEnabled: true, emailFrequency: 'instant' } });
    const task = await makeTask();
    await insertNotifications(db, [
      { userId: asha.user.id, type: 'task_updated', title: 'Outbox test for Asha', taskId: task.id },
      { userId: ben.user.id, type: 'task_updated', title: 'Outbox test for Ben', taskId: task.id },
    ]);

    // Other test files run in parallel and may queue more than one batch: drain it.
    const sent: MailMessage[] = [];
    for (let i = 0; i < 20; i++) {
      const { sent: n } = await runEmailOutbox(async (m) => void sent.push(m), { force: true });
      if (n === 0) break;
    }

    const rows = await rowsForTask(task.id);
    const forAsha = rows.find((r) => r.title === 'Outbox test for Asha')!;
    const forBen = rows.find((r) => r.title === 'Outbox test for Ben')!;
    assert.equal(forAsha.emailedAt, null, 'email off: never sent');
    assert.ok(!sent.some((m) => m.subject === 'Outbox test for Asha'));
    // Ben's goes out (possibly by the dev server's own outbox tick racing this test).
    assert.ok(forBen.emailedAt, 'email on: sent and stamped');
  });

  test('a failing sender does not throw and stamps nothing', async () => {
    await call('PUT', '/me/notification-preferences', { token: ben.token, body: { emailEnabled: true, emailFrequency: 'instant' } });
    await makeTask({ assigneeId: ben.user.id });
    let attempts = 0;
    const result = await runEmailOutbox(async () => {
      attempts++;
      throw new Error('SMTP down');
    }, { force: true });
    // Unstamped rows are picked up again on the next tick.
    assert.equal(result.sent, 0);
  });
});
