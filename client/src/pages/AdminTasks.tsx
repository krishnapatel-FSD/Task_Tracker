import { Plus } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { EmptyState, ErrorBanner, taskSummary } from '../components/PageStates';
import { TaskComposer } from '../components/TaskComposer';
import { TaskFilters } from '../components/TaskFilters';
import { Timetable } from '../components/Timetable';
import type { Employee, TaskFilterValues } from '../types';
import { useTasks } from '../useTasks';

const NO_FILTERS: TaskFilterValues = { status: '', assigneeId: '' };

export function AdminTasks() {
  const [filters, setFilters] = useState<TaskFilterValues>(NO_FILTERS);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [composing, setComposing] = useState(false);
  const { tasks, loading, error, updatingId, flashId, changeStatus, reload, flash } = useTasks(filters);
  const filtered = filters.status !== '' || filters.assigneeId !== '';

  useEffect(() => {
    api.listEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, []);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>All tasks</h1>
          <p className="page-summary" aria-live="polite">
            {taskSummary(tasks, loading)}
          </p>
        </div>
        {!composing && (
          <button type="button" className="btn btn-primary" onClick={() => setComposing(true)}>
            <Plus size={16} weight="bold" aria-hidden="true" />
            New task
          </button>
        )}
      </div>

      <TaskComposer
        open={composing}
        employees={employees}
        onClose={() => setComposing(false)}
        onCreated={(task) => {
          setComposing(false);
          reload();
          flash(task.id);
        }}
      />

      <TaskFilters value={filters} onChange={setFilters} employees={employees} />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <Timetable
        tasks={tasks}
        loading={loading}
        employeeIds={employees.map((e) => e.id)}
        updatingId={updatingId}
        flashId={flashId}
        onStatusChange={changeStatus}
        empty={
          filtered ? (
            <EmptyState title="No tasks match these filters.">
              <button type="button" className="btn btn-link" onClick={() => setFilters(NO_FILTERS)}>
                Clear filters
              </button>
            </EmptyState>
          ) : (
            <EmptyState title="No tasks yet.">
              <p>Create a task to assign it to someone. It will show up here, ordered by deadline.</p>
            </EmptyState>
          )
        }
      />
    </main>
  );
}
