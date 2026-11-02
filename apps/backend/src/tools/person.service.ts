import { Injectable } from '@nestjs/common';
import type { PersonFact, PersonProfile } from '@prime/shared';

const CACHE_TTL_MS = 60 * 60_000;
const TIMEOUT_MS = 8000;
const RATE_LIMIT_RETRY_MS = 1500;
const SEARCH_CANDIDATES = 3;
const MAX_LIST_VALUES = 3;
const LARGE_IMAGE_WIDTH = 500;
// Wikimedia asks API clients to identify themselves.
const HEADERS = { 'User-Agent': 'PRIME-assistant/1.0 (personal assistant; non-commercial)' };

const WIKIPEDIA = 'https://en.wikipedia.org';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const HUMAN = 'Q5';

// Wikidata properties shown as facts, in display order.
const PROPS = {
  instanceOf: 'P31',
  born: 'P569',
  died: 'P570',
  birthPlace: 'P19',
  deathPlace: 'P20',
  citizenship: 'P27',
  occupation: 'P106',
  spouse: 'P26',
} as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Summary {
  type: string;
  title: string;
  description?: string;
  extract: string;
  thumbnail?: { source: string };
  originalimage?: { source: string; width: number };
  wikibase_item?: string;
  content_urls: { desktop: { page: string } };
}

interface Snak {
  datavalue?: { value: unknown };
}
type Claims = Record<string, { rank: string; mainsnak: Snak }[]>;
interface WikiTime {
  time: string;
  precision: number;
}

async function getJson<T>(url: URL | string, retried = false): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  // Wikimedia briefly throttles bursts; one short wait is usually enough.
  if (res.status === 429 && !retried) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_MS));
    return getJson<T>(url, true);
  }
  if (!res.ok) throw new Error(`Wikipedia responded with ${res.status}`);
  return (await res.json()) as T;
}

/** Statement values, preferring "preferred" rank and skipping deprecated ones. */
function values(claims: Claims, prop: string): unknown[] {
  const statements = (claims[prop] ?? []).filter((s) => s.rank !== 'deprecated');
  const preferred = statements.filter((s) => s.rank === 'preferred');
  return (preferred.length ? preferred : statements).map((s) => s.mainsnak.datavalue?.value).filter((v) => v !== undefined);
}

const itemIds = (claims: Claims, prop: string, limit = MAX_LIST_VALUES) =>
  values(claims, prop)
    .map((v) => (v as { id?: string }).id)
    .filter((id): id is string => Boolean(id))
    .slice(0, limit);

function parseTime(claims: Claims, prop: string): WikiTime | null {
  const value = values(claims, prop)[0] as WikiTime | undefined;
  return value?.time ? value : null;
}

/** "+1988-11-05T00:00:00Z" → "5 November 1988", respecting the stated precision. */
function formatTime({ time, precision }: WikiTime): string | null {
  const match = /^([+-])(\d+)-(\d\d)-(\d\d)/.exec(time);
  if (!match) return null;
  const [, sign, y, m, d] = match;
  const year = `${Number(y)}${sign === '-' ? ' BC' : ''}`;
  if (precision >= 11 && Number(d)) return `${Number(d)} ${MONTHS[Number(m) - 1]} ${year}`;
  if (precision >= 10 && Number(m)) return `${MONTHS[Number(m) - 1]} ${year}`;
  return precision >= 9 ? year : null;
}

function ageInYears(born: WikiTime, until = new Date()): number | null {
  const match = /^\+(\d+)-(\d\d)-(\d\d)/.exec(born.time);
  if (!match || born.precision < 9) return null;
  const [year, month, day] = match.slice(1).map(Number);
  let age = until.getUTCFullYear() - year;
  // Without a known birthday, the age may be one year less.
  if (born.precision >= 11 && month && day) {
    const birthdayPassed = until.getUTCMonth() + 1 > month || (until.getUTCMonth() + 1 === month && until.getUTCDate() >= day);
    if (!birthdayPassed) age--;
  }
  return age >= 0 && age < 125 ? age : null;
}

/** Profile cards for people, from Wikipedia (summary, photo) and Wikidata (facts). Free, no key. */
@Injectable()
export class PersonService {
  private readonly cache = new Map<string, { at: number; profile: PersonProfile }>();

  async lookup(name: string): Promise<PersonProfile> {
    const key = name.trim().toLowerCase();
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.profile;

    const summary = await this.findSummary(name.trim());
    const facts = summary.wikibase_item ? await this.getFacts(summary.wikibase_item).catch(() => null) : null;

    const profile: PersonProfile = {
      name: summary.title,
      description: summary.description ?? null,
      summary: summary.extract,
      // The 330px thumbnail is blurry on the panel; ask for a larger rendition of the same file.
      // Wikimedia only serves standard widths (500 is one), and never upscales.
      imageUrl:
        (summary.originalimage && summary.originalimage.width >= LARGE_IMAGE_WIDTH
          ? summary.thumbnail?.source.replace(/\/\d+px-/, `/${LARGE_IMAGE_WIDTH}px-`)
          : summary.thumbnail?.source) ?? null,
      isPerson: facts?.isPerson ?? false,
      facts: facts?.facts ?? [],
      sourceUrl: summary.content_urls.desktop.page,
    };
    this.cache.set(key, { at: Date.now(), profile });
    return profile;
  }

  /** Best matching article that isn't a disambiguation page. */
  private async findSummary(name: string): Promise<Summary> {
    const url = new URL(`${WIKIPEDIA}/w/api.php`);
    url.search = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: name,
      srlimit: String(SEARCH_CANDIDATES),
      format: 'json',
    }).toString();
    const { query } = await getJson<{ query?: { search: { title: string }[] } }>(url);
    for (const { title } of query?.search ?? []) {
      const summary = await getJson<Summary>(`${WIKIPEDIA}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
      if (summary.type !== 'disambiguation' && summary.extract) return summary;
    }
    throw new Error(`No Wikipedia article found for "${name}".`);
  }

  private async getFacts(id: string): Promise<{ isPerson: boolean; facts: PersonFact[] }> {
    const { entities } = await this.wikidata<{ claims: Claims }>([id], 'claims');
    const claims = entities[id]?.claims ?? {};
    const isPerson = itemIds(claims, PROPS.instanceOf, 10).includes(HUMAN);
    if (!isPerson) return { isPerson, facts: [] };

    const birthPlace = itemIds(claims, PROPS.birthPlace, 1);
    const deathPlace = itemIds(claims, PROPS.deathPlace, 1);
    const citizenship = itemIds(claims, PROPS.citizenship);
    const occupation = itemIds(claims, PROPS.occupation);
    const spouse = itemIds(claims, PROPS.spouse, 2);
    const labels = await this.labels([...birthPlace, ...deathPlace, ...citizenship, ...occupation, ...spouse]);
    const names = (ids: string[]) => ids.map((i) => labels[i]).filter(Boolean);
    const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

    const born = parseTime(claims, PROPS.born);
    const died = parseTime(claims, PROPS.died);
    const age = born ? ageInYears(born, died ? new Date(died.time.slice(1)) : undefined) : null;
    const facts: PersonFact[] = [];
    const add = (label: string, parts: (string | null | undefined)[]) => {
      const value = parts.filter(Boolean).join(' · ');
      if (value) facts.push({ label, value });
    };

    add('Born', [born && formatTime(born), ...names(birthPlace)]);
    if (died) add('Died', [formatTime(died), age !== null ? `aged ${age}` : null, ...names(deathPlace)]);
    else if (age !== null) add('Age', [String(age)]);
    add('Nationality', [names(citizenship).join(', ')]);
    add('Occupation', [names(occupation).map(capitalise).join(', ')]);
    add(spouse.length > 1 ? 'Spouses' : 'Spouse', [names(spouse).join(', ')]);
    return { isPerson, facts };
  }

  private async labels(ids: string[]): Promise<Record<string, string>> {
    if (!ids.length) return {};
    const { entities } = await this.wikidata<{ labels?: { en?: { value: string } } }>([...new Set(ids)], 'labels');
    return Object.fromEntries(Object.entries(entities).map(([id, e]) => [id, e.labels?.en?.value ?? '']));
  }

  private wikidata<T>(ids: string[], props: string) {
    const url = new URL(WIKIDATA_API);
    url.search = new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props, languages: 'en', format: 'json' }).toString();
    return getJson<{ entities: Record<string, T> }>(url);
  }
}
