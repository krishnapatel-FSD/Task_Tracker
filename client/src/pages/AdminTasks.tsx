import { Plus } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { EmptyState, ErrorBanner, taskSummary } from '../components/PageStates';
import { TaskComposer } from '../components/TaskComposer';
import { hasFilters, NO_FILTERS, TaskFilters } from '../components/TaskFilters';
import { Timetable } from '../components/Timetable';
import { useToast } from '../components/Toast';
import type { Employee, Task, TaskFilterValues } from '../types';
import { useProjects } from '../useProjects';
import { useRevealTask } from '../useRevealTask';
import { useTasks } from '../useTasks';

const UNDO_MS = 8000;

export function AdminTasks() {
  const [filters, setFilters] = useState<TaskFilterValues>(NO_FILTERS);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [composing, setComposing] = useState(false);
  const projects = useProjects();
  const toast = useToast();
  const { tasks, loading, error, updatingId, flashId, changeStatus, reload, flash, replaceTask, removeTask, patchTask, setError } =
    useTasks(filters);
  const revealId = useRevealTask(tasks, loading, flash);

  useEffect(() => {
    api.listEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, []);

  async function deleteTask(task: Task) {
    try {
      await api.deleteTask(task.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't delete that task. Try again.");
      return;
    }
    removeTask(task.id);
    // No confirm dialog: the delete happens now and can be undone for a few seconds.
    toast({
      message: `Deleted "${task.title}".`,
      durationMs: UNDO_MS,
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            const restored = await api.restoreTask(task.id);
            replaceTask(restored);
          } catch {
            toast({ message: "We couldn't restore that task." });
          }
        },
      },
    });
  }

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
        mode="create"
        open={composing}
        employees={employees}
        projects={projects}
        onClose={() => setComposing(false)}
        onSaved={(task) => {
          setComposing(false);
          reload();
          flash(task.id);
        }}
      />

      <TaskFilters value={filters} onChange={setFilters} projects={projects} employees={employees} />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <Timetable
        tasks={tasks}
        loading={loading}
        admin={{ employees, projects, onSaved: replaceTask, onDelete: deleteTask }}
        updatingId={updatingId}
        flashId={flashId}
        onStatusChange={changeStatus}
        revealId={revealId}
        onPatch={patchTask}
        empty={
          hasFilters(filters) ? (
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
