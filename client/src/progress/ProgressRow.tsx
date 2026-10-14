import { CaretDown, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useState } from 'react';
import { formatDay, formatMinutes } from '../format';
import type { PersonProgress, ProgressState } from '../types';

export const STATE_LABELS: Record<ProgressState, string> = {
  done: 'Done on time',
  doneLate: 'Done late',
  inProgress: 'In progress',
  todo: 'To do',
  late: 'Late',
};
const ORDER: ProgressState[] = ['done', 'doneLate', 'inProgress', 'todo', 'late'];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

/** The month shown, as YYYY-MM-01, with steps back and forward. Defaults to this month. */
export function useMonth() {
  const now = new Date();
  const [month, setMonth] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const step = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  };
  return {
    from: month,
    to: `${month.slice(0, 8)}${String(last).padStart(2, '0')}`,
    label: new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    isCurrent: y === now.getFullYear() && m === now.getMonth() + 1,
    step,
  };
}

export function MonthPicker({ label, isCurrent, step }: { label: string; isCurrent: boolean; step: (n: number) => void }) {
  return (
    <div className="month-picker">
      <button type="button" className="icon-button" aria-label="Previous month" onClick={() => step(-1)}>
        <CaretLeft size={18} weight="bold" aria-hidden="true" />
      </button>
      <span className="month-picker-label" aria-live="polite">
        {label}
      </span>
      <button type="button" className="icon-button" aria-label="Next month" onClick={() => step(1)} disabled={isCurrent}>
        <CaretRight size={18} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ProgressLegend() {
  return (
    <p className="progress-legend">
      {ORDER.map((s) => (
        <span key={s}>
          <i className={`pblock-swatch ps-${s}`} aria-hidden="true" />
          {STATE_LABELS[s]}
        </span>
      ))}
    </p>
  );
}

/**
 * One person's month as a row of blocks, one per task due, coloured by where it stands.
 * Hover or focus a block for the task; click it to open the task.
 */
export function ProgressRow({
  person,
  title,
  expanded,
  onToggle,
  onOpenTask,
}: {
  person: PersonProgress;
  title: string;
  expanded: boolean;
  onToggle?: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const finished = person.done + person.doneLate;

  return (
    <li className={`progress-row${expanded ? ' is-open' : ''}${person.late > 0 ? ' has-late' : ''}`}>
      <div className="progress-head">
        <span className="progress-avatar" aria-hidden="true">
          {initials(person.name)}
        </span>
        {onToggle ? (
          <button type="button" className="progress-name" aria-expanded={expanded} onClick={onToggle}>
            {title}
            <CaretDown size={14} weight="bold" aria-hidden="true" className="progress-caret" />
          </button>
        ) : (
          <span className="progress-name">{title}</span>
        )}
        <span className="progress-summary">
          {person.total === 0 ? 'Nothing due' : `${finished} of ${person.total} done`}
          {person.late > 0 && <span className="chip-late">{person.late} late</span>}
        </span>
        <span className="progress-pct">{person.percentDone === null ? '' : `${person.percentDone}%`}</span>
      </div>

      {person.total > 0 && (
        <div className="progress-blocks" role="list" aria-label={`${title}: tasks due this month`} onMouseLeave={() => setHint(null)}>
          {person.tasks.map((t) => {
            const label = `${t.title}, due ${formatDay(t.deadline)}: ${STATE_LABELS[t.state]}`;
            return (
              <button
                key={t.id}
                type="button"
                role="listitem"
                className={`pblock ps-${t.state}`}
                aria-label={`${label}. Open task`}
                title={label}
                onMouseEnter={() => setHint(label)}
                onFocus={() => setHint(label)}
                onBlur={() => setHint(null)}
                onClick={() => onOpenTask(t.id)}
              />
            );
          })}
        </div>
      )}
      <p className="progress-hint" aria-live="polite">
        {hint ?? ' '}
      </p>

      {expanded && (
        <dl className="progress-detail">
          <div>
            <dt>Done on time</dt>
            <dd>{person.done}</dd>
          </div>
          <div>
            <dt>Done late</dt>
            <dd>{person.doneLate}</dd>
          </div>
          <div>
            <dt>In progress</dt>
            <dd>{person.inProgress}</dd>
          </div>
          <div>
            <dt>To do</dt>
            <dd>{person.todo}</dd>
          </div>
          <div className={person.late > 0 ? 'is-late' : undefined}>
            <dt>Late</dt>
            <dd>{person.late}</dd>
          </div>
          <div>
            <dt>Time logged</dt>
            <dd>{person.minutesLogged > 0 ? formatMinutes(person.minutesLogged) : '0 min'}</dd>
          </div>
        </dl>
      )}
    </li>
  );
}
