import { Injectable, Logger } from '@nestjs/common';
import type { SystemVolume } from '@prime/shared';
import { env } from '../config/env';
import { buildAudioScript, type VolumeAction } from './audio.ps1';
import { runPowerShell } from './powershell';

/** Controls the Windows master volume of the PC the backend runs on. */
@Injectable()
export class VolumeService {
  private readonly logger = new Logger(VolumeService.name);
  readonly enabled = env.pcControl;
  // Serialise calls so rapid commands apply in order.
  private queue: Promise<unknown> = Promise.resolve();

  run(action: VolumeAction): Promise<SystemVolume> {
    if (!this.enabled) return Promise.reject(new Error('System volume control is disabled on this server.'));
    const next = this.queue.then(() => this.execute(action));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async execute(action: VolumeAction): Promise<SystemVolume> {
    try {
      const match = /(\d+)\|(True|False)/.exec(await runPowerShell(buildAudioScript(action)));
      if (!match) throw new Error('Unexpected output');
      return { percent: Number(match[1]), muted: match[2] === 'True' };
    } catch (error) {
      this.logger.warn(`Volume command failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('The system volume could not be changed.');
    }
  }
}
