import { useCallback, useRef } from 'react';
import type { UserLocation } from '@prime/shared';

const TIMEOUT_MS = 10_000;
const MAX_AGE_MS = 30 * 60_000;

// ~1 km precision is plenty for weather and avoids sharing an exact position.
const round2 = (n: number) => Math.round(n * 100) / 100;

async function placeName(latitude: number, longitude: number): Promise<string | undefined> {
  try {
    const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      localityLanguage: 'en',
    }).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { city?: string; locality?: string; principalSubdivision?: string; countryName?: string };
    const place = data.city || data.locality;
    return [place, data.principalSubdivision, data.countryName].filter(Boolean).join(', ') || undefined;
  } catch {
    return undefined;
  }
}

/** Browser location, requested lazily and remembered for the session. Resolves null if unavailable or denied. */
export function useGeolocation() {
  const locationRef = useRef<UserLocation | null>(null);
  const pendingRef = useRef<Promise<UserLocation | null> | null>(null);

  const getLocation = useCallback((): Promise<UserLocation | null> => {
    if (locationRef.current) return Promise.resolve(locationRef.current);
    if (!('geolocation' in navigator)) return Promise.resolve(null);

    pendingRef.current ??= new Promise<UserLocation | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const latitude = round2(coords.latitude);
          const longitude = round2(coords.longitude);
          locationRef.current = { latitude, longitude, label: await placeName(latitude, longitude) };
          resolve(locationRef.current);
        },
        () => resolve(null),
        { timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
      );
    }).finally(() => {
      pendingRef.current = null;
    });
    return pendingRef.current;
  }, []);

  const knownLocation = useCallback(() => locationRef.current, []);

  return { getLocation, knownLocation };
}
