// URL shapes and small text helpers shared by every page. The paths match the reader app's deep
// links (apps/mobile/src/nav.ts), so a shared link opens the same screen in the app or the browser.

import { haulSlug, type Haul, type Item, type Title } from '@fdf/shared/haul';

/** Resolve the :n route parameter against the archive. Only canonical numbers ("1", not "001"). */
export function findHaul(
  a: { hauls: Haul[]; failed: Map<number, string> },
  param: string | undefined,
): { kind: 'ok'; haul: Haul } | { kind: 'failed' } | { kind: 'missing' } {
  if (!param || !/^[1-9]\d{0,5}$/.test(param)) return { kind: 'missing' };
  const n = Number(param);
  const haul = a.hauls.find((h) => h.number === n);
  if (haul) return { kind: 'ok', haul };
  return a.failed.has(n) ? { kind: 'failed' } : { kind: 'missing' };
}

export const SITE = 'https://fromthedumpsterfire.com';
export const SITE_NAME = 'From the Dumpster Fire';
export const EDITOR_NAME = 'Bhuvanesh';
/** The site, the Desk and the app, in the open. */
export const SOURCE_URL = 'https://github.com/bebhuvan/fromthedumpsterfire';
export const SITE_DESCRIPTION =
  'Irregular hauls of things worth salvaging from the internet and the archive, chosen by one editor and read closely with machines.';

export const paths = {
  home: '/',
  haul: (n: number) => `/haul/${n}`,
  haulMd: (n: number) => `/haul/${n}.md`,
  note: (n: number) => `/haul/${n}#field-note`,
  item: (n: number, id: string) => `/haul/${n}/${id}`,
  itemMd: (n: number, id: string) => `/haul/${n}/${id}.md`,
  thread: (n: number, id: string) => `/haul/${n}/thread/${id}`,
  threadMd: (n: number, id: string) => `/haul/${n}/thread/${id}.md`,
  threads: '/threads',
  shelf: '/shelf',
  book: (id: string) => `/shelf/${id}`,
  archive: '/archive',
  about: '/about',
  search: '/search',
  feed: '/feed.xml',
  llms: '/llms.txt',
  llmsFull: '/llms-full.txt',
};

export const absolute = (path: string) => new URL(path, SITE).toString();

/** "What cheap things" + "cost" as one plain string, for meta tags and feeds. */
export const titleText = (t: Title) => (t.italic ? `${t.text} ${t.italic}` : t.text);

/** Latest modification date (YYYY-MM-DD) for a Haul, accounting for corrections. */
export const haulLastmod = (h: Haul) => (h.corrections?.at(-1)?.date ?? h.publishedAt).slice(0, 10);

/** Resolve an item by id, preferring the current Haul and falling back across the archive. */
export function findItemAcrossHauls(
  itemId: string | undefined,
  preferred: Haul,
  allHauls?: Haul[],
): { haul: Haul; item: Item } | undefined {
  if (!itemId) return undefined;
  const local = preferred.items.find((x) => x.id === itemId);
  if (local) return { haul: preferred, item: local };
  if (allHauls) {
    for (const h of allHauls) {
      const found = h.items.find((x) => x.id === itemId);
      if (found) return { haul: h, item: found };
    }
  }
  return undefined;
}

/** Public-domain plate for a Haul's OpenGraph/social image: cover plate first, else first item plate. */
export function haulCoverImage(h: Haul): { url: string; width: number; height: number; alt: string } | undefined {
  const card = h.card && safeHref(h.card.url);
  if (card && h.card) return { url: card, width: h.card.width, height: h.card.height, alt: `Haul ${haulSlug(h.number)}: ${titleText(h.title)}` };
  const plate = h.cover ?? h.items.find((i) => i.plate)?.plate;
  if (!plate) return undefined;
  const url = safeHref(plate.url);
  if (!url) return undefined;
  return {
    url,
    width: plate.width,
    height: plate.height,
    alt: plate.caption || `Haul ${haulSlug(h.number)}: ${titleText(h.title)}`,
  };
}

/**
 * Only http and https links ever reach an href. Anything else (javascript:, data:, relative or
 * malformed input) gives undefined, so the caller renders plain text instead of a link.
 */
export function safeHref(u: string | null | undefined): string | undefined {
  if (typeof u !== 'string' || !u.trim()) return undefined;
  try {
    const p = new URL(u.trim());
    if (p.protocol !== 'https:' && p.protocol !== 'http:') return undefined;
    if (p.username || p.password) return undefined;
    return p.toString();
  } catch {
    return undefined;
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

/** "2026-10-15" to "15 October 2026", parsed by hand so the build machine's locale never leaks in. */
export function longDate(iso: string) {
  const { y, m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-10-15" to "15 Oct 2026", as a date stamp sets it. */
export function stampDate(iso: string) {
  const { y, m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]!.slice(0, 3)} ${y}`;
}

/** "2026-10-15" to "Thursday 15 October 2026". */
export function fullDate(iso: string) {
  const { y, m, d } = parts(iso);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** RFC 822 date for RSS. */
export function rfc822(iso: string) {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m - 1, d, 6, 0, 0)).toUTCString();
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

/** "Six objects". */
export function objects(n: number) {
  const word = WORDS[n] ?? String(n);
  return `${word} ${n === 1 ? 'object' : 'objects'}`;
}

export const minutes = (n?: number) => (n ? `${n} min` : '');
/** "1 minute", "11 minutes". */
export const minutesLong = (n: number) => `${n} minute${n === 1 ? '' : 's'}`;
export const joinMeta = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(' · ');
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** The first sentence of a passage, whole, for cards. Never cut mid-sentence. */
export function firstSentence(text: string) {
  // A sentence ends at . ! or ? after a lowercase letter or digit (so initials like "W." don't
  // count), optionally closed by a quote, and followed by a capital or the end.
  const m = /^(.+?[a-z0-9)][.!?]['"’”]?)(?=\s+['"‘“(]?[A-Z]|\s*$)/.exec(text.trim());
  return m?.[1] ?? text.trim();
}
