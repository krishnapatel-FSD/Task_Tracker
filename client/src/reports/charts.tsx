import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { StatusRow, ThroughputWeek } from './types';

// ---- Colours from the design tokens -------------------------------------------

const TOKENS = ['--surface', '--ink', '--ink-2', '--ink-3', '--rule', '--late', '--done', '--signal', '--line-0', '--progress-bar', '--todo-bar'] as const;
type Token = (typeof TOKENS)[number];

/** Reads chart colours from CSS custom properties, and again when the colour scheme changes. */
export function useChartColors() {
  const read = () => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(TOKENS.map((t) => [t, style.getPropertyValue(t).trim()])) as Record<Token, string>;
  };
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setColors(read());
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return colors;
}

// ---- Frame: title, text summary, chart / table toggle ---------------------------

interface FrameProps {
  title: string;
  /** One sentence a screen reader (and anyone skimming) gets instead of the picture. */
  summary: string;
  legend?: { label: string; color: string }[];
  table: ReactNode;
  children: ReactNode;
  dimmed?: boolean;
  actions?: ReactNode;
}

export function ChartFrame({ title, summary, legend, table, children, dimmed, actions }: FrameProps) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <section className={`chart-card${dimmed ? ' is-refreshing' : ''}`} aria-labelledby={`${id}-title`}>
      <div className="chart-head">
        <div>
          <h2 id={`${id}-title`} className="chart-title">
            {title}
          </h2>
          <p className="chart-summary">{summary}</p>
        </div>
        <div className="chart-tools">
          {actions}
          <button type="button" className="btn btn-link" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? 'View as chart' : 'View as table'}
          </button>
        </div>
      </div>
      {legend && !asTable && (
        <ul className="chart-legend" aria-hidden="true">
          {legend.map((l) => (
            <li key={l.label}>
              <i style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {asTable ? <div className="chart-table-wrap">{table}</div> : <div aria-hidden="true">{children}</div>}
    </section>
  );
}

// ---- Shared bits ----------------------------------------------------------------

const shortWeek = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

function ChartTooltip({ active, payload, label, title }: TooltipContentProps<number, string> & { title?: (label: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{title ? title(String(label)) : String(label)}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="chart-tooltip-row">
          <i style={{ background: p.color }} />
          <span>{p.name}</span>
          <strong>{typeof p.value === 'number' && String(p.dataKey).includes('Rate') ? `${Math.round(p.value)}%` : p.value}</strong>
        </p>
      ))}
    </div>
  );
}

const axisProps = (c: Record<Token, string>) => ({
  stroke: c['--rule'],
  tick: { fill: c['--ink-3'], fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: c['--rule'] },
});

/** Monday of the current week, to mark "now" on weekly charts. */
function currentWeek() {
  const d = new Date();
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

// ---- Throughput: created vs completed per week ---------------------------------

export function ThroughputChart({ data, dimmed }: { data: ThroughputWeek[]; dimmed?: boolean }) {
  const c = useChartColors();
  const created = data.reduce((s, w) => s + w.created, 0);
  const completed = data.reduce((s, w) => s + w.completed, 0);
  const thisWeek = currentWeek();
  const series = [
    { key: 'created', label: 'Created', color: c['--ink-3'] },
    { key: 'completed', label: 'Completed', color: c['--line-0'] },
  ];

  return (
    <ChartFrame
      title="Created vs completed"
      summary={`${created} created and ${completed} completed over ${data.length} week${data.length === 1 ? '' : 's'}.`}
      legend={series.map((s) => ({ label: s.label, color: s.color }))}
      dimmed={dimmed}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th>Week of</th>
              <th className="num">Created</th>
              <th className="num">Completed</th>
              <th className="num">On time</th>
            </tr>
          </thead>
          <tbody>
            {data.map((w) => (
              <tr key={w.weekStart}>
                <td>{shortWeek(w.weekStart)}</td>
                <td className="num">{w.created}</td>
                <td className="num">{w.completed}</td>
                <td className="num">{w.completedOnTime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={c['--rule']} />
          <XAxis dataKey="weekStart" tickFormatter={shortWeek} {...axisProps(c)} />
          <YAxis allowDecimals={false} {...axisProps(c)} axisLine={false} width={40} />
          <Tooltip
            cursor={{ fill: c['--rule'], opacity: 0.5 }}
            content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} title={(l) => `Week of ${shortWeek(l)}`} />}
          />
          {data.some((w) => w.weekStart === thisWeek) && (
            <ReferenceLine x={thisWeek} stroke={c['--signal']} strokeWidth={2} label={{ value: 'This week', position: 'insideTopRight', fill: c['--ink-2'], fontSize: 11 }} />
          )}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ---- On-time trend ---------------------------------------------------------------

export function OnTimeTrend({ data, dimmed }: { data: ThroughputWeek[]; dimmed?: boolean }) {
  const c = useChartColors();
  const points = data.map((w) => ({ weekStart: w.weekStart, onTimeRate: w.completed ? (w.completedOnTime / w.completed) * 100 : null }));
  const rated = points.filter((p) => p.onTimeRate !== null);
  const last = rated[rated.length - 1];

  return (
    <ChartFrame
      title="On-time rate by week"
      summary={
        last ? `Most recent week with completions: ${Math.round(last.onTimeRate!)}% finished on time.` : 'No completed tasks in this range.'
      }
      dimmed={dimmed}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th>Week of</th>
              <th className="num">On time</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.weekStart}>
                <td>{shortWeek(p.weekStart)}</td>
                <td className="num">{p.onTimeRate === null ? 'No completions' : `${Math.round(p.onTimeRate)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={c['--rule']} />
          <XAxis dataKey="weekStart" tickFormatter={shortWeek} {...axisProps(c)} />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} {...axisProps(c)} axisLine={false} width={44} />
          <Tooltip
            cursor={{ stroke: c['--ink-3'], strokeWidth: 1 }}
            content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} title={(l) => `Week of ${shortWeek(l)}`} />}
          />
          <Line
            type="monotone"
            dataKey="onTimeRate"
            name="On time"
            stroke={c['--line-0']}
            strokeWidth={2}
            strokeLinecap="round"
            dot={{ r: 4, fill: c['--line-0'], stroke: c['--surface'], strokeWidth: 2 }}
            activeDot={{ r: 6, fill: c['--line-0'], stroke: c['--surface'], strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// ---- Status by project or person (stacked, horizontal) ---------------------------

export function StatusChart({ title, data, dimmed }: { title: string; data: StatusRow[]; dimmed?: boolean }) {
  const c = useChartColors();
  // Status colours carry meaning, so they're the status tokens, always with a legend.
  const segments = [
    { key: 'overdue', label: 'Overdue', color: c['--late'] },
    { key: 'inProgress', label: 'In progress', color: c['--progress-bar'] },
    { key: 'todo', label: 'To do', color: c['--todo-bar'] },
    { key: 'done', label: 'Done in range', color: c['--done'] },
  ];
  const overdue = data.reduce((s, r) => s + r.overdue, 0);
  const worst = [...data].sort((a, b) => b.overdue - a.overdue)[0];

  return (
    <ChartFrame
      title={title}
      summary={
        data.length === 0
          ? 'No work in this range.'
          : overdue === 0
            ? 'Nothing is overdue.'
            : `${overdue} overdue in total; most in ${worst.label} (${worst.overdue}).`
      }
      legend={segments.map((s) => ({ label: s.label, color: s.color }))}
      dimmed={dimmed}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              {segments.map((s) => (
                <th key={s.key} className="num">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td>{r.label}</td>
                <td className="num">{r.overdue}</td>
                <td className="num">{r.inProgress}</td>
                <td className="num">{r.todo}</td>
                <td className="num">{r.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 40 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }} barCategoryGap="30%">
          <CartesianGrid horizontal={false} stroke={c['--rule']} />
          <XAxis type="number" allowDecimals={false} {...axisProps(c)} />
          <YAxis type="category" dataKey="label" width={130} {...axisProps(c)} axisLine={false} tick={{ fill: c['--ink-2'], fontSize: 12 }} />
          <Tooltip cursor={{ fill: c['--rule'], opacity: 0.5 }} content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} />} />
          {segments.map((s) => (
            // A surface-coloured edge is the 2px gap between touching segments.
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="status" fill={s.color} stroke={c['--surface']} strokeWidth={2} maxBarSize={24} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
