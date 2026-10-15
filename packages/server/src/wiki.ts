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
  const res = await fetch(`${API}/api/rest_v1/page/summary/${encodeURIComponent(key.replace(/ /g, '_'))}?redirect=true`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, any>;
  if (j.type === 'disambiguation' || !j.extract) return null;
  const url: string | undefined = j.content_urls?.desktop?.page;
  if (!url?.startsWith('https://en.wikipedia.org/wiki/')) return null;
  return { title: j.title, description: j.description, extract: j.extract, url, revision: j.revision ? String(j.revision) : undefined, key: j.titles?.canonical ?? key };
}

/** Resolve a free-text topic to the best Wikipedia article, skipping disambiguation pages. */
export async function resolveWikiTopic(query: string): Promise<WikiSummary | null> {
  const q = query.trim();
  if (!q) return null;
  const res = await fetch(`${API}/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=3`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const j = (await res.json()) as { pages?: Array<{ key: string; title: string }> };
  for (const page of j.pages ?? []) {
    if (!relevant(q, page.title)) continue;
    const s = await wikiSummary(page.key);
    if (s && relevant(q, s.title)) return s;
  }
  return null;
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
