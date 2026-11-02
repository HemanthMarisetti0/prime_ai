export type ReactorState = 'connecting' | 'offline' | 'standby' | 'listening' | 'thinking' | 'speaking';

const CENTER = 200;
const TICKS = Array.from({ length: 72 }, (_, i) => i);

/** stroke-dasharray that splits a circle of radius r into `count` arcs, each filling `fill` of its slot. */
function segments(r: number, count: number, fill: number): string {
  const slot = (2 * Math.PI * r) / count;
  return `${slot * fill} ${slot * (1 - fill)}`;
}

interface ReactorProps {
  state: ReactorState;
  active: boolean;
  disabled: boolean;
  label: string;
  onActivate: () => void;
}

export function Reactor({ state, active, disabled, label, onActivate }: ReactorProps) {
  return (
    <button
      type="button"
      className={`reactor reactor--${state}`}
      onClick={onActivate}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 400 400" aria-hidden="true">
        <defs>
          <radialGradient id="reactor-core-fill">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="35%" stopColor="currentColor" stopOpacity="0.85" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="reactor__spin reactor__spin--slow">
          {TICKS.map((i) => (
            <line
              key={i}
              className={i % 6 === 0 ? 'reactor__tick reactor__tick--major' : 'reactor__tick'}
              x1={CENTER}
              y1={10}
              x2={CENTER}
              y2={i % 6 === 0 ? 30 : 20}
              transform={`rotate(${i * 5} ${CENTER} ${CENTER})`}
            />
          ))}
        </g>

        <circle className="reactor__line" cx={CENTER} cy={CENTER} r={186} />
        <circle
          className="reactor__arc reactor__spin reactor__spin--rev"
          cx={CENTER}
          cy={CENTER}
          r={168}
          strokeWidth={3}
          strokeDasharray={segments(168, 60, 0.5)}
        />
        <circle
          className="reactor__arc reactor__arc--bold reactor__spin reactor__spin--mid"
          cx={CENTER}
          cy={CENTER}
          r={146}
          strokeWidth={10}
          strokeDasharray={segments(146, 3, 0.62)}
        />
        <circle className="reactor__line reactor__line--faint" cx={CENTER} cy={CENTER} r={126} />
        <circle
          className="reactor__arc reactor__spin reactor__spin--fast"
          cx={CENTER}
          cy={CENTER}
          r={110}
          strokeWidth={7}
          strokeDasharray={segments(110, 24, 0.32)}
        />
        <circle
          className="reactor__arc reactor__spin reactor__spin--rev-fast"
          cx={CENTER}
          cy={CENTER}
          r={92}
          strokeWidth={2}
          strokeDasharray={segments(92, 4, 0.18)}
        />

        <g className="reactor__core">
          <circle cx={CENTER} cy={CENTER} r={76} fill="url(#reactor-core-fill)" />
          <circle className="reactor__line" cx={CENTER} cy={CENTER} r={52} />
          <circle className="reactor__heart" cx={CENTER} cy={CENTER} r={26} />
        </g>
      </svg>
    </button>
  );
}
