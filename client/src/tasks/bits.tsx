import { ArrowCounterClockwise, CheckCircle, Circle, CircleHalf, Flag, Play, WarningCircle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { daysUntil, isLate, todayIso } from '../timetable';
import { PRIORITY_LABELS, STATUS_LABELS, type Priority, type Status, type Task } from '../types';

/** What a task's "state" is from the reader's point of view: status, or overdue on top of it. */
export type TaskState = Status | 'overdue';

export function taskState(task: Task, today = todayIso()): TaskState {
  return isLate(task, today) ? 'overdue' : task.status;
}

const STATE_ICON: Record<TaskState, ReactNode> = {
  todo: <Circle size={14} weight="bold" aria-hidden="true" />,
  in_progress: <CircleHalf size={14} weight="fill" aria-hidden="true" />,
  done: <CheckCircle size={14} weight="fill" aria-hidden="true" />,
  overdue: <WarningCircle size={14} weight="fill" aria-hidden="true" />,
};

export const STATE_LABELS: Record<TaskState, string> = { ...STATUS_LABELS, overdue: 'Late' };

/** Coloured status label with an icon, so colour is never the only signal. */
export function StatusBadge({ task, size = 'md' }: { task: Task; size?: 'md' | 'lg' }) {
  const state = taskState(task);
  return (
    <span className={`status-badge state-${state} size-${size}`}>
      {STATE_ICON[state]}
      {STATE_LABELS[state]}
    </span>
  );
}

/** The one obvious next step for a task: Start, Mark as done, or Reopen. */
export function nextStep(status: Status): { to: Status; label: string; short: string; icon: ReactNode } {
  switch (status) {
    case 'todo':
      return { to: 'in_progress', label: 'Start task', short: 'Start', icon: <Play size={14} weight="fill" aria-hidden="true" /> };
    case 'in_progress':
      return { to: 'done', label: 'Mark as done', short: 'Mark done', icon: <CheckCircle size={15} weight="bold" aria-hidden="true" /> };
    case 'done':
      return { to: 'todo', label: 'Reopen', short: 'Reopen', icon: <ArrowCounterClockwise size={14} weight="bold" aria-hidden="true" /> };
  }
}

export function NextStepButton({
  task,
  busy,
  onChange,
  size = 'sm',
}: {
  task: Task;
  busy: boolean;
  onChange: (task: Task, status: Status) => void;
  size?: 'sm' | 'lg';
}) {
  const step = nextStep(task.status);
  // One ink column of next steps; green belongs only to the Done state itself.
  const tone = task.status === 'done' ? 'btn-quiet' : 'btn-primary';
  return (
    <button
      type="button"
      className={`btn ${tone} ${size === 'lg' ? 'btn-lg' : 'btn-small'} next-step`}
      disabled={busy}
      aria-label={`${step.label}: ${task.title}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(task, step.to);
      }}
    >
      {step.icon}
      {busy ? 'Saving…' : size === 'lg' ? step.label : step.short}
    </button>
  );
}

/** Initials in a softly tinted square, tinted with the person's line colour. */
export function Avatar({ name, colour, size = 28 }: { name: string; colour: number; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  return (
    <span className={`avatar line-tint-${colour % 8}`} style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function PriorityTag({ priority }: { priority: Priority }) {
  return (
    <span className={`priority-tag priority-${priority}`}>
      <Flag size={13} weight={priority === 'high' ? 'fill' : 'bold'} aria-hidden="true" />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

/** "Due today", "Tomorrow", "In 3 days", "2 days late", "Done". */
export function dueLabel(task: Task, today = todayIso()) {
  const days = daysUntil(task.deadline, today);
  if (task.status === 'done') return 'Finished';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `In ${days} days`;
  return days === -1 ? '1 day late' : `${-days} days late`;
}

export function shortDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** A departure-board date: the day number large, weekday and month beside it. */
export function boardDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    day: String(d).padStart(2, '0'),
    weekdayMonth: `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${date.toLocaleDateString(undefined, { month: 'short' })}`,
  };
}

/** The board's one date voice for data: "FRI 02 OCT" (uppercased in CSS). */
export function boardDateText(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${String(d).padStart(2, '0')} ${date.toLocaleDateString(undefined, { month: 'short' })}`;
}
