import { openApp, powerAction, setBrightness, setSystemVolume } from '../api/pc';
import type { PcCommand } from './commands';

/** Executes a parsed PC command and returns P.R.I.M.E.'s acknowledgement. Throws PcControlError on failure. */
export async function runPcCommand(command: PcCommand): Promise<string> {
  switch (command.kind) {
    case 'volume': {
      const { percent, muted } = await setSystemVolume(command.request);
      switch (command.request.action) {
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
      break;
    }
    case 'brightness': {
      const { percent } = await setBrightness(command.request);
      return command.request.action === 'get'
        ? `Screen brightness is at ${percent} percent, Sir.`
        : `Screen brightness set to ${percent} percent, Sir.`;
    }
    case 'app': {
      const { app } = await openApp(command.app);
      return `Opening ${app}, Sir.`;
    }
    case 'power': {
      const { inSeconds } = await powerAction(command.action);
      return command.action === 'lock'
        ? `Locking your computer in ${inSeconds} seconds, Sir.`
        : `Putting your computer to sleep in ${inSeconds} seconds, Sir. Good night.`;
    }
  }
}
