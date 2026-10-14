import { Bell, ChartBar, CheckSquareOffset, FolderSimple, GearSix, ListChecks, SignOut } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useUnread } from '../notifications';

interface NavItem {
  to: string;
  label: string;
  /** Shorter label for the phone tab bar. */
  short?: string;
  icon: ReactNode;
  badge?: number;
}

export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark" aria-hidden="true">
        <CheckSquareOffset size={20} weight="bold" />
      </span>
      Task Tracker
    </span>
  );
}

/** Sidebar on wide screens; a top bar plus bottom tab bar on phones. Labels are always visible. */
export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { count } = useUnread();
  if (!user) return <>{children}</>;

  const isAdmin = user.role === 'admin';
  const items: NavItem[] = isAdmin
    ? [
        { to: '/projects', label: 'Projects', icon: <FolderSimple size={20} weight="bold" /> },
        { to: '/admin/tasks', label: 'All tasks', short: 'Tasks', icon: <ListChecks size={20} weight="bold" /> },
        { to: '/admin/reports', label: 'Reports', icon: <ChartBar size={20} weight="bold" /> },
        { to: '/admin/projects', label: 'Manage projects', short: 'Manage', icon: <GearSix size={20} weight="bold" /> },
        { to: '/notifications', label: 'Notifications', icon: <Bell size={20} weight="bold" />, badge: count },
      ]
    : [
        { to: '/projects', label: 'Projects', icon: <FolderSimple size={20} weight="bold" /> },
        { to: '/tasks', label: 'My tasks', icon: <ListChecks size={20} weight="bold" /> },
        { to: '/notifications', label: 'Notifications', icon: <Bell size={20} weight="bold" />, badge: count },
      ];
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  const renderLinks = (compact: boolean) => items.map((item) => (
    <NavLink key={item.to} to={item.to} className="nav-link">
      <span className="nav-icon" aria-hidden="true">
        {item.icon}
      </span>
      <span className="nav-label">{compact ? (item.short ?? item.label) : item.label}</span>
      {item.badge ? (
        <span className="nav-badge" aria-label={`${item.badge} unread`}>
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      ) : null}
    </NavLink>
  ));

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo />
        <nav className="nav" aria-label="Main">
          {renderLinks(false)}
        </nav>
        <div className="sidebar-user">
          <span className="user-avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="user-text">
            <span className="user-name">{user.name}</span>
            {user.name !== (isAdmin ? 'Admin' : 'Employee') && <span className="user-role">{isAdmin ? 'Admin' : 'Employee'}</span>}
          </span>
          <button type="button" className="icon-button" onClick={logout} aria-label="Log out" title="Log out">
            <SignOut size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </aside>

      <header className="mobile-bar">
        <Logo />
        <UserMenu name={user.name} role={isAdmin ? 'Admin' : 'Employee'} initials={initials} onLogout={logout} />
      </header>

      <div className="shell-content">{children}</div>

      <nav className="tabbar" aria-label="Main">
        {renderLinks(true)}
      </nav>
    </div>
  );
}

/** Phone top bar: who is signed in, with Log out tucked one tap away so it can't be hit by accident. */
function UserMenu({ name, role, initials, onLogout }: { name: string; role: string; initials: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu-button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        <span className="user-avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="sr-only">Account menu for {name}</span>
      </button>
      {open && (
        <div className="user-menu-panel">
          <p className="user-menu-name">{name}</p>
          {name !== role && <p className="user-menu-role">{role}</p>}
          <button type="button" className="btn btn-quiet btn-small user-menu-logout" onClick={onLogout}>
            <SignOut size={16} weight="bold" aria-hidden="true" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
