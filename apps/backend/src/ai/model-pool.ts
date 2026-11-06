import { ApiError } from '@google/genai';

export type FallbackReason = 'quota exhausted' | 'unavailable' | 'overloaded' | 'unreachable';

const MINUTE_QUOTA_REST_S = 60;
const DAILY_QUOTA_REST_S = 60 * 60;
const OVERLOADED_REST_S = 30;

/** Seconds Google asks us to wait, from "Please retry in 41.2s" or a RetryInfo "retryDelay": "41s". */
export function parseRetrySeconds(message: string): number | null {
  const match = /retry in ([\d.]+)s/i.exec(message) ?? /"retryDelay"\s*:\s*"(\d+)s"/.exec(message);
  const seconds = match ? Number(match[1]) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

/**
 * Decides whether a Gemini error is specific to the model (so another model may succeed)
 * and how long that model should rest. Returns null for errors another model wouldn't fix.
 */
export function classifyModelError(error: unknown): { reason: FallbackReason; restSeconds: number } | null {
  if (!(error instanceof ApiError)) return null;
  const message = error.message ?? '';
  switch (error.status) {
    case 429: {
      const daily = /PerDay/i.test(message);
      return {
        reason: 'quota exhausted',
        restSeconds: parseRetrySeconds(message) ?? (daily ? DAILY_QUOTA_REST_S : MINUTE_QUOTA_REST_S),
      };
    }
    case 404:
      return { reason: 'unavailable', restSeconds: Infinity };
    case 400:
      // e.g. "models/x is not found for API version v1beta, or is not supported for generateContent"
      return /not (found|supported)/i.test(message) ? { reason: 'unavailable', restSeconds: Infinity } : null;
    case 500:
    case 503:
    case 504:
      return { reason: 'overloaded', restSeconds: OVERLOADED_REST_S };
    default:
      return null;
  }
}

/** Ordered list of models with per-model rest periods after quota or availability failures. */
export class ModelPool {
  readonly models: string[];
  private readonly restUntil = new Map<string, number>();

  constructor(models: string[], private readonly now: () => number = Date.now) {
    this.models = [...new Set(models.map((m) => m.trim()).filter(Boolean))];
  }

  /** Models not currently resting, in preference order. */
  available(): string[] {
    const now = this.now();
    return this.models.filter((model) => (this.restUntil.get(model) ?? 0) <= now);
  }

  rest(model: string, seconds: number) {
    this.restUntil.set(model, seconds === Infinity ? Infinity : this.now() + seconds * 1000);
  }

  /** Seconds until the first resting model is usable again (null if none will recover). */
  secondsUntilNextAvailable(): number | null {
    const now = this.now();
    const times = this.models.map((m) => this.restUntil.get(m) ?? 0).filter((t) => t !== Infinity);
    if (!times.length) return null;
    return Math.max(0, Math.ceil((Math.min(...times) - now) / 1000));
  }
}
