import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import * as os from 'node:os';
import * as si from 'systeminformation';
import type { SystemSnapshot } from '@prime/shared';
import { env } from '../config/env';

// Slow probes (PowerShell / nvidia-smi on Windows) refresh in the background at this interval.
const SLOW_REFRESH_MS = 30_000;

type SlowData = Pick<SystemSnapshot, 'disks' | 'gpus' | 'battery'> & { temperatureC: number | null };
type StaticData = { osName: string; build: string; physicalCores: number | null };

const round1 = (n: number) => Math.round(n * 10) / 10;
const percent = (part: number, total: number) => (total > 0 ? round1((part / total) * 100) : 0);

/**
 * Read-only telemetry about the machine the backend runs on.
 * Only meaningful when the backend runs on the user's own PC (SYSTEM_MONITOR=false disables it).
 */
@Injectable()
export class SystemService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemService.name);
  readonly enabled = env.systemMonitor;

  private staticData: Promise<StaticData> | null = null;
  private slowData: SlowData | null = null;
  private firstSlowRefresh: Promise<void> | null = null;
  private refreshing = false;
  private slowTimer: NodeJS.Timeout | null = null;

  // Warm up in the background so the first request doesn't wait for slow probes.
  onModuleInit() {
    if (this.enabled) this.start();
  }

  onModuleDestroy() {
    if (this.slowTimer) clearInterval(this.slowTimer);
    if (this.staticData) si.powerShellRelease();
  }

  async getSnapshot(): Promise<SystemSnapshot> {
    this.start();
    const [statics, load, mem] = await Promise.all([
      this.staticData!,
      si.currentLoad().catch(() => null),
      si.mem().catch(() => null),
    ]);
    if (!this.slowData) await this.firstSlowRefresh;
    const slow = this.slowData ?? { disks: [], gpus: [], battery: emptyBattery(), temperatureC: null };

    const totalMem = mem?.total ?? os.totalmem();
    const usedMem = mem ? mem.total - mem.available : os.totalmem() - os.freemem();

    return {
      capturedAt: new Date().toISOString(),
      os: { name: statics.osName, build: statics.build, arch: os.arch(), uptimeSeconds: Math.round(os.uptime()) },
      cpu: {
        model: os.cpus()[0]?.model.trim() ?? 'Unknown CPU',
        physicalCores: statics.physicalCores,
        threads: os.availableParallelism(),
        loadPercent: load ? round1(load.currentLoad) : null,
        temperatureC: slow.temperatureC,
      },
      memory: { totalBytes: totalMem, usedBytes: usedMem, usedPercent: percent(usedMem, totalMem) },
      disks: slow.disks,
      gpus: slow.gpus,
      battery: slow.battery,
      backend: { nodeVersion: process.version, memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024) },
    };
  }

  private start() {
    if (this.staticData) return;
    si.powerShellStart(); // reuse one PowerShell process on Windows instead of spawning per call
    this.staticData = this.loadStatic();
    this.firstSlowRefresh = this.refreshSlow();
    this.slowTimer = setInterval(() => void this.refreshSlow(), SLOW_REFRESH_MS);
    this.slowTimer.unref();
  }

  private async loadStatic(): Promise<StaticData> {
    const [info, cpu] = await Promise.all([si.osInfo().catch(() => null), si.cpu().catch(() => null)]);
    return {
      osName: info?.distro || `${os.type()} ${os.release()}`,
      build: info?.build || os.release(),
      physicalCores: cpu?.physicalCores ?? null,
    };
  }

  private async refreshSlow(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
        const [disks, graphics, battery, temp] = await Promise.all([
          si.fsSize().catch(() => []),
          si.graphics().catch(() => null),
          si.battery().catch(() => null),
          si.cpuTemperature().catch(() => null),
        ]);
        this.slowData = {
          disks: disks
            .filter((d) => d.size > 0)
            .map((d) => ({ mount: d.mount, totalBytes: d.size, usedBytes: d.used, usedPercent: round1(d.use) })),
          gpus: (graphics?.controllers ?? []).map((g) => ({
            model: g.model,
            vramMB: g.vram ?? null,
            temperatureC: g.temperatureGpu ?? null,
          })),
          battery: battery?.hasBattery
            ? {
                present: true,
                percent: battery.percent,
                charging: battery.isCharging,
                pluggedIn: battery.acConnected,
                minutesRemaining: battery.timeRemaining > 0 ? battery.timeRemaining : null,
              }
            : emptyBattery(),
          temperatureC: temp?.main ?? null,
        };
    } catch (error) {
      this.logger.warn(`System probe failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.refreshing = false;
    }
  }
}

function emptyBattery(): SystemSnapshot['battery'] {
  return { present: false, percent: null, charging: null, pluggedIn: null, minutesRemaining: null };
}

const GB = 1024 ** 3;
const gb = (bytes: number) => `${(bytes / GB).toFixed(1)} GB`;

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

/** Compact, identifier-free summary for the model's context. */
export function describeSnapshot(s: SystemSnapshot): string {
  const temp = (t: number | null) => (t === null ? 'unavailable' : `${t}°C`);
  const battery = s.battery.present
    ? `${s.battery.percent}%${s.battery.charging ? ', charging' : s.battery.pluggedIn ? ', plugged in' : ', on battery'}${
        s.battery.minutesRemaining ? `, ~${s.battery.minutesRemaining} min remaining` : ''
      }`
    : 'none (desktop)';

  return [
    `- Captured: ${new Date(s.capturedAt).toLocaleString()}`,
    `- OS: ${s.os.name} (build ${s.os.build}, ${s.os.arch}), uptime ${formatUptime(s.os.uptimeSeconds)}`,
    `- CPU: ${s.cpu.model}, ${s.cpu.physicalCores ?? '?'} cores / ${s.cpu.threads} threads, load ${
      s.cpu.loadPercent ?? '?'
    }%, temperature ${temp(s.cpu.temperatureC)}`,
    `- Memory: ${s.memory.usedPercent}% used (used ${gb(s.memory.usedBytes)}, free ${gb(
      s.memory.totalBytes - s.memory.usedBytes,
    )}, total ${gb(s.memory.totalBytes)})`,
    `- Disks: ${
      s.disks
        .map((d) => `${d.mount} ${d.usedPercent}% used (free ${gb(d.totalBytes - d.usedBytes)}, total ${gb(d.totalBytes)})`)
        .join('; ') || 'unavailable'
    }`,
    `- GPUs: ${s.gpus.map((g) => `${g.model}${g.vramMB ? ` (${g.vramMB} MB)` : ''}, temperature ${temp(g.temperatureC)}`).join('; ') || 'unavailable'}`,
    `- Battery: ${battery}`,
    `- P.R.I.M.E. backend: Node ${s.backend.nodeVersion}, using ${s.backend.memoryMB} MB`,
  ].join('\n');
}
