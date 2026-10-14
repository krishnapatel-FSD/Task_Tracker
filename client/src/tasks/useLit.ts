import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { NOTIFICATIONS_ARRIVED, useUnread } from '../notifications';
import type { AppNotification } from '../types';

/** Short tag shown on a lit row: what changed. */
const TAGS: Record<string, string> = {
  task_assigned: 'New for you',
  task_updated: 'Changed',
  status_changed: 'Status changed',
  attachment_added: 'New file',
  due_tomorrow: 'Due tomorrow',
  overdue: 'Late reminder',
  mentioned: 'Mentioned you',
  comment_added: 'New comment',
};

export interface LitInfo {
  tag: string;
  ids: string[];
}

/**
 * "Lit until seen": tasks with unread notifications stay highlighted until you open them.
 * Built on the existing notifications, so the list and the Notifications page always agree.
 */
export function useLit() {
  const { count, refresh } = useUnread();
  const [lit, setLit] = useState<Map<string, LitInfo>>(new Map());

  const load = useCallback(async () => {
    try {
      const page = await api.listNotifications({ unread: true, limit: 50 });
      const map = new Map<string, LitInfo>();
      // Newest first: the first notification for a task decides its tag.
      for (const n of page.items as AppNotification[]) {
        if (!n.taskId) continue;
        const entry = map.get(n.taskId);
        if (entry) entry.ids.push(n.id);
        else map.set(n.taskId, { tag: TAGS[n.type] ?? 'Changed', ids: [n.id] });
      }
      setLit(map);
    } catch {
      // Lighting is a convenience; the list still works without it.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, count]);

  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_ARRIVED, load);
    return () => window.removeEventListener(NOTIFICATIONS_ARRIVED, load);
  }, [load]);

  /** Opening a task counts as seeing it. */
  const markSeen = useCallback(
    async (taskId: string) => {
      const entry = lit.get(taskId);
      if (!entry) return;
      setLit((prev) => {
        const next = new Map(prev);
        next.delete(taskId);
        return next;
      });
      await Promise.all(entry.ids.map((id) => api.markNotificationRead(id).catch(() => {})));
      refresh();
    },
    [lit, refresh],
  );

  return { lit, markSeen };
}
