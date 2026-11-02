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

export interface ChatResponse {
  reply: string;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}
