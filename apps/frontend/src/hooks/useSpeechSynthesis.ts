import { useCallback, useEffect, useRef, useState } from 'react';

const synth = 'speechSynthesis' in window ? window.speechSynthesis : undefined;

export const isSpeechSynthesisSupported = Boolean(synth);

// Default voice preference, in order; falls back to the browser language, then any English voice.
const PREFERRED_VOICES = [/Microsoft Ryan/i, /Google UK English Male/i, /Microsoft George/i, /^Daniel/i];

// Chrome stops long utterances after ~15s, so speak in sentence-sized chunks.
const MAX_CHUNK_LENGTH = 200;

const VOICE_KEY = 'prime.voice';
const RATE_KEY = 'prime.voiceRate';
export const MIN_RATE = 0.6;
export const MAX_RATE = 1.6;

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preference simply won't persist.
  }
}

function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  for (const pattern of PREFERRED_VOICES) {
    const match = voices.find((v) => pattern.test(v.name));
    if (match) return match;
  }
  return voices.find((v) => v.lang === navigator.language) ?? voices.find((v) => v.lang.startsWith('en'));
}

/** Converts markdown-ish AI text into something natural to read aloud. */
function toSpeakableText(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, ' The code is shown on screen. ')
    .replace(/^\s*(#{1,6}|[-*•]|\d+[.)])\s+/gm, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (current && current.length + sentence.length + 1 > MAX_CHUNK_LENGTH) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [savedVoiceURI, setSavedVoiceURI] = useState(() => load(VOICE_KEY));
  const [rate, setRateState] = useState(() => {
    const stored = Number(load(RATE_KEY));
    return stored >= MIN_RATE && stored <= MAX_RATE ? stored : 1;
  });
  // Incremented on every speak/stop so callbacks from cancelled utterances are ignored.
  const generationRef = useRef(0);
  // Chrome can garbage-collect queued utterances and skip their `end` event; keep them referenced.
  const utterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  // Utterances queued but not yet finished in the current generation.
  const pendingRef = useRef(0);

  useEffect(() => {
    if (!synth) return;
    const loadVoices = () => setVoices(synth.getVoices());
    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    return () => {
      synth.removeEventListener('voiceschanged', loadVoices);
      synth.cancel();
    };
  }, []);

  const voice = voices.find((v) => v.voiceURI === savedVoiceURI) ?? pickDefaultVoice(voices);
  const voiceRef = useRef(voice);
  const rateRef = useRef(rate);
  voiceRef.current = voice;
  rateRef.current = rate;

  const stop = useCallback(() => {
    if (!synth) return;
    generationRef.current++;
    pendingRef.current = 0;
    synth.cancel();
    setIsSpeaking(false);
  }, []);

  /**
   * Queues text to be spoken after anything already queued (used while a reply streams in).
   * `fresh` cancels what is currently being said first.
   */
  const enqueue = useCallback((text: string, fresh = false) => {
    if (!synth) return;
    const chunks = splitIntoChunks(toSpeakableText(text));
    if (!chunks.length) return;

    if (fresh) {
      generationRef.current++;
      synth.cancel();
      utterancesRef.current = [];
      pendingRef.current = 0;
    }
    const generation = generationRef.current;
    const isCurrent = () => generation === generationRef.current;
    const finishOne = () => {
      if (!isCurrent()) return;
      pendingRef.current = Math.max(0, pendingRef.current - 1);
      if (pendingRef.current === 0) setIsSpeaking(false);
    };
    // Mark as speaking immediately (not on audio start) so hands-free mode never opens the mic in between.
    setIsSpeaking(true);

    for (const chunk of chunks) {
      const utterance = new SpeechSynthesisUtterance(chunk);
      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
        utterance.lang = voiceRef.current.lang;
      }
      utterance.rate = rateRef.current;
      utterance.onend = finishOne;
      utterance.onerror = finishOne;
      pendingRef.current++;
      utterancesRef.current.push(utterance);
      synth.speak(utterance);
    }
  }, []);

  /** Speaks text, interrupting anything currently being said. */
  const speak = useCallback((text: string) => enqueue(text, true), [enqueue]);

  const setVoice = useCallback((voiceURI: string) => {
    setSavedVoiceURI(voiceURI);
    save(VOICE_KEY, voiceURI);
  }, []);

  const setRate = useCallback((value: number) => {
    setRateState(value);
    save(RATE_KEY, String(value));
  }, []);

  return {
    isSupported: isSpeechSynthesisSupported,
    isSpeaking,
    speak,
    enqueue,
    stop,
    voices,
    voice,
    setVoice,
    rate,
    setRate,
  };
}
