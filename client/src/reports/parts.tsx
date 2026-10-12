import { ArrowDownRight, ArrowUpRight, Minus } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatDay } from '../format';
import type { Metrics, OverdueRow, Summary } from './types';

// ---- Formatting ----------------------------------------------------------------

export const pct = (r: number | null) => (r === null ? 'No data' : `${Math.round(r * 100)}%`);
export const days = (d: number | null) => (d === null ? 'No data' : `${d < 10 ? d.toFixed(1) : Math.round(d)} d`);

// ---- KPI strip -------------------------------------------------------------------

type Direction = 'up-good' | 'down-good' | 'neutral';

const KPIS: { key: keyof Metrics; label: string; format: (m: Metrics) => string; direction: Direction; unit?: 'pct' | 'days' }[] = [
  { key: 'open', label: 'Open', format: (m) => String(m.open), direction: 'neutral' },
  { key: 'overdue', label: 'Overdue', format: (m) => String(m.overdue), direction: 'down-good' },
  { key: 'completed', label: 'Completed', format: (m) => String(m.completed), direction: 'up-good' },
  { key: 'onTimeRate', label: 'On time', format: (m) => pct(m.onTimeRate), direction: 'up-good', unit: 'pct' },
  { key: 'avgCycleDays', label: 'Avg cycle time', format: (m) => days(m.avgCycleDays), direction: 'down-good', unit: 'days' },
];

function Delta({ current, previous, direction, unit }: { current: number | null; previous: number | null; direction: Direction; unit?: 'pct' | 'days' }) {
  if (current === null || previous === null) return <span className="kpi-delta">No earlier data</span>;
  const diff = current - previous;
  const shown = unit === 'pct' ? `${Math.round(Math.abs(diff) * 100)} pts` : unit === 'days' ? `${Math.abs(diff).toFixed(1)} d` : String(Math.abs(diff));
  if (Math.abs(diff) < (unit === 'pct' ? 0.005 : unit === 'days' ? 0.05 : 1)) {
    return (
      <span className="kpi-delta">
        <Minus size={12} weight="bold" aria-hidden="true" /> Same as before
      </span>
    );
  }
  const up = diff > 0;
  const tone = direction === 'neutral' ? '' : (up ? direction === 'up-good' : direction === 'down-good') ? ' is-good' : ' is-bad';
  return (
    <span className={`kpi-delta${tone}`}>
      {up ? <ArrowUpRight size={12} weight="bold" aria-hidden="true" /> : <ArrowDownRight size={12} weight="bold" aria-hidden="true" />}
      {up ? 'Up' : 'Down'} {shown}
    </span>
  );
}

export function KpiStrip({ summary, dimmed }: { summary: Summary; dimmed?: boolean }) {
  const { current, previous, range, timeInProgress } = summary;
  return (
    <section className={`kpi-strip${dimmed ? ' is-refreshing' : ''}`} aria-label="Key numbers">
      <ul>
        {KPIS.map((k) => (
          <li key={k.key}>
            <span className="kpi-label">{k.label}</span>
            <span className={`kpi-value${k.key === 'overdue' && current.overdue > 0 ? ' is-late' : ''}`}>{k.format(current)}</span>
            <Delta current={current[k.key] as number | null} previous={previous[k.key] as number | null} direction={k.direction} unit={k.unit} />
          </li>
        ))}
      </ul>
      <p className="kpi-note">
        Compared with {formatDay(range.previousFrom)} to {formatDay(range.previousTo)}. Open and overdue are counted on{' '}
        {formatDay(range.measuredOn)}.
        {timeInProgress.avgDays !== null && (
          <>
            {' '}
            Average time in progress: {days(timeInProgress.avgDays)} across {timeInProgress.sample} task
            {timeInProgress.sample === 1 ? '' : 's'}
            {timeInProgress.historySince && <> (status history since {formatDay(timeInProgress.historySince)})</>}.
          </>
        )}
      </p>
    </section>
  );
}

// ---- Sortable table ----------------------------------------------------------------

export interface Column<T> {
  key: string;
  label: string;
  numeric?: boolean;
  sortValue: (row: T) => number | string | null;
  render: (row: T) => ReactNode;
}

export function SortableTable<T extends { id: string }>({
  columns,
  rows,
  initialSort,
  onRowClick,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  initialSort: string;
  onRowClick?: (row: T) => void;
  caption: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: initialSort, dir: 'desc' });
  const col = columns.find((c) => c.key === sort.key) ?? columns[0];
  const sorted = [...rows].sort((a, b) => {
    const av = col.sortValue(a);
    const bv = col.sortValue(b);
    // Rows with no value always sink to the bottom.
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  return (
    <div className="table-wrap">
      <table className="data-table report-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.numeric ? 'num' : undefined} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                <button
                  type="button"
                  className="sort-button"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === 'desc' ? 'asc' : c.numeric ? 'desc' : 'asc' }))}
                >
                  {c.label}
                  {sort.key === c.key && <span aria-hidden="true">{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id} className={onRowClick ? 'is-clickable' : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c, i) => (
                <td key={c.key} className={c.numeric ? 'num' : undefined}>
                  {i === 0 && onRowClick ? (
                    <button
                      type="button"
                      className="row-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowClick(row);
                      }}
                    >
                      {c.render(row)}
                    </button>
                  ) : (
                    c.render(row)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Overdue list ------------------------------------------------------------------

export function OverdueList({ rows, dimmed }: { rows: OverdueRow[]; dimmed?: boolean }) {
  return (
    <section className={`chart-card${dimmed ? ' is-refreshing' : ''}`} aria-labelledby="overdue-title">
      <div className="chart-head">
        <div>
          <h2 id="overdue-title" className="chart-title">
            Most overdue
          </h2>
          <p className="chart-summary">{rows.length === 0 ? 'Nothing is overdue.' : `The ${rows.length} longest-waiting open tasks.`}</p>
        </div>
      </div>
      {rows.length > 0 && (
        <ol className="overdue-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/admin/tasks?task=${r.id}`} className="overdue-title">
                {r.title}
              </Link>
              <span className="overdue-meta">
                {r.assigneeName}, {r.projectName}
              </span>
              <span className="overdue-late">
                {r.daysLate} day{r.daysLate === 1 ? '' : 's'} late
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
