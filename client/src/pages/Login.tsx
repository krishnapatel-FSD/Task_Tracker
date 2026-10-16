import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { homePathFor, useAuth } from '../auth/AuthContext';
import { Logo } from '../components/Shell';
import { supabase } from '../supabase';
import type { SignInOptions } from '../types';
import { VerifyEmailCode } from './Signup';

export const UNREACHABLE = "We couldn't reach the server. Try again in a moment.";

let optionsLoad: Promise<SignInOptions> | null = null;

/** Which email domains may sign up, from the server. Null while loading or if it can't be reached. */
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

/** The dark band with the pitch, beside the sign-in, sign-up and 2FA forms. */
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

export function Login() {
  const { stage, user, notice } = useAuth();
  const options = useSignInOptions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Signed up but never entered the emailed code: finish that first.
  const [unconfirmed, setUnconfirmed] = useState(false);

  if (stage === 'ready' && user) return <Navigate to={homePathFor(user.role)} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: failed } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (!failed) return; // AuthProvider moves on to the authenticator step.
    if (failed.code === 'email_not_confirmed') {
      await supabase.auth.resend({ type: 'signup', email: email.trim() }).catch(() => undefined);
      setUnconfirmed(true);
    } else if (failed.code === 'invalid_credentials') {
      setError('That email and password combination is not right.');
    } else {
      setError(failed.message || UNREACHABLE);
    }
  }

  if (unconfirmed) {
    return (
      <AuthLayout>
        <VerifyEmailCode
          email={email.trim()}
          intro="Your email isn't confirmed yet. We've sent you a new code."
          onBack={() => setUnconfirmed(false)}
        />
      </AuthLayout>
    );
  }

  const canSignUp = Boolean(options?.signupDomains.length);

  return (
    <AuthLayout>
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <h1>Sign in</h1>

        {notice && !error && (
          <p className="banner banner-error" role="alert">
            {notice}
          </p>
        )}

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

        <p className="login-note">After your password you'll enter a code from your authenticator app.</p>

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
