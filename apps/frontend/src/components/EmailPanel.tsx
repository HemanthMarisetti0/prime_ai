import { useState } from 'react';
import type { EmailDraft } from '@prime/shared';
import { gmailAvailable } from '../email/gmail';
import type { UiMessage } from '../hooks/useChat';
import { CloseIcon } from './icons';

interface EmailPanelProps {
  draft: EmailDraft;
  status: UiMessage['emailStatus'];
  error?: string;
  /** Reports Sir's changes, so a spoken "send it" sends exactly what he sees. */
  onEdit: (edits: Pick<EmailDraft, 'subject' | 'body'>) => void;
  /** Sir confirmed: send from his Gmail. */
  onSend: () => Promise<void>;
  onDiscard: () => void;
  onClose: () => void;
}

function gmailComposeUrl(to: string[], subject: string, body: string): string {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to: to.join(','), su: subject, body });
  return `https://mail.google.com/mail/?${params}`;
}

/** An email P.R.I.M.E. drafted. Nothing is sent until Sir confirms (this Send button, or "yes, send it"). */
export function EmailPanel({ draft, status, error, onEdit, onSend, onDiscard, onClose }: EmailPanelProps) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);
  const to = draft.to.map((r) => r.email);
  const locked = status === 'sending' || status === 'sent' || status === 'discarded';
  const canSendHere = gmailAvailable();

  const edit = (next: Pick<EmailDraft, 'subject' | 'body'>) => {
    setSubject(next.subject);
    setBody(next.body);
    onEdit(next);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${to.join(', ')}\nSubject: ${subject}\n\n${body}`);
      setCopied(true);
    } catch {
      // Clipboard unavailable; nothing to do.
    }
  };

  const headline =
    status === 'sent' ? 'Sent' : status === 'sending' ? 'Sending…' : status === 'discarded' ? 'Discarded' : 'Awaiting your confirmation';

  return (
    <section className={`side-panel panel email-panel email-panel--${status ?? 'draft'}`} aria-label="Email draft">
      <div className="side-panel__header">
        <span className="side-panel__title">
          Email <span className="side-panel__subject">{headline}</span>
        </span>
        <button type="button" className="hud-btn hud-btn--icon side-panel__close" onClick={onClose} aria-label="Hide email" title="Hide">
          <CloseIcon />
        </button>
      </div>

      <dl className="email-panel__to">
        <dt>To</dt>
        <dd>
          {draft.to.map((r) => (
            <span key={r.email} className="email-panel__recipient" title={r.email}>
              {r.name ? (
                <>
                  {r.name} <span className="email-panel__address">{r.email}</span>
                </>
              ) : (
                r.email
              )}
            </span>
          ))}
        </dd>
      </dl>

      <label className="settings__field">
        <span>Subject</span>
        <input className="settings__input" value={subject} readOnly={locked} onChange={(e) => edit({ subject: e.target.value, body })} />
      </label>
      <label className="settings__field">
        <span>Message</span>
        <textarea
          className="settings__about email-panel__body"
          value={body}
          readOnly={locked}
          onChange={(e) => edit({ subject, body: e.target.value })}
          rows={8}
        />
      </label>

      {error && !locked && <p className="import__error email-panel__error">{error}</p>}

      {status === 'sent' ? (
        <p className="email-panel__done">✓ Sent from your Gmail, Sir.</p>
      ) : status === 'discarded' ? (
        <p className="settings__note">Discarded. Nothing was sent.</p>
      ) : (
        <>
          <div className="link-panel__actions">
            {canSendHere ? (
              <button type="button" className="hud-btn email-panel__send" onClick={() => void onSend()} disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Send'}
              </button>
            ) : (
              <a className="hud-btn email-panel__send" href={gmailComposeUrl(to, subject, body)} target="_blank" rel="noopener noreferrer">
                Open in Gmail ↗
              </a>
            )}
            <button type="button" className="hud-btn" onClick={onDiscard} disabled={status === 'sending'}>
              Discard
            </button>
            <button type="button" className="hud-btn email-panel__copy" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="settings__note">
            {canSendHere
              ? 'Say “yes, send it” or tap Send. The first time, Google asks you to allow sending.'
              : 'Sending needs Google sign-in; this opens Gmail with everything filled in instead.'}
          </p>
        </>
      )}
    </section>
  );
}
