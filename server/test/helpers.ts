// Shared setup for the API tests: a running app on a random port, logins and
// a fixture project whose tasks are hard-deleted again at the end.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { db, pool } from '../src/db/index.js';
import { authProvider, type AuthClaims } from '../src/lib/supabaseAuth.js';

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

// Supabase Auth stands in for tests: a token is "test." plus the claims, base64url-encoded,
// and anything else is refused. Real tokens are checked against Supabase's keys.
export function tokenFor(claims: Partial<AuthClaims> & { authId: string }) {
  const full: AuthClaims = { email: `${claims.authId}@signup.test`, aal: 'aal2', name: null, ...claims };
  return `test.${Buffer.from(JSON.stringify(full)).toString('base64url')}`;
}
authProvider.verifyAccessToken = async (token) => {
  if (!token.startsWith('test.')) return null;
  try {
    return JSON.parse(Buffer.from(token.slice(5), 'base64url').toString()) as AuthClaims;
  } catch {
    return null;
  }
};

/** Signs in as a seeded person: links them to a stand-in login (their own id) and returns a 2FA'd token. */
export async function login(email: string): Promise<Session> {
  const [user] = (await db.execute(sql`update users set auth_id = coalesce(auth_id, id) where email = ${email} returning id, name, role, auth_id, email`)).rows as {
    id: string;
    name: string;
    role: string;
    auth_id: string;
    email: string;
  }[];
  assert.ok(user, `no seeded user ${email}`);
  return { token: tokenFor({ authId: user.auth_id, email: user.email }), user: { id: user.id, name: user.name, role: user.role } };
}

export const uniqueName = (prefix: string) => `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Hard-deletes everything that belongs to the given test projects. */
export async function cleanupProjects(projectIds: string[]) {
  if (projectIds.length === 0) return;
  const ids = sql.join(projectIds.map((id) => sql`${id}::uuid`), sql`, `);
  const taskIds = sql`(select id from tasks where project_id in (${ids}))`;
  // Tables added by later milestones are cleaned only if they exist.
  // Comment children first: mentions and revisions point at comments.
  const commentIds = sql`(select id from task_comments where task_id in ${taskIds})`;
  for (const table of ['comment_mentions', 'task_comment_revisions']) {
    const [{ exists }] = (await db.execute(sql`select to_regclass(${table}) is not null as exists`)).rows as { exists: boolean }[];
    if (exists) await db.execute(sql`delete from ${sql.identifier(table)} where comment_id in ${commentIds}`);
  }
  for (const table of ['notifications', 'task_handoffs', 'attachments', 'task_notes', 'task_comments', 'task_checklist_items']) {
    const [{ exists }] = (await db.execute(sql`select to_regclass(${table}) is not null as exists`)).rows as { exists: boolean }[];
    if (exists) await db.execute(sql`delete from ${sql.identifier(table)} where task_id in ${taskIds}`);
  }
  await db.execute(sql`delete from task_events where task_id in ${taskIds}`);
  await db.execute(sql`delete from tasks where project_id in (${ids})`);
  const [{ exists: hasHolidays }] = (await db.execute(sql`select to_regclass('project_holidays') is not null as exists`)).rows as { exists: boolean }[];
  if (hasHolidays) await db.execute(sql`delete from project_holidays where project_id in (${ids})`);
  await db.execute(sql`delete from projects where id in (${ids})`);
}
