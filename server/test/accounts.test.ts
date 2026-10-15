// Sign-up, Google sign-in and the admin's People page.
// setup-env.ts opens sign-up to @signup.test and sets a Google client ID.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { googleVerifier, signupCodeMailer } from '../src/services/authService.js';
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

// Codes "emailed" during the tests, by address.
const codes = new Map<string, string>();
signupCodeMailer.send = async (to, _name, code) => {
  codes.set(to, code);
};

after(async () => {
  await db.execute(sql`delete from signup_codes where email like ${`%-${stamp}@%`}`);
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

describe('sign-up with an emailed code', () => {
  test('the account exists only after the right code, then signs in', async () => {
    const email = address('newbie');
    const res = await call('POST', '/auth/signup', { body: { name: 'New Person', email: email.toUpperCase(), password: 'longenough' } });
    assert.equal(res.status, 202, JSON.stringify(res.body));
    assert.equal(res.body.email, email);
    assert.equal((await call('POST', '/auth/login', { body: { email, password: 'longenough' } })).status, 401);

    const done = await call('POST', '/auth/signup/verify', { body: { email, code: codes.get(email) } });
    assert.equal(done.status, 201, JSON.stringify(done.body));
    assert.equal(done.body.user.role, 'employee');
    assert.equal((await call('POST', '/auth/login', { body: { email, password: 'longenough' } })).status, 200);
    // The code is used up.
    assert.equal((await call('POST', '/auth/signup/verify', { body: { email, code: codes.get(email) } })).status, 400);
  });

  test('wrong codes count down, then the code stops working', async () => {
    const email = address('guesser');
    await call('POST', '/auth/signup', { body: { name: 'Guesser', email, password: 'longenough' } });
    const right = codes.get(email)!;
    const wrong = right === '000000' ? '111111' : '000000';
    const first = await call('POST', '/auth/signup/verify', { body: { email, code: wrong } });
    assert.equal(first.status, 400);
    assert.match(first.body.error, /4 tries left/);
    for (let i = 0; i < 4; i++) await call('POST', '/auth/signup/verify', { body: { email, code: wrong } });
    const locked = await call('POST', '/auth/signup/verify', { body: { email, code: right } });
    assert.equal(locked.status, 400);
    assert.match(locked.body.error, /new one/);
  });

  test('a second code needs a minute; an existing account and another domain are refused', async () => {
    const email = address('again');
    assert.equal((await call('POST', '/auth/signup', { body: { name: 'A', email, password: 'longenough' } })).status, 202);
    assert.equal((await call('POST', '/auth/signup', { body: { name: 'A', email, password: 'longenough' } })).status, 429);
    assert.equal((await call('POST', '/auth/signup', { body: { name: 'B', email: 'asha@example.com', password: 'longenough' } })).status, 403);
    const outside = await call('POST', '/auth/signup', { body: { name: 'Outsider', email: address('x', 'gmail.com'), password: 'longenough' } });
    assert.equal(outside.status, 403);
    assert.match(outside.body.error, /@signup\.test/);
    assert.equal((await call('POST', '/auth/signup', { body: { name: 'C', email: address('short'), password: 'short' } })).status, 400);
    assert.equal((await call('POST', '/auth/signup/verify', { body: { email, code: '12ab' } })).status, 400);
  });

  test('an email that already has an account is 409', async () => {
    const email = address('taken');
    await call('POST', '/users', { token: admin.token, body: { name: 'Taken', email, role: 'employee', password: 'temporary1' } });
    assert.equal((await call('POST', '/auth/signup', { body: { name: 'Again', email, password: 'longenough' } })).status, 409);
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

describe('email check', () => {
  test('admin sees how mail goes out and a test to a reserved address is skipped, not faked', async () => {
    assert.equal((await call('GET', '/mail/status', { token: asha.token })).status, 403);
    const status = await call('GET', '/mail/status', { token: admin.token });
    assert.equal(status.status, 200);
    assert.ok(['brevo', 'smtp', 'off'].includes(status.body.transport));
    const res = await call('POST', '/mail/test', { token: admin.token, body: { to: 'someone@example.com' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.outcome, 'skipped');
    assert.equal((await call('POST', '/mail/test', { token: admin.token, body: { to: 'nope' } })).status, 400);
  });
});
