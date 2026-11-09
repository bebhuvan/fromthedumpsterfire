// Wikipedia cards. Models propose topics as plain search queries; this module resolves each query
// against the Wikipedia REST API, fetches the current summary, and returns the canonical article
// URL. No model ever writes a Wikipedia URL.

import { USER_AGENT } from './extract/http';

export interface WikiSummary {
  title: string;
  description?: string;
  extract: string;
  url: string;
  revision?: string;
  key: string;
}

const API = 'https://en.wikipedia.org';
const headers = { 'user-agent': USER_AGENT, accept: 'application/json', 'api-user-agent': USER_AGENT };

export async function wikiSummary(key: string): Promise<WikiSummary | null> {
  const r = await wikiLookup(key);
  return r && r !== 'ambiguous' ? r : null;
}

/** An article, Wikipedia's own "may refer to" page ('ambiguous'), or nothing. */
async function wikiLookup(key: string): Promise<WikiSummary | 'ambiguous' | null> {
  const res = await fetch(`${API}/api/rest_v1/page/summary/${encodeURIComponent(key.replace(/ /g, '_'))}?redirect=true`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, any>;
  if (j.type === 'disambiguation') return 'ambiguous';
  if (!j.extract) return null;
  const url: string | undefined = j.content_urls?.desktop?.page;
  if (!url?.startsWith('https://en.wikipedia.org/wiki/')) return null;
  return { title: j.title, description: j.description, extract: j.extract, url, revision: j.revision ? String(j.revision) : undefined, key: j.titles?.canonical ?? key };
}

/** Resolve a free-text topic to the best Wikipedia article, skipping disambiguation pages. */
export async function resolveWikiTopic(query: string): Promise<WikiSummary | null> {
  const q = query.trim();
  if (!q) return null;
  // An exact title (redirects followed) first: search ranks a broad article above the specific one
  // a reader asked for ("Arrow stork" searched gives "White stork"; the title "Pfeilstorch" is exact).
  const exact = await wikiLookup(q).catch(() => null);
  const first = exactOutcome(q, exact);
  if (first === 'ambiguous') return null;
  if (first) return first;
  const res = await fetch(`${API}/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=3`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const j = (await res.json()) as { pages?: Array<{ key: string; title: string }> };
  // Among the relevant hits, prefer the one whose own lead uses the reader's phrase: a search for
  // "arrow stork" ranks "White stork" first, but "Pfeilstorch" is the article that says "arrow stork".
  const hits: WikiSummary[] = [];
  for (const page of j.pages ?? []) {
    const s = await wikiSummary(page.key).catch(() => null);
    // Relevant if the title shares a word with the query, or the lead uses the query's words.
    if (s && (relevant(q, s.title) || namesPhrase(q, s))) hits.push(s);
  }
  return pickHit(q, hits);
}

/**
 * What the exact-title lookup settles. A title Wikipedia itself lists as ambiguous is never guessed:
 * searching "Dilettante" returned a record label that shares the word. A topic is better left out
 * than wrong; the model is asked for bracketed titles ("Either/Or (Kierkegaard book)") for this.
 * An article only counts when its title shares a word with the query; otherwise search decides.
 */
export function exactOutcome(query: string, exact: WikiSummary | 'ambiguous' | null): WikiSummary | 'ambiguous' | null {
  if (exact === 'ambiguous') return 'ambiguous';
  return exact && relevant(query, exact.title) ? exact : null;
}

/** The hit that names the query in its title or lead, else the best-ranked one. */
export function pickHit(query: string, hits: WikiSummary[]): WikiSummary | null {
  return hits.find((h) => namesPhrase(query, h)) ?? hits[0] ?? null;
}

/** The article's title is the query, or its lead contains the query as a phrase (two words or more). */
function namesPhrase(query: string, h: Pick<WikiSummary, 'title' | 'extract'>): boolean {
  const phrase = query.toLowerCase().replace(/\s+/g, ' ').trim();
  if (h.title.toLowerCase() === phrase) return true;
  return phrase.includes(' ') && h.extract.toLowerCase().replace(/\s+/g, ' ').includes(phrase);
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'for', 'to', 'by', 'at', 'with', 'from', 'de', 'la']);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

/** A search hit only counts if its title shares a significant word with the query. */
export function relevant(query: string, title: string): boolean {
  const q = new Set(tokens(query));
  return tokens(title).some((t) => q.has(t) || [...q].some((w) => w.length > 4 && (t.startsWith(w) || w.startsWith(t))));
}

/** The article key from a Wikipedia URL, for items captured from Wikipedia itself. */
export function wikiKeyFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!u.hostname.endsWith('wikipedia.org') || !u.pathname.startsWith('/wiki/')) return null;
    return decodeURIComponent(u.pathname.slice(6));
  } catch {
    return null;
  }
}

/** The first sentence of a Wikipedia extract, as a fallback card summary. */
export function firstSentence(s: string): string {
  const m = /^(.{40,}?[.!?])(\s+[A-Z]|$)/s.exec(s.trim());
  return (m?.[1] ?? s).trim();
}

/**
 * The card's summary: a sentence of Wikipedia's own lead, verbatim. The one that best matches why
 * the article was chosen for this piece, so the card says why it is there; the first sentence when
 * nothing matches better.
 */
export function bestSentence(extract: string, why: string): string {
  const text = extract.trim();
  const sentences = text.match(/[^.!?]+(?:[.!?]+["'”’)]*)(?=\s+[A-Z0-9"“(]|\s*$)/g)?.map((x) => x.trim()).filter((x) => x.length >= 40) ?? [];
  if (!why.trim() || sentences.length < 2) return firstSentence(text);
  const want = new Set(tokens(why));
  let best = sentences[0]!;
  let score = 0;
  for (const s of sentences.slice(0, 8)) {
    const n = new Set(tokens(s).filter((t) => want.has(t))).size;
    if (n > score) [best, score] = [s, n];
  }
  return score >= 2 ? best : firstSentence(text);
}
