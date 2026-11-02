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
  'not-allowed': 'Microphone access was denied. Please allow it in your browser settings.',
  'service-not-allowed': 'Speech recognition is blocked in this browser.',
  'audio-capture': 'No microphone was found.',
  'no-speech': 'No speech was detected. Please try again.',
  network: 'Speech recognition needs an internet connection.',
};

interface Options {
  /** Called with the full transcript of the current listening session as it updates. */
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}

export function useSpeechRecognition({ onTranscript, onError }: Options) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const callbacksRef = useRef({ onTranscript, onError });
  callbacksRef.current = { onTranscript, onError };

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const start = useCallback(() => {
    if (!Recognition || recognitionRef.current) return;

    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i++) parts.push(event.results[i][0].transcript.trim());
      callbacksRef.current.onTranscript(parts.join(' ').trim());
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      callbacksRef.current.onError(ERROR_MESSAGES[event.error] ?? 'Speech recognition failed. Please try again.');
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      recognitionRef.current = null;
      callbacksRef.current.onError('Unable to start the microphone.');
    }
  }, []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  return { isSupported: isSpeechRecognitionSupported, isListening, start, stop };
}
