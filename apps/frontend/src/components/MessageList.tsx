import { useEffect, useRef } from 'react';
import type { UiMessage } from '../hooks/useChat';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: UiMessage[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

  return (
    <div className="messages" role="log" aria-live="polite" aria-busy={isLoading}>
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {isLoading && (
        <div className="message message--assistant" aria-label="P.R.I.M.E. is processing">
          <div className="message__meta">
            <span className="message__author">P.R.I.M.E.</span>
          </div>
          <div className="message__body processing">
            <span className="processing__bar" />
            <span className="processing__text">Processing</span>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
