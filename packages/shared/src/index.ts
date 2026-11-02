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

/** What the HUD's media player is doing, so the assistant can refer to it. */
export interface MediaState {
  title: string;
  playing: boolean;
}

export type ChatImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

/** An image attached to the current message (base64, without a data: prefix). */
export interface ChatImage {
  mimeType: ChatImageMimeType;
  data: string;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
  /** Sir's current location, used for weather when no place is named. */
  location?: UserLocation;
  media?: MediaState;
  image?: ChatImage;
}

export interface YouTubeVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  url: string;
}

export interface YouTubeResults {
  query: string;
  /** Always available, even without an API key. */
  searchUrl: string;
  /** Empty when no YouTube API key is configured. */
  videos: YouTubeVideo[];
  /** Start playing the first video straight away. */
  autoplay: boolean;
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

export interface Place {
  name: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
  /** Straight-line distance from Sir, when Sir's location is known. */
  distanceKm: number | null;
  mapsUrl: string;
}

export interface PlacesResult {
  query: string;
  near: string | null;
  places: Place[];
}

export type TravelMode = 'driving' | 'walking' | 'cycling' | 'transit';

export interface DirectionsResult {
  from: string;
  to: string;
  mode: TravelMode;
  /** Road distance, or straight-line distance for transit (no route computed). */
  distanceKm: number;
  /** Estimated travel time without live traffic; null for transit. */
  durationMinutes: number | null;
  steps: { instruction: string; distanceKm: number }[];
  /** Opens turn-by-turn navigation in Google Maps. */
  navigationUrl: string;
}

export interface TripPlan {
  destination: string;
  durationDays: number;
  travellers: number;
  summary: string;
  days: { day: number; title: string; activities: string[] }[];
  budget: {
    currency: string;
    items: { category: string; amount: number; note?: string }[];
    total: number;
  };
  tips: string[];
}

export interface PersonFact {
  label: string;
  value: string;
}

/** A profile card about someone (or something) Sir asked about, from Wikipedia. */
export interface PersonProfile {
  name: string;
  /** Short tagline, e.g. "Indian cricketer (born 1988)". */
  description: string | null;
  summary: string;
  imageUrl: string | null;
  /** False when the best match wasn't a person (e.g. a band or a fictional character). */
  isPerson: boolean;
  /** Born, age, nationality, occupation and similar; empty when unknown. */
  facts: PersonFact[];
  sourceUrl: string;
}

/** Extra HUD panels the frontend should show alongside a reply. */
export type ChatDisplay = 'system';

export interface ChatResponse {
  reply: string;
  /** Gemini model that produced the reply (may be a fallback). */
  model?: string;
  display?: ChatDisplay;
  weather?: WeatherReport;
  news?: NewsReport;
  youtube?: YouTubeResults;
  places?: PlacesResult;
  directions?: DirectionsResult;
  trip?: TripPlan;
  person?: PersonProfile;
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

export type SystemVolumeAction = 'get' | 'set' | 'up' | 'down' | 'mute' | 'unmute';

export interface SystemVolumeRequest {
  action: SystemVolumeAction;
  /** Target level for "set", or step size for "up"/"down" (0-100). */
  level?: number;
}

export interface SystemVolume {
  percent: number;
  muted: boolean;
}

export type PcAppId =
  | 'vscode'
  | 'notepad'
  | 'calculator'
  | 'explorer'
  | 'chrome'
  | 'edge'
  | 'taskmanager'
  | 'settings'
  | 'paint';

export type PcPowerAction = 'lock' | 'sleep';

export interface ScreenBrightness {
  percent: number;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}
