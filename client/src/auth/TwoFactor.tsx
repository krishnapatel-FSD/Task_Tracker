import { useEffect, useState, type FormEvent } from 'react';
import { AuthLayout, UNREACHABLE } from '../pages/Login';
import { supabase } from '../supabase';
import { useAuth } from './AuthContext';

/** Step after the password: set up the authenticator (first time) or enter its code. */
export function TwoFactorScreen() {
  const { stage } = useAuth();
  return <AuthLayout>{stage === 'enroll' ? <SetUpAuthenticator /> : <EnterAuthenticatorCode />}</AuthLayout>;
}

function CodeField({ code, setCode, invalid }: { code: string; setCode: (c: string) => void; invalid: boolean }) {
  return (
    <label className="field">
      <span className="field-label">6-digit code from the app</span>
      <input
        className="code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        aria-invalid={invalid}
        autoFocus
      />
    </label>
  );
}

function Footer() {
  const { email, logout } = useAuth();
  return (
    <p className="login-note">
      Signed in as {email}.{' '}
      <button type="button" className="btn-inline-link" onClick={() => logout()}>
        Use a different account
      </button>
    </p>
  );
}

/** First sign-in: scan a QR code with an authenticator app, then confirm with one code. */
function SetUpAuthenticator() {
  const { refresh } = useAuth();
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // A setup that was started and abandoned blocks a new one; clear it first.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error: failed } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${Date.now()}` });
      if (cancelled) return;
      if (failed || !data) setError(failed?.message || UNREACHABLE);
      else setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!factor) return;
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code shown in the app.');
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (failed) {
      setBusy(false);
      setError(failed.code === 'mfa_verification_failed' ? "That code isn't right. Use the newest code in the app." : failed.message || UNREACHABLE);
      return;
    }
    await refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <h1>Set up two-step sign-in</h1>
      <ol className="twofa-steps">
        <li>
          Install <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> on your phone.
        </li>
        <li>In the app, tap <strong>+</strong> and scan this code.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>

      <div className="twofa-qr">
        {factor ? <img src={factor.qr} alt="QR code to add Task Tracker to your authenticator app" width={180} height={180} /> : <span>Preparing your code…</span>}
      </div>
      {factor && (
        <p className="login-note">
          Can't scan?{' '}
          {showSecret ? (
            <>
              Enter this key in the app: <code className="twofa-secret">{factor.secret}</code>
            </>
          ) : (
            <button type="button" className="btn-inline-link" onClick={() => setShowSecret(true)}>
              Show a key to type instead
            </button>
          )}
        </p>
      )}

      <CodeField code={code} setCode={setCode} invalid={Boolean(error)} />

      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={busy || !factor}>
        {busy ? 'Checking…' : 'Turn on and continue'}
      </button>
      <Footer />
    </form>
  );
}

/** Every sign-in after the password: the current code from the authenticator app. */
function EnterAuthenticatorCode() {
  const { refresh } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your authenticator app.');
    setBusy(true);
    setError(null);
    const { data: list } = await supabase.auth.mfa.listFactors();
    const factor = list?.totp[0];
    if (!factor) {
      setBusy(false);
      return refresh();
    }
    const { error: failed } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (failed) {
      setBusy(false);
      setCode('');
      setError(failed.code === 'mfa_verification_failed' ? "That code isn't right. Use the newest code in the app." : failed.message || UNREACHABLE);
      return;
    }
    await refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <h1>Enter your code</h1>
      <p className="login-lede">Open your authenticator app and type the 6-digit code for Task Tracker.</p>
      <CodeField code={code} setCode={setCode} invalid={Boolean(error)} />
      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Checking…' : 'Continue'}
      </button>
      <p className="login-note">Lost your phone? Ask your admin to reset your two-step sign-in.</p>
      <Footer />
    </form>
  );
}
