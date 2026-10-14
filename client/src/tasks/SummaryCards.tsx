import { daysUntil, isLate, todayIso } from '../timetable';
import type { Task } from '../types';

export type QuickFilter = 'all' | 'changed' | 'overdue' | 'today' | 'in_progress' | 'todo' | 'done';

export const QUICK_LABELS: Record<Exclude<QuickFilter, 'all'>, string> = {
  changed: 'Changed',
  overdue: 'Late',
  today: 'Due today',
  in_progress: 'In progress',
  todo: 'To do',
  done: 'Done',
};

export function matchesQuick(task: Task, filter: QuickFilter, litIds: Set<string>, today = todayIso()) {
  switch (filter) {
    case 'all':
      return true;
    case 'changed':
      return litIds.has(task.id);
    case 'overdue':
      return isLate(task, today);
    case 'today':
      return task.status !== 'done' && daysUntil(task.deadline, today) === 0;
    default:
      return task.status === filter;
  }
}

/** The board's tab row: a standard filter with a count on every tab. */
export function BoardTabs({
  tasks,
  value,
  litIds,
  onChange,
}: {
  tasks: Task[];
  value: QuickFilter;
  litIds: Set<string>;
  onChange: (f: QuickFilter) => void;
}) {
  const today = todayIso();
  const keys: QuickFilter[] = ['all', ...(litIds.size > 0 ? (['changed'] as const) : []), 'overdue', 'today', 'in_progress', 'todo', 'done'];
  return (
    <div className="board-tabs" role="group" aria-label="Show tasks">
      {keys.map((key) => {
        const count = tasks.filter((t) => matchesQuick(t, key, litIds, today)).length;
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            className={`board-tab tab-${key}${active ? ' is-active' : ''}${count === 0 ? ' is-zero' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(key)}
          >
            <span className="board-tab-label">{key === 'all' ? 'All' : QUICK_LABELS[key]}</span>
            <span className="board-tab-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
