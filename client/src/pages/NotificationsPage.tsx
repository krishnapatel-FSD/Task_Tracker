import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { EmailSettings } from '../components/EmailSettings';
import { EmptyState, ErrorBanner } from '../components/PageStates';
import { formatDateTime, timeAgo } from '../format';
import { useUnread } from '../notifications';
import type { AppNotification } from '../types';

export function NotificationsPage() {
  const { count, refresh } = useUnread();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (from: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.listNotifications({ cursor: from });
      setItems((list) => (from ? [...list, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  async function open(n: AppNotification) {
    if (!n.readAt) {
      await api.markNotificationRead(n.id).catch(() => {});
      refresh();
    }
    if (n.link) navigate(n.link);
  }

  async function markAll() {
    await api.markAllNotificationsRead().catch(() => {});
    setItems((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    refresh();
  }

  return (
    <main className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p className="page-summary">{count > 0 ? `${count} unread` : 'All caught up'}</p>
        </div>
        {count > 0 && (
          <button type="button" className="btn btn-quiet" onClick={markAll}>
            Mark all read
          </button>
        )}
      </div>

      <div className="notifications-layout">
        <section aria-label="All notifications">
          {error && <ErrorBanner message={error} onRetry={() => load(null)} />}
          {!loading && items.length === 0 && !error ? (
            <EmptyState title="No notifications yet.">
              <p>Assignments, status changes, reminders and reports will show up here.</p>
            </EmptyState>
          ) : (
            <ul className="notification-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`bell-item${n.readAt ? '' : ' is-unread'}`} onClick={() => open(n)}>
                    <span className="bell-item-title">{n.title}</span>
                    {n.body && <span className="bell-item-body">{n.body}</span>}
                    <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
                      {timeAgo(n.createdAt)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cursor && (
            <button type="button" className="btn btn-quiet load-more" onClick={() => load(cursor)} disabled={loading}>
              {loading ? 'Loading…' : 'Show older'}
            </button>
          )}
        </section>

        <aside className="settings-card" aria-labelledby="email-settings-heading">
          <h2 id="email-settings-heading">Email</h2>
          <EmailSettings />
        </aside>
      </div>
    </main>
  );
}
