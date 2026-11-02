import { Injectable } from '@nestjs/common';
import type { DirectionsResult, TravelMode, UserLocation } from '@prime/shared';
import { GeoService, haversineKm, OSM_USER_AGENT } from './geo.service';

const TIMEOUT_MS = 12_000;
const MAX_STEPS = 15;

// FOSSGIS-hosted OSRM servers (free, fair use) for each mode.
const ROUTERS: Record<Exclude<TravelMode, 'transit'>, string> = {
  driving: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
  walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
};

const GOOGLE_MODES: Record<TravelMode, string> = {
  driving: 'driving',
  cycling: 'bicycling',
  walking: 'walking',
  transit: 'transit',
};

interface OsrmStep {
  distance: number;
  name: string;
  maneuver: { type: string; modifier?: string; exit?: number };
}

interface OsrmResponse {
  code: string;
  routes?: { distance: number; duration: number; legs: { steps: OsrmStep[] }[] }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function describeStep({ maneuver, name }: OsrmStep): string {
  const onto = name ? ` onto ${name}` : '';
  const { type, modifier, exit } = maneuver;
  switch (type) {
    case 'depart':
      return name ? `Start on ${name}` : 'Set off';
    case 'arrive':
      return 'Arrive at your destination';
    case 'roundabout':
    case 'rotary':
      return `At the roundabout, take exit ${exit ?? ''}${onto}`.replace('  ', ' ');
    case 'merge':
      return `Merge${onto}`;
    case 'fork':
      return `Keep ${modifier ?? 'ahead'} at the fork${onto}`;
    case 'on ramp':
      return `Take the ramp${onto}`;
    case 'off ramp':
      return `Take the exit${onto}`;
    default:
      if (!modifier || modifier === 'straight') return name ? `Continue onto ${name}` : 'Continue straight';
      if (modifier === 'uturn') return `Make a U-turn${onto}`;
      return capitalise(`turn ${modifier}${onto}`);
  }
}

const navigationUrl = (from: UserLocation, to: UserLocation, mode: TravelMode) =>
  `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: '1',
    origin: `${from.latitude},${from.longitude}`,
    destination: `${to.latitude},${to.longitude}`,
    travelmode: GOOGLE_MODES[mode],
  })}`;

/** Routes via OpenStreetMap routing (no live traffic); transit hands off to Google Maps. */
@Injectable()
export class DirectionsService {
  constructor(private readonly geo: GeoService) {}

  async getDirections(
    destination: string,
    origin: string | undefined,
    mode: TravelMode,
    here: UserLocation | undefined,
  ): Promise<DirectionsResult> {
    const from = origin?.trim() ? await this.geo.geocode(origin, here) : here;
    if (!from) {
      throw new Error("Sir's location is unknown. Politely ask for a starting point or for location access.");
    }
    const to = await this.geo.geocode(destination, from);
    const fromLabel = origin?.trim() ? (from.label ?? origin) : 'Your location';
    const toLabel = to.label ?? destination;

    if (mode === 'transit') {
      return {
        from: fromLabel,
        to: toLabel,
        mode,
        distanceKm: round1(haversineKm(from, to)),
        durationMinutes: null,
        steps: [],
        navigationUrl: navigationUrl(from, to, mode),
      };
    }

    const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
    const res = await fetch(`${ROUTERS[mode]}/${coords}?overview=false&steps=true`, {
      headers: { 'User-Agent': OSM_USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => null)) as OsrmResponse | null;
    const route = data?.routes?.[0];
    if (!res.ok || data?.code !== 'Ok' || !route) throw new Error('No route could be found between those places.');

    const steps = route.legs
      .flatMap((leg) => leg.steps)
      .filter((step) => step.distance > 0 || step.maneuver.type === 'arrive')
      .map((step) => ({ instruction: describeStep(step), distanceKm: round1(step.distance / 1000) }));

    return {
      from: fromLabel,
      to: toLabel,
      mode,
      distanceKm: round1(route.distance / 1000),
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
      steps: steps.length > MAX_STEPS ? [...steps.slice(0, MAX_STEPS - 1), steps.at(-1)!] : steps,
      navigationUrl: navigationUrl(from, to, mode),
    };
  }
}
