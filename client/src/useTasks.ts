import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { NOTIFICATIONS_ARRIVED } from './notifications';
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
  }, [filters.status, filters.assigneeId, filters.projectId, reloadKey]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  // Something changed elsewhere (a new notification arrived): refresh quietly.
  useEffect(() => {
    const onArrived = () => setReloadKey((k) => k + 1);
    window.addEventListener(NOTIFICATIONS_ARRIVED, onArrived);
    return () => window.removeEventListener(NOTIFICATIONS_ARRIVED, onArrived);
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  /** Briefly highlights a row so the user sees what just changed. */
  const flash = useCallback((id: string) => {
    window.clearTimeout(flashTimer.current);
    setFlashId(id);
    flashTimer.current = window.setTimeout(() => setFlashId(null), FLASH_MS);
  }, []);

  /** Puts a saved task back in place, or drops it if it no longer matches the filters. */
  const replaceTask = useCallback(
    (task: Task) => {
      const matches =
        (!filters.status || task.status === filters.status) &&
        (!filters.assigneeId || task.assignee.id === filters.assigneeId) &&
        (!filters.projectId || task.project.id === filters.projectId);
      setTasks((list) => {
        const without = list.filter((t) => t.id !== task.id);
        if (!matches) return without;
        // Keep deadline order after an edit that moved the deadline.
        return [...without, task].sort(
          (a, b) => a.deadline.localeCompare(b.deadline) || a.createdAt.localeCompare(b.createdAt),
        );
      });
      if (matches) flash(task.id);
    },
    [filters.status, filters.assigneeId, filters.projectId, flash],
  );

  const removeTask = useCallback((id: string) => setTasks((list) => list.filter((t) => t.id !== id)), []);

  /** Small in-place update (e.g. a new file count), without a flash. */
  const patchTask = useCallback(
    (id: string, patch: Partial<Task>) => setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t))),
    [],
  );

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

  return { tasks, loading, error, updatingId, flashId, changeStatus, reload, flash, replaceTask, removeTask, patchTask, setError };
}
