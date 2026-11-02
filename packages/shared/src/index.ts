// Type-only contract between frontend and backend.
// Consumers must use `import type` so nothing is required at runtime.

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  /** Human-readable place name, if known. */
  label?: string;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
  /** Sir's current location, used for weather when no place is named. */
  location?: UserLocation;
}

export interface WeatherReport {
  location: string;
  updatedAt: string;
  current: {
    temperatureC: number;
    feelsLikeC: number;
    humidityPercent: number;
    windKph: number;
    precipitationMm: number;
    condition: string;
    isDay: boolean;
  };
  daily: { date: string; condition: string; maxC: number; minC: number; rainChancePercent: number | null }[];
}

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}

export interface NewsReport {
  /** Search topic, or null for top stories. */
  topic: string | null;
  region: string;
  items: NewsItem[];
}

/** Extra HUD panels the frontend should show alongside a reply. */
export type ChatDisplay = 'system';

export interface ChatResponse {
  reply: string;
  display?: ChatDisplay;
  weather?: WeatherReport;
  news?: NewsReport;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface SystemSnapshot {
  capturedAt: string;
  os: { name: string; build: string; arch: string; uptimeSeconds: number };
  cpu: { model: string; physicalCores: number | null; threads: number; loadPercent: number | null; temperatureC: number | null };
  memory: { totalBytes: number; usedBytes: number; usedPercent: number };
  disks: { mount: string; totalBytes: number; usedBytes: number; usedPercent: number }[];
  gpus: { model: string; vramMB: number | null; temperatureC: number | null }[];
  battery: { present: boolean; percent: number | null; charging: boolean | null; pluggedIn: boolean | null; minutesRemaining: number | null };
  backend: { nodeVersion: string; memoryMB: number };
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}
