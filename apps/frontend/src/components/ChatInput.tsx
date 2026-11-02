import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_MESSAGE_LENGTH } from '../hooks/useChat';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { MicIcon, SendIcon, StopIcon } from './icons';

const MAX_INPUT_HEIGHT = 160;

interface ChatInputProps {
  onSend: (text: string) => Promise<boolean>;
  isLoading: boolean;
  isSpeaking: boolean;
  onStopSpeaking: () => void;
  onVoiceError: (message: string) => void;
  /** True while hands-free mode owns the microphone. */
  micDisabled: boolean;
}

const joinText = (base: string, addition: string) => (base.trim() ? `${base.trimEnd()} ${addition}` : addition);

export function ChatInput({ onSend, isLoading, isSpeaking, onStopSpeaking, onVoiceError, micDisabled }: ChatInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draftBeforeListeningRef = useRef('');

  const speech = useSpeechRecognition({
    onTranscript: (text) => setDraft(joinText(draftBeforeListeningRef.current, text).slice(0, MAX_MESSAGE_LENGTH)),
    onError: onVoiceError,
  });

  const canSend = draft.trim().length > 0 && !isLoading;

  // Hand the microphone over if hands-free mode starts mid-dictation.
  const { isListening, abort: abortDictation } = speech;
  useEffect(() => {
    if (micDisabled && isListening) abortDictation();
  }, [micDisabled, isListening, abortDictation]);

  // Grow with content up to a cap, then scroll.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [draft]);

  const submit = async () => {
    if (!canSend) return;
    if (speech.isListening) speech.stop();
    const text = draft;
    setDraft('');
    const delivered = await onSend(text);
    // Restore the text on failure unless the user already started typing something new.
    if (!delivered) setDraft((current) => current || text);
    inputRef.current?.focus();
  };

  const toggleListening = () => {
    if (speech.isListening) {
      speech.stop();
      return;
    }
    onStopSpeaking();
    draftBeforeListeningRef.current = draft;
    speech.start();
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

  const micTitle = !speech.isSupported
    ? 'Voice input is not supported in this browser. Use Chrome or Edge.'
    : micDisabled
      ? 'Hands-free mode is using the microphone'
      : speech.isListening
      ? 'Stop listening'
      : 'Speak your message';

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className={`composer__field${speech.isListening ? ' composer__field--listening' : ''}`}>
        <textarea
          ref={inputRef}
          className="composer__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={speech.isListening ? 'Listening… speak now, Sir.' : 'Message P.R.I.M.E.…'}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          readOnly={speech.isListening}
          aria-label="Message"
          autoFocus
        />
        {isSpeaking && (
          <button
            type="button"
            className="icon-btn icon-btn--stop"
            onClick={onStopSpeaking}
            aria-label="Stop speaking"
            title="Stop speaking"
          >
            <StopIcon />
          </button>
        )}
        <button
          type="button"
          className={`icon-btn icon-btn--mic${speech.isListening ? ' is-listening' : ''}`}
          onClick={toggleListening}
          disabled={!speech.isSupported || micDisabled}
          aria-label={micTitle}
          aria-pressed={speech.isListening}
          title={micTitle}
        >
          <MicIcon />
        </button>
        <button type="submit" className="icon-btn icon-btn--primary" disabled={!canSend} aria-label="Send message" title="Send">
          <SendIcon />
        </button>
      </div>
      <p className="composer__hint" aria-live="polite">
        {speech.isListening
          ? 'Listening… click the microphone again to stop'
          : 'Enter to send · Shift + Enter for a new line · Mic to dictate'}
      </p>
    </form>
  );
}
