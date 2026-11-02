import type { HandsFreePhase } from '../hooks/useHandsFree';

const PHASE_LABEL: Record<Exclude<HandsFreePhase, 'off'>, string> = {
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  waiting: 'Starting microphone…',
};

interface HandsFreeBarProps {
  phase: Exclude<HandsFreePhase, 'off'>;
  transcript: string;
  onEnd: () => void;
}

export function HandsFreeBar({ phase, transcript, onEnd }: HandsFreeBarProps) {
  return (
    <div className={`handsfree handsfree--${phase}`} role="status" aria-live="polite">
      <span className="handsfree__wave" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
      <div className="handsfree__text">
        <span className="handsfree__phase">{PHASE_LABEL[phase]}</span>
        <span className="handsfree__transcript">
          {phase === 'listening' ? transcript || 'Speak now, Sir. Say "stop listening" to end.' : ' '}
        </span>
      </div>
      <button type="button" className="btn btn--outline" onClick={onEnd}>
        End
      </button>
    </div>
  );
}
