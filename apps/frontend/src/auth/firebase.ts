import { initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

// Firebase web config is public by design; access is enforced by the backend allowlist.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** False when Firebase isn't configured, in which case the app runs without sign-in (development only). */
export const authEnabled = Boolean(config.apiKey && config.authDomain && config.projectId);

export const auth: Auth | null = authEnabled ? getAuth(initializeApp(config)) : null;

if (!authEnabled && import.meta.env.PROD) {
  console.error('P.R.I.M.E.: Firebase is not configured for this production build; sign-in is unavailable.');
}
