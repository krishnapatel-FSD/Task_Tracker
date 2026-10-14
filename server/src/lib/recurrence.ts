import { addDays, daysBetween } from './dates.js';

// Pure date maths for repeat schedules. Dates are YYYY-MM-DD calendar days.

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'interval';

export interface RepeatRule {
  repeat: Repeat;
  /** 0 = Sunday ... 6 = Saturday */
  weekdays: number[];
  monthDay: number | null;
  intervalDays: number | null;
  startDate: string;
  endDate: string | null;
}

export interface WorkCalendar {
  skipWeekends: boolean;
  holidays: Set<string>;
}

export function weekday(iso: string) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function daysInMonth(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isWorkingDay(iso: string, cal: WorkCalendar) {
  const wd = weekday(iso);
  if (cal.skipWeekends && (wd === 0 || wd === 6)) return false;
  return !cal.holidays.has(iso);
}

/** The day itself when it is a working day, otherwise the next one. */
export function nextWorkingDay(iso: string, cal: WorkCalendar) {
  let d = iso;
  for (let i = 0; i < 400 && !isWorkingDay(d, cal); i++) d = addDays(d, 1);
  return d;
}

/** Whether the rule lands on this calendar day (before any weekend or holiday shift). */
export function ruleHits(rule: RepeatRule, iso: string) {
  if (iso < rule.startDate || (rule.endDate && iso > rule.endDate)) return false;
  switch (rule.repeat) {
    case 'daily':
      return true;
    case 'weekly':
      return rule.weekdays.includes(weekday(iso));
    case 'monthly': {
      const day = Number(iso.slice(8, 10));
      return day === Math.min(rule.monthDay ?? 1, daysInMonth(iso));
    }
    case 'interval':
      return (rule.intervalDays ?? 0) > 0 && daysBetween(rule.startDate, iso) % rule.intervalDays! === 0;
    default:
      return false;
  }
}

/**
 * The deadlines a rule produces for days from `from` to `to` (inclusive), in order.
 * Daily schedules simply skip days off; the others move to the next working day.
 * Two hits that move onto the same working day become one deadline.
 */
export function deadlinesBetween(rule: RepeatRule, cal: WorkCalendar, from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!ruleHits(rule, d)) continue;
    let deadline: string;
    if (rule.repeat === 'daily') {
      if (!isWorkingDay(d, cal)) continue;
      deadline = d;
    } else {
      deadline = nextWorkingDay(d, cal);
    }
    if (out[out.length - 1] !== deadline) out.push(deadline);
  }
  return out;
}

/** The next `count` deadlines on or after `from`, looking at most a little over a year ahead. */
export function nextDeadlines(rule: RepeatRule, cal: WorkCalendar, from: string, count: number) {
  const out: string[] = [];
  for (let start = from; out.length < count && daysBetween(from, start) < 400; start = addDays(start, 31)) {
    for (const d of deadlinesBetween(rule, cal, start, addDays(start, 30))) {
      if (!out.includes(d)) out.push(d);
    }
  }
  return out.slice(0, count);
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "Every Monday and Thursday", "Every month on the 1st", ... for screens and emails. */
export function describeRule(rule: RepeatRule) {
  switch (rule.repeat) {
    case 'daily':
      return 'Every working day';
    case 'weekly': {
      const names = [...rule.weekdays].sort().map((d) => DAY_NAMES[d]);
      if (names.length === 0) return 'Weekly';
      return `Every ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}`;
    }
    case 'monthly':
      return `Every month on the ${ordinal(rule.monthDay ?? 1)}`;
    case 'interval':
      return `Every ${rule.intervalDays} days`;
    default:
      return 'Does not repeat';
  }
}
