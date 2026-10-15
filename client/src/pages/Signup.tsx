import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { homePathFor, useAuth } from '../auth/AuthContext';
import { AuthLayout, GoogleSection, useSignInOptions } from './Login';

type Field = 'name' | 'email' | 'password';

export function Signup() {
  const { user, startSession } = useAuth();
  const navigate = useNavigate();
  const options = useSignInOptions();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  const domains = options?.signupDomains ?? [];
  const domainList = domains.map((d) => '@' + d).join(' or ');

  function check() {
    const next: Partial<Record<Field, string>> = {};
    if (!name.trim()) next.name = 'Enter your name.';
    const domain = email.trim().toLowerCase().split('@')[1];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    else if (domains.length && !domains.includes(domain)) next.email = `Use your ${domainList} email.`;
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!check()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = startSession(await api.signup(name.trim(), email.trim(), password));
      navigate(homePathFor(created.role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't reach the server. Try again in a moment.");
      setSubmitting(false);
    }
  }

  // Sign-up closed on this server: say so instead of showing a form that can't work.
  if (options && domains.length === 0) {
    return (
      <AuthLayout>
        <div className="login-form">
          <h1>Create an account</h1>
          <p>Accounts are set up by your admin. Ask them to add you, then sign in.</p>
          <Link to="/login" className="btn btn-primary btn-block">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const fieldError = (f: Field) =>
    errors[f] && (
      <span className="field-error" id={`signup-${f}-error`}>
        {errors[f]}
      </span>
    );

  return (
    <AuthLayout>
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <h1>Create an account</h1>
        {domainList && <p className="login-lede">For people with a {domainList} email.</p>}

        <GoogleSection options={options} onError={setError} text="signup_with" />

        <label className="field">
          <span className="field-label">Your name</span>
          <input autoComplete="name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'signup-name-error' : undefined} autoFocus />
          {fieldError('name')}
        </label>

        <label className="field">
          <span className="field-label">Work email</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'signup-email-error' : undefined} />
          {fieldError('email')}
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input type="password" autoComplete="new-password" value={password} maxLength={72} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'signup-password-error' : 'signup-password-hint'} />
          {fieldError('password') || (
            <span className="field-hint" id="signup-password-hint">
              At least 8 characters.
            </span>
          )}
        </label>

        {error && (
          <p className="banner banner-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creating your account…' : 'Create account'}
        </button>

        <p className="login-note">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
