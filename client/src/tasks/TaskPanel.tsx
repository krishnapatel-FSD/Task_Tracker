import { ArrowLeft, ArrowRight, PencilSimple, Trash, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity } from '../components/Activity';
import { Files } from '../components/Files';
import { Notes } from '../components/Notes';
import { TaskComposer } from '../components/TaskComposer';
import { formatDateTime } from '../format';
import { lineIndexFor } from '../timetable';
import { STATUS_LABELS, STATUSES, type CompletionNote, type Employee, type ProjectRef, type Status, type Task } from '../types';
import { CompleteTask } from './CompleteTask';
import { Avatar, boardDate, boardDateText, dueLabel, NextStepButton, PriorityTag, StatusBadge, taskState } from './bits';

export type PanelState =
  | { kind: 'closed' }
  | { kind: 'view'; id: string }
  | { kind: 'edit'; id: string }
  | { kind: 'complete'; id: string }
  | { kind: 'create' };

interface Props {
  state: PanelState;
  task: Task | null;
  isAdmin: boolean;
  employees: Employee[];
  projects: ProjectRef[];
  /** Set on a project page: new tasks start in this project and the pass skips the project link. */
  currentProjectId?: string;
  updating: boolean;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onCancelEdit: (task: Task) => void;
  onSaved: (task: Task, created: boolean) => void;
  onDelete: (task: Task) => void;
  onStatusChange: (task: Task, status: Status) => void;
  /** Mark done with the required completion note. */
  onComplete: (task: Task, note: CompletionNote) => void;
  onCancelComplete: (task: Task) => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
}

/** The right-hand panel: everything about one task, or the new/edit form. Not a modal: the list stays usable. */
export function TaskPanel(props: Props) {
  const { state, task, onClose } = props;
  const ref = useRef<HTMLElement>(null);

  // Move focus into the panel when it opens or changes, so keyboard users land in it.
  useEffect(() => {
    if (state.kind !== 'closed') ref.current?.focus({ preventScroll: true });
  }, [state.kind, state.kind === 'closed' ? null : 'id' in state ? state.id : 'new']);

  if (state.kind === 'closed') return null;

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      className="task-panel"
      aria-label={state.kind === 'create' ? 'New task' : task ? `Task: ${task.title}` : 'Task'}
      onKeyDown={(e) => e.key === 'Escape' && state.kind === 'view' && onClose()}
    >
      <div className="panel-top">
        <button type="button" className="btn btn-quiet btn-small panel-back" onClick={onClose}>
          <ArrowLeft size={14} weight="bold" aria-hidden="true" />
          Back to list
        </button>
        <button type="button" className="icon-button panel-close" onClick={onClose} aria-label="Close panel">
          <X size={18} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {state.kind === 'create' && (
        <TaskComposer
          mode="create"
          bare
          defaultProjectId={props.currentProjectId}
          employees={props.employees}
          projects={props.projects}
          onClose={onClose}
          onSaved={(t) => props.onSaved(t, true)}
        />
      )}

      {state.kind !== 'create' && !task && <p className="panel-note">This task isn't in the current list. It may have been deleted or filtered out.</p>}

      {state.kind === 'edit' && task && (
        <TaskComposer
          mode="edit"
          initial={task}
          employees={props.employees}
          projects={props.projects}
          onClose={() => props.onCancelEdit(task)}
          onSaved={(t) => props.onSaved(t, false)}
        />
      )}

      {state.kind === 'complete' && task && (
        <CompleteTask
          key={task.id}
          task={task}
          busy={props.updating}
          onSubmit={(note) => props.onComplete(task, note)}
          onCancel={() => props.onCancelComplete(task)}
        />
      )}

      {state.kind === 'view' && task && <TaskDetails {...props} task={task} />}
    </aside>
  );
}

function TaskDetails({ task, isAdmin, employees, currentProjectId, updating, onEdit, onDelete, onStatusChange, onPatch }: Props & { task: Task }) {
  const [tab, setTab] = useState<'notes' | 'files' | 'activity'>(task.noteCount > 0 ? 'notes' : 'files');
  const onCountChange = useCallback(
    (attachmentCount: number) => attachmentCount !== task.attachmentCount && onPatch(task.id, { attachmentCount }),
    [task.id, task.attachmentCount, onPatch],
  );
  // A new note just came in (the task was marked done): show it.
  const [seenNotes, setSeenNotes] = useState(task.noteCount);
  if (task.noteCount !== seenNotes) {
    setSeenNotes(task.noteCount);
    if (task.noteCount > seenNotes) setTab('notes');
  }
  const late = taskState(task) === 'overdue';
  const due = boardDate(task.deadline);

  return (
    <div className="panel-body">
      <article className="pass" aria-label="Task details">
        <header className="pass-band">
          <span className="pass-project">
            <i className={`project-swatch line-${task.project.colourIndex % 8}`} aria-hidden="true" />
            {task.project.name}
            {currentProjectId !== task.project.id && (
              <Link className="pass-project-link" to={`/projects/${task.project.id}`}>
                Open project
                <ArrowRight size={12} weight="bold" aria-hidden="true" />
              </Link>
            )}
          </span>
          <StatusBadge task={task} />
        </header>

        <div className="pass-main">
          <h2 className="pass-title">{task.title}</h2>
          <dl className="pass-fields">
            <div className={`pass-field field-due${late ? ' is-late' : ''}`}>
              <dt>Due</dt>
              <dd>
                <span className="pass-big">
                  {due.day} <span className="pass-big-sub">{due.weekdayMonth}</span>
                </span>
                <span className="pass-note">{dueLabel(task)}</span>
              </dd>
            </div>
            <div className="pass-field">
              <dt>Assigned to</dt>
              <dd className="pass-person">
                <Avatar name={task.assignee.name} colour={lineIndexFor(task.assignee.id, employees.map((e) => e.id))} size={26} />
                {task.assignee.name}
              </dd>
            </div>
            <div className="pass-field">
              <dt>Priority</dt>
              <dd>
                <PriorityTag priority={task.priority} />
              </dd>
            </div>
            <div className="pass-field">
              <dt>Created</dt>
              <dd className="pass-mono">{boardDateText(task.createdAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="pass-perforation" aria-hidden="true" />

        <div className="pass-actions">
          <NextStepButton task={task} busy={updating} onChange={onStatusChange} size="lg" />
          <fieldset className="status-switch" disabled={updating}>
            <legend className="sr-only">Set status</legend>
            {STATUSES.map((s) => (
              <label key={s} className={`status-option opt-${s}`}>
                <input type="radio" name={`status-${task.id}`} checked={task.status === s} onChange={() => onStatusChange(task, s)} />
                <span>{STATUS_LABELS[s]}</span>
              </label>
            ))}
          </fieldset>
        </div>
      </article>

      <section className="panel-section">
        <h3>Description</h3>
        <p className="panel-description">{task.description}</p>
        {task.completedAt && <p className="panel-stamp">Finished {formatDateTime(task.completedAt)}.</p>}
      </section>

      {isAdmin && (
        <div className="panel-admin">
          <button type="button" className="btn btn-quiet" onClick={() => onEdit(task)}>
            <PencilSimple size={15} weight="bold" aria-hidden="true" />
            Edit task
          </button>
          <button type="button" className="btn btn-danger-quiet" onClick={() => onDelete(task)}>
            <Trash size={15} weight="bold" aria-hidden="true" />
            Delete
          </button>
        </div>
      )}

      <section className="panel-section">
        <div className="tabs" role="tablist" aria-label="Notes, files and activity">
          <button type="button" role="tab" className="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}>
            Notes{task.noteCount > 0 && <span className="tab-count">{task.noteCount}</span>}
          </button>
          <button type="button" role="tab" className="tab" aria-selected={tab === 'files'} onClick={() => setTab('files')}>
            Files{task.attachmentCount > 0 && <span className="tab-count">{task.attachmentCount}</span>}
          </button>
          <button type="button" role="tab" className="tab" aria-selected={tab === 'activity'} onClick={() => setTab('activity')}>
            Activity
          </button>
        </div>
        <div role="tabpanel" className="tab-body">
          {tab === 'notes' ? (
            <Notes taskId={task.id} refreshKey={`${task.noteCount}`} />
          ) : tab === 'files' ? (
            <Files taskId={task.id} onCountChange={onCountChange} />
          ) : (
            <Activity taskId={task.id} refreshKey={`${task.updatedAt}:${task.attachmentCount}`} />
          )}
        </div>
      </section>
    </div>
  );
}
