import { SignOut } from '@phosphor-icons/react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NotificationBell } from './NotificationBell';
import { Wordmark } from './Wordmark';

const ADMIN_NAV = [
  { to: '/admin/tasks', label: 'Tasks' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/projects', label: 'Projects' },
];

export function AppHeader() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const roleLabel = user.role === 'admin' ? 'Admin' : 'Employee';

  return (
    <header className="band">
      <div className="band-inner">
        <div className="band-left">
          <Wordmark />
          {user.role === 'admin' && (
            <nav className="band-nav" aria-label="Main">
              {ADMIN_NAV.map((item) => (
                <NavLink key={item.to} to={item.to} className="band-link">
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
        <div className="band-user">
          <NotificationBell />
          <span className="band-name">{user.name}</span>
          {user.name !== roleLabel && <span className="band-role">{roleLabel}</span>}
          <button type="button" className="btn btn-on-band" onClick={logout}>
            <SignOut size={16} weight="bold" aria-hidden="true" />
            <span className="band-logout-label">Log out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
