import type { EmailDraft } from '@prime/shared';

/** RFC 2047 encoding so names and subjects in any language survive email headers. */
const encodeHeader = (text: string) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${toBase64(text)}?=`);

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A plain-text email in the RFC 2822 form the Gmail API expects, base64url-encoded. */
export function buildRawMessage({ to, subject, body }: Pick<EmailDraft, 'to' | 'subject' | 'body'>): string {
  const recipients = to
    .map(({ name, email }) => (name ? `${encodeHeader(name.replace(/["\r\n]/g, ''))} <${email}>` : email))
    .join(', ');
  const message = [
    `To: ${recipients}`,
    `Subject: ${encodeHeader(subject.replace(/[\r\n]+/g, ' '))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64(body.replace(/\r?\n/g, '\r\n')).replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
  return toBase64(message).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
