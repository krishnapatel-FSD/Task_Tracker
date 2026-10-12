import { STATUS_LABELS, STATUSES, type Employee, type ProjectRef, type Status, type TaskFilterValues } from '../types';

interface Props {
  value: TaskFilterValues;
  onChange: (value: TaskFilterValues) => void;
  projects: ProjectRef[];
  /** Pass employees to show the assignee filter (admin only). */
  employees?: Employee[];
}

export const NO_FILTERS: TaskFilterValues = { status: '', assigneeId: '', projectId: '' };

const STATUS_OPTIONS: { value: Status | ''; label: string }[] = [
  { value: '', label: 'All' },
  ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
];

export function hasFilters(value: TaskFilterValues) {
  return value.status !== '' || value.assigneeId !== '' || value.projectId !== '';
}

export function TaskFilters({ value, onChange, projects, employees }: Props) {
  return (
    <div className="filters">
      <fieldset className="filter">
        <legend className="sr-only">Filter by status</legend>
        <div className="segmented">
          {STATUS_OPTIONS.map((opt) => (
            <label key={opt.value || 'all'} className="segment">
              <input
                type="radio"
                name="status-filter"
                value={opt.value}
                checked={value.status === opt.value}
                onChange={() => onChange({ ...value, status: opt.value })}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {projects.length > 1 && (
        <label className="filter filter-select">
          <span className="sr-only">Filter by project</span>
          <select value={value.projectId} onChange={(e) => onChange({ ...value, projectId: e.target.value })}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {employees && (
        <label className="filter filter-select">
          <span className="sr-only">Filter by assignee</span>
          <select value={value.assigneeId} onChange={(e) => onChange({ ...value, assigneeId: e.target.value })}>
            <option value="">Everyone</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {hasFilters(value) && (
        <button type="button" className="btn btn-link" onClick={() => onChange(NO_FILTERS)}>
          Clear filters
        </button>
      )}
    </div>
  );
}
