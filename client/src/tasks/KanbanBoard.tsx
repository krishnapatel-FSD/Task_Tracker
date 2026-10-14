import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { DotsSixVertical, ArrowsLeftRight, ChatCircle, ListChecks, Repeat, NotePencil, Paperclip } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { daysUntil, isLate, lineIndexFor, todayIso } from '../timetable';
import { STATUS_LABELS, STATUSES, type Status, type Task } from '../types';
import { Avatar, dueLabel, NextStepButton, PriorityTag, shortDate } from './bits';
import type { LitInfo } from './useLit';

interface Props {
  tasks: Task[];
  loading: boolean;
  showAssignee: boolean;
  employeeIds: string[];
  lit: Map<string, LitInfo>;
  selectedId: string | null;
  updatingId: string | null;
  canChange: (task: Task) => boolean;
  onOpen: (task: Task) => void;
  /** Moving to Done asks for the completion note first; the card stays put until it is saved. */
  onStatusChange: (task: Task, status: Status) => void;
  empty: ReactNode;
}

/** The column under the pointer wins; keyboard moves (no pointer) fall back to overlap. */
const columnUnderPointer: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

/** What every card needs; the board passes it down through each column. */
type CardProps = Omit<Props, 'tasks' | 'loading' | 'empty'>;

/**
 * The board view: To do, In progress and Done side by side. Cards move by drag and drop,
 * or by keyboard (space to pick up, arrows to move, space to drop). Each column stays in
 * deadline order, so dropping only ever changes the status.
 */
export function KanbanBoard(props: Props) {
  const { tasks, loading, onStatusChange, empty, ...cardProps } = props;
  // On narrow screens the columns become tabs; start on the first one with work in it.
  const [picked, setMobileColumn] = useState<Status | null>(null);
  const mobileColumn = picked ?? STATUSES.find((s) => tasks.some((t) => t.status === s)) ?? 'todo';
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  if (loading && tasks.length === 0) return <p className="panel-note">Loading tasks…</p>;
  if (tasks.length === 0) return <>{empty}</>;

  const byStatus = (status: Status) => tasks.filter((t) => t.status === status);

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    const to = over.id as Status;
    if (task && task.status !== to) onStatusChange(task, to);
  }

  return (
    <div className={`kanban${loading ? ' is-refreshing' : ''}`}>
      <div className="kanban-tabs" role="tablist" aria-label="Column">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={mobileColumn === s}
            className={`board-tab${mobileColumn === s ? ' is-active' : ''}`}
            onClick={() => setMobileColumn(s)}
          >
            <span className="board-tab-label">{STATUS_LABELS[s]}</span>
            <span className="board-tab-count">{byStatus(s).length}</span>
          </button>
        ))}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={columnUnderPointer}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up ${titleOf(tasks, active.id)}.`,
            onDragOver: ({ active, over }) => (over ? `${titleOf(tasks, active.id)} is over ${STATUS_LABELS[over.id as Status]}.` : ''),
            onDragEnd: ({ active, over }) =>
              over ? `${titleOf(tasks, active.id)} dropped on ${STATUS_LABELS[over.id as Status]}.` : `${titleOf(tasks, active.id)} put back.`,
            onDragCancel: ({ active }) => `Moving ${titleOf(tasks, active.id)} was cancelled.`,
          },
        }}
      >
        <div className="kanban-columns">
          {STATUSES.map((s) => (
            <Column key={s} status={s} columnTasks={byStatus(s)} hiddenOnPhone={mobileColumn !== s} cardProps={{ ...cardProps, onStatusChange }} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function titleOf(tasks: Task[], id: string | number) {
  return tasks.find((t) => t.id === id)?.title ?? 'task';
}

function Column({ status, columnTasks: tasks, hiddenOnPhone, cardProps }: { status: Status; columnTasks: Task[]; hiddenOnPhone: boolean; cardProps: CardProps }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const late = status !== 'done' ? tasks.filter((t) => isLate(t)).length : 0;
  return (
    <section
      ref={setNodeRef}
      className={`kanban-column col-${status}${isOver ? ' is-over' : ''}${hiddenOnPhone ? ' is-phone-hidden' : ''}`}
      aria-label={`${STATUS_LABELS[status]}, ${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
    >
      <header className="kanban-column-head">
        <h2>{STATUS_LABELS[status]}</h2>
        <span className="group-count">{tasks.length}</span>
        {late > 0 && <span className="chip-late">{late} late</span>}
      </header>
      <ul className="kanban-cards">
        {tasks.map((t) => (
          <Card key={t.id} task={t} {...cardProps} />
        ))}
        {tasks.length === 0 && <li className="kanban-empty">{status === 'done' ? 'Nothing finished yet.' : 'No tasks here.'}</li>}
      </ul>
    </section>
  );
}

function Card({ task, showAssignee, employeeIds, lit, selectedId, updatingId, canChange, onOpen, onStatusChange }: CardProps & { task: Task }) {
  const movable = canChange(task) && updatingId !== task.id;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !movable });
  const litInfo = lit.get(task.id);
  const late = isLate(task);
  const days = daysUntil(task.deadline, todayIso());
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`kanban-card${isDragging ? ' is-dragging' : ''}${selectedId === task.id ? ' is-selected' : ''}${litInfo ? ' is-lit' : ''}`}
    >
      <div className="kanban-card-top">
        {late ? (
          <span className="chip-late">{dueLabel(task)}</span>
        ) : (
          <span className={`kanban-due${task.status !== 'done' && days === 0 ? ' is-today' : ''}`}>
            {task.status === 'done' ? `Due ${shortDate(task.deadline)}` : `${shortDate(task.deadline)} · ${dueLabel(task)}`}
          </span>
        )}
        {litInfo && <span className="lit-tag">{litInfo.tag}</span>}
        {movable && (
          <button
            type="button"
            className="kanban-handle"
            aria-label={`Move ${task.title}. Press space, then use the arrow keys to choose a column.`}
            {...listeners}
            {...attributes}
          >
            <DotsSixVertical size={16} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>
      <button type="button" className="kanban-title" onClick={() => onOpen(task)}>
        {task.title}
      </button>
      <div className="kanban-card-meta">
        <span className="project-chip">
          <i className={`project-swatch line-${task.project.colourIndex % 8}`} aria-hidden="true" />
          {task.project.name}
        </span>
        <PriorityTag priority={task.priority} />
        {task.handoffPending && (
          <span className="handoff-pill">
            <ArrowsLeftRight size={12} weight="bold" aria-hidden="true" />
            Handoff waiting
          </span>
        )}
        {task.repeats && (
          <span className="row-files" title="Made by a repeat schedule">
            <Repeat size={13} weight="bold" aria-hidden="true" />
            Repeats
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
          </span>
        )}
        {task.attachmentCount > 0 && (
          <span className="row-files" title={`${task.attachmentCount} file${task.attachmentCount === 1 ? '' : 's'}`}>
            <Paperclip size={13} weight="bold" aria-hidden="true" />
            {task.attachmentCount}
          </span>
        )}
        {showAssignee && (
          <span className="kanban-person" title={task.assignee.name}>
            <Avatar name={task.assignee.name} colour={lineIndexFor(task.assignee.id, employeeIds)} size={24} />
          </span>
        )}
      </div>
      {canChange(task) && (
        <div className="kanban-card-action">
          <NextStepButton task={task} busy={updatingId === task.id} onChange={onStatusChange} />
        </div>
      )}
    </li>
  );
}
