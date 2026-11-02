// Empty in development (Vite proxies /api); set VITE_API_URL when the backend is hosted elsewhere.
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
