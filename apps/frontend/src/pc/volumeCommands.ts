import type { SystemVolume, SystemVolumeRequest } from '@prime/shared';

// Short, explicit commands naming the system/computer volume are executed directly
// (no AI round trip). Plain "turn it up" stays with the YouTube player.
const DEVICE = '(system|computer|pc|laptop|windows|master|overall)';
const PERCENT = '(\\d{1,3})( ?%| percent)?';
const FILLER = /\b(please|kindly|prime|sir|hey|ok|okay|could you|can you|would you|my)\b/g;

const PATTERNS: [SystemVolumeRequest['action'], RegExp][] = [
  ['set', new RegExp(`^((set|change|make|put) )?(the )?${DEVICE} (volume|sound) (to |at )?${PERCENT}$`)],
  ['up', new RegExp(`^((increase|raise|boost|turn up) (the )?${DEVICE} (volume|sound)( by ${PERCENT})?|${DEVICE} (volume|sound) up|turn (the )?${DEVICE} (volume|sound) up)$`)],
  ['down', new RegExp(`^((decrease|lower|reduce|turn down) (the )?${DEVICE} (volume|sound)( by ${PERCENT})?|${DEVICE} (volume|sound) down|turn (the )?${DEVICE} (volume|sound) down)$`)],
  ['unmute', new RegExp(`^unmute (the )?${DEVICE}( sound| audio| volume)?$`)],
  ['mute', new RegExp(`^mute (the )?${DEVICE}( sound| audio| volume)?$`)],
  ['get', new RegExp(`^((what('s| is) |check )?(the )?(current )?${DEVICE} volume( level)?|how loud is (the )?${DEVICE})$`)],
];

export function parseSystemVolumeCommand(text: string): SystemVolumeRequest | null {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'%]/gu, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [action, pattern] of PATTERNS) {
    const match = pattern.exec(normalized);
    if (!match) continue;
    const number = match.slice(1).find((group) => group !== undefined && /^\d{1,3}$/.test(group));
    const level = number === undefined ? undefined : Math.min(100, Number(number));
    return level === undefined ? { action } : { action, level };
  }
  return null;
}

/** P.R.I.M.E.'s acknowledgement for a completed volume command. */
export function describeVolumeResult(action: SystemVolumeRequest['action'], { percent, muted }: SystemVolume): string {
  switch (action) {
    case 'set':
      return `System volume set to ${percent} percent, Sir.`;
    case 'up':
      return `System volume raised to ${percent} percent, Sir.`;
    case 'down':
      return `System volume lowered to ${percent} percent, Sir.`;
    case 'mute':
      return 'System audio muted, Sir.';
    case 'unmute':
      return `System audio restored at ${percent} percent, Sir.`;
    case 'get':
      return `The system volume is at ${percent} percent${muted ? ', though it is currently muted' : ''}, Sir.`;
  }
}
