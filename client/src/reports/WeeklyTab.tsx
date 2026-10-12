import { DownloadSimple, Printer } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, downloadFile, reportsApi } from '../api';
import { ErrorBanner } from '../components/PageStates';
import { formatDateTime, formatDay } from '../format';
import { days, pct } from './parts';
import type { EmployeeRow, Metrics, ProjectRow } from './types';

interface WeekListItem {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  status: 'ready' | 'failed';
  completed: number | null;
  overdue: number | null;
}

interface Snapshot {
  weekStart: string;
  weekEnd: string;
  kpis: { current: Metrics; previous: Metrics };
  completed: { project: string; tasks: { title: string; assignee: string; completedOn: string; onTime: boolean }[] }[];
  slipped: { title: string; assignee: string; project: string; deadline: string; stillOpen: boolean }[];
  comingUp: { assignee: string; tasks: { title: string; project: string; deadline: string; priority: string }[] }[];
  employees: EmployeeRow[];
  projects: ProjectRow[];
  notable: { kind: 'reassigned' | 'deadline_moved'; title: string; actor: string; detail: string; at: string }[];
}

interface WeeklyReport {
  weekStart: string;
  generatedAt: string;
  generatedBy: string | null;
  status: 'ready' | 'failed';
  data: Snapshot;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Mondays of the last eight weeks, most recent first (this week included). */
function recentMondays() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 8 }, (_, i) => iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * i)));
}

const range = (from: string, to: string) => `${formatDay(from)} to ${formatDay(to)}`;

export function WeeklyTab() {
  const [params, setParams] = useSearchParams();
  const [weeks, setWeeks] = useState<WeekListItem[] | null>(null);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const mondays = recentMondays();
  const [toGenerate, setToGenerate] = useState(mondays[1]);
  const selected = params.get('week') ?? weeks?.[0]?.weekStart ?? null;

  const loadList = useCallback(async () => {
    try {
      setWeeks(await reportsApi.listWeekly<WeekListItem[]>());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't load the weekly reports.");
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selected) return;
    setReport(null);
    reportsApi
      .getWeekly<WeeklyReport>(selected)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "We couldn't load that report."));
  }, [selected]);

  const select = (weekStart: string) => {
    const next = new URLSearchParams(params);
    next.set('week', weekStart);
    setParams(next);
  };

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      await reportsApi.generateWeekly(toGenerate);
      await loadList();
      select(toGenerate);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generating the report failed.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="weekly">
      <aside className="weekly-side">
        <div className="weekly-generate">
          <label className="field">
            <span className="field-label">Generate a report</span>
            <select value={toGenerate} onChange={(e) => setToGenerate(e.target.value)}>
              {mondays.map((m, i) => (
                <option key={m} value={m}>
                  Week of {formatDay(m)}
                  {i === 0 ? ' (so far)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary btn-small" onClick={generate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate now'}
          </button>
          <p className="kpi-note">Reports are also generated automatically every Monday at 08:00 for the week before.</p>
        </div>

        <h2 className="tt-group-title">Saved weeks</h2>
        {weeks && weeks.length === 0 && <p className="panel-note">No reports yet. Generate one above.</p>}
        <ul className="week-list">
          {weeks?.map((w) => (
            <li key={w.weekStart}>
              <button type="button" className={`week-item${w.weekStart === selected ? ' is-selected' : ''}`} onClick={() => select(w.weekStart)} aria-current={w.weekStart === selected}>
                <span className="week-range">{range(w.weekStart, w.weekEnd)}</span>
                <span className="week-meta">
                  {w.status === 'failed' ? 'Failed, generate again' : `${w.completed ?? 0} completed, ${w.overdue ?? 0} overdue`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="weekly-main">
        {error && <ErrorBanner message={error} />}
        {!selected && weeks && <p className="panel-note">Choose or generate a week to read its report.</p>}
        {selected && !report && !error && <p className="panel-note">Loading report…</p>}
        {report && report.status === 'failed' && <ErrorBanner message="This report failed to generate. Generate it again." />}
        {report && report.status === 'ready' && <Bulletin report={report} />}
      </div>
    </div>
  );
}

function Bulletin({ report }: { report: WeeklyReport }) {
  const s = report.data;
  const c = s.kpis.current;
  const p = s.kpis.previous;
  const [busy, setBusy] = useState(false);

  const kpis = [
    { label: 'Completed', value: String(c.completed), was: String(p.completed) },
    { label: 'On time', value: pct(c.onTimeRate), was: pct(p.onTimeRate) },
    { label: 'Open at week end', value: String(c.open), was: String(p.open) },
    { label: 'Overdue at week end', value: String(c.overdue), was: String(p.overdue), late: c.overdue > 0 },
    { label: 'Avg cycle time', value: days(c.avgCycleDays), was: days(p.avgCycleDays) },
  ];

  return (
    <article className="bulletin">
      <header className="bulletin-head">
        <div>
          <h2 className="bulletin-title">Week of {range(s.weekStart, s.weekEnd)}</h2>
          <p className="kpi-note">
            Snapshot taken {formatDateTime(report.generatedAt)}
            {report.generatedBy ? ' (generated by hand)' : ' (scheduled)'}. Later edits to tasks don't change it.
          </p>
        </div>
        <div className="bulletin-tools no-print">
          <button
            type="button"
            className="btn btn-quiet btn-small"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await downloadFile(`/reports/weekly/${s.weekStart}/export.csv`, `weekly-report-${s.weekStart}.csv`).catch(() => {});
              setBusy(false);
            }}
          >
            <DownloadSimple size={14} weight="bold" aria-hidden="true" />
            CSV
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => window.print()}>
            <Printer size={14} weight="bold" aria-hidden="true" />
            Print or save as PDF
          </button>
        </div>
      </header>

      <dl className="bulletin-kpis">
        {kpis.map((k) => (
          <div key={k.label}>
            <dt>{k.label}</dt>
            <dd className={k.late ? 'is-late' : undefined}>{k.value}</dd>
            <dd className="bulletin-was">Week before: {k.was}</dd>
          </div>
        ))}
      </dl>

      <section className="bulletin-section">
        <h3>Completed this week</h3>
        {s.completed.length === 0 ? (
          <p className="panel-note">Nothing was completed.</p>
        ) : (
          s.completed.map((g) => (
            <div key={g.project} className="bulletin-group">
              <h4>{g.project}</h4>
              <ul>
                {g.tasks.map((t, i) => (
                  <li key={i}>
                    <span>{t.title}</span>
                    <span className="bulletin-aside">
                      {t.assignee}, {formatDay(t.completedOn)}
                      {t.onTime ? '' : <strong className="text-late">, late</strong>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="bulletin-section">
        <h3>Slipped this week</h3>
        {s.slipped.length === 0 ? (
          <p className="panel-note">No task passed its deadline unfinished.</p>
        ) : (
          <ul>
            {s.slipped.map((t, i) => (
              <li key={i}>
                <span>{t.title}</span>
                <span className="bulletin-aside">
                  {t.assignee}, {t.project}, due {formatDay(t.deadline)}
                  {t.stillOpen ? ', still open' : ', finished late'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bulletin-section">
        <h3>Coming up next week</h3>
        {s.comingUp.length === 0 ? (
          <p className="panel-note">Nothing is due next week.</p>
        ) : (
          s.comingUp.map((person) => (
            <div key={person.assignee} className="bulletin-group">
              <h4>{person.assignee}</h4>
              <ul>
                {person.tasks.map((t, i) => (
                  <li key={i}>
                    <span>{t.title}</span>
                    <span className="bulletin-aside">
                      {t.project}, {formatDay(t.deadline)}
                      {t.priority === 'high' ? ', high priority' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="bulletin-section bulletin-tables">
        <div>
          <h3>By employee</h3>
          <SnapshotTable rows={s.employees.map((r) => ({ ...r, label: r.name }))} />
        </div>
        <div>
          <h3>By project</h3>
          <SnapshotTable rows={s.projects.map((r) => ({ ...r, label: r.name }))} />
        </div>
      </section>

      <section className="bulletin-section">
        <h3>Notable changes</h3>
        {s.notable.length === 0 ? (
          <p className="panel-note">No reassignments or deadline moves.</p>
        ) : (
          <ul>
            {s.notable.map((n, i) => (
              <li key={i}>
                <span>
                  {n.title}: {n.kind === 'reassigned' ? 'moved from' : 'deadline moved from'} {n.detail}
                </span>
                <span className="bulletin-aside">by {n.actor}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function SnapshotTable({ rows }: { rows: (Metrics & { id: string; label: string })[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th className="num">Completed</th>
          <th className="num">On time</th>
          <th className="num">Open</th>
          <th className="num">Overdue</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.label}</td>
            <td className="num">{r.completed}</td>
            <td className="num">{pct(r.onTimeRate)}</td>
            <td className="num">{r.open}</td>
            <td className={`num${r.overdue ? ' text-late' : ''}`}>{r.overdue}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
