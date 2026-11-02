import { Injectable, Logger } from '@nestjs/common';
import type { YouTubeResults, YouTubeVideo } from '@prime/shared';
import { env } from '../config/env';

const CACHE_TTL_MS = 30 * 60_000;
const TIMEOUT_MS = 8000;
const MAX_RESULTS = 5;

interface SearchResponse {
  items?: {
    id: { videoId?: string };
    snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string }; default?: { url: string } } };
  }[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
const decode = (text: string) => text.replace(/&(#39|amp|lt|gt|quot|apos);/g, (_, entity: string) => ENTITIES[entity]);

/**
 * YouTube search via the YouTube Data API (free quota: ~100 searches/day).
 * Without YOUTUBE_API_KEY only a search link is returned.
 */
@Injectable()
export class YouTubeService {
  private readonly logger = new Logger(YouTubeService.name);
  private readonly cache = new Map<string, { at: number; videos: YouTubeVideo[] }>();

  get hasApiKey(): boolean {
    return Boolean(env.youtubeApiKey);
  }

  async search(query: string, autoplay: boolean): Promise<YouTubeResults> {
    const searchUrl = `https://www.youtube.com/results?${new URLSearchParams({ search_query: query })}`;
    if (!env.youtubeApiKey) return { query, searchUrl, videos: [], autoplay: false };

    const key = query.toLowerCase();
    const cached = this.cache.get(key);
    const videos = cached && Date.now() - cached.at < CACHE_TTL_MS ? cached.videos : await this.fetchVideos(query);
    this.cache.set(key, { at: Date.now(), videos });
    if (!videos.length) throw new Error(`No playable YouTube videos found for "${query}".`);

    return { query, searchUrl, videos, autoplay };
  }

  private async fetchVideos(query: string): Promise<YouTubeVideo[]> {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.search = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      safeSearch: 'moderate',
      maxResults: String(MAX_RESULTS),
      regionCode: env.newsRegion,
      q: query,
      key: env.youtubeApiKey,
    }).toString();

    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      this.logger.warn(`YouTube API responded with ${res.status}`);
      throw new Error(res.status === 403 ? 'The YouTube search quota is exhausted for today.' : 'YouTube search failed.');
    }

    const data = (await res.json()) as SearchResponse;
    return (data.items ?? [])
      .filter((item) => item.id.videoId)
      .map((item) => {
        const videoId = item.id.videoId!;
        return {
          videoId,
          title: decode(item.snippet.title),
          channel: decode(item.snippet.channelTitle),
          thumbnailUrl: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? '',
          url: `https://www.youtube.com/watch?v=${videoId}`,
        };
      });
  }
}
