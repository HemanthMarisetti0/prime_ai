import type { UiMessage } from '../hooks/useChat';
import { FormattedText } from './FormattedText';

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export function MessageBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`message message--${message.role}`}>
      <div className="message__meta">
        <span className="message__author">{isUser ? 'You' : 'P.R.I.M.E.'}</span>
        <span className="message__time">{formatTime(message.createdAt)}</span>
        {message.model && (
          <span className="message__model" title={`Answered by ${message.model}`}>
            {message.model.replace(/^gemini-/, "")}
          </span>
        )}
      </div>
      <div className="message__body">
        {message.imageUrl && <img className="message__image" src={message.imageUrl} alt="Attached by you" />}
        {isUser ? message.content : <FormattedText text={message.content} />}
      </div>
    </div>
  );
}
