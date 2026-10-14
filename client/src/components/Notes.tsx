import { Clock } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatDateTime, formatMinutes } from '../format';
import type { TaskNote } from '../types';

/** Completion notes on a task, newest first: what was done and how long it took. */
export function Notes({ taskId, refreshKey }: { taskId: string; refreshKey: string }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<TaskNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .listTaskNotes(taskId)
      .then((n) => !cancelled && setNotes(n))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "We couldn't load the notes."));
    return () => {
      cancelled = true;
    };
  }, [taskId, refreshKey]);

  if (error) return <p className="panel-note panel-error">{error}</p>;
  if (!notes) return <p className="panel-note">Loading notes…</p>;
  if (notes.length === 0) {
    return <p className="panel-note">No notes yet. When this task is marked done, the summary and time taken show here.</p>;
  }

  return (
    <ul className="note-list">
      {notes.map((n) => (
        <li key={n.id} className="note">
          <div className="note-head">
            <span className="note-author">{n.author.id === user?.id ? 'You' : n.author.name}</span>
            <span className="note-time">
              <Clock size={13} weight="bold" aria-hidden="true" />
              Took {formatMinutes(n.minutesSpent)}
            </span>
          </div>
          <p className="note-summary">{n.summary}</p>
          <time className="note-date" dateTime={n.createdAt}>
            {formatDateTime(n.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
