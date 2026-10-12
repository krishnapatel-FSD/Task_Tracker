import { useState } from 'react';
import { EmptyState, ErrorBanner, taskSummary } from '../components/PageStates';
import { TaskFilters } from '../components/TaskFilters';
import { Timetable } from '../components/Timetable';
import type { TaskFilterValues } from '../types';
import { useTasks } from '../useTasks';

const NO_FILTERS: TaskFilterValues = { status: '', assigneeId: '' };

export function EmployeeTasks() {
  const [filters, setFilters] = useState<TaskFilterValues>(NO_FILTERS);
  const { tasks, loading, error, updatingId, flashId, changeStatus, reload } = useTasks(filters);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>My tasks</h1>
          <p className="page-summary" aria-live="polite">
            {taskSummary(tasks, loading)}
          </p>
        </div>
      </div>

      <TaskFilters value={filters} onChange={setFilters} />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <Timetable
        tasks={tasks}
        loading={loading}
        updatingId={updatingId}
        flashId={flashId}
        onStatusChange={changeStatus}
        empty={
          filters.status ? (
            <EmptyState title="No tasks with this status.">
              <button type="button" className="btn btn-link" onClick={() => setFilters(NO_FILTERS)}>
                Show all tasks
              </button>
            </EmptyState>
          ) : (
            <EmptyState title="Nothing assigned to you yet.">
              <p>When your admin assigns you a task, it appears here in deadline order.</p>
            </EmptyState>
          )
        }
      />
    </main>
  );
}
