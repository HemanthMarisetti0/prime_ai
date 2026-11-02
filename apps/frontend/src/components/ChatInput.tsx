import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { MAX_MESSAGE_LENGTH } from '../hooks/useChat';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { canCaptureScreen, captureScreen, prepareImage, type AttachedImage } from '../media/image';
import { CloseIcon, ImageIcon, MicIcon, MonitorIcon, SendIcon, StopIcon } from './icons';

const MAX_INPUT_HEIGHT = 160;

interface ChatInputProps {
  onSend: (text: string, image?: AttachedImage) => Promise<boolean>;
  isLoading: boolean;
  isSpeaking: boolean;
  onStopSpeaking: () => void;
  onVoiceError: (message: string) => void;
  /** True while hands-free mode owns the microphone. */
  micDisabled: boolean;
  /** Reports manual dictation so other listeners (wake word) can pause. */
  onDictatingChange: (dictating: boolean) => void;
}

const joinText = (base: string, addition: string) => (base.trim() ? `${base.trimEnd()} ${addition}` : addition);

export function ChatInput({
  onSend,
  isLoading,
  isSpeaking,
  onStopSpeaking,
  onVoiceError,
  micDisabled,
  onDictatingChange,
}: ChatInputProps) {
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftBeforeListeningRef = useRef('');

  const speech = useSpeechRecognition({
    onTranscript: (text) => setDraft(joinText(draftBeforeListeningRef.current, text).slice(0, MAX_MESSAGE_LENGTH)),
    onError: onVoiceError,
  });

  const canSend = (draft.trim().length > 0 || image !== null) && !isLoading;

  // Hand the microphone over if hands-free mode starts mid-dictation.
  const { isListening, abort: abortDictation } = speech;
  useEffect(() => {
    if (micDisabled && isListening) abortDictation();
  }, [micDisabled, isListening, abortDictation]);

  useEffect(() => {
    onDictatingChange(isListening);
  }, [isListening, onDictatingChange]);

  // Grow with content up to a cap, then scroll.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [draft]);

  const attach = async (load: () => Promise<AttachedImage>) => {
    try {
      setImage(await load());
      inputRef.current?.focus();
    } catch (error) {
      // Cancelling the browser's screen picker is not an error worth reporting.
      if (error instanceof DOMException && error.name === 'NotAllowedError') return;
      onVoiceError(error instanceof Error ? error.message : 'That image could not be attached, Sir.');
    }
  };

  const submit = async () => {
    if (!canSend) return;
    if (speech.isListening) speech.stop();
    const text = draft;
    const attached = image ?? undefined;
    setDraft('');
    setImage(null);
    const delivered = await onSend(text, attached);
    // Restore on failure unless the user already started something new.
    if (!delivered) {
      setDraft((current) => current || text);
      if (attached) setImage((current) => current ?? attached);
    }
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

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    void attach(() => prepareImage(file));
  };

  const handleDrop = (e: DragEvent<HTMLFormElement>) => {
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    setDragging(false);
    if (!file) return;
    e.preventDefault();
    void attach(() => prepareImage(file));
  };

  const micTitle = !speech.isSupported
    ? 'Voice input is not supported in this browser. Use Chrome or Edge.'
    : micDisabled
      ? 'Hands-free mode is using the microphone'
      : speech.isListening
        ? 'Stop listening'
        : 'Speak your message';

  return (
    <form
      className={`composer${dragging ? ' composer--dragging' : ''}`}
      onSubmit={handleSubmit}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.items).some((item) => item.type.startsWith('image/'))) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {image && (
        <div className="composer__attachment">
          <img src={image.previewUrl} alt="Attached" />
          <span>Image attached</span>
          <button type="button" className="icon-btn" onClick={() => setImage(null)} aria-label="Remove image" title="Remove image">
            <CloseIcon />
          </button>
        </div>
      )}
      <div className={`composer__field${speech.isListening ? ' composer__field--listening' : ''}`}>
        <span className="composer__prompt" aria-hidden="true">
          ›
        </span>
        <textarea
          ref={inputRef}
          className="composer__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            speech.isListening
              ? 'Listening… speak now, Sir.'
              : image
                ? 'Ask about the image, Sir…'
                : 'How may I help you, Sir?'
          }
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          readOnly={speech.isListening}
          aria-label="Message"
          autoFocus
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void attach(() => prepareImage(file));
          }}
        />
        <button
          type="button"
          className="icon-btn icon-btn--tool"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach an image"
          title="Attach an image or photo (you can also paste or drop one)"
        >
          <ImageIcon />
        </button>
        {canCaptureScreen() && (
          <button
            type="button"
            className="icon-btn icon-btn--tool composer__capture"
            onClick={() => void attach(captureScreen)}
            aria-label="Capture your screen"
            title="Capture a screen or window"
          >
            <MonitorIcon />
          </button>
        )}
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
          : 'Enter to send · Shift + Enter for a new line · Paste or drop an image to ask about it'}
      </p>
    </form>
  );
}
