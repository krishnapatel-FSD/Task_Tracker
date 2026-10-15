import { CaretDown, CaretRight, ArrowsLeftRight, ChatCircle, ListChecks, NotePencil, Paperclip } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { daysUntil, isLate, lineIndexFor, todayIso } from '../timetable';
import type { Status, Task } from '../types';
import { Avatar, boardDate, dueLabel, NextStepButton, PriorityTag, StatusBadge } from './bits';
import type { LitInfo } from './useLit';

interface Props {
  tasks: Task[];
  loading: boolean;
  /** Group into Late / Due today / Coming up / Finished (only when no tab filter is active). */
  grouped: boolean;
  showAssignee: boolean;
  /** Project page: columns read Task, Assigned to, Date, Status, Next step, and rows skip the project chip. */
  byProject?: boolean;
  employeeIds: string[];
  lit: Map<string, LitInfo>;
  selectedId: string | null;
  updatingId: string | null;
  /** The admin and the assignee can change a task; the rest of the team only reads it. */
  canChange: (task: Task) => boolean;
  /** The signed-in person, to offer "Review handoff" on tasks handed to them. */
  meId?: string;
  flashId: string | null;
  onOpen: (task: Task) => void;
  onStatusChange: (task: Task, status: Status) => void;
  empty: ReactNode;
}

type GroupKey = 'overdue' | 'today' | 'upcoming' | 'done';
const GROUP_TITLES: Record<GroupKey, string> = { overdue: 'Late', today: 'Due today', upcoming: 'Coming up', done: 'Finished' };

function groupOf(task: Task, today: string): GroupKey {
  if (task.status === 'done') return 'done';
  if (isLate(task, today)) return 'overdue';
  return daysUntil(task.deadline, today) === 0 ? 'today' : 'upcoming';
}

/** The board: deadline-ordered rows in one fixed column grid. */
export function TaskList(props: Props) {
  const { tasks, loading, grouped, showAssignee, byProject = false, empty } = props;
  const [showDone, setShowDone] = useState(false);
  const today = todayIso();

  if (loading && tasks.length === 0) return <ListSkeleton />;
  if (tasks.length === 0) return <>{empty}</>;

  const head = byProject ? (
    <div className="board-head" aria-hidden="true">
      <span>Task</span>
      {showAssignee && <span>Assigned to</span>}
      <span>Date</span>
      <span>Status</span>
      <span className="head-action">Next step</span>
    </div>
  ) : (
    <div className="board-head" aria-hidden="true">
      <span>Due</span>
      <span>Task</span>
      {showAssignee && <span>Person</span>}
      <span>Status</span>
      <span className="head-action">Next step</span>
    </div>
  );
  const boardClass = `board${showAssignee ? ' with-person' : ''}${byProject ? ' by-project' : ''}${loading ? ' is-refreshing' : ''}`;

  if (!grouped) {
    return (
      <div className={boardClass}>
        {head}
        <ul className="board-rows">{tasks.map((t) => <Row key={t.id} task={t} {...props} />)}</ul>
      </div>
    );
  }

  const groups = (['overdue', 'today', 'upcoming', 'done'] as GroupKey[])
    .map((key) => ({ key, tasks: tasks.filter((t) => groupOf(t, today) === key) }))
    .filter((g) => g.tasks.length > 0);

  return (
    <div className={boardClass}>
      {head}
      {groups.map((g) => {
        const collapsed = g.key === 'done' && !showDone;
        return (
          <section key={g.key} className={`board-group group-${g.key}`} aria-label={GROUP_TITLES[g.key]}>
            {g.key === 'done' ? (
              <button type="button" className="group-toggle" aria-expanded={!collapsed} onClick={() => setShowDone((v) => !v)}>
                {collapsed ? <CaretRight size={14} weight="bold" aria-hidden="true" /> : <CaretDown size={14} weight="bold" aria-hidden="true" />}
                {collapsed ? `Show ${g.tasks.length} finished` : 'Finished'}
                <span className="group-count">{g.tasks.length}</span>
              </button>
            ) : (
              <h2 className="group-title">
                {GROUP_TITLES[g.key]}
                <span className="group-count">{g.tasks.length}</span>
              </h2>
            )}
            {!collapsed && <ul className="board-rows">{g.tasks.map((t) => <Row key={t.id} task={t} {...props} />)}</ul>}
          </section>
        );
      })}
    </div>
  );
}

function Row({ task, showAssignee, byProject, employeeIds, lit, selectedId, updatingId, flashId, canChange, meId, onOpen, onStatusChange }: Props & { task: Task }) {
  const late = isLate(task);
  const selected = selectedId === task.id;
  const litInfo = lit.get(task.id);
  const date = boardDate(task.deadline);
  const dueCell = (
    <div className={`row-due${late ? ' is-late' : ''}`}>
      <span className="due-day" aria-label={date.day}>
        {date.day.split('').map((digit, i) => (
          <span key={i} className="due-cell" aria-hidden="true">
            {digit}
          </span>
        ))}
      </span>
      <span className="due-rest">
        <span className="due-month">{date.weekdayMonth}</span>
        <span className="due-relative">{dueLabel(task)}</span>
      </span>
    </div>
  );
  return (
    <li
      id={`task-${task.id}`}
      className={`board-row${selected ? ' is-selected' : ''}${litInfo ? ' is-lit' : ''}${flashId === task.id ? ' is-flash' : ''}${task.status === 'done' ? ' is-done' : ''}`}
      onClick={() => onOpen(task)}
    >
      {!byProject && dueCell}

      <div className="row-main">
        <span className="row-title-line">
          {litInfo && <span className="lit-tag">{litInfo.tag}</span>}
          <button
            type="button"
            className="row-title"
            aria-expanded={selected}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(task);
            }}
          >
            {task.title}
          </button>
        </span>
        <span className="row-meta">
          {!byProject && (
            <span className="project-chip">
              <i className={`project-swatch line-${task.project.colourIndex % 8}`} aria-hidden="true" />
              {task.project.name}
            </span>
          )}
          <PriorityTag priority={task.priority} />
          {task.handoffPending && (
            <span className="handoff-pill">
              <ArrowsLeftRight size={12} weight="bold" aria-hidden="true" />
              Handoff waiting
            </span>
          )}
          {task.checklistTotal > 0 && (
            <span className={`row-files${task.checklistDone === task.checklistTotal ? ' is-complete' : ''}`} title="Checklist">
              <ListChecks size={13} weight="bold" aria-hidden="true" />
              {task.checklistDone}/{task.checklistTotal}
              <span className="sr-only"> checklist items done</span>
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="row-files" title={`${task.commentCount} comment${task.commentCount === 1 ? '' : 's'}`}>
              <ChatCircle size={13} weight="bold" aria-hidden="true" />
              {task.commentCount}
              <span className="sr-only"> comments</span>
            </span>
          )}
          {task.noteCount > 0 && (
            <span className="row-files" title={`${task.noteCount} note${task.noteCount === 1 ? '' : 's'}`}>
              <NotePencil size={13} weight="bold" aria-hidden="true" />
              {task.noteCount}
              <span className="sr-only"> notes</span>
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="row-files" title={`${task.attachmentCount} file${task.attachmentCount === 1 ? '' : 's'}`}>
              <Paperclip size={13} weight="bold" aria-hidden="true" />
              {task.attachmentCount}
              <span className="sr-only"> files</span>
            </span>
          )}
        </span>
      </div>

      {showAssignee && (
        <div className="row-person">
          <Avatar name={task.assignee.name} colour={lineIndexFor(task.assignee.id, employeeIds)} />
          <span>{task.assignee.name}</span>
        </div>
      )}

      {byProject && dueCell}

      <div className="row-status">
        <StatusBadge task={task} />
      </div>

      <div className="row-action">
        {canChange(task) ? (
          <NextStepButton task={task} busy={updatingId === task.id} onChange={onStatusChange} />
        ) : task.handoffPending && task.assignee.id === meId ? (
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(task);
            }}
          >
            Review handoff
          </button>
        ) : (
          <span className="row-readonly">View only</span>
        )}
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="board is-skeleton" aria-busy="true" aria-label="Loading tasks">
      <ul className="board-rows">
        {[70, 55, 62, 48, 58].map((w, i) => (
          <li key={i} className="board-row">
            <span className="sk sk-date" />
            <div className="row-main">
              <span className="sk sk-title" style={{ width: `${w}%` }} />
              <span className="sk sk-line" />
            </div>
            <span className="sk sk-badge" />
            <span className="sk sk-button" />
          </li>
        ))}
      </ul>
    </div>
  );
}
