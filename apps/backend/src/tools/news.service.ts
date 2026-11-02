import { Injectable } from '@nestjs/common';
import type { NewsItem, NewsReport } from '@prime/shared';
import { env } from '../config/env';

const CACHE_TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 8000;
const MAX_ITEMS = 8;

// Google News editions: region code -> [hl, gl, ceid].
const EDITIONS: Record<string, [string, string, string]> = {
  IN: ['en-IN', 'IN', 'IN:en'],
  US: ['en-US', 'US', 'US:en'],
  GB: ['en-GB', 'GB', 'GB:en'],
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (match, entity: string) => {
      if (entity[0] === '#') {
        const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .trim();
}

const tag = (xml: string, name: string) => {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? decode(match[1]) : '';
};

function parseItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const source = tag(item, 'source');
    let title = tag(item, 'title');
    // Google appends " - Source" to titles; the source is shown separately.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const published = new Date(tag(item, 'pubDate'));
    items.push({
      title,
      source: source || 'Unknown source',
      url: tag(item, 'link'),
      publishedAt: Number.isNaN(published.getTime()) ? new Date().toISOString() : published.toISOString(),
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

/** Headlines via Google News RSS (free; personal, non-commercial use). */
@Injectable()
export class NewsService {
  private readonly region = env.newsRegion;
  private readonly cache = new Map<string, { at: number; report: NewsReport }>();

  async getNews(topic: string | undefined): Promise<NewsReport> {
    const query = topic?.trim() || null;
    const key = query?.toLowerCase() ?? '';
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.report;

    const [hl, gl, ceid] = EDITIONS[this.region] ?? EDITIONS.IN;
    const url = new URL(query ? 'https://news.google.com/rss/search' : 'https://news.google.com/rss');
    url.search = new URLSearchParams({ ...(query && { q: `${query} when:2d` }), hl, gl, ceid }).toString();

    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`News service responded with ${res.status}`);
    const items = parseItems(await res.text());
    if (!items.length) throw new Error(query ? `No recent news found about "${query}".` : 'No headlines available.');

    const report: NewsReport = { topic: query, region: gl, items };
    this.cache.set(key, { at: Date.now(), report });
    return report;
  }
}
