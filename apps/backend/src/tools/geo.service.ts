import { Injectable } from '@nestjs/common';
import type { Place, UserLocation } from '@prime/shared';

const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 30 * 60_000;
// Nominatim usage policy: identify the app and send at most one request per second.
export const OSM_USER_AGENT = 'PRIME-personal-assistant/0.1';
const MIN_INTERVAL_MS = 1100;
// Search box around Sir for "near me" queries (~10 km).
const NEARBY_DEGREES = 0.09;

interface NominatimResult {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  type?: string;
}

export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const mapsLink = (latitude: number, longitude: number) =>
  `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: `${latitude},${longitude}` })}`;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Place search and geocoding via OpenStreetMap Nominatim (free). */
@Injectable()
export class GeoService {
  private readonly cache = new Map<string, { at: number; results: NominatimResult[] }>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  /** Finds places matching `query`; restricted to Sir's surroundings when `near` is given. */
  async searchPlaces(query: string, near: UserLocation | undefined, limit = 5): Promise<Place[]> {
    const params: Record<string, string> = { q: query, format: 'jsonv2', limit: String(limit) };
    if (near) {
      const { latitude: lat, longitude: lon } = near;
      params.viewbox = [lon - NEARBY_DEGREES, lat + NEARBY_DEGREES, lon + NEARBY_DEGREES, lat - NEARBY_DEGREES].join(',');
      params.bounded = '1';
    }
    const results = await this.request(params);
    const places = results.map((r) => {
      const latitude = Number(r.lat);
      const longitude = Number(r.lon);
      const [first, ...rest] = r.display_name.split(', ');
      return {
        name: r.name || first,
        address: (r.name ? r.display_name.replace(`${r.name}, `, '') : rest.join(', ')).split(', ').slice(0, 4).join(', '),
        category: (r.type ?? r.category ?? 'place').replace(/_/g, ' '),
        latitude,
        longitude,
        distanceKm: near ? round1(haversineKm(near, { latitude, longitude })) : null,
        mapsUrl: mapsLink(latitude, longitude),
      };
    });
    return near ? places.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0)) : places;
  }

  /** Resolves a place name to coordinates, preferring results near Sir when known. */
  async geocode(place: string, near?: UserLocation): Promise<UserLocation> {
    const nearby = near ? await this.searchPlaces(place, near, 1) : [];
    const [match] = nearby.length ? nearby : await this.searchPlaces(place, undefined, 1);
    if (!match) throw new Error(`I could not find "${place}" on the map.`);
    return { latitude: match.latitude, longitude: match.longitude, label: match.name };
  }

  private request(params: Record<string, string>): Promise<NominatimResult[]> {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams(params)}`;
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return Promise.resolve(cached.results);

    // Serialise and space requests to respect the one-per-second policy.
    const next = this.queue.then(async () => {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastRequestAt = Date.now();
      const res = await fetch(url, {
        headers: { 'User-Agent': OSM_USER_AGENT, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Map search responded with ${res.status}`);
      const results = (await res.json()) as NominatimResult[];
      this.cache.set(url, { at: Date.now(), results });
      return results;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}
