import { useState } from 'react';
import { EmptyState, ErrorBanner, taskSummary } from '../components/PageStates';
import { hasFilters, NO_FILTERS, TaskFilters } from '../components/TaskFilters';
import { Timetable } from '../components/Timetable';
import type { TaskFilterValues } from '../types';
import { useProjects } from '../useProjects';
import { useRevealTask } from '../useRevealTask';
import { useTasks } from '../useTasks';

export function EmployeeTasks() {
  const [filters, setFilters] = useState<TaskFilterValues>(NO_FILTERS);
  const projects = useProjects();
  const { tasks, loading, error, updatingId, flashId, changeStatus, reload, flash, patchTask } = useTasks(filters);
  const revealId = useRevealTask(tasks, loading, flash);

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

      <TaskFilters value={filters} onChange={setFilters} projects={projects} />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <Timetable
        tasks={tasks}
        loading={loading}
        updatingId={updatingId}
        flashId={flashId}
        onStatusChange={changeStatus}
        revealId={revealId}
        onPatch={patchTask}
        empty={
          hasFilters(filters) ? (
            <EmptyState title="No tasks match these filters.">
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
