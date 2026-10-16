import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../auth/AuthContext';
import { supabase } from '../supabase';
import { AuthLayout, UNREACHABLE, useSignInOptions } from './Login';

type Field = 'name' | 'email' | 'password';

export function Signup() {
  const { stage, user } = useAuth();
  const options = useSignInOptions();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Step 2: the address the code went to.
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (stage === 'ready' && user) return <Navigate to={homePathFor(user.role)} replace />;

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
    const { error: failed } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } });
    setSubmitting(false);
    if (failed) setError(failed.code === 'weak_password' ? 'Choose a stronger password.' : failed.message || UNREACHABLE);
    else setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <AuthLayout>
        <VerifyEmailCode
          email={sentTo}
          intro={`We sent a 6-digit code to ${sentTo}.`}
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

/**
 * The 6-digit code Supabase emails to confirm a new account. Entering it confirms the email
 * and signs in; AuthProvider then asks for the authenticator setup.
 */
export function VerifyEmailCode({ email, intro, onBack }: { email: string; intro: string; onBack: () => void }) {
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
    const { error: failed } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    setBusy(false);
    if (failed) setError(failed.code === 'otp_expired' ? 'That code is wrong or has expired. Check it, or send a new one.' : failed.message || UNREACHABLE);
  }

  async function resend() {
    setError(null);
    setNotice(null);
    const { error: failed } = await supabase.auth.resend({ type: 'signup', email });
    if (failed) setError(failed.code === 'over_email_send_rate_limit' ? 'Wait a minute before asking for another code.' : failed.message || UNREACHABLE);
    else {
      setCode('');
      setNotice('A new code is on its way.');
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <h1>Check your email</h1>
      <p className="login-lede">{intro} It works for 10 minutes.</p>

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
      {notice && (
        <p className="person-notice" role="status">
          {notice}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Checking…' : 'Confirm email'}
      </button>

      <p className="login-note">
        No email? Check spam, or{' '}
        <button type="button" className="btn-inline-link" onClick={resend}>
          send a new code
        </button>
        {' · '}
        <button type="button" className="btn-inline-link" onClick={onBack}>
          go back
        </button>
      </p>
    </form>
  );
}
