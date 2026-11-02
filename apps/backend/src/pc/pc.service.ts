import { Injectable, Logger } from '@nestjs/common';
import type { PcAppId, PcPowerAction, ScreenBrightness, SystemVolumeAction } from '@prime/shared';
import { env } from '../config/env';
import { APP_CATALOG } from './apps';
import { runPowerShell } from './powershell';

// Delay before lock/sleep so P.R.I.M.E.'s spoken confirmation can finish.
export const POWER_DELAY_SECONDS = 3;
const DEFAULT_BRIGHTNESS_STEP = 10;

const BRIGHTNESS_GET =
  "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness";

const brightnessSetScript = (expression: string) => `
$current = ${BRIGHTNESS_GET}
$target = [int][math]::Max(0, [math]::Min(100, ${expression}))
$methods = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1
Invoke-CimMethod -InputObject $methods -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = [byte]$target } | Out-Null
$target`;

/** Opens allow-listed apps, adjusts screen brightness and locks/sleeps the PC the backend runs on. */
@Injectable()
export class PcService {
  private readonly logger = new Logger(PcService.name);
  readonly enabled = env.pcControl;

  async openApp(id: PcAppId): Promise<{ app: string }> {
    this.assertEnabled();
    const app = APP_CATALOG[id];
    try {
      await runPowerShell(app.launch);
      return { app: app.name };
    } catch (error) {
      this.logger.warn(`Could not open ${app.name}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`${app.name} could not be opened. It may not be installed.`);
    }
  }

  /** "get", "set" to `level`, or "up"/"down" by `level` (default 10). Laptop/internal displays only. */
  async brightness(action: Exclude<SystemVolumeAction, 'mute' | 'unmute'>, level?: number): Promise<ScreenBrightness> {
    this.assertEnabled();
    const value = Math.round(Math.max(0, Math.min(100, level ?? DEFAULT_BRIGHTNESS_STEP)));
    const script =
      action === 'get'
        ? BRIGHTNESS_GET
        : brightnessSetScript(
            action === 'set' ? String(value) : action === 'up' ? `$current + ${value}` : `$current - ${value}`,
          );
    try {
      const percent = Number((await runPowerShell(script)).split(/\s+/).pop());
      if (!Number.isFinite(percent)) throw new Error('Unexpected output');
      return { percent };
    } catch (error) {
      this.logger.warn(`Brightness command failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Screen brightness could not be adjusted. External monitors are not supported.');
    }
  }

  /** Schedules lock or sleep after a short delay and returns immediately. */
  power(action: PcPowerAction): { action: PcPowerAction; inSeconds: number } {
    this.assertEnabled();
    const script =
      action === 'lock'
        ? 'rundll32.exe user32.dll,LockWorkStation'
        : "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)";
    setTimeout(() => {
      runPowerShell(script).catch((error: unknown) =>
        this.logger.warn(`Power action ${action} failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    }, POWER_DELAY_SECONDS * 1000);
    this.logger.log(`Power action "${action}" scheduled in ${POWER_DELAY_SECONDS}s`);
    return { action, inSeconds: POWER_DELAY_SECONDS };
  }

  private assertEnabled() {
    if (!this.enabled) throw new Error('PC control is disabled on this server.');
  }
}
