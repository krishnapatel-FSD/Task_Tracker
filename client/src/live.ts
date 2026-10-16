import { useEffect, useRef } from 'react';
import { API_URL, getAccessToken } from './api';

/** What changed, as announced by the API. */
export interface LiveChange {
  /** tasks, projects, comments, checklist, attachments, users, ... or "*" after a reconnect. */
  scope: string;
  taskId?: string;
  actorId?: string;
}

const LIVE_EVENT = 'tt:live';

/**
 * Keeps one stream open to the API while signed in. Every change anyone makes arrives as a
 * message and is re-sent on window, so open screens refresh within a second. Uses fetch
 * (not EventSource) so the sign-in token goes in a header, and reconnects on its own.
 */
export function useLiveConnection(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let controller: AbortController | null = null;
    let retryMs = 1000;
    let connectedBefore = false;

    async function connect() {
      while (!stopped) {
        controller = new AbortController();
        try {
          const token = getAccessToken();
          const res = await fetch(`${API_URL}/live`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
            cache: 'no-store',
          });
          if (!res.ok || !res.body) throw new Error(`live ${res.status}`);
          retryMs = 1000;
          // Back after a drop: anything may have changed meanwhile.
          if (connectedBefore) window.dispatchEvent(new CustomEvent<LiveChange>(LIVE_EVENT, { detail: { scope: '*' } }));
          connectedBefore = true;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let end;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const block = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const data = block.split('\n').find((l) => l.startsWith('data: '));
              if (!data) continue;
              try {
                window.dispatchEvent(new CustomEvent<LiveChange>(LIVE_EVENT, { detail: JSON.parse(data.slice(6)) }));
              } catch {
                // ignore a malformed message
              }
            }
          }
        } catch {
          // dropped or refused: try again below
        }
        if (stopped) return;
        await new Promise((r) => setTimeout(r, retryMs));
        retryMs = Math.min(retryMs * 2, 15_000);
      }
    }

    void connect();
    return () => {
      stopped = true;
      controller?.abort();
    };
  }, [enabled]);
}

/**
 * Calls `refresh` when a matching change arrives, at most once per short burst (a single
 * action can announce a few changes). The callback can change between renders.
 */
export function useLiveRefresh(refresh: () => void, matches: (change: LiveChange) => boolean = () => true, delayMs = 250) {
  const latest = useRef({ refresh, matches });
  latest.current = { refresh, matches };

  useEffect(() => {
    let timer: number | undefined;
    const onChange = (e: Event) => {
      const change = (e as CustomEvent<LiveChange>).detail;
      if (change.scope !== '*' && !latest.current.matches(change)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => latest.current.refresh(), delayMs);
    };
    window.addEventListener(LIVE_EVENT, onChange);
    return () => {
      window.removeEventListener(LIVE_EVENT, onChange);
      window.clearTimeout(timer);
    };
  }, [delayMs]);
}

/** Changes that can affect a task list or board: the tasks, and the counts shown on them. */
export const TASK_SCOPES = new Set(['tasks', 'projects', 'comments', 'checklist', 'attachments', 'users']);
