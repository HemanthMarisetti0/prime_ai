import type { UiMessage } from '../hooks/useChat';

export function MessageBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`message message--${message.role}`}>
      <span className="message__author">{isUser ? 'You' : 'P.R.I.M.E.'}</span>
      <div className="message__bubble">{message.content}</div>
    </div>
  );
}
