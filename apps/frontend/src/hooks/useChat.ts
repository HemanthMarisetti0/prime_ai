import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatDisplay,
  ChatMessage,
  ChatRole,
  DirectionsResult,
  NewsReport,
  PlacesResult,
  TripPlan,
  WeatherReport,
  YouTubeResults,
} from '@prime/shared';
import { sendChat, type ChatContext } from '../api/chat';

export interface UiMessage extends ChatMessage {
  id: string;
  createdAt: number;
  /** HUD panel the reply asked to show (e.g. system diagnostics). */
  display?: ChatDisplay;
  weather?: WeatherReport;
  news?: NewsReport;
  youtube?: YouTubeResults;
  places?: PlacesResult;
  directions?: DirectionsResult;
  trip?: TripPlan;
}

// Mirror the backend validation limits (apps/backend/src/ai/dto/chat-request.dto.ts).
export const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 50;
const MAX_HISTORY_CONTENT_LENGTH = MAX_MESSAGE_LENGTH * 4;

function createMessage(role: ChatRole, content: string): UiMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: Date.now() };
}

function createGreeting(): UiMessage {
  const hour = new Date().getHours();
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return createMessage('assistant', `Good ${period}, Sir. P.R.I.M.E. is online. How may I assist you today?`);
}

export function useChat() {
  const [messages, setMessages] = useState<UiMessage[]>(() => [createGreeting()]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const pendingRef = useRef<AbortController | null>(null);

  useEffect(() => () => pendingRef.current?.abort(), []);

  /** Sends a message. Resolves false if it was not delivered, so the caller can restore the draft. */
  const send = useCallback(
    async (text: string, context: ChatContext = {}): Promise<boolean> => {
      const content = text.trim();
      if (!content || pendingRef.current) return false;

      const history: ChatMessage[] = messages
        .slice(-MAX_HISTORY_MESSAGES)
        .map(({ role, content }) => ({ role, content: content.slice(0, MAX_HISTORY_CONTENT_LENGTH) }));
      const userMessage = createMessage('user', content);
      const controller = new AbortController();
      pendingRef.current = controller;

      setMessages((prev) => [...prev, userMessage]);
      setError(null);
      setIsLoading(true);

      try {
        const { reply, ...extras } = await sendChat(content, history, context, controller.signal);
        setMessages((prev) => [...prev, { ...createMessage('assistant', reply), ...extras }]);
        return true;
      } catch (err) {
        if (controller.signal.aborted) return false;
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
        setError(err instanceof Error ? err.message : 'My apologies, Sir. Something went wrong. Would you kindly try again?');
        return false;
      } finally {
        if (pendingRef.current === controller) {
          pendingRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [messages],
  );

  const reset = useCallback(() => {
    pendingRef.current?.abort();
    pendingRef.current = null;
    setIsLoading(false);
    setError(null);
    setMessages([createGreeting()]);
  }, []);

  /** Clears the messages but keeps the current draft. */
  const clearConversation = reset;

  /** Starts a fresh session; consumers key on conversationId to reset their own state (e.g. the draft). */
  const newConversation = useCallback(() => {
    reset();
    setConversationId(crypto.randomUUID());
  }, [reset]);

  const dismissError = useCallback(() => setError(null), []);

  /** Records an exchange handled locally (e.g. a playback command) without calling the AI. */
  const addLocalExchange = useCallback((userText: string, reply: string) => {
    setError(null);
    setMessages((prev) => [...prev, createMessage('user', userText.trim()), createMessage('assistant', reply)]);
  }, []);

  return {
    messages,
    isLoading,
    error,
    conversationId,
    send,
    clearConversation,
    newConversation,
    dismissError,
    addLocalExchange,
  };
}
