// Shared setup for the API tests: a running app on a random port, logins and
// a fixture project whose tasks are hard-deleted again at the end.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, pool } from '../src/db/index.js';

export interface Session {
  token: string;
  user: { id: string; name: string; role: string };
}

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '';

export async function startServer() {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
}

export async function stopServer() {
  server.close();
  await pool.end();
}

export async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

export async function rawFetch(path: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, init);
}

export async function login(email: string): Promise<Session> {
  const res = await call('POST', '/auth/login', { body: { email, password: 'password123' } });
  assert.equal(res.status, 200, `login failed for ${email}`);
  return res.body;
}

export const uniqueName = (prefix: string) => `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Hard-deletes everything that belongs to the given test projects. */
export async function cleanupProjects(projectIds: string[]) {
  if (projectIds.length === 0) return;
  const ids = sql.join(projectIds.map((id) => sql`${id}::uuid`), sql`, `);
  const taskIds = sql`(select id from tasks where project_id in (${ids}))`;
  // Tables added by later milestones are cleaned only if they exist.
  for (const table of ['notifications', 'attachments']) {
    const [{ exists }] = (await db.execute(sql`select to_regclass(${table}) is not null as exists`)).rows as { exists: boolean }[];
    if (exists) await db.execute(sql`delete from ${sql.identifier(table)} where task_id in ${taskIds}`);
  }
  await db.execute(sql`delete from task_events where task_id in ${taskIds}`);
  await db.execute(sql`delete from tasks where project_id in (${ids})`);
  await db.execute(sql`delete from projects where id in (${ids})`);
}
