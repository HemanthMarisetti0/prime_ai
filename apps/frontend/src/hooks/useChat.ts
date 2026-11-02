import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatRole } from '@prime/shared';
import { sendChat } from '../api/chat';

export interface UiMessage extends ChatMessage {
  id: string;
  createdAt: number;
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
    async (text: string): Promise<boolean> => {
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
        const reply = await sendChat(content, history, controller.signal);
        setMessages((prev) => [...prev, createMessage('assistant', reply)]);
        return true;
      } catch (err) {
        if (controller.signal.aborted) return false;
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
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

  return {
    messages,
    isLoading,
    error,
    conversationId,
    send,
    clearConversation,
    newConversation,
    dismissError,
  };
}
