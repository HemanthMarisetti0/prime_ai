import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const TIMEOUT_MS = 10_000;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const MAX_README_CHARS = 4000;
const MAX_PAGE_TEXT_CHARS = 7000;
const TOP_REPOS = 8;
const HEADERS = { 'User-Agent': 'PRIME-assistant/1.0 (personal assistant; non-commercial)' };

/** Text gathered from one source, ready to be summarised. */
export interface SourceText {
  title: string;
  text: string;
  /** Short note for Sir about what was read. */
  detail: string;
}

interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  twitter_username: string | null;
  public_repos: number;
  followers: number;
  created_at: string;
  html_url: string;
}

interface GitHubRepo {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
  pushed_at: string;
  topics?: string[];
  homepage: string | null;
}

/**
 * Plain text of a GitHub README: badges become their labels, stats widgets, HTML and
 * decorative rules are dropped, so only the meaningful words remain.
 */
export function cleanMarkdown(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[!\[([^\]]*)\]\([^)]*\)\]\([^)]*\)/g, '$1') // linked images
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt: string) =>
      /stat|trophy|counter|views?|langs|streak|graph|your name/i.test(alt) ? '' : alt,
    )
    .replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, '$1')
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/^ +| +$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Accepts "octocat", "@octocat" or "https://github.com/octocat". */
export function parseGitHubUser(input: string): string | null {
  const value = input.trim().replace(/^@/, '');
  const fromUrl = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#\s]+)/i.exec(value)?.[1];
  const user = fromUrl ?? value;
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(user) ? user : null;
}

/** True for loopback, private, link-local and other addresses a public website never uses. */
export function isPrivateAddress(address: string): boolean {
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = address.toLowerCase();
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

/** Rejects URLs that aren't public http(s) sites, so the server can't be pointed at internal machines. */
async function assertPublicUrl(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https links are supported.');
  if (url.username || url.password) throw new Error('Links with credentials are not supported.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('That address is not a public website.');
  }
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new Error(`Could not find a website at ${host}.`);
      });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('That address is not a public website.');
  }
}

const decodeEntities = (text: string) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));

const meta = (html: string, name: string) =>
  new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html)?.[1] ??
  new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i').exec(html)?.[1];

/** Readable text of an HTML page: title, description and body text without scripts, styles or markup. */
export function htmlToText(html: string): { title: string; description: string; text: string } {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim();
  const description = decodeEntities(meta(html, 'description') ?? meta(html, 'og:description') ?? '').trim();
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr|header|footer)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  return { title, description, text };
}

/** Reads public profile information from GitHub and personal websites. */
export class ProfileSources {
  async github(input: string): Promise<SourceText> {
    const user = parseGitHubUser(input);
    if (!user) throw new Error('That does not look like a GitHub username.');

    const api = async <T>(path: string): Promise<T> => {
      const res = await fetch(`https://api.github.com${path}`, {
        headers: { ...HEADERS, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 404) throw new Error(`No GitHub user called "${user}".`);
      if (res.status === 403 || res.status === 429) throw new Error('GitHub is rate-limiting requests; try again in a while.');
      if (!res.ok) throw new Error(`GitHub responded with ${res.status}.`);
      return (await res.json()) as T;
    };

    const [profile, repos, readme] = await Promise.all([
      api<GitHubUser>(`/users/${user}`),
      api<GitHubRepo[]>(`/users/${user}/repos?per_page=100&sort=pushed`),
      // A profile README lives in the repo named after the user.
      fetch(`https://raw.githubusercontent.com/${user}/${user}/HEAD/README.md`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
        .then((res) => (res.ok ? res.text() : ''))
        .catch(() => ''),
    ]);

    const own = repos.filter((r) => !r.fork && !r.archived);
    const top = [...own]
      .sort((a, b) => b.stargazers_count - a.stargazers_count || b.pushed_at.localeCompare(a.pushed_at))
      .slice(0, TOP_REPOS);
    const languages = Object.entries(
      own.reduce<Record<string, number>>((count, r) => {
        if (r.language) count[r.language] = (count[r.language] ?? 0) + 1;
        return count;
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([language]) => language);

    const lines = [
      `Profile: ${profile.html_url}`,
      profile.name && `Name: ${profile.name}`,
      profile.bio && `Bio: ${profile.bio}`,
      profile.company && `Company: ${profile.company}`,
      profile.location && `Location: ${profile.location}`,
      profile.blog && `Website: ${profile.blog}`,
      profile.twitter_username && `X/Twitter: @${profile.twitter_username}`,
      `Public repositories: ${profile.public_repos}; followers: ${profile.followers}; on GitHub since ${profile.created_at.slice(0, 4)}`,
      languages.length && `Most used languages: ${languages.join(', ')}`,
      top.length &&
        `Notable repositories:\n${top
          .map(
            (r) =>
              `- ${r.name}${r.language ? ` (${r.language})` : ''}${r.stargazers_count ? `, ${r.stargazers_count}★` : ''}${
                r.description ? `: ${r.description}` : ''
              }${r.topics?.length ? ` [${r.topics.slice(0, 5).join(', ')}]` : ''}`,
          )
          .join('\n')}`,
      readme.trim() && `Profile README:\n${cleanMarkdown(readme).slice(0, MAX_README_CHARS)}`,
    ].filter(Boolean);

    return {
      title: `GitHub (${user})`,
      text: lines.join('\n'),
      detail: `Read @${user}: ${profile.public_repos} public repos${readme.trim() ? ' and profile README' : ''}.`,
    };
  }

  async portfolio(input: string): Promise<SourceText> {
    const raw = input.trim();
    if (/^[a-z][a-z\d+.-]*:(?!\d)/i.test(raw) &&!/^https?:\/\//i.test(raw)) throw new Error('Only http and https links are supported.');
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      throw new Error('That is not a valid web address.');
    }

    // Follow redirects by hand so every hop is checked.
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(url);
      res = await fetch(url, {
        headers: { ...HEADERS, Accept: 'text/html,application/xhtml+xml' },
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      break;
    }
    if (!res || (res.status >= 300 && res.status < 400)) throw new Error('The site redirected too many times.');
    if (!res.ok) throw new Error(`The site responded with ${res.status}.`);
    if (!/html|text\/plain/i.test(res.headers.get('content-type') ?? '')) throw new Error('That link is not a web page.');

    const html = await readLimited(res, MAX_PAGE_BYTES);
    const { title, description, text } = htmlToText(html);
    const body = text.slice(0, MAX_PAGE_TEXT_CHARS);
    const thin = body.length < 200;
    return {
      title: `Portfolio (${url.hostname})`,
      text: [`URL: ${url.href}`, title && `Title: ${title}`, description && `Description: ${description}`, body && `Page text:\n${body}`]
        .filter(Boolean)
        .join('\n'),
      detail: thin
        ? `Read ${url.hostname}, but found very little text (sites built with JavaScript often show none to readers like me).`
        : `Read ${url.hostname} (${Math.round(body.length / 100) / 10}k characters).`,
    };
  }
}

/** Reads a response body, stopping at `maxBytes`. */
async function readLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
