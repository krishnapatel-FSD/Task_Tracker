import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api';

const POLL_MS = 30_000;
/** Fired on window when the unread count goes up, so open lists can refresh. */
export const NOTIFICATIONS_ARRIVED = 'tt:notifications-arrived';

export interface UnreadState {
  count: number;
  refresh: () => void;
}

export const UnreadContext = createContext<UnreadState>({ count: 0, refresh: () => {} });
export const useUnread = () => useContext(UnreadContext);

/**
 * Polls the unread count every 30 s while the tab is visible, and refetches when the
 * tab comes back into view. Near real-time without websockets.
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
