import { useState, type ReactNode } from 'react';
import { formatDue, formatToday, GROUP_LABELS, groupTasks, isLate, lineIndexFor, relativeDue, todayIso } from '../timetable';
import { PRIORITY_LABELS, STATUS_LABELS, STATUSES, type Status, type Task } from '../types';

interface Props {
  tasks: Task[];
  loading: boolean;
  /** Admin view: shows the assignee column with line colours. */
  employeeIds?: string[];
  updatingId: string | null;
  flashId: string | null;
  onStatusChange: (task: Task, status: Status) => void;
  /** Rendered instead of the list when there are no tasks. */
  empty: ReactNode;
}

export function Timetable({ tasks, loading, employeeIds, updatingId, flashId, onStatusChange, empty }: Props) {
  const showAssignee = Boolean(employeeIds);
  const today = todayIso();

  if (loading && tasks.length === 0) return <TimetableSkeleton showAssignee={showAssignee} />;
  if (tasks.length === 0) return <>{empty}</>;

  const groups = groupTasks(tasks, today);
  const nowLine = (
    <div className="now-line" role="presentation">
      <span>Today, {formatToday(today)}</span>
    </div>
  );

  return (
    <div className={`timetable${showAssignee ? ' with-assignee' : ''}${loading ? ' is-refreshing' : ''}`}>
      <div className="tt-head" aria-hidden="true">
        <span>Due</span>
        <span>Task</span>
        {showAssignee && <span>Assignee</span>}
        <span>Priority</span>
        <span>Status</span>
      </div>

      {groups[0]?.key !== 'past' && nowLine}

      {groups.map((group) => (
        <section key={group.key} className={`tt-group group-${group.key}`} aria-labelledby={`group-${group.key}`}>
          <h2 id={`group-${group.key}`} className="tt-group-title">
            {GROUP_LABELS[group.key]}
            <span className="tt-group-count">{group.tasks.length}</span>
          </h2>
          <ul className="tt-rows">
            {group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={today}
                lineIndex={employeeIds ? lineIndexFor(task.assignee.id, employeeIds) : null}
                updating={updatingId === task.id}
                flash={flashId === task.id}
                onStatusChange={onStatusChange}
              />
            ))}
          </ul>
          {group.key === 'past' && nowLine}
        </section>
      ))}
    </div>
  );
}

interface RowProps {
  task: Task;
  today: string;
  lineIndex: number | null;
  updating: boolean;
  flash: boolean;
  onStatusChange: (task: Task, status: Status) => void;
}

function TaskRow({ task, today, lineIndex, updating, flash, onStatusChange }: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const due = formatDue(task.deadline);
  const late = isLate(task, today);
  const descId = `desc-${task.id}`;

  return (
    <li className={`tt-row status-${task.status}${late ? ' is-late' : ''}${flash ? ' is-flash' : ''}`}>
      <div className="tt-due">
        <span className="tt-date">
          <span className="tt-weekday">{due.weekday}</span> {due.day}
        </span>
        <span className="tt-relative">{relativeDue(task, today)}</span>
      </div>

      <div className="tt-task">
        <button
          type="button"
          className="tt-title"
          aria-expanded={expanded}
          aria-controls={descId}
          onClick={() => setExpanded((v) => !v)}
        >
          {task.title}
        </button>
        <p id={descId} className={`tt-desc${expanded ? ' is-open' : ''}`}>
          {task.description}
        </p>
      </div>

      {lineIndex !== null && (
        <div className="tt-assignee">
          <span className={`line-swatch line-${lineIndex}`} aria-hidden="true" />
          {task.assignee.name}
        </div>
      )}

      <div className={`tt-priority priority-${task.priority}`}>
        <span className="priority-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>
          <span className="sr-only">Priority: </span>
          {PRIORITY_LABELS[task.priority]}
        </span>
      </div>

      <div className="tt-status">
        <select
          className={`status-select status-${task.status}`}
          value={task.status}
          disabled={updating}
          aria-label={`Status of ${task.title}`}
          aria-busy={updating}
          onChange={(e) => onStatusChange(task, e.target.value as Status)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

function TimetableSkeleton({ showAssignee }: { showAssignee: boolean }) {
  return (
    <div className={`timetable is-skeleton${showAssignee ? ' with-assignee' : ''}`} aria-busy="true" aria-label="Loading tasks">
      <ul className="tt-rows">
        {[72, 56, 64, 48].map((width, i) => (
          <li key={i} className="tt-row">
            <div className="tt-due">
              <span className="sk sk-date" />
              <span className="sk sk-small" />
            </div>
            <div className="tt-task">
              <span className="sk sk-title" style={{ width: `${width}%` }} />
              <span className="sk sk-line" />
            </div>
            {showAssignee && <span className="sk sk-small tt-assignee" />}
            <span className="sk sk-small tt-priority" />
            <span className="sk sk-select tt-status" />
          </li>
        ))}
      </ul>
    </div>
  );
}
