import { env } from './env.js';

// Calendar-day helpers. Deadlines are plain YYYY-MM-DD dates; "today" is taken in REPORT_TZ.

/** Today's date in the given time zone, as YYYY-MM-DD. */
export function todayIn(timeZone = env.REPORT_TZ, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** "Fri 17 Oct" */
export function formatDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "6 to 12 Oct" or "29 Sep to 5 Oct" */
export function formatRange(fromIso: string, toIso: string) {
  const opts = { day: 'numeric', month: 'short', timeZone: 'UTC' } as const;
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  const sameMonth = from.getUTCMonth() === to.getUTCMonth();
  const fromText = sameMonth ? String(from.getUTCDate()) : from.toLocaleDateString('en-GB', opts);
  return `${fromText} to ${to.toLocaleDateString('en-GB', opts)}`;
}

/** Monday of the week containing the given date. */
export function weekStartOf(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const weekday = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(iso, -weekday);
}
