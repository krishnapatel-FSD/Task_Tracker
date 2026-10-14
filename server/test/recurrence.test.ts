// Pure date maths for repeat schedules: no database.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { deadlinesBetween, describeRule, nextDeadlines, ruleHits, type RepeatRule, type WorkCalendar } from '../src/lib/recurrence.js';

const rule = (r: Partial<RepeatRule>): RepeatRule => ({
  repeat: 'daily',
  weekdays: [],
  monthDay: null,
  intervalDays: null,
  startDate: '2026-01-01',
  endDate: null,
  ...r,
});
const weekdaysOnly: WorkCalendar = { skipWeekends: true, holidays: new Set() };
const everyDay: WorkCalendar = { skipWeekends: false, holidays: new Set() };

describe('repeat rules', () => {
  test('daily skips weekends and holidays rather than moving them', () => {
    // Fri 2 Oct 2026 to Tue 6 Oct 2026; Mon 5 Oct is a holiday
    const cal: WorkCalendar = { skipWeekends: true, holidays: new Set(['2026-10-05']) };
    assert.deepEqual(deadlinesBetween(rule({ repeat: 'daily' }), cal, '2026-10-02', '2026-10-06'), ['2026-10-02', '2026-10-06']);
  });

  test('daily keeps weekends when the project works them', () => {
    assert.equal(deadlinesBetween(rule({ repeat: 'daily' }), everyDay, '2026-10-02', '2026-10-06').length, 5);
  });

  test('weekly on chosen days', () => {
    // Mondays and Thursdays in the week of 5 Oct 2026
    assert.deepEqual(deadlinesBetween(rule({ repeat: 'weekly', weekdays: [1, 4] }), weekdaysOnly, '2026-10-05', '2026-10-11'), ['2026-10-05', '2026-10-08']);
  });

  test('a weekend or holiday hit moves to the next working day', () => {
    // Saturdays move to Monday; Mon 12 Oct is a holiday so that one goes to Tuesday
    const cal: WorkCalendar = { skipWeekends: true, holidays: new Set(['2026-10-12']) };
    assert.deepEqual(deadlinesBetween(rule({ repeat: 'weekly', weekdays: [6] }), cal, '2026-10-01', '2026-10-16'), ['2026-10-05', '2026-10-13']);
  });

  test('monthly on the 31st uses the last day of shorter months, then shifts off weekends', () => {
    const r = rule({ repeat: 'monthly', monthDay: 31 });
    assert.equal(ruleHits(r, '2026-04-30'), true);
    assert.equal(ruleHits(r, '2026-04-29'), false);
    // 28 Feb 2027 is a Sunday: due Monday 1 March
    assert.deepEqual(deadlinesBetween(r, weekdaysOnly, '2027-02-01', '2027-02-28'), ['2027-03-01']);
    // leap year: 29 Feb 2028 (a Tuesday)
    assert.deepEqual(deadlinesBetween(r, weekdaysOnly, '2028-02-01', '2028-02-29'), ['2028-02-29']);
  });

  test('every N days counts from the start date', () => {
    const r = rule({ repeat: 'interval', intervalDays: 10, startDate: '2026-10-01' });
    assert.deepEqual(deadlinesBetween(r, everyDay, '2026-10-01', '2026-10-31'), ['2026-10-01', '2026-10-11', '2026-10-21', '2026-10-31']);
  });

  test('start and end dates bound the schedule', () => {
    const r = rule({ repeat: 'daily', startDate: '2026-10-07', endDate: '2026-10-08' });
    assert.deepEqual(deadlinesBetween(r, everyDay, '2026-10-01', '2026-10-31'), ['2026-10-07', '2026-10-08']);
  });

  test('two hits that land on the same working day become one deadline', () => {
    // Saturday and Sunday both move to Monday
    assert.deepEqual(deadlinesBetween(rule({ repeat: 'weekly', weekdays: [6, 0] }), weekdaysOnly, '2026-10-03', '2026-10-04'), ['2026-10-05']);
  });

  test('next deadlines and plain-words description', () => {
    assert.deepEqual(nextDeadlines(rule({ repeat: 'monthly', monthDay: 1 }), weekdaysOnly, '2026-10-14', 3), ['2026-11-02', '2026-12-01', '2027-01-01']);
    assert.equal(describeRule(rule({ repeat: 'weekly', weekdays: [4, 1] })), 'Every Monday and Thursday');
    assert.equal(describeRule(rule({ repeat: 'monthly', monthDay: 22 })), 'Every month on the 22nd');
    assert.equal(describeRule(rule({ repeat: 'daily' })), 'Every working day');
  });
});
