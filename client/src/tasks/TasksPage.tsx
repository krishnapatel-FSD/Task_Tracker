import { ArrowLeft, ArrowRight, ArrowsClockwise, Kanban, ListBullets, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorBanner } from '../components/PageStates';
import { useToast } from '../components/Toast';
import { PRIORITIES, PRIORITY_LABELS, type CompletionNote, type Employee, type Priority, type ProjectRef, type Status, type Task, type TaskFilterValues } from '../types';
import { useProjects } from '../useProjects';
import { useTasks } from '../useTasks';
import { BoardTabs, matchesQuick, QUICK_LABELS, type QuickFilter } from './SummaryCards';
import { MyProgressCard } from '../progress/MyProgressCard';
import { KanbanBoard } from './KanbanBoard';
import { TaskList } from './TaskList';
import { TaskPanel, type PanelState } from './TaskPanel';
import { useLit } from './useLit';

const UNDO_MS = 8000;

/** "Tue 13 Oct, 14:05", ticking each minute like a board clock. */
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const day = `${now.toLocaleDateString(undefined, { weekday: 'short' })} ${String(now.getDate()).padStart(2, '0')} ${now.toLocaleDateString(undefined, { month: 'short' })}`;
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return { day, time, iso: now.toISOString() };
}

type View = 'list' | 'board';
const VIEW_KEY = 'tt-task-view';

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

/**
 * One task page for both roles. The whole team can see every task; only the admin and the
 * assignee can change one. `scope="mine"` is an employee's own list ("My tasks").
 * With `project`, the page shows only that project's tasks, in date order.
 */
export function TasksPage({ project, scope = 'all' }: { project?: ProjectRef; scope?: 'mine' | 'all' } = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const mineOnly = !isAdmin && scope === 'mine';
  // A task handed to you stays locked until you accept the handoff.
  const canChange = (task: Task) => isAdmin || (task.assignee.id === user?.id && !task.handoffPending);
  const [view, setViewState] = useState<View>(savedView);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // the choice is simply not remembered
    }
  };
  const [priority, setPriority] = useState<Priority | ''>('');
  const toast = useToast();
  const projects = useProjects();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const ownId = mineOnly ? (user?.id ?? '') : '';
  const [serverFilters, setServerFilters] = useState<TaskFilterValues>({ status: '', assigneeId: ownId, projectId: project?.id ?? '' });
  const [quick, setQuick] = useState<QuickFilter>('all');
  const [search, setSearch] = useState('');
  const [params, setParams] = useSearchParams();
  const [panel, setPanel] = useState<PanelState>(() => {
    const id = params.get('task');
    return id ? { kind: 'view', id } : { kind: 'closed' };
  });
  const { tasks, loading, error, updatingId, flashId, changeStatus, reload, flash, replaceTask, removeTask, patchTask, setError } =
    useTasks(serverFilters);
  const { lit, markSeen } = useLit();
  // Only count changes to tasks on this page (a project page or filter hides the rest).
  const litIds = useMemo(() => new Set(tasks.filter((t) => lit.has(t.id)).map((t) => t.id)), [lit, tasks]);
  const clock = useClock();

  useEffect(() => {
    api.listEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, []);

  // Links like ?task=<id> (from notifications) open that task.
  const linked = params.get('task');
  useEffect(() => {
    // Leave the panel alone when it already shows this task (viewing, editing or completing it).
    if (linked && !('id' in panel && panel.id === linked)) setPanel({ kind: 'view', id: linked });
    if (linked) markSeen(linked);
  }, [linked, lit]);

  useEffect(() => {
    if (panel.kind === 'view' && !loading) {
      document.getElementById(`task-${panel.id}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [panel, loading]);

  const setUrlTask = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('task', id);
    else next.delete('task');
    setParams(next, { replace: true });
  };

  const openTask = (task: Task) => {
    setPanel({ kind: 'view', id: task.id });
    setUrlTask(task.id);
    markSeen(task.id);
  };
  const closePanel = () => {
    setPanel({ kind: 'closed' });
    setUrlTask(null);
  };

  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          matchesQuick(t, quick, litIds) &&
          (!priority || t.priority === priority) &&
          (!needle || t.title.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle)),
      ),
    [tasks, quick, needle, litIds, priority],
  );

  const selectedId = panel.kind === 'view' || panel.kind === 'edit' || panel.kind === 'complete' || panel.kind === 'handoff' ? panel.id : null;

  // Marking a task done always asks for a note first, in the task panel.
  const requestStatus = (task: Task, status: Status) => {
    if (!canChange(task)) return;
    if (status === 'done' && task.status !== 'done') {
      setPanel({ kind: 'complete', id: task.id });
      setUrlTask(task.id);
      markSeen(task.id);
      return;
    }
    changeStatus(task, status);
  };
  const completeTask = async (task: Task, note: CompletionNote) => {
    const updated = await changeStatus(task, 'done', note);
    if (updated) {
      setPanel({ kind: 'view', id: task.id });
      toast({ message: `Marked "${task.title}" as done.` });
    }
  };
  const selectedTask = selectedId ? (tasks.find((t) => t.id === selectedId) ?? null) : null;
  const filtered =
    quick !== 'all' || needle !== '' || priority !== '' || serverFilters.assigneeId !== ownId || (!project && serverFilters.projectId !== '');

  function clearAll() {
    setQuick('all');
    setSearch('');
    setPriority('');
    setServerFilters({ status: '', assigneeId: ownId, projectId: project?.id ?? '' });
  }

  async function deleteTask(task: Task) {
    try {
      await api.deleteTask(task.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't delete that task. Try again.");
      return;
    }
    closePanel();
    removeTask(task.id);
    // No confirm dialog: it's deleted now and can be undone for a few seconds.
    toast({
      message: `Deleted "${task.title}".`,
      durationMs: UNDO_MS,
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            replaceTask(await api.restoreTask(task.id));
          } catch {
            toast({ message: "We couldn't restore that task." });
          }
        },
      },
    });
  }

  const emptyState = filtered ? (
    <EmptyState title="No tasks match.">
      <button type="button" className="btn btn-quiet" onClick={clearAll}>
        Show all tasks
      </button>
    </EmptyState>
  ) : isAdmin ? (
    <EmptyState title={project ? 'No tasks in this project yet.' : 'No tasks yet.'}>
      <p>Create the first task and assign it to someone.</p>
      <button type="button" className="btn btn-primary" onClick={() => setPanel({ kind: 'create' })}>
        <Plus size={16} weight="bold" aria-hidden="true" />
        New task
      </button>
    </EmptyState>
  ) : mineOnly ? (
    <EmptyState title="Nothing assigned to you yet.">
      <p>When your admin gives you a task, it shows up here.</p>
    </EmptyState>
  ) : (
    <EmptyState title="No tasks yet.">
      <p>Tasks the admin creates show up here for the whole team.</p>
    </EmptyState>
  );

  return (
    <div className={`tasks-layout${panel.kind !== 'closed' ? ' has-panel' : ''}`}>
      <main className="tasks-main">
        <div className={project ? 'page-head project-band' : 'page-head'}>
          <div>
            {project && (
              <Link className="back-link" to="/projects">
                <ArrowLeft size={14} weight="bold" aria-hidden="true" />
                All projects
              </Link>
            )}
            {project ? (
              <h1>
                <i className={`project-swatch line-${project.colourIndex % 8}`} aria-hidden="true" />
                {project.name}
              </h1>
            ) : (
              <h1>{mineOnly ? 'My tasks' : 'All tasks'}</h1>
            )}
            <p className="page-summary">
              {project
                ? 'Every task in this project, by date.'
                : mineOnly
                  ? 'Your work, in deadline order. The button on each task moves it forward.'
                  : isAdmin
                    ? 'Everyone’s work, in deadline order.'
                    : 'The whole team’s work. You can change the tasks assigned to you.'}
            </p>
          </div>
          <div className="page-head-side">
            <time className="board-clock" dateTime={clock.iso}>
              <span>{clock.day}</span>
              <strong>{clock.time}</strong>
            </time>
            {isAdmin && (
              <button type="button" className="btn btn-primary btn-lg" onClick={() => setPanel({ kind: 'create' })}>
                <Plus size={18} weight="bold" aria-hidden="true" />
                New task
              </button>
            )}
          </div>
        </div>

        {litIds.size > 0 && quick !== 'changed' && (
          <button type="button" className="change-bar" onClick={() => setQuick('changed')}>
            <span className="change-icon" aria-hidden="true">
              <ArrowsClockwise size={16} weight="bold" />
            </span>
            <span className="change-text">
              {litIds.size === 1 ? '1 task changed' : `${litIds.size} tasks changed`} since you last looked.
            </span>
            <span className="change-action">
              Show {litIds.size === 1 ? 'it' : 'them'}
              <ArrowRight size={14} weight="bold" aria-hidden="true" />
            </span>
          </button>
        )}

        {mineOnly && (
          <MyProgressCard
            refreshKey={tasks.map((t) => `${t.id}:${t.status}:${t.deadline}`).join(',')}
            onOpenTask={(id) => {
              setPanel({ kind: 'view', id });
              setUrlTask(id);
              markSeen(id);
            }}
          />
        )}

        <BoardTabs tasks={tasks} value={quick} litIds={litIds} onChange={setQuick} />

        <div className="toolbar">
          <label className="search">
            <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
            <span className="sr-only">Search tasks</span>
            <input type="search" placeholder="Search tasks" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {!project && projects.length > 1 && (
            <label className="toolbar-select">
              <span className="sr-only">Project</span>
              <select value={serverFilters.projectId} onChange={(e) => setServerFilters((f) => ({ ...f, projectId: e.target.value }))}>
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!mineOnly && (
            <label className="toolbar-select">
              <span className="sr-only">Person</span>
              <select value={serverFilters.assigneeId} onChange={(e) => setServerFilters((f) => ({ ...f, assigneeId: e.target.value }))}>
                <option value="">Everyone</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="toolbar-select">
            <span className="sr-only">Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}>
              <option value="">Any priority</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]} priority
                </option>
              ))}
            </select>
          </label>
          <div className="view-switch" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
              <ListBullets size={16} weight="bold" aria-hidden="true" />
              List
            </button>
            <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')}>
              <Kanban size={16} weight="bold" aria-hidden="true" />
              Board
            </button>
          </div>
          {filtered && (
            <button type="button" className="btn btn-link" onClick={clearAll}>
              <X size={14} weight="bold" aria-hidden="true" />
              Clear filters
            </button>
          )}
        </div>

        {quick !== 'all' && (
          <p className="filter-note" aria-live="polite">
            Showing {visible.length} {QUICK_LABELS[quick].toLowerCase()} task{visible.length === 1 ? '' : 's'}.
          </p>
        )}

        {error && <ErrorBanner message={error} onRetry={reload} />}

        {view === 'board' ? (
          <KanbanBoard
            tasks={visible}
            loading={loading}
            showAssignee={!mineOnly}
            lit={lit}
            employeeIds={employees.map((e) => e.id)}
            selectedId={selectedId}
            updatingId={updatingId}
            canChange={canChange}
            onOpen={openTask}
            onStatusChange={requestStatus}
            empty={emptyState}
          />
        ) : (
          <TaskList
            tasks={visible}
            loading={loading}
            grouped={quick === 'all' && !needle}
            showAssignee={!mineOnly}
            byProject={Boolean(project)}
            lit={lit}
            employeeIds={employees.map((e) => e.id)}
            selectedId={selectedId}
            updatingId={updatingId}
            flashId={flashId}
            canChange={canChange}
            meId={user?.id}
            onOpen={openTask}
            onStatusChange={requestStatus}
            empty={emptyState}
          />
        )}
      </main>

      <TaskPanel
        state={panel}
        task={selectedTask}
        isAdmin={isAdmin}
        canChange={selectedTask ? canChange(selectedTask) : false}
        employees={employees}
        projects={projects}
        currentProjectId={project?.id}
        updating={selectedTask ? updatingId === selectedTask.id : false}
        onClose={closePanel}
        onEdit={(t) => setPanel({ kind: 'edit', id: t.id })}
        onCancelEdit={(t) => setPanel({ kind: 'view', id: t.id })}
        onSaved={(t, created) => {
          if (created) {
            reload();
            flash(t.id);
          } else {
            replaceTask(t);
          }
          setPanel({ kind: 'view', id: t.id });
          setUrlTask(t.id);
        }}
        onDelete={deleteTask}
        onStatusChange={requestStatus}
        onComplete={completeTask}
        onCancelComplete={(t) => setPanel({ kind: 'view', id: t.id })}
        onHandoff={(t) => setPanel({ kind: 'handoff', id: t.id })}
        onCancelHandoff={(t) => setPanel({ kind: 'view', id: t.id })}
        onHandedOff={(t) => {
          replaceTask(t);
          // On "My tasks" the task has just left your list, so close it; elsewhere keep it open.
          if (mineOnly) closePanel();
          else setPanel({ kind: 'view', id: t.id });
          toast({ message: `Handed "${t.title}" to ${t.assignee.name}. It's waiting for them to accept.` });
        }}
        onAccepted={(t) => {
          replaceTask(t);
          toast({ message: `"${t.title}" is yours now.` });
        }}
        onPatch={patchTask}
      />
    </div>
  );
}
