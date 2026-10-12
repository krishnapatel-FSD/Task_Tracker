import { ArrowClockwise } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { isLate } from '../timetable';
import type { Task } from '../types';

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="banner banner-error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-link" onClick={onRetry}>
          <ArrowClockwise size={14} weight="bold" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

/** "5 tasks, 1 past its deadline" */
export function taskSummary(tasks: Task[], loading: boolean) {
  if (loading && tasks.length === 0) return 'Loading tasks…';
  const late = tasks.filter((t) => isLate(t)).length;
  const count = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
  return late > 0 ? `${count}, ${late} past ${late === 1 ? 'its' : 'their'} deadline` : count;
}
