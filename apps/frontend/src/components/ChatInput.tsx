import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_MESSAGE_LENGTH } from '../hooks/useChat';
import { SendIcon } from './icons';

const MAX_INPUT_HEIGHT = 160;

interface ChatInputProps {
  onSend: (text: string) => Promise<boolean>;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canSend = draft.trim().length > 0 && !isLoading;

  // Grow with content up to a cap, then scroll.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [draft]);

  const submit = async () => {
    if (!canSend) return;
    const text = draft;
    setDraft('');
    const delivered = await onSend(text);
    // Restore the text on failure unless the user already started typing something new.
    if (!delivered) setDraft((current) => current || text);
    inputRef.current?.focus();
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
      <div className="composer__field">
        <textarea
          ref={inputRef}
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
        <button type="submit" className="icon-btn icon-btn--primary" disabled={!canSend} aria-label="Send message" title="Send">
          <SendIcon />
        </button>
      </div>
      <p className="composer__hint">Enter to send · Shift + Enter for a new line</p>
    </form>
  );
}
