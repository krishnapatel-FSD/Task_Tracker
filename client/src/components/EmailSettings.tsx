import { useEffect, useState } from 'react';
import { api } from '../api';
import type { NotificationPreferences } from '../types';

/** Email preferences. Saves on every change. */
export function EmailSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    api.getNotificationPreferences().then(setPrefs).catch(() => setStatus('error'));
  }, []);

  async function save(next: NotificationPreferences) {
    setPrefs(next);
    setStatus('saving');
    try {
      setPrefs(await api.setNotificationPreferences(next));
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  if (!prefs) return <p className="panel-note">{status === 'error' ? "We couldn't load your settings." : 'Loading…'}</p>;

  return (
    <div className="email-settings">
      <label className="check">
        <input type="checkbox" checked={prefs.emailEnabled} onChange={(e) => save({ ...prefs, emailEnabled: e.target.checked })} />
        <span>Also send notifications by email</span>
      </label>

      <fieldset className="radio-group" disabled={!prefs.emailEnabled}>
        <legend className="field-label">How often</legend>
        <label className="check">
          <input
            type="radio"
            name="email-frequency"
            checked={prefs.emailFrequency === 'instant'}
            onChange={() => save({ ...prefs, emailFrequency: 'instant' })}
          />
          <span>As they happen</span>
        </label>
        <label className="check">
          <input
            type="radio"
            name="email-frequency"
            checked={prefs.emailFrequency === 'daily'}
            onChange={() => save({ ...prefs, emailFrequency: 'daily' })}
          />
          <span>One summary each morning</span>
        </label>
      </fieldset>

      <p className="panel-note" aria-live="polite">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved.' : status === 'error' ? "We couldn't save that. Try again." : ' '}
      </p>
    </div>
  );
}
