const ACTIONS: { label: string; prompt: string }[] = [
  { label: 'Weather', prompt: "What's the weather like today?" },
  { label: 'Headlines', prompt: "What's in the news today?" },
  { label: 'Play music', prompt: 'Play some relaxing lofi music' },
  { label: 'Nearby cafés', prompt: 'Find cafés near me' },
  { label: 'System status', prompt: "How's my system doing?" },
  { label: 'Plan a trip', prompt: 'Plan a 2-day weekend getaway for me with a budget of 10000 rupees' },
];

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
  disabled: boolean;
}

/** One-tap starters shown on a fresh conversation. */
export function QuickActions({ onSelect, disabled }: QuickActionsProps) {
  return (
    <div className="quick-actions" role="group" aria-label="Suggestions">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          className="quick-actions__chip"
          onClick={() => onSelect(action.prompt)}
          disabled={disabled}
          title={action.prompt}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
