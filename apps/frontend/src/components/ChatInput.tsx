import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_MESSAGE_LENGTH } from '../hooks/useChat';

interface ChatInputProps {
  onSend: (text: string) => Promise<boolean>;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [draft, setDraft] = useState('');
  const canSend = draft.trim().length > 0 && !isLoading;

  const submit = async () => {
    if (!canSend) return;
    const text = draft;
    setDraft('');
    const delivered = await onSend(text);
    // Restore the text on failure unless the user already started typing something new.
    if (!delivered) setDraft((current) => current || text);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <textarea
        className="composer__input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message P.R.I.M.E.…"
        rows={1}
        maxLength={MAX_MESSAGE_LENGTH}
        aria-label="Message"
        autoFocus
      />
      <button type="submit" className="btn btn--primary" disabled={!canSend}>
        Send
      </button>
    </form>
  );
}
