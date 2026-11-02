import { auth } from '../auth/firebase';

/** Empty in development (Vite proxies /api); set VITE_API_URL when the backend is hosted elsewhere. */
function apiBase(value: string | undefined): string {
  const url = (value ?? '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export const API_BASE = apiBase(import.meta.env.VITE_API_URL);

/** Authorization header with the signed-in user's Firebase ID token (refreshed automatically by the SDK). */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth?.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
