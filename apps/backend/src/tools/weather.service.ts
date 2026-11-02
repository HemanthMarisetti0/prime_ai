import { Injectable } from '@nestjs/common';
import type { UserLocation, WeatherReport } from '@prime/shared';

const CACHE_TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 8000;

// WMO weather interpretation codes used by Open-Meteo.
const CONDITIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Violent showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
};

const condition = (code: number) => CONDITIONS[code] ?? 'Unknown conditions';

interface ForecastResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    precipitation: number;
    weather_code: number;
    is_day: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
  };
}

interface GeocodeResponse {
  results?: { name: string; latitude: number; longitude: number; admin1?: string; country?: string }[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Weather service responded with ${res.status}`);
  return (await res.json()) as T;
}

/** Weather via Open-Meteo (free, no API key). */
@Injectable()
export class WeatherService {
  private readonly cache = new Map<string, { at: number; report: WeatherReport }>();

  /** Weather for a named place, or for `fallback` (Sir's location) when no place is given. */
  async getWeather(place: string | undefined, fallback: UserLocation | undefined): Promise<WeatherReport> {
    const target = place?.trim() ? await this.geocode(place.trim()) : fallback;
    if (!target) {
      throw new Error("Sir's location is unknown. Politely ask Sir which city to check, or to allow location access.");
    }

    const key = `${target.latitude.toFixed(2)},${target.longitude.toFixed(2)}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.report;

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: String(target.latitude),
      longitude: String(target.longitude),
      current:
        'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'auto',
      forecast_days: '3',
    }).toString();
    const data = await getJson<ForecastResponse>(url.toString());

    const report: WeatherReport = {
      location: target.label ?? `${target.latitude.toFixed(2)}, ${target.longitude.toFixed(2)}`,
      updatedAt: data.current.time,
      current: {
        temperatureC: Math.round(data.current.temperature_2m),
        feelsLikeC: Math.round(data.current.apparent_temperature),
        humidityPercent: Math.round(data.current.relative_humidity_2m),
        windKph: Math.round(data.current.wind_speed_10m),
        precipitationMm: data.current.precipitation,
        condition: condition(data.current.weather_code),
        isDay: data.current.is_day === 1,
      },
      daily: data.daily.time.map((date, i) => ({
        date,
        condition: condition(data.daily.weather_code[i]),
        maxC: Math.round(data.daily.temperature_2m_max[i]),
        minC: Math.round(data.daily.temperature_2m_min[i]),
        rainChancePercent: data.daily.precipitation_probability_max[i] ?? null,
      })),
    };
    this.cache.set(key, { at: Date.now(), report });
    return report;
  }

  private async geocode(place: string): Promise<UserLocation> {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({ name: place, count: '1', language: 'en' }).toString();
    const match = (await getJson<GeocodeResponse>(url.toString())).results?.[0];
    if (!match) throw new Error(`No place called "${place}" was found.`);
    return {
      latitude: match.latitude,
      longitude: match.longitude,
      label: [match.name, match.admin1, match.country].filter(Boolean).join(', '),
    };
  }
}
