import { useEffect, useRef, useState } from 'react';
import type { ServerStatus } from '../hooks/useServerStatus';
import type { WakeWordStatus } from '../hooks/useWakeWord';
import { Reactor } from './Reactor';

const STEP_MS = 320;
const LINK_TIMEOUT_MS = 4000;
const HOLD_MS = 900;
const FADE_MS = 450;

type Tone = 'ok' | 'warn' | 'fail';
interface Check {
  label: string;
  /** null while the check is still running. */
  result: { text: string; tone: Tone } | null;
}

interface BootSequenceProps {
  serverStatus: ServerStatus;
  accountName: string | null;
  recognitionSupported: boolean;
  synthesisSupported: boolean;
  wakeStatus: WakeWordStatus;
  onDone: () => void;
}

/** Start-up sequence reporting real subsystem checks before revealing the HUD. */
export function BootSequence({
  serverStatus,
  accountName,
  recognitionSupported,
  synthesisSupported,
  wakeStatus,
  onDone,
}: BootSequenceProps) {
  const [shown, setShown] = useState(0);
  const [linkTimedOut, setLinkTimedOut] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const link: Check['result'] =
    serverStatus === 'online'
      ? { text: 'Established', tone: 'ok' }
      : serverStatus === 'waking'
        ? { text: 'Waking server', tone: 'warn' }
        : serverStatus === 'offline' || linkTimedOut
        ? { text: 'Offline', tone: 'fail' }
        : null;

  const checks: Check[] = [
    { label: 'Core systems', result: { text: 'Online', tone: 'ok' } },
    { label: 'Neural link', result: link },
    {
      label: 'Identity',
      result: accountName ? { text: `Verified · ${accountName.split(' ')[0]}`, tone: 'ok' } : { text: 'Local mode', tone: 'warn' },
    },
    { label: 'Voice recognition', result: recognitionSupported ? { text: 'Ready', tone: 'ok' } : { text: 'Unavailable', tone: 'warn' } },
    { label: 'Speech synthesis', result: synthesisSupported ? { text: 'Ready', tone: 'ok' } : { text: 'Unavailable', tone: 'warn' } },
    {
      label: 'Wake word',
      result:
        wakeStatus === 'armed' || wakeStatus === 'paused'
          ? { text: 'Armed', tone: 'ok' }
          : wakeStatus === 'off'
            ? { text: 'Standby', tone: 'warn' }
            : { text: 'Unavailable', tone: 'warn' },
    },
  ];
  const complete = shown >= checks.length;
  const nominal = checks.every((c) => c.result?.tone !== 'fail');

  const finish = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => onDoneRef.current(), FADE_MS);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setLinkTimedOut(true), LINK_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Reveal checks one by one, waiting on any that are still running.
  useEffect(() => {
    if (complete) {
      const timer = window.setTimeout(finish, HOLD_MS);
      return () => window.clearTimeout(timer);
    }
    if (checks[shown].result === null) return;
    const timer = window.setTimeout(() => setShown((n) => n + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  });

  useEffect(() => {
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  });

  const progress = Math.round((Math.min(shown, checks.length) / checks.length) * 100);

  return (
    <div className={`boot${leaving ? ' boot--leaving' : ''}`} onClick={finish} role="status" aria-label="P.R.I.M.E. starting up">
      <div className="boot__reactor">
        <Reactor state={complete ? 'standby' : 'thinking'} active={false} disabled label="P.R.I.M.E. core" onActivate={() => {}} />
      </div>
      <h1 className="boot__title">P.R.I.M.E.</h1>
      <p className="boot__subtitle">Initialising · v0.1</p>

      <ul className="boot__checks">
        {checks.slice(0, Math.min(shown + 1, checks.length)).map((check, i) => {
          const done = i < shown;
          return (
            <li key={check.label} className="boot__check">
              <span className="boot__label">{check.label}</span>
              <span className="boot__dots" aria-hidden="true" />
              <span className={`boot__result boot__result--${done ? check.result?.tone : 'pending'}`}>
                {done ? check.result?.text : 'Checking…'}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="boot__progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className={`boot__final${complete ? ' is-visible' : ''}`}>
        {nominal ? 'All systems nominal. At your service, Sir.' : 'Running with limited systems, Sir.'}
      </p>
      <p className="boot__skip">Click or press any key to skip</p>
    </div>
  );
}
