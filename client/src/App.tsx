import { Navigate, Route, Routes } from 'react-router-dom';
import { homePathFor, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppHeader } from './components/AppHeader';
import { AdminTasks } from './pages/AdminTasks';
import { EmployeeTasks } from './pages/EmployeeTasks';
import { Login } from './pages/Login';

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

export function App() {
  return (
    <>
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
          path="/tasks"
          element={
            <ProtectedRoute role="employee">
              <EmployeeTasks />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </>
  );
}
