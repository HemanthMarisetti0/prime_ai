import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import type { EmailDraft } from '@prime/shared';
import { auth } from '../auth/firebase';
import { buildRawMessage } from './mime';

// Send-only access: P.R.I.M.E. can send mail as Sir, but cannot read his inbox.
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const TOKEN_KEY = 'prime.gmailToken';
// Google's access tokens last an hour; renew a little early.
const TOKEN_LIFETIME_MS = 55 * 60_000;

export class GmailError extends Error {
  /** Sir has to grant (or re-grant) Gmail access with a click before sending. */
  readonly needsPermission: boolean;

  constructor(message: string, needsPermission = false) {
    super(message);
    this.name = 'GmailError';
    this.needsPermission = needsPermission;
  }
}

/** Gmail sending needs Google sign-in (unavailable when sign-in is disabled in local development). */
export const gmailAvailable = () => Boolean(auth?.currentUser);

function loadToken(): string | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as { token: string; expiresAt: number } | null;
    return saved && saved.expiresAt > Date.now() ? saved.token : null;
  } catch {
    return null;
  }
}

function saveToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt: Date.now() + TOKEN_LIFETIME_MS }));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Kept for this page only.
  }
}

/** True when Gmail access was granted recently enough to send without asking again. */
export const hasGmailPermission = () => loadToken() !== null;

const PERMISSION_ERRORS: Record<string, string> = {
  'auth/popup-blocked': 'Your browser blocked the Google window, Sir. Tap Send on the draft to continue.',
  'auth/popup-closed-by-user': 'The Google window was closed, Sir, so nothing was sent.',
  'auth/cancelled-popup-request': 'The Google window was closed, Sir, so nothing was sent.',
  'auth/user-mismatch': 'Kindly choose the same Google account you signed in with, Sir.',
};

/**
 * Asks Google for permission to send mail as Sir (opens a Google window, so call it from a click
 * or key press). Google remembers the grant; afterwards this only refreshes the access.
 */
export async function grantGmailPermission(): Promise<void> {
  const user = auth?.currentUser;
  if (!user) throw new GmailError('Sending email needs Google sign-in, Sir.');
  const provider = new GoogleAuthProvider();
  provider.addScope(GMAIL_SEND_SCOPE);
  if (user.email) provider.setCustomParameters({ login_hint: user.email });
  try {
    const result = await reauthenticateWithPopup(user, provider);
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    if (!token) throw new GmailError('Google did not grant access to send email, Sir.');
    saveToken(token);
  } catch (error) {
    if (error instanceof GmailError) throw error;
    const code = (error as { code?: string }).code ?? '';
    throw new GmailError(PERMISSION_ERRORS[code] ?? 'Google did not grant access to send email, Sir.', code === 'auth/popup-blocked');
  }
}

/**
 * Sends the email from Sir's own Gmail. Throws a GmailError with `needsPermission` when Google
 * access must be granted first (which needs a click, see grantGmailPermission).
 */
export async function sendGmail(draft: Pick<EmailDraft, 'to' | 'subject' | 'body'>): Promise<void> {
  const token = loadToken();
  if (!token) throw new GmailError('Google needs to confirm it is you before I send this, Sir.', true);

  let res: Response;
  try {
    res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: buildRawMessage(draft) }),
    });
  } catch {
    throw new GmailError('I could not reach Gmail, Sir. Kindly check your connection; nothing was sent.');
  }
  if (res.ok) return;

  const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? '';
  if (res.status === 401) {
    saveToken(null);
    throw new GmailError('My Gmail access has expired, Sir. Google needs to confirm it is you again.', true);
  }
  if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(detail)) {
    throw new GmailError('The Gmail API is not enabled for this project yet, Sir. It needs switching on in Google Cloud.');
  }
  if (res.status === 403) {
    saveToken(null);
    throw new GmailError('Google did not allow sending from this account, Sir. Kindly grant access again.', true);
  }
  throw new GmailError(`Gmail could not send it, Sir${detail ? `: ${detail}` : '.'}`);
}
