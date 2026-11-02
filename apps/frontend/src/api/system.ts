import type { SystemSnapshot } from '@prime/shared';
import { API_BASE, authHeaders } from './config';

/** Returns null when monitoring is unavailable or disabled on the server. */
export async function fetchSystemSnapshot(signal?: AbortSignal): Promise<SystemSnapshot | null> {
  try {
    const res = await fetch(`${API_BASE}/api/system`, { signal, headers: await authHeaders() });
    return res.ok ? ((await res.json()) as SystemSnapshot) : null;
  } catch {
    return null;
  }
}
