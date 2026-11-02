import type {
  ApiErrorResponse,
  PcAppId,
  PcPowerAction,
  ScreenBrightness,
  SystemVolume,
  SystemVolumeRequest,
} from '@prime/shared';
import type { BrightnessRequest } from '../pc/commands';
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

async function post<T extends object>(path: string, body: object, isResult: (data: object) => boolean): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/pc/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PcControlError('My apologies, Sir. I cannot reach my server.', false);
  }
  const data = (await res.json().catch(() => null)) as T | ApiErrorResponse | null;
  if (!res.ok || !data || !isResult(data)) {
    const detail = data && 'message' in data ? data.message : undefined;
    const message = (Array.isArray(detail) ? detail.join('; ') : detail) ?? 'My apologies, Sir. That did not work.';
    throw new PcControlError(message, res.status === 503 && /disabled/i.test(message));
  }
  return data as T;
}

export const setSystemVolume = (request: SystemVolumeRequest) =>
  post<SystemVolume>('volume', request, (d) => 'percent' in d);

export const setBrightness = (request: BrightnessRequest) =>
  post<ScreenBrightness>('brightness', request, (d) => 'percent' in d);

export const openApp = (app: PcAppId) => post<{ app: string }>('app', { app }, (d) => 'app' in d);

export const powerAction = (action: PcPowerAction) =>
  post<{ action: PcPowerAction; inSeconds: number }>('power', { action }, (d) => 'inSeconds' in d);
