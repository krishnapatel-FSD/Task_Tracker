import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Task } from './types';

/**
 * Handles links like /tasks?task=<id> (from notifications): once the list has loaded,
 * scrolls the row into view and flashes it, then removes the parameter.
 * Returns the id being revealed so the timetable can open a collapsed group.
 */
export function useRevealTask(tasks: Task[], loading: boolean, flash: (id: string) => void) {
  const [params, setParams] = useSearchParams();
  const target = params.get('task');
  const [revealId, setRevealId] = useState<string | null>(null);

  useEffect(() => {
    if (!target || loading) return;
    const found = tasks.some((t) => t.id === target);
    if (found) {
      setRevealId(target);
      // Give a group opened for it time to render. (Not rAF: it never fires in a background tab.)
      window.setTimeout(() => {
        document.getElementById(`task-${target}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        flash(target);
      }, 60);
    }
    const next = new URLSearchParams(params);
    next.delete('task');
    setParams(next, { replace: true });
  }, [target, loading, tasks]);

  return revealId;
}
