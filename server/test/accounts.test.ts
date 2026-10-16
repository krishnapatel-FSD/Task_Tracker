// Accounts with Supabase Auth: first sign-in makes or links the app account, and the admin's
// People page manages logins through the Supabase admin API (stood in for here).
// setup-env.ts opens sign-up to @signup.test.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { authProvider } from '../src/lib/supabaseAuth.js';
import { call, login, startServer, stopServer, tokenFor, type Session } from './helpers.js';

let admin: Session;
let asha: Session;
const stamp = Date.now();
const address = (name: string, domain = 'signup.test') => `${name}-${stamp}@${domain}`;

// The Supabase admin API, recorded instead of called.
const logins = new Map<string, { email: string; password?: string; factors: number }>();
authProvider.createUser = async ({ email, password }) => {
  if ([...logins.values()].some((l) => l.email === email)) throw Object.assign(new Error('already registered'), { status: 422 });
  const id = randomUUID();
  logins.set(id, { email, password, factors: 1 });
  return { id, email };
};
authProvider.setPassword = async (authId, password) => {
  logins.get(authId)!.password = password;
};
authProvider.resetTwoFactor = async (authId) => {
  const login = logins.get(authId)!;
  const removed = login.factors;
  login.factors = 0;
  return removed;
};

before(async () => {
  await startServer();
  admin = await login('admin@example.com');
  asha = await login('asha@example.com');
});

after(async () => {
  await db.execute(sql`delete from notification_preferences where user_id in (select id from users where email like ${`%-${stamp}@%`})`);
  await db.execute(sql`delete from users where email like ${`%-${stamp}@%`}`);
  await stopServer();
});

describe('sign-in options', () => {
  test('lists the sign-up domains', async () => {
    const res = await call('GET', '/auth/options');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { signupDomains: ['signup.test'] });
  });
});

describe('first sign-in', () => {
  test('a confirmed company login gets an employee account named from sign-up, once', async () => {
    const token = tokenFor({ authId: randomUUID(), email: address('newbie'), name: 'New Person' });
    const first = await call('GET', '/auth/me', { token });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.name, 'New Person');
    assert.equal(first.body.role, 'employee');
    const again = await call('GET', '/auth/me', { token });
    assert.equal(again.body.id, first.body.id);
    assert.equal((await call('GET', '/tasks', { token })).status, 200);
  });

  test('an existing account is linked by email, keeping its role', async () => {
    const email = address('moved');
    const [{ id }] = (await db.execute(sql`insert into users (name, email, role) values ('Moved Admin', ${email}, 'admin') returning id`)).rows as { id: string }[];
    const res = await call('GET', '/auth/me', { token: tokenFor({ authId: randomUUID(), email }) });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, id);
    assert.equal(res.body.role, 'admin');
  });

  test('another domain gets no account, and 2FA is required first', async () => {
    assert.equal((await call('GET', '/auth/me', { token: tokenFor({ authId: randomUUID(), email: address('x', 'gmail.com') }) })).status, 403);
    const res = await call('GET', '/auth/me', { token: tokenFor({ authId: randomUUID(), email: address('half'), aal: 'aal1' }) });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /authenticator/);
    assert.equal((await call('GET', '/auth/me', { token: 'garbage' })).status, 401);
  });
});

describe('People page', () => {
  test('only the admin lists accounts, with emails', async () => {
    assert.equal((await call('GET', '/users/accounts', { token: asha.token })).status, 403);
    const res = await call('GET', '/users/accounts', { token: admin.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.some((a: { email: string }) => a.email === 'asha@example.com'));
  });

  test('the admin adds a person: a confirmed login with a starting password', async () => {
    const email = address('added');
    const res = await call('POST', '/users', { token: admin.token, body: { name: 'Added', email, role: 'employee', password: 'temporary1' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.openTasks, 0);
    assert.equal(res.body.authId, undefined);
    assert.ok([...logins.values()].some((l) => l.email === email && l.password === 'temporary1'));
    assert.equal((await call('POST', '/users', { token: admin.token, body: { name: 'Again', email, role: 'employee', password: 'temporary1' } })).status, 409);
    assert.equal((await call('POST', '/users', { token: asha.token, body: { name: 'X', email: address('nope'), role: 'admin', password: 'temporary1' } })).status, 403);
  });

  test('the admin changes role, password and 2FA, but not their own role', async () => {
    const email = address('promote');
    const { body: person } = await call('POST', '/users', { token: admin.token, body: { name: 'Promote', email, role: 'employee', password: 'temporary1' } });
    const res = await call('PATCH', `/users/${person.id}`, { token: admin.token, body: { role: 'admin', password: 'brandnew99' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'admin');
    assert.ok([...logins.values()].some((l) => l.email === email && l.password === 'brandnew99'));

    const reset = await call('POST', `/users/${person.id}/reset-2fa`, { token: admin.token });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.removed, 1);
    assert.equal((await call('POST', `/users/${person.id}/reset-2fa`, { token: asha.token })).status, 403);

    assert.equal((await call('PATCH', `/users/${admin.user.id}`, { token: admin.token, body: { role: 'employee' } })).status, 400);
    assert.equal((await call('PATCH', `/users/${person.id}`, { token: admin.token, body: { role: 'employee' } })).status, 200);
  });
});
