import type { ApiErrorResponse, SystemVolume, SystemVolumeRequest } from '@prime/shared';
import { API_BASE, authHeaders } from './config';

export class PcControlError extends Error {
  /** True when the server has PC control switched off (the AI can explain instead). */
  readonly unavailable: boolean;

  constructor(message: string, unavailable: boolean) {
    super(message);
    this.name = 'PcControlError';
    this.unavailable = unavailable;
  }
}

export async function setSystemVolume(request: SystemVolumeRequest): Promise<SystemVolume> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/pc/volume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(request),
    });
  } catch {
    throw new PcControlError('My apologies, Sir. I cannot reach my server.', false);
  }
  const data = (await res.json().catch(() => null)) as SystemVolume | ApiErrorResponse | null;
  if (!res.ok || !data || !('percent' in data)) {
    const detail = data && 'message' in data ? data.message : undefined;
    const message = (Array.isArray(detail) ? detail.join('; ') : detail) ?? 'My apologies, Sir. I could not adjust the system volume.';
    throw new PcControlError(message, res.status === 503 && /disabled/i.test(message));
  }
  return data;
}
