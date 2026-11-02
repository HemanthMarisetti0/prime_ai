import { auth } from '../auth/firebase';

// Empty in development (Vite proxies /api); set VITE_API_URL when the backend is hosted elsewhere.
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/** Authorization header with the signed-in user's Firebase ID token (refreshed automatically by the SDK). */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth?.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
