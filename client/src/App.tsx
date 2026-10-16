import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { homePathFor, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { TwoFactorScreen } from './auth/TwoFactor';
import { Shell } from './components/Shell';
import { CalendarPage } from './calendar/CalendarPage';
import { TeamProgressPage } from './progress/TeamProgressPage';
import { AdminProjects } from './pages/AdminProjects';
import { Login } from './pages/Login';
import { NotificationsPage } from './pages/NotificationsPage';
import { PeoplePage } from './pages/PeoplePage';
import { Signup } from './pages/Signup';
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
  const { stage, user } = useAuth();
  const unread = useUnreadCountPoller(Boolean(user));

  // Restoring the session: show nothing rather than bouncing a deep link to the sign-in page.
  if (stage === 'loading') return <div className="app-loading" aria-busy="true" />;
  // Password accepted; the authenticator step comes before any page.
  if (stage === 'enroll' || stage === 'challenge') return <TwoFactorScreen />;

  return (
    <UnreadContext.Provider value={unread}>
      <Shell>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
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
            path="/admin/progress"
            element={
              <ProtectedRoute role="admin">
                <TeamProgressPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/people"
            element={
              <ProtectedRoute role="admin">
                <PeoplePage />
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
            path="/calendar"
            element={
              <ProtectedRoute>
                <CalendarPage />
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
