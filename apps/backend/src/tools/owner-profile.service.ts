import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OwnerSite } from '@prime/shared';
import { ProfileSources, type SourceText } from './profile-sources';

/** Sir's public profiles, read automatically so P.R.I.M.E. knows about him. Empty = not used. */
const OWNER = {
  github: 'https://github.com/HemanthMarisetti0',
  portfolio: 'https://hk-dev-portfolio.vercel.app/',
  linkedin: 'https://www.linkedin.com/in/hemanth-kumar-marisetti-671298253/',
};

/** People P.R.I.M.E. knows by name, e.g. for "email my wife". Keys are what Sir may call them. */
export const CONTACTS = [
  {
    name: 'Hemanth Kumar Marisetti',
    relation: 'Sir himself',
    aliases: ['me', 'myself', 'my email', 'hemanth'],
    email: 'hemanthmarisetti5552@gmail.com',
  },
  {
    name: 'Marisetti Neeraja Venkata Lakshmi',
    relation: "Sir's wife",
    aliases: ['wife', 'my wife', 'neeraja', 'lakshmi'],
    email: 'middeneeraja04@gmail.com',
  },
] as const;

/** Fixed facts about Sir, always known (unlike his public profiles, which are read from the web). */
const OWNER_FACTS = [
  `- Full name: ${CONTACTS[0].name}`,
  `- Personal email: ${CONTACTS[0].email}`,
  `- Wife: ${CONTACTS[1].name} (email: ${CONTACTS[1].email})`,
].join('\n');

/** Sir's pages P.R.I.M.E. can open. GitHub and LinkedIn refuse to be shown inside other sites. */
export const OWNER_LINKS: Record<OwnerSite, { label: string; url: string; embeddable: boolean }> = {
  portfolio: { label: 'Portfolio', url: OWNER.portfolio, embeddable: true },
  github: { label: 'GitHub', url: OWNER.github, embeddable: false },
  linkedin: { label: 'LinkedIn', url: OWNER.linkedin, embeddable: false },
};

const REFRESH_MS = 12 * 60 * 60_000;
const RETRY_MS = 10 * 60_000;
const MAX_TEXT_CHARS = 7000;
// Survives restarts (e.g. dev reloads), so GitHub's rate limit is never an issue.
const CACHE_FILE = join(tmpdir(), 'prime-owner-profile.json');

interface Cached {
  key: string;
  at: number;
  text: string;
}

/**
 * Sir's background from his public GitHub and portfolio (see OWNER above),
 * read in the background and kept fresh, so P.R.I.M.E. knows about him without being told.
 */
@Injectable()
export class OwnerProfileService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OwnerProfileService.name);
  private readonly sources = new ProfileSources();
  // Bump the version when the stored text format changes, so old caches are ignored.
  private readonly key = JSON.stringify({ version: 2, ...OWNER });
  private cached: Cached | null = null;
  private timer: NodeJS.Timeout | null = null;

  get configured(): boolean {
    return Boolean(OWNER.github || OWNER.portfolio || OWNER.linkedin);
  }

  /** What is known about Sir: fixed personal facts, plus his public profiles once they have been read. */
  background(): string {
    return [`Personal details:\n${OWNER_FACTS}`, this.cached?.text].filter(Boolean).join('\n\n');
  }

  async onModuleInit() {
    if (!this.configured) return;
    this.cached = await this.loadCache();
    const age = this.cached ? Date.now() - this.cached.at : Infinity;
    this.schedule(age >= REFRESH_MS ? 0 : REFRESH_MS - age);
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delayMs: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), delayMs);
    this.timer.unref();
  }

  private async refresh() {
    const { github, portfolio, linkedin } = OWNER;
    const results = await Promise.allSettled<SourceText | null>([
      github ? this.sources.github(github) : Promise.resolve(null),
      portfolio ? this.sources.portfolio(portfolio) : Promise.resolve(null),
    ]);
    const parts: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) parts.push(`${result.value.title}:\n${result.value.text}`);
      if (result.status === 'rejected') this.logger.warn(`Could not read ${i ? 'portfolio' : 'GitHub'}: ${String(result.reason?.message ?? result.reason)}`);
    });
    if (linkedin) parts.push(`LinkedIn: ${linkedin}`);

    const failed = results.some((r) => r.status === 'rejected');
    if (parts.length) {
      this.cached = { key: this.key, at: Date.now(), text: parts.join('\n\n').slice(0, MAX_TEXT_CHARS) };
      await writeFile(CACHE_FILE, JSON.stringify(this.cached)).catch(() => undefined);
      this.logger.log(`Read Sir's public profile (${this.cached.text.length} characters)`);
    }
    // Retry soon if something failed and there is nothing usable yet; otherwise refresh twice a day.
    this.schedule(failed && !this.cached ? RETRY_MS : REFRESH_MS);
  }

  private async loadCache(): Promise<Cached | null> {
    try {
      const cached = JSON.parse(await readFile(CACHE_FILE, 'utf8')) as Cached;
      return cached.key === this.key && typeof cached.text === 'string' ? cached : null;
    } catch {
      return null;
    }
  }
}
