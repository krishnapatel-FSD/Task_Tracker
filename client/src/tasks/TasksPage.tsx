import { ArrowLeft, ArrowRight, ArrowsClockwise, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorBanner } from '../components/PageStates';
import { useToast } from '../components/Toast';
import type { CompletionNote, Employee, ProjectRef, Status, Task, TaskFilterValues } from '../types';
import { useProjects } from '../useProjects';
import { useTasks } from '../useTasks';
import { BoardTabs, matchesQuick, QUICK_LABELS, type QuickFilter } from './SummaryCards';
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

/**
 * One task page for both roles. Admins see everyone's work and can create, edit and delete.
 * With `project`, the page shows only that project's tasks, in date order.
 */
export function TasksPage({ project }: { project?: ProjectRef } = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const toast = useToast();
  const projects = useProjects();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [serverFilters, setServerFilters] = useState<TaskFilterValues>({ status: '', assigneeId: '', projectId: project?.id ?? '' });
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
    if (isAdmin) api.listEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, [isAdmin]);

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
          (!needle || t.title.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle)),
      ),
    [tasks, quick, needle, litIds],
  );

  const selectedId = panel.kind === 'view' || panel.kind === 'edit' || panel.kind === 'complete' ? panel.id : null;

  // Marking a task done always asks for a note first, in the task panel.
  const requestStatus = (task: Task, status: Status) => {
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
  const filtered = quick !== 'all' || needle !== '' || serverFilters.assigneeId !== '' || (!project && serverFilters.projectId !== '');

  function clearAll() {
    setQuick('all');
    setSearch('');
    setServerFilters({ status: '', assigneeId: '', projectId: project?.id ?? '' });
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
              <h1>{isAdmin ? 'All tasks' : 'My tasks'}</h1>
            )}
            <p className="page-summary">
              {project
                ? isAdmin
                  ? 'Every task in this project, by date.'
                  : 'Your tasks in this project, by date.'
                : isAdmin
                  ? 'Everyone’s work, in deadline order.'
                  : 'Your work, in deadline order. The button on each task moves it forward.'}
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
          {isAdmin && (
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

        <TaskList
          tasks={visible}
          loading={loading}
          grouped={quick === 'all' && !needle}
          showAssignee={isAdmin}
          byProject={Boolean(project)}
          lit={lit}
          employeeIds={employees.map((e) => e.id)}
          selectedId={selectedId}
          updatingId={updatingId}
          flashId={flashId}
          onOpen={openTask}
          onStatusChange={requestStatus}
          empty={
            filtered ? (
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
            ) : (
              <EmptyState title="Nothing assigned to you yet.">
                <p>When your admin gives you a task, it shows up here.</p>
              </EmptyState>
            )
          }
        />
      </main>

      <TaskPanel
        state={panel}
        task={selectedTask}
        isAdmin={isAdmin}
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
        onPatch={patchTask}
      />
    </div>
  );
}
