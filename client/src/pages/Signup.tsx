import { useState, type FormEvent } from 'react';
import type { Session } from '../api';
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
  // Step 2: the address the code went to.
  const [sentTo, setSentTo] = useState<{ email: string; minutes: number } | null>(null);

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
      const sent = await api.signup(name.trim(), email.trim(), password);
      setSentTo({ email: sent.email, minutes: sent.expiresInMinutes });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't reach the server. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout>
        <VerifyCode
          sentTo={sentTo}
          onResend={() => api.signup(name.trim(), email.trim(), password).then(() => undefined)}
          onVerified={(session) => navigate(homePathFor(startSession(session).role), { replace: true })}
          onBack={() => {
            setSentTo(null);
            setError(null);
          }}
        />
      </AuthLayout>
    );
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
        {domainList && <p className="login-lede">For people with a {domainList} email. We'll email you a code to confirm it's yours.</p>}

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
          {submitting ? 'Sending your code…' : 'Continue'}
        </button>

        <p className="login-note">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

/** Step 2: the 6-digit code from the email. The account is created when it's right. */
function VerifyCode({ sentTo, onResend, onVerified, onBack }: { sentTo: { email: string; minutes: number }; onResend: () => Promise<void>; onVerified: (session: Session) => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      onVerified(await api.verifySignup(sentTo.email, code));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't reach the server. Try again in a moment.");
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    try {
      await onResend();
      setCode('');
      setNotice('A new code is on its way.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't reach the server. Try again in a moment.");
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <h1>Check your email</h1>
      <p className="login-lede">
        We sent a 6-digit code to <strong>{sentTo.email}</strong>. It works for {sentTo.minutes} minutes.
      </p>

      <label className="field">
        <span className="field-label">Code</span>
        <input
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          aria-invalid={Boolean(error)}
          autoFocus
        />
      </label>

      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="person-notice" role="status">{notice}</p>}

      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Checking…' : 'Create account'}
      </button>

      <p className="login-note">
        No email? Check spam, or{' '}
        <button type="button" className="btn-inline-link" onClick={resend}>
          send a new code
        </button>
        {' · '}
        <button type="button" className="btn-inline-link" onClick={onBack}>
          use a different email
        </button>
      </p>
    </form>
  );
}
