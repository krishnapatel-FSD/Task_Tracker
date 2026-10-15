import { useEffect, useRef, useState } from 'react';

// The bits of Google Identity Services this button uses.
interface GoogleId {
  initialize(options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: 'popup' }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let scriptLoad: Promise<void> | null = null;
function loadGoogleScript() {
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoad = null;
      reject(new Error('Google sign-in could not load'));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

/** Google's own "Continue with Google" button. Hands the ID token to onCredential. */
export function GoogleButton({ clientId, onCredential, text = 'continue_with' }: { clientId: string; onCredential: (credential: string) => void; text?: 'continue_with' | 'signup_with' }) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        const id = window.google?.accounts.id;
        if (cancelled || !id || !ref.current) return;
        id.initialize({ client_id: clientId, callback: (r) => callback.current(r.credential), ux_mode: 'popup' });
        id.renderButton(ref.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.min(ref.current.offsetWidth || 368, 400),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (failed) return <p className="login-note">Google sign-in couldn't load. Use your email and password instead.</p>;
  return <div ref={ref} className="google-button" />;
}
