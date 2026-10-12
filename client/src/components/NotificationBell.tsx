import { Bell, GearSix } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { timeAgo } from '../format';
import { useUnread } from '../notifications';
import type { AppNotification } from '../types';
import { EmailSettings } from './EmailSettings';

/** Bell with unread count. Opens a dropdown panel (not a modal) with the latest ten. */
export function NotificationBell() {
  const { count, refresh } = useUnread();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'list' | 'settings'>('list');
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setView('list');
    api
      .listNotifications({ limit: 10 })
      .then((page) => setItems(page.items))
      .catch(() => setItems([]));

    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function openItem(n: AppNotification) {
    setOpen(false);
    if (!n.readAt) {
      await api.markNotificationRead(n.id).catch(() => {});
      refresh();
    }
    if (n.link) navigate(n.link);
  }

  async function markAll() {
    await api.markAllNotificationsRead().catch(() => {});
    setItems((list) => list?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
    refresh();
  }

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="bell-button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} weight="bold" aria-hidden="true" />
        {count > 0 && <span className="bell-count">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="region" aria-label="Notifications">
          <div className="bell-panel-head">
            <h2>{view === 'list' ? 'Notifications' : 'Email settings'}</h2>
            {view === 'list' ? (
              <div className="bell-panel-tools">
                {count > 0 && (
                  <button type="button" className="btn btn-link" onClick={markAll}>
                    Mark all read
                  </button>
                )}
                <button type="button" className="icon-button" onClick={() => setView('settings')} aria-label="Email settings">
                  <GearSix size={16} weight="bold" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-link" onClick={() => setView('list')}>
                Back
              </button>
            )}
          </div>

          {view === 'settings' ? (
            <div className="bell-settings">
              <EmailSettings />
            </div>
          ) : items === null ? (
            <p className="bell-empty">Loading…</p>
          ) : items.length === 0 ? (
            <p className="bell-empty">Nothing yet. Assignments, status changes and reminders show up here.</p>
          ) : (
            <ul className="bell-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`bell-item${n.readAt ? '' : ' is-unread'}`} onClick={() => openItem(n)}>
                    <span className="bell-item-title">{n.title}</span>
                    {n.body && <span className="bell-item-body">{n.body}</span>}
                    <time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {view === 'list' && (
            <Link to="/notifications" className="bell-all" onClick={() => setOpen(false)}>
              See all notifications
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
