// Sign-up, Google sign-in and the admin's People page.
// setup-env.ts opens sign-up to @signup.test and sets a Google client ID.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { googleVerifier } from '../src/services/authService.js';
import { call, login, startServer, stopServer, type Session } from './helpers.js';

let admin: Session;
let asha: Session;
const stamp = Date.now();
const address = (name: string, domain = 'signup.test') => `${name}-${stamp}@${domain}`;

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
  test('lists the sign-up domains and the Google client id', async () => {
    const res = await call('GET', '/auth/options');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { signupDomains: ['signup.test'], googleClientId: 'test-client.apps.googleusercontent.com' });
  });
});

describe('sign-up', () => {
  test('a company email gets an employee account and can sign in', async () => {
    const email = address('newbie');
    const res = await call('POST', '/auth/signup', { body: { name: 'New Person', email: email.toUpperCase(), password: 'longenough' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.user.role, 'employee');
    assert.ok(res.body.token);
    const again = await call('POST', '/auth/login', { body: { email, password: 'longenough' } });
    assert.equal(again.status, 200);
  });

  test('another domain is refused with a reason', async () => {
    const res = await call('POST', '/auth/signup', { body: { name: 'Outsider', email: address('x', 'gmail.com'), password: 'longenough' } });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /@signup\.test/);
  });

  test('a taken email is 409 and a short password is 400', async () => {
    const email = address('twice');
    assert.equal((await call('POST', '/auth/signup', { body: { name: 'A', email, password: 'longenough' } })).status, 201);
    assert.equal((await call('POST', '/auth/signup', { body: { name: 'B', email, password: 'longenough' } })).status, 409);
    assert.equal((await call('POST', '/auth/signup', { body: { name: 'C', email: address('short'), password: 'short' } })).status, 400);
  });
});

describe('Google sign-in', () => {
  const realVerify = googleVerifier.verify;
  after(() => {
    googleVerifier.verify = realVerify;
  });
  const as = (payload: Record<string, unknown> | null) => {
    googleVerifier.verify = async () => payload as never;
  };

  test('an existing account signs in, whatever its domain', async () => {
    as({ email: 'Asha@example.com', email_verified: true, name: 'Asha' });
    const res = await call('POST', '/auth/google', { body: { credential: 'x'.repeat(40) } });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, asha.user.id);
  });

  test('a new company email gets an employee account named from Google', async () => {
    as({ email: address('googler'), email_verified: true, name: 'Goo Gler' });
    const res = await call('POST', '/auth/google', { body: { credential: 'x'.repeat(40) } });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, 'Goo Gler');
    assert.equal(res.body.user.role, 'employee');
  });

  test('a new outside email and an unverified email are refused', async () => {
    as({ email: address('out', 'gmail.com'), email_verified: true });
    assert.equal((await call('POST', '/auth/google', { body: { credential: 'x'.repeat(40) } })).status, 403);
    as({ email: address('unverified'), email_verified: false });
    assert.equal((await call('POST', '/auth/google', { body: { credential: 'x'.repeat(40) } })).status, 401);
  });

  test('a bad token is 401', async () => {
    googleVerifier.verify = async () => {
      throw new Error('bad signature');
    };
    assert.equal((await call('POST', '/auth/google', { body: { credential: 'x'.repeat(40) } })).status, 401);
  });
});

describe('People page', () => {
  test('only the admin lists accounts, with emails', async () => {
    assert.equal((await call('GET', '/users/accounts', { token: asha.token })).status, 403);
    const res = await call('GET', '/users/accounts', { token: admin.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.some((a: { email: string }) => a.email === 'asha@example.com'));
  });

  test('the admin adds a person who can then sign in', async () => {
    const email = address('added');
    const res = await call('POST', '/users', { token: admin.token, body: { name: 'Added', email, role: 'employee', password: 'temporary1' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.openTasks, 0);
    assert.equal((await call('POST', '/auth/login', { body: { email, password: 'temporary1' } })).status, 200);
    assert.equal((await call('POST', '/users', { token: asha.token, body: { name: 'X', email: address('nope'), role: 'admin', password: 'temporary1' } })).status, 403);
  });

  test('the admin changes role and password, but not their own role', async () => {
    const email = address('promote');
    const { body: person } = await call('POST', '/users', { token: admin.token, body: { name: 'Promote', email, role: 'employee', password: 'temporary1' } });
    const res = await call('PATCH', `/users/${person.id}`, { token: admin.token, body: { role: 'admin', password: 'brandnew99' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'admin');
    assert.equal((await call('POST', '/auth/login', { body: { email, password: 'brandnew99' } })).status, 200);
    assert.equal((await call('PATCH', `/users/${admin.user.id}`, { token: admin.token, body: { role: 'employee' } })).status, 400);
    assert.equal((await call('PATCH', `/users/${person.id}`, { token: admin.token, body: { role: 'employee' } })).status, 200);
  });
});
