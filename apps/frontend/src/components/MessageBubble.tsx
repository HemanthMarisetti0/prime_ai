import { memo, useState } from 'react';
import type { UiMessage } from '../hooks/useChat';
import { FormattedText } from './FormattedText';
import { CheckIcon, CopyIcon } from './icons';

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/** Animated "working on it" line, with what P.R.I.M.E. is doing when known. */
export function Processing({ status }: { status?: string }) {
  return (
    <div className="processing">
      <span className="processing__bar" />
      <span className="processing__text">{status ? `${status}…` : 'Processing'}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context); nothing to do.
    }
  };
  return (
    <button
      type="button"
      className={`message__copy${copied ? ' is-copied' : ''}`}
      onClick={() => void copy()}
      aria-label={copied ? 'Copied' : 'Copy reply'}
      title={copied ? 'Copied' : 'Copy reply'}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

// Memoised: while a reply streams in, only that bubble re-renders.
export const MessageBubble = memo(function MessageBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === 'user';
  const writing = message.streaming && message.content.length > 0;
  return (
    <div className={`message message--${message.role}${message.streaming ? ' message--streaming' : ''}`}>
      <div className="message__meta">
        <span className="message__author">{isUser ? 'You' : 'P.R.I.M.E.'}</span>
        <span className="message__time">{formatTime(message.createdAt)}</span>
        {message.model && (
          <span className="message__model" title={`Answered by ${message.model}`}>
            {message.model.replace(/^gemini-/, '')}
          </span>
        )}
        {!isUser && !message.streaming && message.content && <CopyButton text={message.content} />}
      </div>
      <div className="message__body">
        {message.imageUrl && <img className="message__image" src={message.imageUrl} alt="Attached by you" />}
        {isUser ? (
          message.content
        ) : message.streaming && !message.content ? (
          <Processing status={message.status} />
        ) : (
          <>
            <FormattedText text={message.content} />
            {writing && <span className="message__caret" aria-hidden="true" />}
            {message.stopped && <span className="message__stopped">Stopped</span>}
          </>
        )}
      </div>
    </div>
  );
});
