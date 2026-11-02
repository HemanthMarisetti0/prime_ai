import type { SystemVolumeAction } from '@prime/shared';
import type { VolumeAction } from './audio.ps1';

export const DEFAULT_VOLUME_STEP = 10;

/** Maps an API/tool request to a concrete volume action. `level` is a target (set) or step (up/down). */
export function toVolumeAction(action: SystemVolumeAction, level?: number): VolumeAction {
  switch (action) {
    case 'set':
      return { type: 'set', level: level ?? 50 };
    case 'up':
      return { type: 'change', delta: level ?? DEFAULT_VOLUME_STEP };
    case 'down':
      return { type: 'change', delta: -(level ?? DEFAULT_VOLUME_STEP) };
    case 'mute':
      return { type: 'mute' };
    case 'unmute':
      return { type: 'unmute' };
    case 'get':
      return { type: 'get' };
  }
}
