import type { Task } from './types';

// Deadlines are plain dates (YYYY-MM-DD). All maths here happens on local calendar
// days so nothing shifts across time zones.

const DAY_MS = 86_400_000;

function toDayNumber(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days from today until the deadline (negative = in the past). */
export function daysUntil(deadline: string, today = todayIso()) {
  return toDayNumber(deadline) - toDayNumber(today);
}

function asLocalDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDue(deadline: string) {
  const date = asLocalDate(deadline);
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
    day: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
  };
}

export function formatToday(today = todayIso()) {
  return asLocalDate(today).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function isLate(task: Task, today = todayIso()) {
  return task.status !== 'done' && daysUntil(task.deadline, today) < 0;
}

/** Short relative label shown under the date. */
export function relativeDue(task: Task, today = todayIso()) {
  const days = daysUntil(task.deadline, today);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `In ${days} days`;
  if (task.status === 'done') return days === -1 ? 'Yesterday' : `${-days} days ago`;
  return days === -1 ? '1 day late' : `${-days} days late`;
}

export type GroupKey = 'past' | 'today' | 'thisWeek' | 'nextWeek' | 'later';

export const GROUP_LABELS: Record<GroupKey, string> = {
  past: 'Past due date',
  today: 'Due today',
  thisWeek: 'This week',
  nextWeek: 'Next week',
  later: 'Later',
};

const GROUP_ORDER: GroupKey[] = ['past', 'today', 'thisWeek', 'nextWeek', 'later'];

function groupFor(deadline: string, today: string): GroupKey {
  const days = daysUntil(deadline, today);
  if (days < 0) return 'past';
  if (days === 0) return 'today';
  // Weeks run Monday to Sunday.
  const weekday = (asLocalDate(today).getDay() + 6) % 7; // 0 = Monday
  const daysLeftThisWeek = 6 - weekday;
  if (days <= daysLeftThisWeek) return 'thisWeek';
  if (days <= daysLeftThisWeek + 7) return 'nextWeek';
  return 'later';
}

/** Splits an already deadline-sorted list into timetable groups, keeping order. */
export function groupTasks(tasks: Task[], today = todayIso()) {
  const buckets = new Map<GroupKey, Task[]>();
  for (const task of tasks) {
    const key = groupFor(task.deadline, today);
    buckets.set(key, [...(buckets.get(key) ?? []), task]);
  }
  return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({ key, tasks: buckets.get(key)! }));
}

// Each employee gets a fixed "line colour", like a route on a transit map.
const LINE_COLOURS = 8;

export function lineIndexFor(employeeId: string, employeeIds: string[]) {
  const index = employeeIds.indexOf(employeeId);
  return (index === -1 ? 0 : index) % LINE_COLOURS;
}
