import { useEffect, useRef, useState } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';

// Short pause before listening again, so the mic never overlaps the end of a spoken reply.
const RESUME_DELAY_MS = 400;

const EXIT_PHRASES = /^(stop listening|exit hands[- ]?free|goodbye|that'?s all)[.!\s]*$/i;

export type HandsFreePhase = 'off' | 'listening' | 'thinking' | 'speaking' | 'waiting';

interface Options {
  enabled: boolean;
  isLoading: boolean;
  isSpeaking: boolean;
  send: (text: string) => Promise<boolean>;
  onDisable: () => void;
  onError: (message: string) => void;
}

/** Listen → auto-send on pause → wait for the reply and its speech → listen again. */
export function useHandsFree({ enabled, isLoading, isSpeaking, send, onDisable, onError }: Options) {
  const [transcript, setTranscript] = useState('');
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const recognition = useSpeechRecognition({
    onTranscript: setTranscript,
    onEnd: (text) => {
      setTranscript('');
      if (!enabledRef.current || !text) return;
      if (EXIT_PHRASES.test(text)) {
        onDisable();
        return;
      }
      void send(text).then((delivered) => {
        // Pause on failures (e.g. rate limits) instead of looping on errors.
        if (!delivered) onDisable();
      });
    },
    onError: (message, code) => {
      // Silence just restarts the loop; anything else ends hands-free mode.
      if (code === 'no-speech' || !enabledRef.current) return;
      onError(message);
      onDisable();
    },
  });

  const { isListening, start, abort } = recognition;

  useEffect(() => {
    if (!enabled || isLoading || isSpeaking) {
      if (isListening) abort();
      return;
    }
    if (isListening) return;
    const timer = window.setTimeout(start, RESUME_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, isLoading, isSpeaking, isListening, start, abort]);

  useEffect(() => {
    if (!enabled) setTranscript('');
  }, [enabled]);

  const phase: HandsFreePhase = !enabled
    ? 'off'
    : isLoading
      ? 'thinking'
      : isSpeaking
        ? 'speaking'
        : isListening
          ? 'listening'
          : 'waiting';

  return { isSupported: recognition.isSupported, phase, transcript };
}
