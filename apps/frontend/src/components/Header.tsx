interface HeaderProps {
  onNewConversation: () => void;
  onClearConversation: () => void;
  canClear: boolean;
}

export function Header({ onNewConversation, onClearConversation, canClear }: HeaderProps) {
  return (
    <header className="header">
      <div className="header__brand">
        <h1 className="header__title">P.R.I.M.E.</h1>
        <p className="header__subtitle">Personal Reasoning and Intelligent Machine Engine</p>
      </div>
      <div className="header__actions">
        <button type="button" className="btn btn--ghost" onClick={onClearConversation} disabled={!canClear}>
          Clear
        </button>
        <button type="button" className="btn btn--outline" onClick={onNewConversation}>
          New conversation
        </button>
      </div>
    </header>
  );
}
