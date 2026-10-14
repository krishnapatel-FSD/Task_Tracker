import { ArrowRight, ArrowsClockwise, CalendarCheck, CaretRight, MagnifyingGlass, Warning, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorBanner } from '../components/PageStates';
import { useUnread } from '../notifications';
import { boardDateText } from '../tasks/bits';
import { useClock } from '../tasks/TasksPage';
import { todayIso } from '../timetable';
import type { ProjectBoardRow } from '../types';

type CardFilter = 'all' | 'late' | 'changed';

/** The home page for both roles: one card per project, each with a Go button into its tasks. */
export function ProjectsHome() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { count: unread } = useUnread();
  const [rows, setRows] = useState<ProjectBoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CardFilter>('all');
  const [search, setSearch] = useState('');
  const clock = useClock();

  const load = () =>
    api
      .listProjectBoard()
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "We couldn't load your projects. Try again."));

  // Reload when notifications change, so the "changed" marks stay current.
  useEffect(() => {
    load();
  }, [unread]);

  const all = rows ?? [];
  const lateCount = all.filter((p) => p.lateTasks > 0).length;
  const changedProjects = all.filter((p) => p.changedTasks > 0);
  const changedTasks = changedProjects.reduce((n, p) => n + p.changedTasks, 0);

  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      all.filter(
        (p) =>
          (filter === 'all' || (filter === 'late' ? p.lateTasks > 0 : p.changedTasks > 0)) &&
          (!needle || p.name.toLowerCase().includes(needle) || (p.description ?? '').toLowerCase().includes(needle)),
      ),
    [all, filter, needle],
  );
  const filtered = filter !== 'all' || needle !== '';
  const clear = () => {
    setFilter('all');
    setSearch('');
  };

  const tabs: { key: CardFilter; label: string; count: number; hidden?: boolean }[] = [
    { key: 'all', label: 'All projects', count: all.length },
    { key: 'late', label: 'Has late work', count: lateCount },
    { key: 'changed', label: 'Changed', count: changedProjects.length, hidden: changedProjects.length === 0 },
  ];

  return (
    <main className="page page-wide projects-home">
      <div className="page-head">
        <div>
          <h1 className="title-with-count">
            Projects
            {rows !== null && <span className="page-count">{all.length} total</span>}
          </h1>
          <p className="page-summary">
            Pick a project to see its tasks by date.
          </p>
        </div>
        <div className="page-head-side">
          <time className="board-clock" dateTime={clock.iso}>
            <span>{clock.day}</span>
            <strong>{clock.time}</strong>
          </time>
          {isAdmin && (
            <Link className="btn btn-quiet projects-manage" to="/admin/projects">
              Manage projects
            </Link>
          )}
        </div>
      </div>

      {changedTasks > 0 && filter !== 'changed' && (
        <button type="button" className="change-bar" onClick={() => setFilter('changed')}>
          <span className="change-icon" aria-hidden="true">
            <ArrowsClockwise size={16} weight="bold" />
          </span>
          <span className="change-text">
            {changedTasks === 1 ? '1 task changed' : `${changedTasks} tasks changed`} in{' '}
            {changedProjects.length === 1 ? '1 project' : `${changedProjects.length} projects`} since you last looked.
          </span>
          <span className="change-action">
            Show {changedProjects.length === 1 ? 'it' : 'them'}
            <ArrowRight size={14} weight="bold" aria-hidden="true" />
          </span>
        </button>
      )}

      <div className="board-tabs" role="group" aria-label="Show projects">
        {tabs
          .filter((t) => !t.hidden)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={filter === t.key}
              className={`board-tab${filter === t.key ? ' is-active' : ''}${t.count === 0 ? ' is-zero' : ''}${t.key === 'late' ? ' tab-overdue' : ''}${t.key === 'changed' ? ' tab-changed' : ''}`}
              onClick={() => setFilter(t.key)}
            >
              <span className="board-tab-label">{t.label}</span>
              <span className="board-tab-count">{t.count}</span>
            </button>
          ))}
      </div>

      {all.length > 3 && (
        <div className="toolbar">
          <label className="search">
            <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
            <span className="sr-only">Search projects</span>
            <input type="search" placeholder="Search projects" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {filtered && (
            <button type="button" className="btn btn-link" onClick={clear}>
              <X size={14} weight="bold" aria-hidden="true" />
              Clear filters
            </button>
          )}
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={load} />}

      {rows === null && !error ? (
        <ul className="project-grid is-skeleton" aria-busy="true" aria-label="Loading projects">
          {[0, 1, 2].map((i) => (
            <li key={i} className="project-card">
              <span className="sk sk-title" />
              <span className="sk sk-line" />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 && rows !== null ? (
        filtered ? (
          <EmptyState title="No projects match.">
            <button type="button" className="btn btn-quiet" onClick={clear}>
              Show all projects
            </button>
          </EmptyState>
        ) : isAdmin ? (
          <EmptyState title="No projects yet.">
            <p>Create a project first, then add tasks to it.</p>
            <Link className="btn btn-primary" to="/admin/projects">
              Create a project
            </Link>
          </EmptyState>
        ) : (
          <EmptyState title="Nothing assigned to you yet.">
            <p>When your admin gives you a task, its project shows up here.</p>
          </EmptyState>
        )
      ) : (
        <ul className="project-grid">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </ul>
      )}
    </main>
  );
}

function ProjectCard({ project: p }: { project: ProjectBoardRow }) {
  const today = todayIso();
  const nextLate = p.nextDeadline !== null && p.nextDeadline < today;
  const total = p.openTasks + p.doneTasks;
  const pct = total === 0 ? 0 : Math.round((p.doneTasks / total) * 100);
  return (
    <li className={`project-card${p.changedTasks > 0 ? ' is-lit' : ''}`}>
      <div className="project-card-head">
        <div className="project-card-title">
          <i className={`project-swatch line-${p.colourIndex % 8}`} aria-hidden="true" />
          <h2 className="project-card-name">
            <Link to={`/projects/${p.id}`} state={{ project: p }}>
              {p.name}
            </Link>
          </h2>
        </div>
        <div className="project-card-tags">
          {p.changedTasks > 0 && <span className="lit-tag">{p.changedTasks} new</span>}
          {p.lateTasks > 0 && <span className="chip-late">{p.lateTasks} late</span>}
          <CaretRight size={16} weight="bold" aria-hidden="true" />
        </div>
      </div>

      {p.description && <p className="project-card-desc">{p.description}</p>}

      <div className="project-progress">
        <div className="project-progress-line">
          <span>
            {p.openTasks} open · {p.doneTasks} done{p.dueToday > 0 ? ` · ${p.dueToday} due today` : ''}
          </span>
          <strong>{pct}%</strong>
        </div>
        <div className="project-progress-bar" role="img" aria-label={`${pct}% done`}>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="project-card-foot">
        <span className={`project-card-when${nextLate ? ' is-late' : ''}`}>
          {nextLate ? <Warning size={15} weight="bold" aria-hidden="true" /> : <CalendarCheck size={15} weight="bold" aria-hidden="true" />}
          {p.nextDeadline
            ? `${nextLate ? 'Late since' : 'Next due'} ${boardDateText(p.nextDeadline)}`
            : p.totalTasks === 0
              ? 'No tasks yet'
              : 'All done'}
        </span>
        <span className={`project-card-state${p.lateTasks > 0 ? ' is-late' : ''}`}>{p.lateTasks > 0 ? 'Overdue' : p.openTasks > 0 ? 'Active' : 'Quiet'}</span>
      </div>
    </li>
  );
}
