import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { Status, Task, TaskFilterValues } from './types';

const FLASH_MS = 1600;

/** Loads the task list for the given filters and handles status updates. Shared by both task pages. */
export function useTasks(filters: TaskFilterValues) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listTasks(filters)
      .then((result) => !cancelled && setTasks(result))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "We couldn't load your tasks."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters.status, filters.assigneeId, reloadKey]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  /** Briefly highlights a row so the user sees what just changed. */
  const flash = useCallback((id: string) => {
    window.clearTimeout(flashTimer.current);
    setFlashId(id);
    flashTimer.current = window.setTimeout(() => setFlashId(null), FLASH_MS);
  }, []);

  const changeStatus = useCallback(
    async (task: Task, status: Status) => {
      setUpdatingId(task.id);
      setError(null);
      try {
        const updated = await api.updateTaskStatus(task.id, status);
        setTasks((list) =>
          // Drop the row if it no longer matches the active status filter.
          filters.status && updated.status !== filters.status
            ? list.filter((t) => t.id !== updated.id)
            : list.map((t) => (t.id === updated.id ? updated : t)),
        );
        flash(updated.id);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "We couldn't save that status change. Try again.");
      } finally {
        setUpdatingId(null);
      }
    },
    [filters.status, flash],
  );

  return { tasks, loading, error, updatingId, flashId, changeStatus, reload, flash };
}
