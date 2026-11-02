import type { ServerStatus } from '../hooks/useServerStatus';
import { PlusIcon, TrashIcon } from './icons';

export type CoreState = ServerStatus | 'processing';

const STATUS_LABEL: Record<CoreState, string> = {
  checking: 'Connecting',
  online: 'Online',
  offline: 'Offline',
  processing: 'Processing',
};

interface HeaderProps {
  coreState: CoreState;
  onNewConversation: () => void;
  onClearConversation: () => void;
  canClear: boolean;
}

export function Header({ coreState, onNewConversation, onClearConversation, canClear }: HeaderProps) {
  return (
    <header className="header">
      <div className="header__brand">
        <div className={`core core--${coreState}`} aria-hidden="true">
          <span className="core__ring" />
          <span className="core__dot" />
        </div>
        <div>
          <h1 className="header__title">P.R.I.M.E.</h1>
          <p className="header__subtitle">Personal Reasoning and Intelligent Machine Engine</p>
        </div>
      </div>

      <div className="header__actions">
        <span className={`status status--${coreState}`} role="status">
          {STATUS_LABEL[coreState]}
        </span>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onClearConversation}
          disabled={!canClear}
          title="Clear conversation"
        >
          <TrashIcon />
          <span className="btn__label">Clear</span>
        </button>
        <button type="button" className="btn btn--outline" onClick={onNewConversation} title="New conversation">
          <PlusIcon />
          <span className="btn__label">New</span>
        </button>
      </div>
    </header>
  );
}
