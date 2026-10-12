import { SignOut } from '@phosphor-icons/react';
import { useAuth } from '../auth/AuthContext';
import { Wordmark } from './Wordmark';

export function AppHeader() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const roleLabel = user.role === 'admin' ? 'Admin' : 'Employee';

  return (
    <header className="band">
      <div className="band-inner">
        <Wordmark />
        <div className="band-user">
          <span className="band-name">{user.name}</span>
          {user.name !== roleLabel && <span className="band-role">{roleLabel}</span>}
          <button type="button" className="btn btn-on-band" onClick={logout}>
            <SignOut size={16} weight="bold" aria-hidden="true" />
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
