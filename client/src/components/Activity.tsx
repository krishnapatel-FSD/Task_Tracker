import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';
import { formatDateTime, formatDay, formatMinutes, timeAgo } from '../format';
import { PRIORITY_LABELS, STATUS_LABELS, type Priority, type Status, type TaskEvent, type TaskTimeline } from '../types';

/** The task's activity log as short sentences, loaded when the tab first opens. */
export function Activity({ taskId, refreshKey }: { taskId: string; refreshKey: string }) {
  const { user } = useAuth();
  const [timeline, setTimeline] = useState<TaskTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .listTaskEvents(taskId)
      .then((t) => !cancelled && setTimeline(t))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "We couldn't load the activity."));
    return () => {
      cancelled = true;
    };
  }, [taskId, refreshKey]);

  if (error) return <p className="panel-note panel-error">{error}</p>;
  if (!timeline) return <p className="panel-note">Loading activity…</p>;

  const name = (id: string) => (id === user?.id ? 'you' : (timeline.names[id] ?? 'someone'));
  const actor = (e: TaskEvent) => (e.actor.id === user?.id ? 'You' : e.actor.name);

  return (
    <ol className="timeline">
      {timeline.events.map((event) => (
        <li key={event.id}>
          <span className="timeline-text">
            <strong>{actor(event)}</strong> {describe(event, name)}
          </span>
          <time dateTime={event.createdAt} title={formatDateTime(event.createdAt)}>
            {timeAgo(event.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}

function describe(event: TaskEvent, name: (id: string) => string): string {
  const d = event.data;
  switch (event.type) {
    case 'created':
      return `created this task for ${name(d.assigneeId)}`;
    case 'reassigned':
      return `moved this from ${name(d.fromId)} to ${name(d.toId)}`;
    case 'status_changed':
      return typeof d.minutesSpent === 'number'
        ? `marked it ${STATUS_LABELS[d.to as Status]} (took ${formatMinutes(d.minutesSpent)})`
        : `set the status to ${STATUS_LABELS[d.to as Status]}`;
    case 'archived':
      return 'deleted this task';
    case 'restored':
      return 'restored this task';
    case 'attachment_added':
      return `added ${d.fileName}`;
    case 'attachment_removed':
      return `removed ${d.fileName}`;
    case 'updated': {
      const changes = d.changes as Record<string, { from: string; to: string }>;
      const parts = Object.entries(changes).map(([field, { from, to }]) => {
        switch (field) {
          case 'title':
            return `renamed it from "${from}" to "${to}"`;
          case 'description':
            return 'edited the description';
          case 'priority':
            return `changed the priority from ${PRIORITY_LABELS[from as Priority]} to ${PRIORITY_LABELS[to as Priority]}`;
          case 'deadline':
            return `moved the deadline from ${formatDay(from)} to ${formatDay(to)}`;
          case 'projectId':
            return `moved it from ${name(from)} to ${name(to)}`;
          default:
            return `changed ${field}`;
        }
      });
      return parts.join(', ');
    }
  }
}
