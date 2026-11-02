import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useClock } from '../hooks/useClock';
import type { ServerStatus } from '../hooks/useServerStatus';
import type { WakeWordStatus } from '../hooks/useWakeWord';
import {
  ActivityIcon,
  EarIcon,
  LogoutIcon,
  MoreIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
  VolumeIcon,
  VolumeOffIcon,
} from './icons';

export interface Account {
  name: string;
  email: string;
  photoURL: string | null;
}

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
  account: Account | null;
  onSignOut: () => void;
  wakeStatus: WakeWordStatus;
  onToggleWakeWord: () => void;
  onOpenVoiceSettings: () => void;
}

function Avatar({ account }: { account: Account }) {
  return account.photoURL ? (
    <img className="account__avatar" src={account.photoURL} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className="account__avatar account__avatar--initial" aria-hidden="true">
      {account.name.charAt(0).toUpperCase()}
    </span>
  );
}

const WAKE_TITLE: Record<WakeWordStatus, string> = {
  off: 'Wake word off: click to listen for “Hey Prime”',
  armed: 'Listening for “Hey Prime”: click to turn off',
  paused: 'Wake word on (paused while busy): click to turn off',
  blocked: 'Wake word needs microphone access: allow it in the browser',
  unsupported: 'Wake word needs Chrome or Edge',
};

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
  account,
  onSignOut,
  wakeStatus,
  onToggleWakeWord,
  onOpenVoiceSettings,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const runAndClose = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

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
        {/* Primary actions stay visible on phones; .topbar__secondary moves into the ⋯ menu. */}
        <button
          type="button"
          className={`hud-btn hud-btn--icon wake-btn wake-btn--${wakeStatus}`}
          onClick={onToggleWakeWord}
          disabled={wakeStatus === 'unsupported'}
          aria-pressed={wakeStatus !== 'off' && wakeStatus !== 'unsupported'}
          title={WAKE_TITLE[wakeStatus]}
          aria-label={WAKE_TITLE[wakeStatus]}
        >
          <EarIcon />
        </button>
        <button
          type="button"
          className={`hud-btn hud-btn--icon topbar__secondary${diagnosticsOpen ? ' is-active' : ''}`}
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
          className="hud-btn hud-btn--icon topbar__secondary"
          onClick={onClearConversation}
          disabled={!canClear}
          title="Clear conversation"
          aria-label="Clear conversation"
        >
          <TrashIcon />
        </button>
        <button type="button" className="hud-btn" onClick={onNewConversation} title="New conversation" aria-label="New conversation">
          <PlusIcon />
          <span className="hud-btn__label">New</span>
        </button>

        <div className="topbar__menu" ref={menuRef}>
          <button
            type="button"
            className={`hud-btn hud-btn--icon${menuOpen ? ' is-active' : ''}`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More options"
            title="More options"
          >
            <MoreIcon />
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              {account && (
                <div className="menu__account">
                  <Avatar account={account} />
                  <span className="menu__account-text">
                    <span className="menu__account-name">{account.name}</span>
                    <span className="menu__account-email">{account.email}</span>
                  </span>
                </div>
              )}
              <button type="button" role="menuitem" className="menu__item" onClick={() => runAndClose(onToggleDiagnostics)}>
                <ActivityIcon />
                {diagnosticsOpen ? 'Hide system diagnostics' : 'System diagnostics'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu__item"
                disabled={!voiceSupported}
                onClick={() => runAndClose(onOpenVoiceSettings)}
              >
                <SettingsIcon />
                Voice settings
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu__item"
                disabled={!canClear}
                onClick={() => runAndClose(onClearConversation)}
              >
                <TrashIcon />
                Clear conversation
              </button>
              {account && (
                <button type="button" role="menuitem" className="menu__item menu__item--danger" onClick={() => runAndClose(onSignOut)}>
                  <LogoutIcon />
                  Sign out
                </button>
              )}
            </div>
          )}
        </div>

        {account && (
          <div className="account topbar__secondary" title={account.email}>
            <Avatar account={account} />
            <button
              type="button"
              className="hud-btn hud-btn--icon"
              onClick={onSignOut}
              title={`Sign out (${account.email})`}
              aria-label="Sign out"
            >
              <LogoutIcon />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
