import { Injectable } from '@nestjs/common';

const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 60 * 60_000;

export interface Conversion {
  amount: number;
  from: string;
  to: string;
  result: number;
  rate: number;
  date: string;
}

/** Currency conversion with European Central Bank reference rates via Frankfurter (free, no key). */
@Injectable()
export class CurrencyService {
  private readonly cache = new Map<string, { at: number; rate: number; date: string }>();

  async convert(amount: number, from: string, to: string): Promise<Conversion> {
    const base = from.trim().toUpperCase();
    const target = to.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(target)) throw new Error('Use three-letter currency codes, e.g. USD or INR.');

    let rate = 1;
    let date = new Date().toISOString().slice(0, 10);
    if (base !== target) {
      const key = `${base}-${target}`;
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        ({ rate, date } = cached);
      } else {
        const url = `https://api.frankfurter.dev/v1/latest?${new URLSearchParams({ base, symbols: target })}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        const data = (await res.json().catch(() => null)) as { date?: string; rates?: Record<string, number> } | null;
        const found = data?.rates?.[target];
        if (!res.ok || !found) throw new Error(`Exchange rates for ${base} to ${target} are unavailable.`);
        rate = found;
        date = data?.date ?? date;
        this.cache.set(key, { at: Date.now(), rate, date });
      }
    }
    return { amount, from: base, to: target, rate, date, result: Math.round(amount * rate * 100) / 100 };
  }
}
