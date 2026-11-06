import type { ReactNode } from 'react';

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const ACTIONS: { label: string; hint: string; prompt: string; icon: ReactNode }[] = [
  {
    label: 'Weather',
    hint: 'Today and the next 3 days',
    prompt: "What's the weather like today?",
    icon: svg(
      <>
        <path d="M12 2v2M4.9 4.9l1.4 1.4M2 12h2M19.1 4.9l-1.4 1.4" />
        <path d="M8 12a4 4 0 0 1 7.5-2" />
        <path d="M17.5 21H9a5 5 0 1 1 4.6-7h1.4a3.5 3.5 0 0 1 2.5 7z" />
      </>,
    ),
  },
  {
    label: 'Headlines',
    hint: "Today's top stories",
    prompt: "What's in the news today?",
    icon: svg(
      <>
        <path d="M4 4h13v16H6a2 2 0 0 1-2-2z" />
        <path d="M17 8h3v10a2 2 0 0 1-2 2" />
        <path d="M8 8h5M8 12h5M8 16h3" />
      </>,
    ),
  },
  {
    label: 'Play music',
    hint: 'Relaxing lofi on YouTube',
    prompt: 'Play some relaxing lofi music',
    icon: svg(
      <>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </>,
    ),
  },
  {
    label: 'Nearby cafés',
    hint: 'Closest spots with directions',
    prompt: 'Find cafés near me',
    icon: svg(
      <>
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </>,
    ),
  },
  {
    label: 'System status',
    hint: 'CPU, memory, disks, battery',
    prompt: "How's my system doing?",
    icon: svg(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
  },
  {
    label: 'Plan a trip',
    hint: 'Weekend getaway, ₹10,000',
    prompt: 'Plan a 2-day weekend getaway for me with a budget of 10000 rupees',
    icon: svg(
      <>
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
      </>,
    ),
  },
];

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
  disabled: boolean;
}

/** One-tap starters shown on a fresh conversation. */
export function QuickActions({ onSelect, disabled }: QuickActionsProps) {
  return (
    <div className="quick-actions" role="group" aria-label="Suggestions">
      <p className="quick-actions__title">Try asking</p>
      <div className="quick-actions__grid">
        {ACTIONS.map((action, i) => (
          <button
            key={action.label}
            type="button"
            className="quick-actions__card"
            style={{ animationDelay: `${120 + i * 50}ms` }}
            onClick={() => onSelect(action.prompt)}
            disabled={disabled}
            title={action.prompt}
          >
            <span className="quick-actions__icon">{action.icon}</span>
            <span className="quick-actions__text">
              <span className="quick-actions__label">{action.label}</span>
              <span className="quick-actions__hint">{action.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
