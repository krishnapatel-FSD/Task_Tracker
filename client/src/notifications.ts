import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useLiveRefresh } from './live';

// Live updates refresh the count at once; this slow check is only a backup.
const POLL_MS = 60_000;
/** Fired on window when the unread count goes up, so open lists can refresh. */
export const NOTIFICATIONS_ARRIVED = 'tt:notifications-arrived';

export interface UnreadState {
  count: number;
  refresh: () => void;
}

export const UnreadContext = createContext<UnreadState>({ count: 0, refresh: () => {} });
export const useUnread = () => useContext(UnreadContext);

/**
 * Refreshes the unread count whenever a live change arrives (a change can notify you), plus a
 * slow backup check while the tab is visible and a refetch when it comes back into view.
 */
export function useUnreadCountPoller(enabled: boolean): UnreadState {
  const [count, setCount] = useState(0);
  const last = useRef(0);

  const refresh = useCallback(() => {
    if (!enabled) return;
    api
      .unreadCount()
      .then(({ count: next }) => {
        if (next > last.current) window.dispatchEvent(new Event(NOTIFICATIONS_ARRIVED));
        last.current = next;
        setCount(next);
      })
      .catch(() => {});
  }, [enabled]);

  useLiveRefresh(refresh, () => true, 400);

  useEffect(() => {
    if (!enabled) {
      last.current = 0;
      setCount(0);
      return;
    }
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled, refresh]);

  return { count, refresh };
}
