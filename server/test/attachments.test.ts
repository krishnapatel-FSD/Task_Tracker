// Uploads, type checks, limits, authenticated downloads and access after reassignment.
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { env } from '../src/lib/env.js';
import { call, cleanupProjects, login, rawFetch, startServer, stopServer, uniqueName, type Session } from './helpers.js';

let admin: Session;
let asha: Session;
let ben: Session;
let projectId: string;
const taskIds: string[] = [];

// Smallest real files of each kind.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(0x3c - 2), Buffer.from([0x80, 0, 0, 0]), Buffer.alloc(0x40), Buffer.from('PE\0\0')]);

async function makeTask(assigneeId = asha.user.id) {
  const res = await call('POST', '/tasks', {
    token: admin.token,
    body: { title: uniqueName('Files task'), description: 'Attachment tests', assigneeId, projectId, priority: 'low', deadline: '2026-12-01' },
  });
  assert.equal(res.status, 201);
  taskIds.push(res.body.id);
  return res.body as { id: string };
}

async function upload(token: string, taskId: string, name: string, data: Buffer, type = 'application/octet-stream') {
  const form = new FormData();
  form.append('file', new Blob([data], { type }), name);
  const res = await rawFetch(`/tasks/${taskId}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  await startServer();
  admin = await login('admin@example.com');
  asha = await login('asha@example.com');
  ben = await login('ben@example.com');
  projectId = (await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Files project') } })).body.id;
});

after(async () => {
  await cleanupProjects([projectId]);
  await Promise.all(taskIds.map((id) => rm(path.join(env.UPLOAD_DIR, id), { recursive: true, force: true })));
  await stopServer();
});

describe('upload', () => {
  test('employee uploads to their own task (201) and it appears in the list, count and timeline', async () => {
    const task = await makeTask();
    const res = await upload(asha.token, task.id, 'report.pdf', PDF);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.fileName, 'report.pdf');
    assert.equal(res.body.mimeType, 'application/pdf');
    assert.equal(res.body.uploader.id, asha.user.id);

    const list = await call('GET', `/tasks/${task.id}/attachments`, { token: admin.token });
    assert.deepEqual(list.body.map((a: { id: string }) => a.id), [res.body.id]);

    const tasks = await call('GET', `/tasks?projectId=${projectId}`, { token: admin.token });
    assert.equal(tasks.body.find((t: { id: string }) => t.id === task.id).attachmentCount, 1);

    const events = await call('GET', `/tasks/${task.id}/events`, { token: admin.token });
    assert.equal(events.body.events[0].type, 'attachment_added');
    assert.equal(events.body.events[0].data.fileName, 'report.pdf');
  });

  test("uploading to someone else's task is 403", async () => {
    const task = await makeTask(ben.user.id);
    assert.equal((await upload(asha.token, task.id, 'x.pdf', PDF)).status, 403);
  });

  test('an oversized file is 413 with a clear message', async () => {
    const task = await makeTask();
    const big = Buffer.concat([PDF, Buffer.alloc(env.MAX_UPLOAD_MB * 1024 * 1024 + 1)]);
    const res = await upload(asha.token, task.id, 'huge.pdf', big);
    assert.equal(res.status, 413);
    assert.match(res.body.error, /up to \d+ MB/);
  });

  test('an .exe renamed to .pdf is rejected (400), whatever MIME type the browser claims', async () => {
    const task = await makeTask();
    const res = await upload(asha.token, task.id, 'invoice.pdf', EXE, 'application/pdf');
    assert.equal(res.status, 400);
    assert.match(res.body.error, /contents don't match/);
  });

  test('disallowed extensions and binary "text" files are rejected', async () => {
    const task = await makeTask();
    assert.equal((await upload(asha.token, task.id, 'page.html', Buffer.from('<script>alert(1)</script>'))).status, 400);
    assert.equal((await upload(asha.token, task.id, 'notes.txt', PNG)).status, 400);
    assert.equal((await upload(asha.token, task.id, 'notes.txt', Buffer.from('Plain notes\n'))).status, 201);
    assert.equal((await upload(asha.token, task.id, 'photo.png', PNG)).status, 201);
  });

  test('display names are sanitised', async () => {
    const task = await makeTask();
    const res = await upload(admin.token, task.id, '../../etc/<evil>.pdf', PDF);
    assert.equal(res.status, 201);
    assert.equal(res.body.fileName, 'evil.pdf');
  });

  test('a task holds at most 10 files', async () => {
    const task = await makeTask();
    for (let i = 0; i < 10; i++) {
      assert.equal((await upload(admin.token, task.id, `f${i}.txt`, Buffer.from(`file ${i}\n`))).status, 201);
    }
    const res = await upload(admin.token, task.id, 'one-too-many.txt', Buffer.from('x\n'));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /up to 10 files/);
  });
});

describe('download', () => {
  test('returns the bytes with attachment headers', async () => {
    const task = await makeTask();
    const { body } = await upload(asha.token, task.id, 'report final.pdf', PDF);
    const res = await rawFetch(`/attachments/${body.id}/download`, { headers: { Authorization: `Bearer ${admin.token}` } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-disposition') ?? '', /^attachment; filename\*=UTF-8''report%20final\.pdf$/);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PDF);
  });

  test('needs a login and task access', async () => {
    const task = await makeTask();
    const { body } = await upload(admin.token, task.id, 'brief.pdf', PDF);
    assert.equal((await rawFetch(`/attachments/${body.id}/download`)).status, 401);
    const asBen = await rawFetch(`/attachments/${body.id}/download`, { headers: { Authorization: `Bearer ${ben.token}` } });
    assert.equal(asBen.status, 404);
  });

  test('an employee reassigned away can no longer list or download', async () => {
    const task = await makeTask();
    const { body } = await upload(asha.token, task.id, 'mine.pdf', PDF);
    await call('PATCH', `/tasks/${task.id}`, { token: admin.token, body: { assigneeId: ben.user.id } });

    const res = await rawFetch(`/attachments/${body.id}/download`, { headers: { Authorization: `Bearer ${asha.token}` } });
    assert.equal(res.status, 404);
    assert.equal((await call('GET', `/tasks/${task.id}/attachments`, { token: asha.token })).status, 404);
    const asNewAssignee = await rawFetch(`/attachments/${body.id}/download`, { headers: { Authorization: `Bearer ${ben.token}` } });
    assert.equal(asNewAssignee.status, 200);
  });
});

describe('remove', () => {
  test("the assignee can't remove the admin's file, but can remove their own", async () => {
    const task = await makeTask();
    const adminFile = (await upload(admin.token, task.id, 'spec.pdf', PDF)).body;
    const ownFile = (await upload(asha.token, task.id, 'draft.pdf', PDF)).body;

    assert.equal((await call('DELETE', `/attachments/${adminFile.id}`, { token: asha.token })).status, 403);
    assert.equal((await call('DELETE', `/attachments/${ownFile.id}`, { token: asha.token })).status, 204);

    const list = await call('GET', `/tasks/${task.id}/attachments`, { token: asha.token });
    assert.deepEqual(list.body.map((a: { id: string }) => a.id), [adminFile.id]);
    const gone = await rawFetch(`/attachments/${ownFile.id}/download`, { headers: { Authorization: `Bearer ${admin.token}` } });
    assert.equal(gone.status, 404);

    const events = await call('GET', `/tasks/${task.id}/events`, { token: admin.token });
    assert.equal(events.body.events[0].type, 'attachment_removed');
  });

  test('admins can remove any file', async () => {
    const task = await makeTask();
    const file = (await upload(asha.token, task.id, 'any.pdf', PDF)).body;
    assert.equal((await call('DELETE', `/attachments/${file.id}`, { token: admin.token })).status, 204);
  });
});
