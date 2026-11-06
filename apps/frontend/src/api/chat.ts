import type {
  ApiErrorResponse,
  ChatImage,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  MediaState,
  UserLocation,
  UserProfile,
} from '@prime/shared';
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

/** Optional browser context sent with a message. */
export interface ChatContext {
  location?: UserLocation | null;
  media?: MediaState | null;
  image?: ChatImage | null;
  profile?: UserProfile | null;
}

function toBody(message: string, history: ChatMessage[], { location, media, image, profile }: ChatContext): ChatRequest {
  return {
    message,
    history,
    ...(location && { location }),
    ...(media && { media }),
    ...(image && { image: { mimeType: image.mimeType, data: image.data } }),
    ...(profile && (profile.name || profile.about) && { profile }),
  };
}

async function post(path: string, body: ChatRequest, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ChatApiError(UNREACHABLE);
  }
}

async function toApiError(res: Response): Promise<ChatApiError> {
  const data = (await res.json().catch(() => null)) as ApiErrorResponse | null;
  const detail = data && 'message' in data ? data.message : undefined;
  const message = Array.isArray(detail) ? detail.join('; ') : detail;
  return new ChatApiError(message || UNREACHABLE, res.status);
}

/** Complete reply in one response. */
export async function sendChat(
  message: string,
  history: ChatMessage[],
  context: ChatContext,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const res = await post('/api/chat', toBody(message, history, context), signal);
  if (!res.ok) throw await toApiError(res);
  const data = (await res.json().catch(() => null)) as ChatResponse | null;

  if (!data || !('reply' in data)) {
    throw new ChatApiError('My apologies, Sir. I received an unexpected response from my server.', res.status);
  }
  return data;
}

/**
 * Streams the reply: `onEvent` receives status updates, text as it is written and panel data.
 * Resolves with the final reply. Falls back to the one-shot endpoint on servers without streaming.
 */
export async function streamChat(
  message: string,
  history: ChatMessage[],
  context: ChatContext,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const body = toBody(message, history, context);
  const res = await post('/api/chat/stream', body, signal);
  if (res.status === 404) {
    const response = await sendChat(message, history, context, signal);
    onEvent({ type: 'done', response });
    return response;
  }
  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new ChatApiError(UNREACHABLE);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let final: ChatResponse | null = null;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line) as ChatStreamEvent;
        if (event.type === 'error') throw new ChatApiError(event.message, event.status);
        if (event.type === 'done') final = event.response;
        onEvent(event);
      }
    }
  } catch (error) {
    if (signal?.aborted || error instanceof ChatApiError) throw error;
    throw new ChatApiError('My apologies, Sir. My connection dropped mid-reply. Would you kindly try again?');
  } finally {
    reader.releaseLock();
  }
  if (!final) throw new ChatApiError('My apologies, Sir. My reply was cut short. Would you kindly try again?');
  return final;
}
