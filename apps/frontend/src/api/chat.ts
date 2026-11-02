import type { ApiErrorResponse, ChatMessage, ChatRequest, ChatResponse, UserLocation } from '@prime/shared';
import { API_BASE, authHeaders } from './config';

const UNREACHABLE = 'My apologies, Sir. I cannot reach my server. Kindly check that the backend is running.';

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
  location: UserLocation | null,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const body: ChatRequest = { message, history, ...(location && { location }) };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
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
    throw new ChatApiError('My apologies, Sir. I received an unexpected response from my server.', res.status);
  }
  return data;
}
