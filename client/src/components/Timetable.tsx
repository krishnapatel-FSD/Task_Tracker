import { PaperclipHorizontal, PencilSimple, Trash } from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { formatDateTime } from '../format';
import { formatDue, formatToday, GROUP_LABELS, groupTasks, isLate, lineIndexFor, relativeDue, todayIso } from '../timetable';
import { PRIORITY_LABELS, STATUS_LABELS, STATUSES, type Employee, type ProjectRef, type Status, type Task } from '../types';
import { Activity } from './Activity';
import { Files } from './Files';
import { TaskComposer } from './TaskComposer';

/** Admin-only capabilities. Without this the timetable is the employee view. */
export interface AdminControls {
  employees: Employee[];
  projects: ProjectRef[];
  onSaved: (task: Task) => void;
  onDelete: (task: Task) => void;
}

interface Props {
  tasks: Task[];
  loading: boolean;
  admin?: AdminControls;
  updatingId: string | null;
  flashId: string | null;
  onStatusChange: (task: Task, status: Status) => void;
  /** Quiet in-place update of one task (e.g. its file count). */
  onPatch: (id: string, patch: Partial<Task>) => void;
  /** A task to bring into view (opens its group if collapsed). */
  revealId?: string | null;
  /** Rendered instead of the list when there are no tasks. */
  empty: ReactNode;
}

export function Timetable({ tasks, loading, admin, updatingId, flashId, onStatusChange, onPatch, revealId, empty }: Props) {
  const showAssignee = Boolean(admin);
  const today = todayIso();
  const employeeIds = admin?.employees.map((e) => e.id) ?? [];
  const [showEarlier, setShowEarlier] = useState(false);

  useEffect(() => {
    if (!revealId) return;
    const inEarlier = groupTasks(tasks, today).some((g) => g.key === 'earlier' && g.tasks.some((t) => t.id === revealId));
    if (inEarlier) setShowEarlier(true);
  }, [revealId]);

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

      {groups.map((group) => {
        const collapsed = group.key === 'earlier' && !showEarlier;
        return (
        <section key={group.key} className={`tt-group group-${group.key}`} aria-labelledby={`group-${group.key}`}>
          <h2 id={`group-${group.key}`} className="tt-group-title">
            {GROUP_LABELS[group.key]}
            <span className="tt-group-count">{group.tasks.length}</span>
            {group.key === 'earlier' && (
              <button type="button" className="btn btn-link tt-group-toggle" aria-expanded={!collapsed} onClick={() => setShowEarlier((v) => !v)}>
                {collapsed ? 'Show' : 'Hide'}
              </button>
            )}
          </h2>
          {!collapsed && (
          <ul className="tt-rows">
            {group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={today}
                lineIndex={admin ? lineIndexFor(task.assignee.id, employeeIds) : null}
                admin={admin}
                updating={updatingId === task.id}
                flash={flashId === task.id}
                onStatusChange={onStatusChange}
                onPatch={onPatch}
              />
            ))}
          </ul>
          )}
          {group.key === 'past' && nowLine}
        </section>
        );
      })}
    </div>
  );
}

interface RowProps {
  task: Task;
  today: string;
  lineIndex: number | null;
  admin?: AdminControls;
  updating: boolean;
  flash: boolean;
  onStatusChange: (task: Task, status: Status) => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
}

type Tab = 'details' | 'activity' | 'files';
const TAB_LABELS: Record<Tab, string> = { details: 'Details', activity: 'Activity', files: 'Files' };

function TaskRow({ task, today, lineIndex, admin, updating, flash, onStatusChange, onPatch }: RowProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>('details');
  const due = formatDue(task.deadline);
  const late = isLate(task, today);
  const panelId = `panel-${task.id}`;
  const onCountChange = useCallback(
    (attachmentCount: number) => attachmentCount !== task.attachmentCount && onPatch(task.id, { attachmentCount }),
    [task.id, task.attachmentCount, onPatch],
  );

  return (
    <li id={`task-${task.id}`} className={`tt-row status-${task.status}${late ? ' is-late' : ''}${flash ? ' is-flash' : ''}${open || editing ? ' is-open' : ''}`}>
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
          aria-expanded={open || editing}
          aria-controls={panelId}
          onClick={() => {
            if (editing) return;
            setOpen((v) => !v);
          }}
        >
          {task.title}
        </button>
        <p className="tt-meta-line">
          <span className="project-chip">
            <i className={`project-swatch line-${task.project.colourIndex % 8}`} aria-hidden="true" />
            {task.project.name}
          </span>
          {task.attachmentCount > 0 && (
            <span className="tt-files" title={`${task.attachmentCount} file${task.attachmentCount === 1 ? '' : 's'}`}>
              <PaperclipHorizontal size={13} weight="bold" aria-hidden="true" />
              <span className="sr-only">Files: </span>
              {task.attachmentCount}
            </span>
          )}
          <span className="tt-desc">{task.description}</span>
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

      {editing && admin && (
        <div className="tt-panel" id={panelId}>
          <TaskComposer
            mode="edit"
            initial={task}
            employees={admin.employees}
            projects={admin.projects}
            onClose={() => setEditing(false)}
            onSaved={(saved) => {
              setEditing(false);
              admin.onSaved(saved);
            }}
          />
        </div>
      )}

      {open && !editing && (
        <div className="tt-panel" id={panelId}>
          <div className="panel-bar">
            <div className="tabs" role="tablist" aria-label={`${task.title} sections`}>
              {(['details', 'activity', 'files'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  id={`${panelId}-${t}-tab`}
                  aria-selected={tab === t}
                  aria-controls={`${panelId}-${t}`}
                  className="tab"
                  onClick={() => setTab(t)}
                >
                  {TAB_LABELS[t]}
                  {t === 'files' && task.attachmentCount > 0 && <span className="tab-count">{task.attachmentCount}</span>}
                </button>
              ))}
            </div>
            {admin && (
              <div className="panel-actions">
                <button type="button" className="btn btn-quiet btn-small" onClick={() => setEditing(true)}>
                  <PencilSimple size={14} weight="bold" aria-hidden="true" />
                  Edit
                </button>
                <button type="button" className="btn btn-danger-quiet btn-small" onClick={() => admin.onDelete(task)}>
                  <Trash size={14} weight="bold" aria-hidden="true" />
                  Delete
                </button>
              </div>
            )}
          </div>

          <div role="tabpanel" id={`${panelId}-${tab}`} aria-labelledby={`${panelId}-${tab}-tab`} className="panel-body">
            {tab === 'details' ? (
              <div className="details">
                <p className="details-desc">{task.description}</p>
                <dl className="details-meta">
                  <div>
                    <dt>Project</dt>
                    <dd>{task.project.name}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDateTime(task.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Last changed</dt>
                    <dd>{formatDateTime(task.updatedAt)}</dd>
                  </div>
                  {task.completedAt && (
                    <div>
                      <dt>Completed</dt>
                      <dd>{formatDateTime(task.completedAt)}</dd>
                    </div>
                  )}
                </dl>
              </div>
            ) : tab === 'activity' ? (
              <Activity taskId={task.id} refreshKey={`${task.updatedAt}:${task.attachmentCount}`} />
            ) : (
              <Files taskId={task.id} onCountChange={onCountChange} />
            )}
          </div>
        </div>
      )}
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
