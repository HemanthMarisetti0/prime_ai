import type { ReactNode } from 'react';
import { useClock } from '../hooks/useClock';
import type { ServerStatus } from '../hooks/useServerStatus';
import { ActivityIcon, PlusIcon, TrashIcon, VolumeIcon, VolumeOffIcon } from './icons';

const LINK_LABEL: Record<ServerStatus, string> = {
  checking: 'Linking',
  online: 'Online',
  offline: 'Offline',
};

interface HeaderProps {
  serverStatus: ServerStatus;
  voiceReplies: boolean;
  voiceSupported: boolean;
  onToggleVoiceReplies: () => void;
  voiceSettings: ReactNode;
  onNewConversation: () => void;
  onClearConversation: () => void;
  canClear: boolean;
  diagnosticsOpen: boolean;
  onToggleDiagnostics: () => void;
}

export function Header({
  serverStatus,
  voiceReplies,
  voiceSupported,
  onToggleVoiceReplies,
  voiceSettings,
  onNewConversation,
  onClearConversation,
  canClear,
  diagnosticsOpen,
  onToggleDiagnostics,
}: HeaderProps) {
  const now = useClock();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const date = now
    .toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();

  const voiceTitle = !voiceSupported
    ? 'Spoken replies are not supported in this browser'
    : voiceReplies
      ? 'Spoken replies on'
      : 'Spoken replies off';

  return (
    <header className="topbar panel">
      <div className="topbar__brand">
        <h1 className="topbar__title">P.R.I.M.E.</h1>
        <p className="topbar__subtitle">Personal Reasoning &amp; Intelligent Machine Engine</p>
      </div>

      <div className="topbar__readouts" aria-label="System readouts">
        <div className="readout">
          <span className="readout__label">Local time</span>
          <span className="readout__value readout__value--clock">{time}</span>
        </div>
        <div className="readout readout--date">
          <span className="readout__label">Date</span>
          <span className="readout__value">{date}</span>
        </div>
        <div className={`readout readout--link readout--${serverStatus}`} role="status">
          <span className="readout__label">Link</span>
          <span className="readout__value">
            <span className="readout__dot" aria-hidden="true" />
            {LINK_LABEL[serverStatus]}
          </span>
        </div>
      </div>

      <div className="topbar__actions">
        <button
          type="button"
          className={`hud-btn hud-btn--icon${diagnosticsOpen ? ' is-active' : ''}`}
          onClick={onToggleDiagnostics}
          aria-pressed={diagnosticsOpen}
          title={diagnosticsOpen ? 'Hide system diagnostics' : 'Show system diagnostics'}
          aria-label={diagnosticsOpen ? 'Hide system diagnostics' : 'Show system diagnostics'}
        >
          <ActivityIcon />
        </button>
        <button
          type="button"
          className={`hud-btn hud-btn--icon${voiceReplies && voiceSupported ? ' is-active' : ''}`}
          onClick={onToggleVoiceReplies}
          disabled={!voiceSupported}
          aria-pressed={voiceReplies}
          title={voiceTitle}
          aria-label={voiceTitle}
        >
          {voiceReplies && voiceSupported ? <VolumeIcon /> : <VolumeOffIcon />}
        </button>
        {voiceSettings}
        <button
          type="button"
          className="hud-btn hud-btn--icon"
          onClick={onClearConversation}
          disabled={!canClear}
          title="Clear conversation"
          aria-label="Clear conversation"
        >
          <TrashIcon />
        </button>
        <button type="button" className="hud-btn" onClick={onNewConversation} title="New conversation">
          <PlusIcon />
          <span className="hud-btn__label">New</span>
        </button>
      </div>
    </header>
  );
}
