import { useCallback, useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { auth, authEnabled } from './firebase';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out' | 'disabled';

const SIGN_IN_ERRORS: Record<string, string> = {
  'auth/popup-closed-by-user': 'The sign-in window was closed before completing, Sir.',
  'auth/cancelled-popup-request': 'The sign-in window was closed before completing, Sir.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window, Sir. Kindly allow pop-ups for this site.',
  'auth/network-request-failed': 'I could not reach the sign-in service, Sir. Kindly check your connection.',
  'auth/unauthorized-domain': 'This address is not authorised for sign-in. Add it under Authentication → Settings in Firebase.',
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(authEnabled ? 'loading' : 'disabled');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setStatus(next ? 'signed-in' : 'signed-out');
    });
  }, []);

  const signIn = useCallback(async () => {
    if (!auth) return;
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(SIGN_IN_ERRORS[code] ?? 'My apologies, Sir. Sign-in did not succeed. Would you kindly try again?');
    }
  }, []);

  const signOut = useCallback(async () => {
    if (auth) await firebaseSignOut(auth);
  }, []);

  return { user, status, error, signIn, signOut };
}
