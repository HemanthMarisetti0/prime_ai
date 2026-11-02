import { useCallback, useEffect, useRef, useState } from 'react';

const synth = 'speechSynthesis' in window ? window.speechSynthesis : undefined;

export const isSpeechSynthesisSupported = Boolean(synth);

// Preferred voices, in order; falls back to the browser language, then any English voice.
const PREFERRED_VOICES = [/Microsoft Ryan/i, /Google UK English Male/i, /Microsoft George/i, /^Daniel/i];

// Chrome stops long utterances after ~15s, so speak in sentence-sized chunks.
const MAX_CHUNK_LENGTH = 200;

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
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
  const voiceRef = useRef<SpeechSynthesisVoice | undefined>(undefined);
  // Incremented on every speak/stop so callbacks from cancelled utterances are ignored.
  const generationRef = useRef(0);

  useEffect(() => {
    if (!synth) return;
    const loadVoices = () => {
      voiceRef.current = pickVoice(synth.getVoices());
    };
    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    return () => {
      synth.removeEventListener('voiceschanged', loadVoices);
      synth.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (!synth) return;
    generationRef.current++;
    synth.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!synth) return;
    const chunks = splitIntoChunks(toSpeakableText(text));
    if (!chunks.length) return;

    const generation = ++generationRef.current;
    synth.cancel();
    const isCurrent = () => generation === generationRef.current;

    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
        utterance.lang = voiceRef.current.lang;
      }
      if (index === 0) utterance.onstart = () => isCurrent() && setIsSpeaking(true);
      if (index === chunks.length - 1) {
        utterance.onend = () => isCurrent() && setIsSpeaking(false);
      }
      utterance.onerror = () => isCurrent() && setIsSpeaking(false);
      synth.speak(utterance);
    });
  }, []);

  return { isSupported: isSpeechSynthesisSupported, isSpeaking, speak, stop };
}
