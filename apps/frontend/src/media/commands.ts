export type MediaCommand = 'pause' | 'resume' | 'stop' | 'next' | 'volumeUp' | 'volumeDown' | 'mute' | 'unmute';

// The whole (politeness-stripped) utterance must be a command, so questions like
// "what is the next big thing?" or "continue the story" still reach the AI.
const MEDIA = '(the )?(song|music|video|track|playback|player)';
const PATTERNS: [MediaCommand, RegExp][] = [
  ['unmute', /^(unmute|unmute it|sound on)$/],
  ['mute', /^(mute|mute it|silence|sound off)$/],
  ['volumeUp', /^(volume up|louder|turn it up|turn (the )?volume up|(increase|raise) (the )?volume)$/],
  ['volumeDown', /^(volume down|quieter|softer|turn it down|turn (the )?volume down|(decrease|lower|reduce) (the )?volume)$/],
  ['next', new RegExp(`^(next|skip|next (one|song|video|track)|skip (it|this|this one|${MEDIA})|play the next (one|song|video))$`)],
  ['stop', new RegExp(`^(stop|stop it|stop ${MEDIA}|close ${MEDIA}|turn (it|${MEDIA}) off)$`)],
  ['pause', new RegExp(`^(pause|pause it|pause ${MEDIA}|hold on|hold it)$`)],
  ['resume', new RegExp(`^(resume|continue|unpause|play|play it|keep playing|continue playing|carry on|resume ${MEDIA}|unpause ${MEDIA})$`)],
];

const FILLER = /\b(please|kindly|prime|sir|hey|ok|okay|now|could you|can you|would you)\b/g;

/** Recognises a short playback command such as "pause", "next song" or "turn it up". */
export function parseMediaCommand(text: string): MediaCommand | null {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;
  return PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}
