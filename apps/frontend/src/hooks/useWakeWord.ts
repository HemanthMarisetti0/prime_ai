import { useEffect, useRef, useState } from 'react';
import { Recognition, type Recognition as RecognitionInstance } from './useSpeechRecognition';

// "Hey/Hi/OK Prime" (also common mishearings), optionally followed by a request.
const WAKE_PHRASE = /\b(hey|hi|hello|ok|okay)[\s,]+(prime|prima|primes|pride|primed)\b[\s,.!?]*(.*)$/i;
const RESTART_DELAY_MS = 300;
const NETWORK_RETRY_MS = 3000;

export type WakeWordStatus = 'off' | 'armed' | 'paused' | 'unsupported' | 'blocked';

interface Options {
  enabled: boolean;
  /** Temporarily stop listening (e.g. while P.R.I.M.E. speaks or another mic user is active). */
  paused: boolean;
  /** Called with whatever followed the wake phrase ("" when just the wake phrase was said). */
  onWake: (request: string) => void;
}

/**
 * Background "Hey Prime" detector using continuous browser speech recognition.
 * Chrome ends continuous sessions periodically, so the listener restarts itself while armed.
 */
export function useWakeWord({ enabled, paused, onWake }: Options): WakeWordStatus {
  const [blocked, setBlocked] = useState(false);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  const active = enabled && !paused && !blocked && Boolean(Recognition);

  useEffect(() => {
    if (!active || !Recognition) return;

    let recognition: RecognitionInstance | null = null;
    let timer: number | undefined;
    let stopped = false;
    let pendingRequest: string | null = null;

    const fire = (request: string) => {
      stopped = true;
      recognition?.abort();
      onWakeRef.current(request.trim());
    };

    const start = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (stopped) return;
        recognition = new Recognition!();
        recognition.lang = navigator.language || 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const match = WAKE_PHRASE.exec(result[0].transcript);
            if (!match) continue;
            // Wait for the final result so a request spoken in the same breath is captured whole.
            if (result.isFinal) return fire(match[3]);
            pendingRequest = match[3];
          }
        };
        recognition.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            stopped = true;
            setBlocked(true);
          }
        };
        recognition.onend = () => {
          if (pendingRequest !== null && !stopped) return fire(pendingRequest);
          if (!stopped) start(RESTART_DELAY_MS);
        };

        try {
          recognition.start();
        } catch {
          start(NETWORK_RETRY_MS);
        }
      }, delay);
    };

    start(RESTART_DELAY_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      recognition?.abort();
    };
  }, [active]);

  if (!Recognition) return 'unsupported';
  if (!enabled) return 'off';
  if (blocked) return 'blocked';
  return paused ? 'paused' : 'armed';
}
