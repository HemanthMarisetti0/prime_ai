import { useLayoutEffect, useRef } from 'react';
import type { UiMessage } from '../hooks/useChat';
import { MessageBubble, Processing } from './MessageBubble';

interface MessageListProps {
  messages: UiMessage[];
  isLoading: boolean;
}

// Within this distance of the bottom, new text keeps the view pinned to the latest line.
const STICK_THRESHOLD_PX = 120;

export function MessageList({ messages, isLoading }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const countRef = useRef(messages.length);

  const last = messages.at(-1);
  // Until the reply's first event arrives, show a placeholder in its place.
  const awaitingReply = isLoading && !(last?.role === 'assistant' && last.streaming);

  // Follow the conversation, unless Sir has scrolled up to read something earlier.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const added = messages.length > countRef.current;
    countRef.current = messages.length;
    if (added && last?.role === 'user') stickRef.current = true;
    if (!stickRef.current) return;
    // Smooth for new entries, instant while text streams in (smooth scrolling would lag behind).
    list.scrollTo({ top: list.scrollHeight, behavior: added && !last?.streaming ? 'smooth' : 'auto' });
  }, [messages, awaitingReply, last]);

  return (
    <div
      ref={listRef}
      className="messages"
      role="log"
      aria-live="polite"
      aria-busy={isLoading}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
      }}
    >
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {awaitingReply && (
        <div className="message message--assistant message--streaming" aria-label="P.R.I.M.E. is processing">
          <div className="message__meta">
            <span className="message__author">P.R.I.M.E.</span>
          </div>
          <div className="message__body">
            <Processing />
          </div>
        </div>
      )}
    </div>
  );
}
