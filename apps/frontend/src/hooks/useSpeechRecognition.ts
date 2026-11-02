import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API recognition is not in the standard DOM typings; declare the parts we use.
interface RecognitionResultList {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => Recognition;

const Recognition: RecognitionConstructor | undefined = (() => {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
})();

export const isSpeechRecognitionSupported = Boolean(Recognition);

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'My apologies, Sir. I need microphone access; kindly allow it in your browser settings.',
  'service-not-allowed': 'My apologies, Sir. Speech recognition is blocked in this browser.',
  'audio-capture': 'My apologies, Sir. I could not find a microphone.',
  'no-speech': 'Forgive me, Sir, I did not catch that. Would you kindly try again?',
  network: 'My apologies, Sir. Speech recognition needs an internet connection.',
};

interface Options {
  /** Called with the full transcript of the current listening session as it updates. */
  onTranscript: (text: string) => void;
  /** Called when a session ends on its own or via stop(); receives the final transcript ('' if none). Not called after abort(). */
  onEnd?: (text: string) => void;
  onError: (message: string, code: string) => void;
}

export function useSpeechRecognition({ onTranscript, onEnd, onError }: Options) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const transcriptRef = useRef('');
  const abortedRef = useRef(false);
  const callbacksRef = useRef({ onTranscript, onEnd, onError });
  callbacksRef.current = { onTranscript, onEnd, onError };

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const start = useCallback(() => {
    if (!Recognition || recognitionRef.current) return;

    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    transcriptRef.current = '';
    abortedRef.current = false;

    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i++) parts.push(event.results[i][0].transcript.trim());
      transcriptRef.current = parts.join(' ').trim();
      callbacksRef.current.onTranscript(transcriptRef.current);
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      callbacksRef.current.onError(
        ERROR_MESSAGES[event.error] ?? 'Speech recognition failed. Please try again.',
        event.error,
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
      if (!abortedRef.current) callbacksRef.current.onEnd?.(transcriptRef.current);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      recognitionRef.current = null;
      callbacksRef.current.onError('Unable to start the microphone.', 'start-failed');
    }
  }, []);

  /** Stops listening and delivers what was heard so far. */
  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  /** Stops listening and discards the session. */
  const abort = useCallback(() => {
    abortedRef.current = true;
    recognitionRef.current?.abort();
  }, []);

  return { isSupported: isSpeechRecognitionSupported, isListening, start, stop, abort };
}
