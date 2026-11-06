import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatDisplay,
  ChatMessage,
  ChatRole,
  DirectionsResult,
  EmailDraft,
  NewsReport,
  OwnerLink,
  PersonProfile,
  PlacesResult,
  TripPlan,
  WeatherReport,
  YouTubeResults,
} from '@prime/shared';
import { streamChat, type ChatContext } from '../api/chat';
import type { AttachedImage } from '../media/image';

export interface UiMessage extends ChatMessage {
  id: string;
  createdAt: number;
  /** Gemini model that answered (may be a fallback). */
  model?: string;
  /** HUD panel the reply asked to show (e.g. system diagnostics). */
  display?: ChatDisplay;
  weather?: WeatherReport;
  news?: NewsReport;
  youtube?: YouTubeResults;
  places?: PlacesResult;
  directions?: DirectionsResult;
  trip?: TripPlan;
  person?: PersonProfile;
  link?: OwnerLink;
  email?: EmailDraft;
  /** Where the drafted email stands; absent while it awaits Sir's confirmation. */
  emailStatus?: 'sending' | 'sent' | 'failed' | 'discarded';
  emailError?: string;
  /** Preview of an image Sir attached to this message. */
  imageUrl?: string;
  /** The reply is still being written. */
  streaming?: boolean;
  /** What P.R.I.M.E. is doing while the reply is pending (e.g. "Checking the weather"). */
  status?: string;
  /** Sir stopped the reply before it finished. */
  stopped?: boolean;
}

// Mirror the backend validation limits (apps/backend/src/ai/dto/chat-request.dto.ts).
export const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 50;
const MAX_HISTORY_CONTENT_LENGTH = MAX_MESSAGE_LENGTH * 4;

function describeDraft(email: EmailDraft, status: UiMessage['emailStatus']): string {
  const to = email.to.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)).join(', ');
  const state = status === 'sent' ? 'SENT' : status === 'discarded' ? 'discarded' : 'not sent yet, awaiting confirmation';
  return `\n\n[Email draft (${state}). To: ${to}\nSubject: ${email.subject}\n${email.body}]`;
}

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
    async (text: string, context: ChatContext & { image?: AttachedImage | null } = {}): Promise<boolean> => {
      const image = context.image ?? null;
      const content = text.trim() || (image ? 'What can you tell me about this image?' : '');
      if (!content || pendingRef.current) return false;

      // Earlier images aren't re-sent; a marker keeps the conversation coherent.
      // Earlier drafts are included so Sir can ask for changes ("make it shorter").
      const history: ChatMessage[] = messages
        .slice(-MAX_HISTORY_MESSAGES)
        .map(({ role, content, imageUrl, email, emailStatus }) => ({
          role,
          content: `${imageUrl ? '[Sir attached an image] ' : ''}${content}${email ? describeDraft(email, emailStatus) : ''}`.slice(
            0,
            MAX_HISTORY_CONTENT_LENGTH,
          ),
        }));
      const userMessage = { ...createMessage('user', content), ...(image && { imageUrl: image.previewUrl }) };
      const replyId = crypto.randomUUID();
      const controller = new AbortController();
      pendingRef.current = controller;

      /** Updates the reply being written, creating it on the first event. */
      const updateReply = (change: (reply: UiMessage) => UiMessage) =>
        setMessages((prev) => {
          const index = prev.findIndex((m) => m.id === replyId);
          if (index < 0) {
            if (controller.signal.aborted) return prev;
            return [...prev, change({ id: replyId, role: 'assistant', content: '', createdAt: Date.now(), streaming: true })];
          }
          const next = prev.slice();
          next[index] = change(prev[index]);
          return next;
        });

      setMessages((prev) => [...prev, userMessage]);
      setError(null);
      setIsLoading(true);

      try {
        await streamChat(
          content,
          history,
          context,
          (event) => {
            switch (event.type) {
              case 'status':
                return updateReply((m) => ({ ...m, status: event.text }));
              case 'delta':
                return updateReply((m) => ({ ...m, content: m.content + event.text, status: undefined }));
              case 'reset':
                return updateReply((m) => ({ ...m, content: '' }));
              case 'extras':
                return updateReply((m) => ({ ...m, ...event.extras }));
              case 'done': {
                const { reply, ...extras } = event.response;
                return updateReply((m) => ({ ...m, ...extras, content: reply, streaming: false, status: undefined }));
              }
            }
          },
          controller.signal,
        );
        return true;
      } catch (err) {
        if (controller.signal.aborted) {
          // Stopped by Sir: keep whatever was written so far.
          setMessages((prev) =>
            prev.flatMap((m) =>
              m.id !== replyId ? [m] : m.content ? [{ ...m, streaming: false, status: undefined, stopped: true }] : [],
            ),
          );
          return true;
        }
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id && m.id !== replyId));
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

  /** Updates one message in place (e.g. an email draft's send status). */
  const updateMessage = useCallback((id: string, patch: Partial<UiMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  /** Stops the reply being written, keeping what has arrived so far. */
  const stop = useCallback(() => {
    pendingRef.current?.abort();
  }, []);

  /** Records an exchange handled locally (e.g. a playback command) without calling the AI. */
  const addLocalExchange = useCallback((userText: string, reply: string, extras?: Partial<UiMessage>) => {
    setError(null);
    setMessages((prev) => [
      ...prev,
      createMessage('user', userText.trim()),
      { ...createMessage('assistant', reply), ...extras },
    ]);
  }, []);

  return {
    messages,
    isLoading,
    error,
    conversationId,
    send,
    stop,
    updateMessage,
    clearConversation,
    newConversation,
    dismissError,
    addLocalExchange,
  };
}
