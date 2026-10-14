import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api';
import { homePathFor, useAuth } from '../auth/AuthContext';
import { Logo } from '../components/Shell';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const loggedIn = await login(email.trim(), password);
      navigate(homePathFor(loggedIn.role), { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'That email and password combination is not right.'
          : "We couldn't reach the server. Try again in a moment.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <aside className="login-band">
        <Logo />
        <div className="login-pitch">
          <p className="login-statement">Your tasks, all in one place.</p>
          <ul className="login-points">
            <li>See what's due today and what's late</li>
            <li>Move a task forward with one button</li>
            <li>Get notified when something changes</li>
          </ul>
        </div>
      </aside>

      <main className="login-main">
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <h1>Sign in</h1>

          <label className="field">
            <span className="field-label">Work email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error)}
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(error)}
            />
          </label>

          {error && (
            <p className="banner banner-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="login-note">Accounts are set up by your admin.</p>
        </form>
      </main>
    </div>
  );
}
