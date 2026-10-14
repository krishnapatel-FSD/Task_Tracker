import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { EmptyState, ErrorBanner } from '../components/PageStates';
import { formatMinutes } from '../format';
import type { ProgressReport } from '../types';
import { useProjects } from '../useProjects';
import { MonthPicker, ProgressLegend, ProgressRow, useMonth } from './ProgressRow';

/** Admin: every employee's month at a glance, people with late work first. */
export function TeamProgressPage() {
  const navigate = useNavigate();
  const projects = useProjects();
  const month = useMonth();
  const [projectId, setProjectId] = useState('');
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setError(null);
    api
      .getProgress({ from: month.from, to: month.to, projectId: projectId || undefined })
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "We couldn't load progress."));
  }, [month.from, month.to, projectId]);

  useEffect(load, [load]);

  const people = useMemo(
    () => [...(report?.people ?? [])].sort((a, b) => b.late - a.late || (a.percentDone ?? 101) - (b.percentDone ?? 101) || a.name.localeCompare(b.name)),
    [report],
  );
  const totals = useMemo(() => {
    const due = people.reduce((n, p) => n + p.total, 0);
    const done = people.reduce((n, p) => n + p.done + p.doneLate, 0);
    return {
      due,
      percent: due === 0 ? null : Math.round((done / due) * 100),
      late: people.reduce((n, p) => n + p.late, 0),
      minutes: people.reduce((n, p) => n + p.minutesLogged, 0),
    };
  }, [people]);

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className="page page-wide progress-page">
      <div className="page-head">
        <div>
          <h1>Team progress</h1>
          <p className="page-summary">Each block is a task due this month. People with late work are listed first.</p>
        </div>
      </div>

      <div className="calendar-bar">
        <MonthPicker label={month.label} isCurrent={month.isCurrent} step={month.step} />
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
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {report && (
        <p className="progress-team-line">
          <strong>{totals.percent === null ? 'Nothing due' : `${totals.percent}% done`}</strong>
          <span>{totals.due} tasks due</span>
          {totals.late > 0 && <span className="chip-late">{totals.late} late</span>}
          <span>{formatMinutes(totals.minutes)} logged</span>
        </p>
      )}

      {!report && !error && <p className="panel-note">Loading progress…</p>}
      {report && people.length === 0 && (
        <EmptyState title="No employees yet.">
          <p>Progress shows up here once tasks are assigned.</p>
        </EmptyState>
      )}
      {people.length > 0 && (
        <ul className="progress-list">
          {people.map((p) => (
            <ProgressRow
              key={p.id}
              person={p}
              title={p.name}
              expanded={open.has(p.id)}
              onToggle={() => toggle(p.id)}
              onOpenTask={(id) => navigate(`/admin/tasks?task=${id}`)}
            />
          ))}
        </ul>
      )}
      <ProgressLegend />
    </main>
  );
}
