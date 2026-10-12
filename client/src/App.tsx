import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { homePathFor, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppHeader } from './components/AppHeader';
import { AdminProjects } from './pages/AdminProjects';
import { AdminTasks } from './pages/AdminTasks';
import { EmployeeTasks } from './pages/EmployeeTasks';
import { Login } from './pages/Login';
import { NotificationsPage } from './pages/NotificationsPage';
import { UnreadContext, useUnreadCountPoller } from './notifications';

// Charts only load on the reports route, so task pages stay light.
const ReportsPage = lazy(() => import('./reports/ReportsPage'));

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

export function App() {
  const { user } = useAuth();
  const unread = useUnreadCountPoller(Boolean(user));

  return (
    <UnreadContext.Provider value={unread}>
      <AppHeader />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/admin/tasks"
          element={
            <ProtectedRoute role="admin">
              <AdminTasks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/projects"
          element={
            <ProtectedRoute role="admin">
              <AdminProjects />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks"
          element={
            <ProtectedRoute role="employee">
              <EmployeeTasks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute role="admin">
              <Suspense fallback={<main className="page"><p className="panel-note">Loading reports…</p></main>}>
                <ReportsPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </UnreadContext.Provider>
  );
}
