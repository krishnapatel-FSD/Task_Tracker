import { ArrowLeft, DownloadSimple } from '@phosphor-icons/react';
import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, exportCsv, type ReportParams } from '../api';
import { ErrorBanner } from '../components/PageStates';
import { timeAgo } from '../format';
import type { Employee, ProjectRef } from '../types';
import { useProjects } from '../useProjects';
import { OnTimeTrend, StatusChart, ThroughputChart } from './charts';
import { days, KpiStrip, OverdueList, pct, SortableTable, type Column } from './parts';
import type { ActivityRow, EmployeeRow, OverdueRow, ProjectRow, StatusRow, Summary, ThroughputWeek } from './types';
import { PRESET_LABELS, useReport, useReportState, type RangePreset, type ReportTab } from './useReportState';
import { WeeklyTab } from './WeeklyTab';

const TABS: { key: ReportTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'projects', label: 'By project' },
  { key: 'employees', label: 'By employee' },
  { key: 'weekly', label: 'Weekly' },
];

export default function ReportsPage() {
  const state = useReportState();
  const projects = useProjects();
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    api.listEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, []);

  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="page-summary">Tasks, completions and deadlines across projects and people.</p>
        </div>
      </div>

      <div className="tabs report-tabs" role="tablist" aria-label="Report views">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className="tab"
            aria-selected={state.tab === t.key}
            onClick={() => state.update({ tab: t.key === 'overview' ? null : t.key, focus: null })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {state.tab === 'weekly' ? (
        <WeeklyTab />
      ) : (
        <>
          <FilterBar state={state} projects={projects} employees={employees} />
          {state.tab === 'overview' && <Overview filters={state.filters} />}
          {state.tab === 'projects' &&
            (state.focus ? (
              <ProjectDetail id={state.focus} filters={state.filters} projects={projects} onBack={() => state.update({ focus: null })} />
            ) : (
              <ProjectsTab filters={state.filters} onOpen={(id) => state.update({ focus: id })} />
            ))}
          {state.tab === 'employees' &&
            (state.focus ? (
              <EmployeeDetail id={state.focus} filters={state.filters} employees={employees} onBack={() => state.update({ focus: null })} />
            ) : (
              <EmployeesTab filters={state.filters} employees={employees} onOpen={(id) => state.update({ focus: id })} />
            ))}
        </>
      )}
    </main>
  );
}

// ---- One filter row above everything it scopes -----------------------------------

function FilterBar({ state, projects, employees }: { state: ReturnType<typeof useReportState>; projects: ProjectRef[]; employees: Employee[] }) {
  const presets = Object.entries(PRESET_LABELS) as [Exclude<RangePreset, 'custom'>, string][];
  return (
    <div className="filters report-filters">
      <fieldset className="filter">
        <legend className="sr-only">Date range</legend>
        <div className="segmented">
          {[...presets, ['custom', 'Custom'] as const].map(([key, label]) => (
            <label key={key} className="segment">
              <input
                type="radio"
                name="range"
                checked={state.preset === key}
                onChange={() => state.update(key === 'custom' ? { range: 'custom', from: state.from, to: state.to } : { range: key, from: null, to: null })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.preset === 'custom' && (
        <div className="date-range">
          <label>
            <span className="sr-only">From</span>
            <input type="date" value={state.from} max={state.to} onChange={(e) => e.target.value && state.update({ from: e.target.value })} />
          </label>
          <span aria-hidden="true">to</span>
          <label>
            <span className="sr-only">To</span>
            <input type="date" value={state.to} min={state.from} onChange={(e) => e.target.value && state.update({ to: e.target.value })} />
          </label>
        </div>
      )}

      {!(state.tab === 'projects' && state.focus) && (
        <label className="filter filter-select">
          <span className="sr-only">Project</span>
          <select value={state.projectId} onChange={(e) => state.update({ projectId: e.target.value })}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {!(state.tab === 'employees' && state.focus) && (
        <label className="filter filter-select">
          <span className="sr-only">Employee</span>
          <select value={state.assigneeId} onChange={(e) => state.update({ assigneeId: e.target.value })}>
            <option value="">Everyone</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

// ---- Overview ----------------------------------------------------------------------

function Overview({ filters }: { filters: ReportParams }) {
  const summary = useReport<Summary>('summary', filters);
  const throughput = useReport<ThroughputWeek[]>('throughput', filters);
  const overdue = useReport<OverdueRow[]>('overdue', filters);
  const status = useReport<StatusRow[]>('status-breakdown', { ...filters, groupBy: 'project' });
  const error = summary.error ?? throughput.error ?? overdue.error ?? status.error;

  return (
    <div className="report-body">
      {error && <ErrorBanner message={error} />}
      {summary.data ? <KpiStrip summary={summary.data} dimmed={summary.loading} /> : <div className="kpi-strip is-skeleton" />}
      <div className="report-grid">
        {throughput.data && <ThroughputChart data={throughput.data} dimmed={throughput.loading} />}
        {overdue.data && <OverdueList rows={overdue.data} dimmed={overdue.loading} />}
      </div>
      {status.data && <StatusChart title="Status by project" data={status.data} dimmed={status.loading} />}
    </div>
  );
}

// ---- Tables --------------------------------------------------------------------------

const metricColumns = <T extends EmployeeRow | ProjectRow>(): Column<T>[] => [
  { key: 'open', label: 'Open', numeric: true, sortValue: (r) => r.open, render: (r) => r.open },
  {
    key: 'overdue',
    label: 'Overdue',
    numeric: true,
    sortValue: (r) => r.overdue,
    render: (r) => <span className={r.overdue > 0 ? 'text-late' : undefined}>{r.overdue}</span>,
  },
  { key: 'completed', label: 'Completed', numeric: true, sortValue: (r) => r.completed, render: (r) => r.completed },
  { key: 'onTimeRate', label: 'On time', numeric: true, sortValue: (r) => r.onTimeRate, render: (r) => pct(r.onTimeRate) },
  { key: 'avgCycleDays', label: 'Avg cycle', numeric: true, sortValue: (r) => r.avgCycleDays, render: (r) => days(r.avgCycleDays) },
];

function ExportButton({ type, filters }: { type: 'projects' | 'employees' | 'tasks'; filters: ReportParams }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="export">
      <button
        type="button"
        className="btn btn-quiet btn-small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await exportCsv(type, filters);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Export failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <DownloadSimple size={14} weight="bold" aria-hidden="true" />
        {busy ? 'Exporting…' : 'Export CSV'}
      </button>
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}

function TableCard({ title, actions, children, dimmed }: { title: string; actions?: ReactNode; children: ReactNode; dimmed?: boolean }) {
  return (
    <section className={`chart-card${dimmed ? ' is-refreshing' : ''}`}>
      <div className="chart-head">
        <h2 className="chart-title">{title}</h2>
        <div className="chart-tools">{actions}</div>
      </div>
      {children}
    </section>
  );
}

function ProjectsTab({ filters, onOpen }: { filters: ReportParams; onOpen: (id: string) => void }) {
  const table = useReport<ProjectRow[]>('projects', filters);
  const columns: Column<ProjectRow>[] = [
    {
      key: 'name',
      label: 'Project',
      sortValue: (r) => r.name.toLowerCase(),
      render: (r) => (
        <span className="name-cell">
          <i className={`project-swatch line-${r.colourIndex % 8}`} aria-hidden="true" />
          {r.name}
          {r.archived && <span className="muted-tag">archived</span>}
        </span>
      ),
    },
    ...metricColumns<ProjectRow>(),
  ];
  return (
    <div className="report-body">
      {table.error && <ErrorBanner message={table.error} />}
      <TableCard title="Projects" dimmed={table.loading} actions={<ExportButton type="projects" filters={filters} />}>
        {table.data && <SortableTable caption="Projects" columns={columns} rows={table.data} initialSort="open" onRowClick={(r) => onOpen(r.id)} />}
      </TableCard>
    </div>
  );
}

/** Bar length is relative to the busiest person, so loads compare at a glance. */
function WorkloadBar({ w, max }: { w: EmployeeRow['workload']; max: number }) {
  const total = w.high + w.medium + w.low;
  if (total === 0) return <span className="muted">None</span>;
  return (
    <span className="workload" title={`${w.high} high, ${w.medium} medium, ${w.low} low`}>
      <span className="workload-bar" aria-hidden="true" style={{ width: `calc(7rem * ${total / Math.max(max, 1)})` }}>
        {(['high', 'medium', 'low'] as const).map((k) =>
          w[k] > 0 ? <i key={k} className={`wl-${k}`} style={{ flexGrow: w[k] }} /> : null,
        )}
      </span>
      <span className="workload-total">{total}</span>
      <span className="sr-only">
        {w.high} high, {w.medium} medium, {w.low} low priority
      </span>
    </span>
  );
}

function EmployeesTab({ filters, employees, onOpen }: { filters: ReportParams; employees: Employee[]; onOpen: (id: string) => void }) {
  const table = useReport<EmployeeRow[]>('employees', filters);
  const ids = employees.map((e) => e.id);
  const maxLoad = Math.max(0, ...(table.data ?? []).map((r) => r.workload.high + r.workload.medium + r.workload.low));
  const columns: Column<EmployeeRow>[] = [
    {
      key: 'name',
      label: 'Employee',
      sortValue: (r) => r.name.toLowerCase(),
      render: (r) => (
        <span className="name-cell">
          <i className={`line-swatch line-${Math.max(0, ids.indexOf(r.id)) % 8}`} aria-hidden="true" />
          {r.name}
        </span>
      ),
    },
    ...metricColumns<EmployeeRow>(),
    { key: 'workload', label: 'Open by priority', sortValue: (r) => r.workload.high * 100 + r.workload.medium * 10 + r.workload.low, render: (r) => <WorkloadBar w={r.workload} max={maxLoad} /> },
  ];
  return (
    <div className="report-body">
      {table.error && <ErrorBanner message={table.error} />}
      <TableCard title="Employees" dimmed={table.loading} actions={<ExportButton type="employees" filters={filters} />}>
        {table.data && <SortableTable caption="Employees" columns={columns} rows={table.data} initialSort="open" onRowClick={(r) => onOpen(r.id)} />}
      </TableCard>
      <p className="kpi-note">
        Open by priority: <i className="legend-chip wl-high" /> high <i className="legend-chip wl-medium" /> medium{' '}
        <i className="legend-chip wl-low" /> low.
      </p>
    </div>
  );
}

// ---- Detail views -------------------------------------------------------------------------

function BackLink({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button type="button" className="btn btn-link back-link" onClick={onBack}>
      <ArrowLeft size={14} weight="bold" aria-hidden="true" />
      {label}
    </button>
  );
}

function ProjectDetail({ id, filters, projects, onBack }: { id: string; filters: ReportParams; projects: ProjectRef[]; onBack: () => void }) {
  const scoped = { ...filters, projectId: id };
  const summary = useReport<Summary>('summary', scoped);
  const throughput = useReport<ThroughputWeek[]>('throughput', scoped);
  const status = useReport<StatusRow[]>('status-breakdown', { ...scoped, groupBy: 'employee' });
  const people = useReport<EmployeeRow[]>('employees', scoped);
  const name = projects.find((p) => p.id === id)?.name ?? 'Project';
  const contributors = people.data?.filter((p) => p.open + p.completed + p.created > 0) ?? [];

  return (
    <div className="report-body">
      <BackLink onBack={onBack} label="All projects" />
      <h2 className="detail-title">{name}</h2>
      {summary.data && <KpiStrip summary={summary.data} dimmed={summary.loading} />}
      <div className="report-grid">
        {throughput.data && <ThroughputChart data={throughput.data} dimmed={throughput.loading} />}
        {status.data && <StatusChart title="Status by person" data={status.data} dimmed={status.loading} />}
      </div>
      <TableCard title="Who worked on it" dimmed={people.loading} actions={<ExportButton type="tasks" filters={scoped} />}>
        {people.data && (
          <SortableTable
            caption={`People on ${name}`}
            columns={[{ key: 'name', label: 'Employee', sortValue: (r) => r.name.toLowerCase(), render: (r) => r.name }, ...metricColumns<EmployeeRow>()]}
            rows={contributors}
            initialSort="completed"
          />
        )}
      </TableCard>
    </div>
  );
}

const ACTIVITY_TEXT: Record<string, (a: ActivityRow) => string> = {
  created: (a) => `created "${a.taskTitle}"`,
  updated: (a) => `edited "${a.taskTitle}"`,
  reassigned: (a) => `reassigned "${a.taskTitle}"`,
  status_changed: (a) => `set "${a.taskTitle}" to ${({ todo: 'To do', in_progress: 'In progress', done: 'Done' } as Record<string, string>)[a.data.to] ?? a.data.to}`,
  archived: (a) => `deleted "${a.taskTitle}"`,
  restored: (a) => `restored "${a.taskTitle}"`,
  attachment_added: (a) => `added ${a.data.fileName} to "${a.taskTitle}"`,
  attachment_removed: (a) => `removed ${a.data.fileName} from "${a.taskTitle}"`,
};

function EmployeeDetail({ id, filters, employees, onBack }: { id: string; filters: ReportParams; employees: Employee[]; onBack: () => void }) {
  const scoped = { ...filters, assigneeId: id };
  const summary = useReport<Summary>('summary', scoped);
  const throughput = useReport<ThroughputWeek[]>('throughput', scoped);
  const byProject = useReport<StatusRow[]>('status-breakdown', { ...scoped, groupBy: 'project' });
  const activity = useReport<ActivityRow[]>('activity', scoped);
  const name = employees.find((e) => e.id === id)?.name ?? 'Employee';

  return (
    <div className="report-body">
      <BackLink onBack={onBack} label="All employees" />
      <h2 className="detail-title">{name}</h2>
      {summary.data && <KpiStrip summary={summary.data} dimmed={summary.loading} />}
      <div className="report-grid">
        {throughput.data && <ThroughputChart data={throughput.data} dimmed={throughput.loading} />}
        {throughput.data && <OnTimeTrend data={throughput.data} dimmed={throughput.loading} />}
      </div>
      <div className="report-grid">
        {byProject.data && <StatusChart title="Work by project" data={byProject.data} dimmed={byProject.loading} />}
        <section className={`chart-card${activity.loading ? ' is-refreshing' : ''}`} aria-labelledby="activity-title">
          <div className="chart-head">
            <h2 id="activity-title" className="chart-title">
              Recent activity
            </h2>
          </div>
          {activity.data && activity.data.length === 0 && <p className="panel-note">Nothing in this range.</p>}
          {activity.data && activity.data.length > 0 && (
            <ol className="timeline">
              {activity.data.map((a) => (
                <li key={a.id}>
                  <span className="timeline-text">
                    <strong>{a.actorName}</strong> {(ACTIVITY_TEXT[a.type] ?? (() => a.type))(a)}
                  </span>
                  <time dateTime={a.createdAt}>{timeAgo(a.createdAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
