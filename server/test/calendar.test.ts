// The calendar's .ics export and days-off feed.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildCalendar, escapeText, foldLine } from '../src/lib/ical.js';
import { call, cleanupProjects, login, rawFetch, startServer, stopServer, uniqueName, type Session } from './helpers.js';

let admin: Session;
let asha: Session;
let ben: Session;
let projectId: string;

const ics = (token: string, query: string) => rawFetch(`/calendar/deadlines.ics?${query}`, { headers: { Authorization: `Bearer ${token}` } });

before(async () => {
  await startServer();
  admin = await login('admin@example.com');
  asha = await login('asha@example.com');
  ben = await login('ben@example.com');
  projectId = (await call('POST', '/projects', { token: admin.token, body: { name: uniqueName('Calendar project') } })).body.id;
  const add = (title: string, deadline: string, assigneeId = asha.user.id) =>
    call('POST', '/tasks', { token: admin.token, body: { title, description: 'x', projectId, assigneeId, priority: 'low', deadline } });
  await add('Pay suppliers; check VAT, too', '2030-03-10');
  await add('Quarter close', '2030-03-31', ben.user.id);
  await add('Outside the range', '2030-05-01');
  await call('POST', `/projects/${projectId}/holidays`, { token: admin.token, body: { date: '2030-03-11', name: 'Office closed' } });
});

after(async () => {
  await cleanupProjects([projectId]);
  await stopServer();
});

describe('ics helpers', () => {
  test('escapes text and folds long lines at 75 octets', () => {
    assert.equal(escapeText('a, b; c\\d\ne'), 'a\\, b\\; c\\\\d\\ne');
    const folded = foldLine(`SUMMARY:${'x'.repeat(200)}`);
    assert.ok(folded.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
    assert.equal(folded.replace(/\r\n /g, ''), `SUMMARY:${'x'.repeat(200)}`);
  });

  test('all-day entries end the next day', () => {
    const out = buildCalendar('Test', [{ uid: 'a@b', date: '2030-12-31', summary: 'S', description: 'D' }], new Date('2030-01-01T00:00:00Z'));
    assert.match(out, /DTSTART;VALUE=DATE:20301231\r\nDTEND;VALUE=DATE:20310101/);
    assert.match(out, /^BEGIN:VCALENDAR\r\n/);
    assert.match(out, /END:VCALENDAR\r\n$/);
  });
});

describe('deadlines.ics', () => {
  test('exports the range with filters, as an attachment anyone on the team can download', async () => {
    const res = await ics(ben.token, `from=2030-03-01&to=2030-03-31&projectId=${projectId}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/calendar/);
    assert.match(res.headers.get('content-disposition') ?? '', /deadlines-2030-03-01-to-2030-03-31\.ics/);
    const body = await res.text();
    assert.equal((body.match(/BEGIN:VEVENT/g) ?? []).length, 2);
    assert.match(body, /SUMMARY:Due: Pay suppliers\\; check VAT\\, too/);
    assert.ok(!body.includes('Outside the range'));
  });

  test('filters by person', async () => {
    const body = await (await ics(admin.token, `from=2030-03-01&to=2030-03-31&projectId=${projectId}&assigneeId=${ben.user.id}`)).text();
    assert.equal((body.match(/BEGIN:VEVENT/g) ?? []).length, 1);
    assert.match(body, /Quarter close/);
  });

  test('needs a login and a sensible range', async () => {
    assert.equal((await rawFetch('/calendar/deadlines.ics?from=2030-03-01&to=2030-03-31')).status, 401);
    assert.equal((await ics(asha.token, 'from=2030-04-01&to=2030-03-01')).status, 400);
    assert.equal((await ics(asha.token, 'from=2030-01-01&to=2032-01-01')).status, 400);
  });
});

describe('days off', () => {
  test('lists weekend settings and holidays for the calendar', async () => {
    const res = await call('GET', '/calendar/days-off', { token: asha.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.projects.some((p: { id: string; skipWeekends: boolean }) => p.id === projectId && p.skipWeekends === true));
    assert.ok(res.body.holidays.some((h: { projectId: string; date: string }) => h.projectId === projectId && h.date === '2030-03-11'));
  });
});
