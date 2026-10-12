import { STATUS_LABELS, STATUSES, type Employee, type Status, type TaskFilterValues } from '../types';

interface Props {
  value: TaskFilterValues;
  onChange: (value: TaskFilterValues) => void;
  /** Pass employees to show the assignee filter (admin only). */
  employees?: Employee[];
}

const STATUS_OPTIONS: { value: Status | ''; label: string }[] = [
  { value: '', label: 'All' },
  ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
];

export function TaskFilters({ value, onChange, employees }: Props) {
  const hasFilters = value.status !== '' || value.assigneeId !== '';

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

      {hasFilters && (
        <button type="button" className="btn btn-link" onClick={() => onChange({ status: '', assigneeId: '' })}>
          Clear filters
        </button>
      )}
    </div>
  );
}
