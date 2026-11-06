import type { OwnerLink, OwnerSite } from '@prime/shared';

/**
 * Sir's own pages. Keep in step with OWNER_LINKS in apps/backend/src/tools/owner-profile.service.ts
 * (the shared package holds types only). GitHub and LinkedIn refuse to be shown inside other sites.
 */
export const OWNER_PAGES: Record<OwnerSite, Omit<OwnerLink, 'site' | 'open'>> = {
  portfolio: { label: 'Portfolio', url: 'https://hk-dev-portfolio.vercel.app/', embeddable: true },
  github: { label: 'GitHub', url: 'https://github.com/HemanthMarisetti0', embeddable: false },
  linkedin: {
    label: 'LinkedIn',
    url: 'https://www.linkedin.com/in/hemanth-kumar-marisetti-671298253/',
    embeddable: false,
  },
};

type Where = OwnerLink['open'];

const SITES: [OwnerSite, RegExp][] = [
  ['portfolio', /^(portfolio|portfolio (web)?site|(personal )?(web)?site)$/],
  ['github', /^(github|git hub)( (profile|page|account|repos|repositories))?$/],
  ['linkedin', /^(linkedin|linked in)( (profile|page|account))?$/],
];

const INSIDE = /^(here|in here|inside|inside here|in prime|within prime|in this (window|page|tab)|right here)$/;
const NEW_TAB = /^((in )?(a )?(new|separate|another|different) (browser )?(tab|window)|separately|outside|externally|in (the )?browser)$/;

const FILLER = /\b(please|kindly|prime|sir|hey|ok|okay|could you|can you|would you|will you|for me|now|up)\b/g;

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[.,!?]/g, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function parseWhere(text: string): Where | undefined {
  if (!text) return null;
  if (INSIDE.test(text)) return 'inside';
  if (NEW_TAB.test(text)) return 'new_tab';
  return undefined;
}

/**
 * "Open my GitHub", "show my portfolio here", "open my LinkedIn in a new tab": handled instantly
 * in the browser, so a new tab opens from Sir's own keypress (and isn't blocked as a popup).
 * Returns null for anything else, which goes to the AI as usual.
 */
export function parseOwnerPageCommand(text: string): { site: OwnerSite; where: Where } | null {
  const match = /^(open|show|launch|visit|go to|take me to|pull|bring|display) (my|me my) (.+)$/.exec(normalise(text));
  if (!match) return null;
  const rest = match[3];
  for (const [site, pattern] of SITES) {
    // Split "<site> <where>" at each space and accept the first reading that fits.
    const words = rest.split(' ');
    for (let i = words.length; i > 0; i--) {
      if (!pattern.test(words.slice(0, i).join(' '))) continue;
      const where = parseWhere(words.slice(i).join(' '));
      if (where !== undefined) return { site, where };
    }
  }
  return null;
}

/** Sir's answer to "here or in a new tab?", e.g. "here", "in a new tab". */
export function parseWhereAnswer(text: string): 'inside' | 'new_tab' | null {
  const answer = normalise(text).replace(/^(open (it|that)|show (it|that)|(do it|put it|i want it|let's do|lets do)) ?/, '');
  return INSIDE.test(answer) ? 'inside' : NEW_TAB.test(answer) || /^(tab|new tab)$/.test(answer) ? 'new_tab' : null;
}

/** P.R.I.M.E.'s spoken reply for a page request handled in the browser. */
export function describeOpen(link: OwnerLink, asked: Where): string {
  const name = `your ${link.label === 'Portfolio' ? 'portfolio' : link.label}`;
  if (link.open === 'inside') return `Here is ${name}, Sir.`;
  if (link.open === 'new_tab') {
    return asked === 'inside'
      ? `${link.label} does not allow being shown inside P.R.I.M.E., Sir, so I have opened it in a new tab.`
      : `Opening ${name} in a new tab, Sir.`;
  }
  return `Shall I open ${name} here or in a new tab, Sir?`;
}

/** Resolves where a page opens: GitHub and LinkedIn can only open in a new tab, so they never ask. */
export function toOwnerLink(site: OwnerSite, where: Where): OwnerLink {
  const page = OWNER_PAGES[site];
  const open: Where = page.embeddable ? where : 'new_tab';
  return { site, ...page, open };
}
