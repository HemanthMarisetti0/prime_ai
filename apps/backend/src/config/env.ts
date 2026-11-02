// Central, validated configuration. Values come from .env.development (pnpm dev)
// or .env.production (pnpm start), loaded by Node's --env-file flag.

export type NodeEnv = 'development' | 'production';

export interface AppEnv {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  corsOrigins: string[];
  gemini: { apiKey: string; model: string };
  systemMonitor: boolean;
  /** Control of the host PC (currently: Windows system volume). */
  pcControl: boolean;
  newsRegion: string;
  /** Optional: enables picking and embedding specific YouTube videos. */
  youtubeApiKey: string;
  auth: {
    /** Empty disables authentication (development only). */
    firebaseProjectId: string;
    /** Lower-cased emails allowed to use the assistant; empty allows any verified Google account. */
    allowedEmails: string[];
  };
}

const text = (value: string | undefined) => value?.trim() ?? '';
const list = (value: string | undefined) =>
  text(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const flag = (value: string | undefined, fallback: boolean) =>
  text(value) ? !['false', '0', 'no', 'off'].includes(text(value).toLowerCase()) : fallback;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const nodeEnv: NodeEnv = text(source.NODE_ENV) === 'production' ? 'production' : 'development';
  const isProduction = nodeEnv === 'production';

  const env: AppEnv = {
    nodeEnv,
    isProduction,
    port: Number(source.PORT) || 3000,
    corsOrigins: list(source.CORS_ORIGIN),
    gemini: { apiKey: text(source.GEMINI_API_KEY), model: text(source.GEMINI_MODEL) || 'gemini-2.5-flash' },
    // A cloud server would report its own hardware, so telemetry defaults off in production.
    systemMonitor: flag(source.SYSTEM_MONITOR, !isProduction),
    // Only meaningful when the backend runs on Sir's own Windows PC.
    pcControl: flag(source.PC_CONTROL, !isProduction) && process.platform === 'win32',
    newsRegion: (text(source.NEWS_REGION) || 'IN').toUpperCase(),
    youtubeApiKey: text(source.YOUTUBE_API_KEY),
    auth: {
      firebaseProjectId: text(source.FIREBASE_PROJECT_ID),
      allowedEmails: list(source.ALLOWED_EMAILS).map((email) => email.toLowerCase()),
    },
  };

  if (isProduction) {
    const missing = [
      !env.gemini.apiKey && 'GEMINI_API_KEY',
      !env.auth.firebaseProjectId && 'FIREBASE_PROJECT_ID',
      !env.auth.allowedEmails.length && 'ALLOWED_EMAILS',
      !env.corsOrigins.length && 'CORS_ORIGIN',
    ].filter(Boolean);
    if (missing.length) {
      throw new Error(`Missing required production settings: ${missing.join(', ')}`);
    }
  }

  return env;
}

export const env = loadEnv();
