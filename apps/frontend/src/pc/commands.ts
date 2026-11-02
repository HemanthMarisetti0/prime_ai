import type { PcAppId, PcPowerAction, SystemVolumeRequest } from '@prime/shared';

// Short, explicit PC commands are executed directly (no AI round trip).
// Anything vaguer ("it's too bright in here") goes to the AI, which has the same tools.

export type BrightnessRequest = { action: 'get' | 'set' | 'up' | 'down'; level?: number };

export type PcCommand =
  | { kind: 'volume'; request: SystemVolumeRequest }
  | { kind: 'brightness'; request: BrightnessRequest }
  | { kind: 'app'; app: PcAppId }
  | { kind: 'power'; action: PcPowerAction };

const DEVICE = '(system|computer|pc|laptop|windows|master|overall)';
const PERCENT = '(\\d{1,3})( ?%| percent)?';
const SCREEN = '(screen |display )?brightness';
const MACHINE = '(the )?(computer|pc|laptop|system|machine|screen|workstation)';
const FILLER = /\b(please|kindly|prime|sir|hey|ok|okay|could you|can you|would you|my|for me)\b/g;

const APP_NAMES: [PcAppId, string][] = [
  ['vscode', '(vs ?code|visual studio code|code editor)'],
  ['notepad', 'notepad'],
  ['calculator', '(calculator|calc)'],
  ['explorer', '(file explorer|explorer|file manager|my files)'],
  ['chrome', '(google )?chrome'],
  ['edge', '(microsoft )?edge'],
  ['taskmanager', 'task manager'],
  ['settings', '((windows )?settings)'],
  ['paint', '(ms )?paint'],
];

const VOLUME: [SystemVolumeRequest['action'], RegExp][] = [
  ['set', new RegExp(`^((set|change|make|put) )?(the )?${DEVICE} (volume|sound) (to |at )?${PERCENT}$`)],
  ['up', new RegExp(`^((increase|raise|boost|turn up) (the )?${DEVICE} (volume|sound)( by ${PERCENT})?|${DEVICE} (volume|sound) up|turn (the )?${DEVICE} (volume|sound) up)$`)],
  ['down', new RegExp(`^((decrease|lower|reduce|turn down) (the )?${DEVICE} (volume|sound)( by ${PERCENT})?|${DEVICE} (volume|sound) down|turn (the )?${DEVICE} (volume|sound) down)$`)],
  ['unmute', new RegExp(`^unmute (the )?${DEVICE}( sound| audio| volume)?$`)],
  ['mute', new RegExp(`^mute (the )?${DEVICE}( sound| audio| volume)?$`)],
  ['get', new RegExp(`^((what('s| is) |check )?(the )?(current )?${DEVICE} volume( level)?|how loud is (the )?${DEVICE})$`)],
];

const BRIGHTNESS: [BrightnessRequest['action'], RegExp][] = [
  ['set', new RegExp(`^((set|change|make|put) )?(the )?${SCREEN} (to |at )?${PERCENT}$`)],
  ['up', new RegExp(`^((increase|raise|turn up|boost) (the )?${SCREEN}( by ${PERCENT})?|${SCREEN} up|brighten (the )?(screen|display)|brighter|make (the )?(screen|display) brighter)$`)],
  ['down', new RegExp(`^((decrease|lower|reduce|turn down) (the )?${SCREEN}( by ${PERCENT})?|${SCREEN} down|dim (the )?(screen|display)|dimmer|make (the )?(screen|display) dimmer)$`)],
  ['get', new RegExp(`^(what('s| is) )?(the )?(current )?${SCREEN}( level)?$`)],
];

const POWER: [PcPowerAction, RegExp][] = [
  ['lock', new RegExp(`^lock ${MACHINE}( now)?$`)],
  ['sleep', new RegExp(`^((put|send) ${MACHINE} to sleep|sleep ${MACHINE}|${MACHINE} sleep)( now)?$`)],
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'%]/gu, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levelFrom(match: RegExpExecArray): number | undefined {
  const number = match.slice(1).find((group) => group !== undefined && /^\d{1,3}$/.test(group));
  return number === undefined ? undefined : Math.min(100, Number(number));
}

export function parsePcCommand(text: string): PcCommand | null {
  const input = normalize(text);
  if (!input) return null;

  for (const [action, pattern] of VOLUME) {
    const match = pattern.exec(input);
    if (match) return { kind: 'volume', request: { action, ...withLevel(levelFrom(match)) } };
  }
  for (const [action, pattern] of BRIGHTNESS) {
    const match = pattern.exec(input);
    if (match) return { kind: 'brightness', request: { action, ...withLevel(levelFrom(match)) } };
  }
  for (const [action, pattern] of POWER) {
    if (pattern.test(input)) return { kind: 'power', action };
  }
  for (const [app, name] of APP_NAMES) {
    if (new RegExp(`^(open|launch|start|run|bring up) (the )?${name}( app)?$`).test(input)) return { kind: 'app', app };
  }
  return null;
}

const withLevel = (level: number | undefined) => (level === undefined ? {} : { level });
