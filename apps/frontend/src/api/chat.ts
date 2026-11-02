import type { ApiErrorResponse, ChatMessage, ChatRequest, ChatResponse } from '@prime/shared';

// Empty in development (Vite proxies /api); set VITE_API_URL when the backend is hosted elsewhere.
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const UNREACHABLE = 'Unable to reach the P.R.I.M.E. server. Please check that the backend is running.';

export class ChatApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ChatApiError';
    this.status = status;
  }
}

export async function sendChat(
  message: string,
  history: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const body: ChatRequest = { message, history };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ChatApiError(UNREACHABLE);
  }

  const data = (await res.json().catch(() => null)) as ChatResponse | ApiErrorResponse | null;

  if (!res.ok) {
    const detail = data && 'message' in data ? data.message : undefined;
    const message = Array.isArray(detail) ? detail.join('; ') : detail;
    throw new ChatApiError(message || UNREACHABLE, res.status);
  }

  if (!data || !('reply' in data)) {
    throw new ChatApiError('Received an invalid response from the server.', res.status);
  }
  return data.reply;
}
