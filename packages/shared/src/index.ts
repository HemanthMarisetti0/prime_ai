// Type-only contract between frontend and backend.
// Consumers must use `import type` so nothing is required at runtime.

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
}

/** Extra HUD panels the frontend should show alongside a reply. */
export type ChatDisplay = 'system';

export interface ChatResponse {
  reply: string;
  display?: ChatDisplay;
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
