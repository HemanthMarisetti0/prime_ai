import { useEffect, useRef, useState } from 'react';
import type { OwnerLink } from '@prime/shared';
import { CloseIcon } from './icons';

interface LinkPanelProps {
  link: OwnerLink;
  onClose: () => void;
}

type View = 'choose' | 'inside' | 'tab' | 'blocked';

const pretty = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** Opens a new tab; false when the browser blocked it (no recent click, e.g. a voice request). */
function openTab(url: string): boolean {
  const tab = window.open(url, '_blank');
  if (!tab) return false;
  tab.opener = null;
  return true;
}

/** One of Sir's own pages: shown inside the HUD, opened in a new tab, or both choices offered. */
export function LinkPanel({ link, onClose }: LinkPanelProps) {
  const [view, setView] = useState<View>(() => (link.open === 'inside' && link.embeddable ? 'inside' : 'choose'));

  // A reply that asked for a new tab opens it straight away (the browser may block it).
  // Once per reply: the panel is keyed by reply, and a reply's data can arrive twice.
  const handledRef = useRef(false);
  useEffect(() => {
    if (handledRef.current || link.open !== 'new_tab') return;
    handledRef.current = true;
    setView(openTab(link.url) ? 'tab' : 'blocked');
  }, [link]);

  return (
    <section className={`side-panel panel link-panel${view === 'inside' ? ' link-panel--inside' : ''}`} aria-label={link.label}>
      <div className="side-panel__header">
        <span className="side-panel__title">
          {link.label} <span className="side-panel__subject">{pretty(link.url)}</span>
        </span>
        <button type="button" className="hud-btn hud-btn--icon side-panel__close" onClick={onClose} aria-label={`Close ${link.label}`} title="Close">
          <CloseIcon />
        </button>
      </div>

      {view === 'inside' ? (
        <iframe
          className="link-panel__frame"
          src={link.url}
          title={link.label}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
          referrerPolicy="no-referrer"
        />
      ) : (
        <p className="link-panel__note">
          {view === 'tab'
            ? `Opened in a new tab, Sir.`
            : view === 'blocked'
              ? 'Your browser held back the new tab. Tap below to open it, Sir.'
              : link.embeddable
                ? 'Shall I open it here or in a new tab, Sir?'
                : `${link.label} can only be opened in a new tab, Sir.`}
        </p>
      )}

      <div className="link-panel__actions">
        {link.embeddable && view !== 'inside' && (
          <button type="button" className="hud-btn" onClick={() => setView('inside')}>
            Open here
          </button>
        )}
        {/* A real link always works, even when the browser blocks scripted tabs. */}
        <a
          className={`hud-btn link-panel__tab${view === 'blocked' ? ' is-urgent' : ''}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setView((v) => (v === 'inside' ? v : 'tab'))}
        >
          {view === 'tab' ? 'Open again' : 'New tab'} ↗
        </a>
      </div>
    </section>
  );
}
