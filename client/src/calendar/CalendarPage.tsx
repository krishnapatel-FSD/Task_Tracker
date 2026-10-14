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
import { CalendarX, CaretLeft, CaretRight, DownloadSimple, Warning } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, downloadFile } from '../api';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/PageStates';
import { useToast } from '../components/Toast';
import { formatDay } from '../format';
import { isLate, todayIso } from '../timetable';
import type { Employee, Task } from '../types';
import { useProjects } from '../useProjects';
import { useTasks } from '../useTasks';

type View = 'month' | 'week' | 'day';
type DaysOff = { projects: { id: string; skipWeekends: boolean }[]; holidays: { projectId: string; date: string; name: string }[] };

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LIMIT_KEY = 'tt-calendar-limit';

// ---- date helpers (YYYY-MM-DD, local calendar days) ----
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso: string, n: number) => {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
};
/** Monday on or before the date. */
const weekStart = (iso: string) => addDays(iso, -((fromIso(iso).getDay() + 6) % 7));
const monthStart = (iso: string) => `${iso.slice(0, 8)}01`;
const addMonths = (iso: string, n: number) => {
  const d = fromIso(monthStart(iso));
  d.setMonth(d.getMonth() + n);
  return toIso(d);
};
const monthLabel = (iso: string) => fromIso(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const dayLabel = (iso: string) => fromIso(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/** Deadlines across projects by day, week or month. The admin can drag a task to move its deadline. */
export function CalendarPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const toast = useToast();
  const projects = useProjects();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(todayIso());
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [includeDone, setIncludeDone] = useState(false);
  const [limit, setLimitState] = useState(() => {
    try {
      return Number(localStorage.getItem(LIMIT_KEY)) || 3;
    } catch {
      return 3;
    }
  });
  const setLimit = (n: number) => {
    setLimitState(n);
    try {
      localStorage.setItem(LIMIT_KEY, String(n));
    } catch {
      // not remembered
    }
  };
  const [daysOff, setDaysOff] = useState<DaysOff>({ projects: [], holidays: [] });
  const [error, setError] = useState<string | null>(null);
  const { tasks, loading, error: loadError, reload, replaceTask } = useTasks({ status: '', assigneeId, projectId });
  const today = todayIso();

  useEffect(() => {
    api.listEmployees().then(setEmployees).catch(() => setEmployees([]));
    api.calendarDaysOff().then(setDaysOff).catch(() => undefined);
  }, []);

  // The visible range for the current view.
  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: cursor, days: [cursor] };
    if (view === 'week') {
      const from = weekStart(cursor);
      return { from, to: addDays(from, 6), days: Array.from({ length: 7 }, (_, i) => addDays(from, i)) };
    }
    const first = monthStart(cursor);
    const from = weekStart(first);
    const last = addDays(addMonths(first, 1), -1);
    const to = addDays(weekStart(last), 6);
    const count = Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 86_400_000) + 1;
    return { from: first, to: last, gridFrom: from, days: Array.from({ length: count }, (_, i) => addDays(from, i)) };
  }, [view, cursor]);

  const visible = useMemo(() => tasks.filter((t) => includeDone || t.status !== 'done'), [tasks, includeDone]);
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of visible) map.set(t.deadline, [...(map.get(t.deadline) ?? []), t]);
    return map;
  }, [visible]);

  const skipWeekends = useMemo(() => new Map(daysOff.projects.map((p) => [p.id, p.skipWeekends])), [daysOff]);
  const holidayAt = (date: string, projectId?: string) =>
    daysOff.holidays.filter((h) => h.date === date && (!projectId || h.projectId === projectId));
  /** Due on a weekend (in a project that has weekends off) or on one of its holidays. */
  const onDayOff = (t: Task) => {
    const wd = fromIso(t.deadline).getDay();
    return ((wd === 0 || wd === 6) && skipWeekends.get(t.project.id) !== false) || holidayAt(t.deadline, t.project.id).length > 0;
  };
  /** People with more than `limit` open tasks due that day. */
  const overload = (date: string) => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const t of byDay.get(date) ?? []) {
      if (t.status === 'done') continue;
      const c = counts.get(t.assignee.id) ?? { name: t.assignee.name, n: 0 };
      counts.set(t.assignee.id, { ...c, n: c.n + 1 });
    }
    return [...counts.values()].filter((c) => c.n > limit);
  };

  const linkFor = (t: Task) => (isAdmin ? `/admin/tasks?task=${t.id}` : t.assignee.id === user?.id ? `/tasks?task=${t.id}` : `/team?task=${t.id}`);

  function step(n: number) {
    setCursor((c) => (view === 'month' ? addMonths(c, n) : addDays(c, view === 'week' ? 7 * n : n)));
  }

  async function moveDeadline(task: Task, to: string) {
    const from = task.deadline;
    if (from === to) return;
    setError(null);
    try {
      replaceTask(await api.updateTask(task.id, { deadline: to }));
      toast({
        message: `Moved "${task.title}" to ${formatDay(to)}.`,
        durationMs: 8000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              replaceTask(await api.updateTask(task.id, { deadline: from }));
            } catch {
              toast({ message: "We couldn't move it back." });
            }
          },
        },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't move that deadline.");
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    return hits.length ? hits : rectIntersection(args);
  };
  function onDragEnd({ active, over }: DragEndEvent) {
    const task = visible.find((t) => t.id === active.id);
    if (task && over) moveDeadline(task, over.id as string);
  }

  async function exportIcs() {
    const q = new URLSearchParams({ from: range.from, to: range.to, includeDone: String(includeDone) });
    if (projectId) q.set('projectId', projectId);
    if (assigneeId) q.set('assigneeId', assigneeId);
    try {
      await downloadFile(`/calendar/deadlines.ics?${q}`, `deadlines-${range.from}-to-${range.to}.ics`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't make the calendar file.");
    }
  }

  const title = view === 'month' ? monthLabel(cursor) : view === 'week' ? `${formatDay(range.from)} to ${formatDay(range.to)}` : dayLabel(cursor);
  const dayProps = { byDay, today, isAdmin, overload, holidayAt, onDayOff, linkFor, onOpenDay: (d: string) => {
    setCursor(d);
    setView('day');
  } };

  return (
    <main className="page page-wide calendar-page">
      <div className="page-head">
        <div>
          <h1>Calendar</h1>
          <p className="page-summary">
            Deadlines across projects.{isAdmin ? ' Drag a task to another day to move its deadline.' : ''}
          </p>
        </div>
        <div className="page-head-side">
          <button type="button" className="btn btn-quiet" onClick={exportIcs}>
            <DownloadSimple size={16} weight="bold" aria-hidden="true" />
            Download .ics
          </button>
        </div>
      </div>

      <div className="calendar-bar">
        <div className="calendar-nav">
          <button type="button" className="icon-button" aria-label={`Previous ${view}`} onClick={() => step(-1)}>
            <CaretLeft size={18} weight="bold" aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setCursor(todayIso())}>
            Today
          </button>
          <button type="button" className="icon-button" aria-label={`Next ${view}`} onClick={() => step(1)}>
            <CaretRight size={18} weight="bold" aria-hidden="true" />
          </button>
          <h2 className="calendar-title" aria-live="polite">
            {title}
          </h2>
        </div>
        <div className="view-switch" role="group" aria-label="View">
          {(['month', 'week', 'day'] as View[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar">
        <label className="toolbar-select">
          <span className="sr-only">Project</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Person</span>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Everyone</option>
            {!isAdmin && user && <option value={user.id}>Only me</option>}
            {employees
              .filter((e) => isAdmin || e.id !== user?.id)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Busy day warning</span>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                Warn above {n} due per person
              </option>
            ))}
          </select>
        </label>
        <label className="calendar-check">
          <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
          Show finished
        </label>
      </div>

      {(error || loadError) && <ErrorBanner message={(error ?? loadError)!} onRetry={reload} />}

      <DndContext sensors={sensors} collisionDetection={collision} onDragEnd={onDragEnd}>
        {view === 'day' ? (
          <DayList date={cursor} {...dayProps} />
        ) : (
          <div className={`calendar-grid view-${view}${loading ? ' is-refreshing' : ''}`}>
            {WEEKDAYS.map((d) => (
              <div key={d} className="calendar-weekday" aria-hidden="true">
                {d}
              </div>
            ))}
            {range.days.map((d) => (
              <DayCell key={d} date={d} outside={view === 'month' && d.slice(0, 7) !== cursor.slice(0, 7)} full={view === 'week'} {...dayProps} />
            ))}
          </div>
        )}
      </DndContext>

      <p className="calendar-legend">
        <span>
          <span className="legend-swatch is-late" aria-hidden="true" /> Late
        </span>
        <span>
          <Warning size={14} weight="bold" aria-hidden="true" /> Someone has more than {limit} due that day
        </span>
        <span>
          <CalendarX size={14} weight="bold" aria-hidden="true" /> Due on a day off
        </span>
      </p>
    </main>
  );
}

interface DayProps {
  byDay: Map<string, Task[]>;
  today: string;
  isAdmin: boolean;
  overload: (date: string) => { name: string; n: number }[];
  holidayAt: (date: string) => { projectId: string; date: string; name: string }[];
  onDayOff: (t: Task) => boolean;
  linkFor: (t: Task) => string;
  onOpenDay: (date: string) => void;
}

const SHOWN = 3;

function DayCell({ date, outside, full, byDay, today, isAdmin, overload, holidayAt, onDayOff, linkFor, onOpenDay }: DayProps & { date: string; outside: boolean; full: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: date, disabled: !isAdmin });
  const tasks = byDay.get(date) ?? [];
  const busy = overload(date);
  const holidays = [...new Set(holidayAt(date).map((h) => h.name))];
  const shown = full ? tasks : tasks.slice(0, SHOWN);
  const weekend = [0, 6].includes(fromIso(date).getDay());
  return (
    <section
      ref={setNodeRef}
      className={`calendar-day${outside ? ' is-outside' : ''}${date === today ? ' is-today' : ''}${weekend ? ' is-weekend' : ''}${isOver ? ' is-over' : ''}${busy.length ? ' is-busy' : ''}`}
      aria-label={`${dayLabel(date)}, ${tasks.length} due`}
    >
      <div className="calendar-day-head">
        <button type="button" className="calendar-date" onClick={() => onOpenDay(date)} aria-label={`Open ${dayLabel(date)}`}>
          {fromIso(date).getDate()}
        </button>
        {busy.length > 0 && (
          <span className="calendar-busy" title={busy.map((b) => `${b.name} has ${b.n} due`).join('. ')}>
            <Warning size={13} weight="bold" aria-hidden="true" />
            <span className="sr-only">{busy.map((b) => `${b.name} has ${b.n} due`).join('. ')}</span>
          </span>
        )}
        {tasks.length > 0 && (
          <span className={`calendar-count${tasks.some((t) => isLate(t)) ? ' is-late' : ''}`} aria-hidden="true">
            {tasks.length}
          </span>
        )}
      </div>
      {holidays.length > 0 && <p className="calendar-holiday">{holidays.join(', ')}</p>}
      {busy.length > 0 && full && <p className="calendar-busy-text">{busy.map((b) => `${b.name}: ${b.n} due`).join(', ')}</p>}
      <ul className="calendar-chips">
        {shown.map((t) => (
          <Chip key={t.id} task={t} draggable={isAdmin && t.status !== 'done'} dayOff={onDayOff(t)} href={linkFor(t)} />
        ))}
      </ul>
      {!full && tasks.length > SHOWN && (
        <button type="button" className="calendar-more" onClick={() => onOpenDay(date)}>
          {tasks.length - SHOWN} more
        </button>
      )}
    </section>
  );
}

function Chip({ task, draggable, dayOff, href }: { task: Task; draggable: boolean; dayOff: boolean; href: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !draggable });
  const late = isLate(task);
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`calendar-chip${late ? ' is-late' : ''}${task.status === 'done' ? ' is-done' : ''}${isDragging ? ' is-dragging' : ''}${draggable ? ' is-draggable' : ''}`}
      {...(draggable ? { ...listeners, ...attributes, 'aria-roledescription': 'Draggable task', 'aria-label': `${task.title}. Press space to move its deadline.` } : {})}
    >
      <i className={`project-swatch line-${task.project.colourIndex % 8}`} aria-hidden="true" />
      <Link to={href} className="calendar-chip-title" title={`${task.title} · ${task.assignee.name}`}>
        {task.title}
      </Link>
      {dayOff && (
        <span className="calendar-dayoff" title="Due on a day off">
          <CalendarX size={13} weight="bold" aria-hidden="true" />
          <span className="sr-only">Due on a day off</span>
        </span>
      )}
    </li>
  );
}

function DayList({ date, byDay, overload, holidayAt, onDayOff, linkFor, isAdmin }: DayProps & { date: string }) {
  const { setNodeRef } = useDroppable({ id: date, disabled: !isAdmin });
  const tasks = byDay.get(date) ?? [];
  const busy = overload(date);
  const holidays = [...new Set(holidayAt(date).map((h) => h.name))];
  return (
    <section ref={setNodeRef} className="calendar-daylist">
      {holidays.length > 0 && <p className="calendar-holiday">Day off: {holidays.join(', ')}</p>}
      {busy.length > 0 && (
        <p className="calendar-busy-text">
          <Warning size={14} weight="bold" aria-hidden="true" /> {busy.map((b) => `${b.name} has ${b.n} due`).join('. ')}.
        </p>
      )}
      {tasks.length === 0 ? (
        <p className="panel-note">Nothing due this day.</p>
      ) : (
        <ul className="calendar-daylist-items">
          {tasks.map((t) => (
            <li key={t.id} className={isLate(t) ? 'is-late' : undefined}>
              <i className={`project-swatch line-${t.project.colourIndex % 8}`} aria-hidden="true" />
              <Link to={linkFor(t)} className="calendar-daylist-title">
                {t.title}
              </Link>
              <span className="calendar-daylist-meta">
                {t.project.name} · {t.assignee.name}
              </span>
              {onDayOff(t) && (
                <span className="calendar-dayoff" title="Due on a day off">
                  <CalendarX size={14} weight="bold" aria-hidden="true" />
                </span>
              )}
              <span className={`status-badge state-${isLate(t) ? 'overdue' : t.status} size-md`}>
                {isLate(t) ? 'Late' : t.status === 'done' ? 'Done' : t.status === 'in_progress' ? 'In progress' : 'To do'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
