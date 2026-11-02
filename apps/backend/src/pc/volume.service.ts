import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import type { SystemVolume } from '@prime/shared';
import { env } from '../config/env';
import { buildAudioScript, type VolumeAction } from './audio.ps1';

const TIMEOUT_MS = 20_000;

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

  private execute(action: VolumeAction): Promise<SystemVolume> {
    const encoded = Buffer.from(buildAudioScript(action), 'utf16le').toString('base64');
    return new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
        { timeout: TIMEOUT_MS, windowsHide: true },
        (error, stdout, stderr) => {
          const match = /(\d+)\|(True|False)/.exec(stdout);
          if (error || !match) {
            this.logger.warn(`Volume command failed: ${(error?.message ?? stderr).slice(0, 200)}`);
            reject(new Error('The system volume could not be changed.'));
            return;
          }
          resolve({ percent: Number(match[1]), muted: match[2] === 'True' });
        },
      );
    });
  }
}
