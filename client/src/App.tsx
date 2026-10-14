import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { homePathFor, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Shell } from './components/Shell';
import { AdminProjects } from './pages/AdminProjects';
import { TemplatesPage } from './pages/TemplatesPage';
import { Login } from './pages/Login';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProjectPage } from './projects/ProjectPage';
import { ProjectsHome } from './projects/ProjectsHome';
import { UnreadContext, useUnreadCountPoller } from './notifications';
import { TasksPage } from './tasks/TasksPage';

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
      <Shell>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <ProjectsHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <ProtectedRoute>
                <ProjectPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/tasks"
            element={
              <ProtectedRoute role="admin">
                <TasksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/templates"
            element={
              <ProtectedRoute role="admin">
                <TemplatesPage />
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
                <TasksPage key="mine" scope="mine" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/team"
            element={
              <ProtectedRoute role="employee">
                <TasksPage key="team" scope="all" />
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
      </Shell>
    </UnreadContext.Provider>
  );
}
