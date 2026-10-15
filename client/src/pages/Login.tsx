import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { homePathFor, useAuth } from '../auth/AuthContext';
import { GoogleButton } from '../auth/GoogleButton';
import { Logo } from '../components/Shell';
import type { SignInOptions } from '../types';

const UNREACHABLE = "We couldn't reach the server. Try again in a moment.";

let optionsLoad: Promise<SignInOptions> | null = null;

/** Sign-up domains and Google, from the server. Null while loading or if it can't be reached. */
export function useSignInOptions() {
  const [options, setOptions] = useState<SignInOptions | null>(null);
  useEffect(() => {
    optionsLoad ??= api.signInOptions().catch((err) => {
      optionsLoad = null;
      throw err;
    });
    optionsLoad.then(setOptions).catch(() => setOptions(null));
  }, []);
  return options;
}

/** The dark band with the pitch, beside the sign-in or sign-up form. */
export function AuthLayout({ children }: { children: ReactNode }) {
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
      <main className="login-main">{children}</main>
    </div>
  );
}

/** "Continue with Google" plus an "or" rule, when the server has Google set up. */
export function GoogleSection({ options, onError, text }: { options: SignInOptions | null; onError: (message: string | null) => void; text?: 'continue_with' | 'signup_with' }) {
  const { startSession } = useAuth();
  const navigate = useNavigate();
  if (!options?.googleClientId) return null;

  async function handleCredential(credential: string) {
    onError(null);
    try {
      const user = startSession(await api.googleLogin(credential));
      navigate(homePathFor(user.role), { replace: true });
    } catch (err) {
      onError(err instanceof ApiError ? err.message : UNREACHABLE);
    }
  }

  return (
    <>
      <GoogleButton clientId={options.googleClientId} onCredential={handleCredential} text={text} />
      <p className="login-or">
        <span>or</span>
      </p>
    </>
  );
}

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const options = useSignInOptions();
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
      setError(err instanceof ApiError && err.status === 401 ? 'That email and password combination is not right.' : UNREACHABLE);
      setSubmitting(false);
    }
  }

  const canSignUp = Boolean(options?.signupDomains.length);

  return (
    <AuthLayout>
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <h1>Sign in</h1>

        <GoogleSection options={options} onError={setError} />

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

        {canSignUp ? (
          <p className="login-note">
            New here? <Link to="/signup">Create an account</Link>
          </p>
        ) : (
          <p className="login-note">Accounts are set up by your admin.</p>
        )}
      </form>
    </AuthLayout>
  );
}
