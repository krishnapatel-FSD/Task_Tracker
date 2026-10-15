import { Plus } from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorBanner } from '../components/PageStates';
import type { Account, Role } from '../types';

/** Admin only: everyone with an account, adding people, roles and password resets. */
export function PeoplePage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .listAccounts()
      .then(setAccounts)
      .catch((err) => setError(err instanceof ApiError ? err.message : "We couldn't load people."));
  }, []);

  useEffect(load, [load]);

  const admins = accounts?.filter((a) => a.role === 'admin').length ?? 0;

  return (
    <main className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>People</h1>
          <p className="page-summary">
            {accounts ? `${accounts.length - admins} employees, ${admins} ${admins === 1 ? 'admin' : 'admins'}` : 'Loading people…'}
          </p>
        </div>
        {!adding && (
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} weight="bold" aria-hidden="true" />
            Add person
          </button>
        )}
      </div>

      {adding && (
        <AddPersonForm
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {error && <ErrorBanner message={error} onRetry={load} />}

      {accounts && accounts.length === 0 && (
        <EmptyState title="No one here yet.">
          <p>Add the first person to start assigning work.</p>
        </EmptyState>
      )}

      {accounts && accounts.length > 0 && (
        <ul className="project-list">
          {accounts.map((a) => (
            <PersonRow key={a.id} account={a} onChanged={load} />
          ))}
        </ul>
      )}
    </main>
  );
}

function PersonRow({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const { user } = useAuth();
  const isMe = user?.id === account.id;
  const [resetting, setResetting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function change(changes: { role?: Role; password?: string }, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.updateAccount(account.id, changes);
      setNotice(done);
      setResetting(false);
      if (changes.role) onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't save that change.");
    } finally {
      setBusy(false);
    }
  }

  const otherRole: Role = account.role === 'admin' ? 'employee' : 'admin';

  return (
    <li className="project-row person-row">
      <span className="person-initials" aria-hidden="true">
        {account.name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase())
          .join('')}
      </span>
      <div className="project-main">
        <span className="project-name">
          {account.name}
          {isMe && <span className="person-you"> (you)</span>}
        </span>
        <span className="project-desc">{account.email}</span>
        {error && <span className="field-error">{error}</span>}
        {notice && <span className="person-notice">{notice}</span>}
      </div>
      <span className={`role-pill role-${account.role}`}>{account.role === 'admin' ? 'Admin' : 'Employee'}</span>
      <span className="project-counts">
        <strong>{account.openTasks}</strong> open
      </span>
      <div className="project-actions">
        <button type="button" className="btn btn-quiet btn-small" aria-expanded={resetting} onClick={() => setResetting((v) => !v)} disabled={busy}>
          Reset password
        </button>
        {!isMe && (
          <button type="button" className="btn btn-link" onClick={() => change({ role: otherRole }, `Now ${otherRole === 'admin' ? 'an admin' : 'an employee'}.`)} disabled={busy}>
            {otherRole === 'admin' ? 'Make admin' : 'Make employee'}
          </button>
        )}
      </div>
      {resetting && <ResetPassword name={account.name} busy={busy} onSave={(password) => change({ password }, 'Password changed. Share the new one with them.')} />}
    </li>
  );
}

function ResetPassword({ name, busy, onSave }: { name: string; busy: boolean; onSave: (password: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="person-reset"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (password.length < 8) return setError('Use at least 8 characters.');
        setError(null);
        onSave(password);
      }}
    >
      <label className="field">
        <span className="field-label">New password for {name}</span>
        <input type="text" autoComplete="off" value={password} maxLength={72} onChange={(e) => setPassword(e.target.value)} autoFocus aria-invalid={Boolean(error)} />
        {error ? <span className="field-error">{error}</span> : <span className="field-hint">At least 8 characters. Tell them the new password yourself.</span>}
      </label>
      <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
        Save password
      </button>
    </form>
  );
}

function AddPersonForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter their name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Give them a password of at least 8 characters.');
    setSaving(true);
    setError(null);
    try {
      await api.createAccount({ name: name.trim(), email: email.trim(), role, password });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't add this person.");
      setSaving(false);
    }
  }

  return (
    <form className="project-form" onSubmit={handleSubmit} onKeyDown={(e) => e.key === 'Escape' && onCancel()} noValidate>
      <label className="field">
        <span className="field-label">Name</span>
        <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span className="field-label">Work email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="employee">Employee</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">Password</span>
        <input type="text" autoComplete="off" value={password} maxLength={72} onChange={(e) => setPassword(e.target.value)} />
        <span className="field-hint">They sign in with this. Share it with them yourself.</span>
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="composer-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add person'}
        </button>
      </div>
    </form>
  );
}
