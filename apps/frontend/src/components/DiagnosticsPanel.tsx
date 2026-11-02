import type { SystemSnapshot } from '@prime/shared';

const GB = 1024 ** 3;
const gb = (bytes: number) => (bytes / GB).toFixed(1);

function level(percent: number): 'ok' | 'warn' | 'crit' {
  return percent >= 90 ? 'crit' : percent >= 75 ? 'warn' : 'ok';
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : `${h}h ${m}m`;
}

interface MeterProps {
  label: string;
  percent: number | null;
  detail: string;
  /** Battery: low is bad, so invert the warning thresholds. */
  inverted?: boolean;
  compact?: boolean;
}

function Meter({ label, percent, detail, inverted, compact }: MeterProps) {
  const state = percent === null ? 'ok' : level(inverted ? 100 - percent : percent);
  return (
    <div className={`meter meter--${state}${compact ? ' meter--compact' : ''}`}>
      <div className="meter__head">
        <span className="meter__label">{label}</span>
        <span className="meter__value">{percent === null ? '—' : `${Math.round(percent)}%`}</span>
      </div>
      <div className="meter__track" role="meter" aria-valuenow={percent ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <span className="meter__fill" style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }} />
      </div>
      <span className="meter__detail">{detail}</span>
    </div>
  );
}

interface DiagnosticsPanelProps {
  snapshot: SystemSnapshot | null | undefined;
  onRunDiagnostics: () => void;
  canRun: boolean;
}

export function DiagnosticsPanel({ snapshot, onRunDiagnostics, canRun }: DiagnosticsPanelProps) {
  if (snapshot === null) {
    return (
      <section className="diag panel" aria-label="System diagnostics">
        <div className="diag__header">
          <span>System diagnostics</span>
        </div>
        <p className="diag__empty">Telemetry unavailable.</p>
      </section>
    );
  }

  const nvidia = snapshot?.gpus.find((g) => g.temperatureC !== null) ?? snapshot?.gpus.at(-1);
  const battery = snapshot?.battery;
  const batteryState = battery?.charging ? 'Charging' : battery?.pluggedIn ? 'Plugged in' : 'On battery';

  return (
    <section className="diag panel" aria-label="System diagnostics">
      <div className="diag__header">
        <span>System diagnostics</span>
        <button type="button" className="hud-btn diag__run" onClick={onRunDiagnostics} disabled={!canRun || !snapshot}>
          Run diagnostics
        </button>
      </div>

      {!snapshot ? (
        <p className="diag__empty">Scanning systems…</p>
      ) : (
        <div className="diag__grid">
          <Meter
            label="CPU"
            percent={snapshot.cpu.loadPercent}
            detail={`${snapshot.cpu.physicalCores ?? '?'}C / ${snapshot.cpu.threads}T${
              snapshot.cpu.temperatureC !== null ? ` · ${snapshot.cpu.temperatureC}°C` : ''
            }`}
          />
          <Meter
            label="Memory"
            percent={snapshot.memory.usedPercent}
            detail={`${gb(snapshot.memory.usedBytes)} / ${gb(snapshot.memory.totalBytes)} GB`}
          />
          {snapshot.disks.map((d) => (
            <Meter
              key={d.mount}
              label={`Disk ${d.mount}`}
              percent={d.usedPercent}
              detail={`${gb(d.totalBytes - d.usedBytes)} GB free`}
              compact
            />
          ))}
          {battery?.present && (
            <Meter label="Battery" percent={battery.percent} detail={batteryState} inverted compact />
          )}
          <div className="diag__facts">
            {nvidia && (
              <span>
                GPU <strong>{nvidia.model.replace(/\(R\)|NVIDIA |Intel /g, '').trim()}</strong>
                {nvidia.temperatureC !== null && ` · ${nvidia.temperatureC}°C`}
              </span>
            )}
            <span>
              Uptime <strong>{formatUptime(snapshot.os.uptimeSeconds)}</strong>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
