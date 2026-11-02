import { useState } from 'react';
import { Reactor } from './Reactor';

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

interface LoginScreenProps {
  loading: boolean;
  error: string | null;
  onSignIn: () => Promise<void>;
}

export function LoginScreen({ loading, error, onSignIn }: LoginScreenProps) {
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    await onSignIn();
    setBusy(false);
  };

  return (
    <div className="login">
      <section className="login__panel panel" aria-labelledby="login-title">
        <div className="login__reactor">
          <Reactor state={loading || busy ? 'thinking' : 'connecting'} active={false} disabled label="P.R.I.M.E. core" onActivate={() => {}} />
        </div>
        <h1 className="login__brand">P.R.I.M.E.</h1>
        <p className="login__subtitle">Personal Reasoning &amp; Intelligent Machine Engine</p>

        <p id="login-title" className="login__status">
          {loading ? 'Verifying identity' : 'Identity verification required'}
        </p>
        {!loading && (
          <>
            <p className="login__message">{greeting()}, Sir. Kindly sign in so I may be of service.</p>
            <button type="button" className="hud-btn login__button" onClick={signIn} disabled={busy}>
              <GoogleMark />
              {busy ? 'Awaiting confirmation…' : 'Sign in with Google'}
            </button>
          </>
        )}
        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z" />
    </svg>
  );
}
