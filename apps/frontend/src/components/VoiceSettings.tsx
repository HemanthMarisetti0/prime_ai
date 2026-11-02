import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_RATE, MIN_RATE } from '../hooks/useSpeechSynthesis';
import { SettingsIcon } from './icons';

const SAMPLE = 'Good day, Sir. P.R.I.M.E. is online. This is how I will sound.';

interface VoiceSettingsProps {
  voices: SpeechSynthesisVoice[];
  voice: SpeechSynthesisVoice | undefined;
  onVoiceChange: (voiceURI: string) => void;
  rate: number;
  onRateChange: (rate: number) => void;
  onTest: (text: string) => void;
  disabled: boolean;
}

export function VoiceSettings({ voices, voice, onVoiceChange, rate, onRateChange, onTest, disabled }: VoiceSettingsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // English voices first, then the rest, each alphabetically.
  const sortedVoices = useMemo(
    () =>
      [...voices].sort((a, b) => {
        const aEn = a.lang.startsWith('en') ? 0 : 1;
        const bEn = b.lang.startsWith('en') ? 0 : 1;
        return aEn - bEn || a.name.localeCompare(b.name);
      }),
    [voices],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="settings" ref={rootRef}>
      <button
        type="button"
        className={`btn btn--ghost${open ? ' is-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={disabled ? 'Spoken replies are not supported in this browser' : 'Voice settings'}
        aria-label="Voice settings"
      >
        <SettingsIcon />
      </button>

      {open && (
        <div className="settings__panel" role="dialog" aria-label="Voice settings">
          <p className="settings__title">Voice</p>

          <label className="settings__field">
            <span>Speaker</span>
            <select value={voice?.voiceURI ?? ''} onChange={(e) => onVoiceChange(e.target.value)}>
              {sortedVoices.length === 0 && <option value="">No voices available</option>}
              {sortedVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>

          <label className="settings__field">
            <span>
              Speed <output>{rate.toFixed(1)}×</output>
            </span>
            <input
              type="range"
              min={MIN_RATE}
              max={MAX_RATE}
              step={0.1}
              value={rate}
              onChange={(e) => onRateChange(Number(e.target.value))}
            />
          </label>

          <button type="button" className="btn btn--outline settings__test" onClick={() => onTest(SAMPLE)}>
            Test voice
          </button>
          <p className="settings__note">"Online" / "Natural" voices sound most realistic and need internet.</p>
        </div>
      )}
    </div>
  );
}
