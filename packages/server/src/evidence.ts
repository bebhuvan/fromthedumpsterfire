// Evidence: the texts the machine may cite in a margin note besides the piece itself. Every one is
// fetched by the Desk: a whole Wikipedia article resolved by code from a title a model proposed, or a
// page an editorial session found and handed over (fetched through the same guarded article path as
// a capture). A note quotes its evidence word for word; the judge reads the quoted stretch.

import { detectUrl } from '@fdf/shared/detect';
import type { EvidenceRow } from './db';
import type { Env } from './env';
import { USER_AGENT } from './extract/http';
import { readJsonCapped } from './extract/stream';
import { fetchSource } from './ingest';
import { resolveWikiTopic, wikiKeyFromUrl, wordTokens } from './wiki';
import { newId, nowIso, wordCount } from './util';

/** Enough for any Wikipedia article's prose (the longest run past 100,000 words is rare) and a long essay. */
export const EVIDENCE_MAX_CHARS = 400_000;
const WIKI_JSON_MAX_BYTES = 4_000_000;

export interface FetchedEvidence {
  kind: EvidenceRow['kind'];
  title: string;
  publisher: string;
  url: string;
  text: string;
  revision: string | null;
}

/** A whole English Wikipedia article as plain text, by its exact title (redirects followed). */
export async function wikiArticle(title: string): Promise<FetchedEvidence | null> {
  const q = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'extracts|revisions|info',
    explaintext: '1',
    exsectionformat: 'plain',
    rvprop: 'ids',
    inprop: 'url',
    redirects: '1',
    titles: title,
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${q}`, {
    headers: { 'user-agent': USER_AGENT, 'api-user-agent': USER_AGENT, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const j = await readJsonCapped<{ query?: { pages?: Array<Record<string, any>> } }>(res.body, WIKI_JSON_MAX_BYTES, 'Wikipedia article');
  return wikiPage(j.query?.pages?.[0]);
}

/** The article from Wikipedia's answer, or null for a missing page or an empty extract. */
export function wikiPage(page: Record<string, any> | undefined): FetchedEvidence | null {
  if (!page || page.missing || page.invalid) return null;
  const text = String(page.extract ?? '').trim();
  const url = String(page.fullurl ?? '');
  if (!text || !url.startsWith('https://en.wikipedia.org/wiki/')) return null;
  return { kind: 'wiki', title: String(page.title), publisher: 'Wikipedia', url, text: text.slice(0, EVIDENCE_MAX_CHARS), revision: page.revisions?.[0]?.revid ? String(page.revisions[0].revid) : null };
}

// The first fetch of a link is kept as it is: notes point into it by offset, so a second fetch of the
// same page never replaces the text under them.
async function store(env: Env, itemId: string, e: FetchedEvidence, via: string): Promise<EvidenceRow> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO evidence (id, item_id, kind, title, publisher, url, text, word_count, revision, via, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (item_id, url) DO NOTHING`,
  )
    .bind(newId('ev_'), itemId, e.kind, e.title, e.publisher, e.url, e.text, wordCount(e.text), e.revision, via, now)
    .run();
  return (await env.DB.prepare('SELECT * FROM evidence WHERE item_id = ? AND url = ?').bind(itemId, e.url).first<EvidenceRow>())!;
}

/** Resolve a title or topic to a Wikipedia article (never guessing an ambiguous one) and keep its whole text. */
export async function addWikiEvidence(env: Env, itemId: string, query: string, via = 'pipeline'): Promise<EvidenceRow | null> {
  const hit = await resolveWikiTopic(query);
  if (!hit) return null;
  const known = await env.DB.prepare('SELECT * FROM evidence WHERE item_id = ? AND url = ?').bind(itemId, hit.url).first<EvidenceRow>();
  if (known) return known;
  const article = await wikiArticle(hit.title);
  return article ? store(env, itemId, article, via) : null;
}

/**
 * A page an editorial session found, fetched by the Desk itself (guarded, capped, free text only: a
 * paid piece fails, and the editor's saved library copy is never used here). A Wikipedia link is kept
 * as the whole article.
 */
export async function addWebEvidence(env: Env, itemId: string, url: string, via: string): Promise<EvidenceRow> {
  const key = wikiKeyFromUrl(url);
  if (key) {
    const row = await addWikiEvidence(env, itemId, key.replace(/_/g, ' '), via);
    if (!row) throw new Error('That Wikipedia article could not be found, or its title is ambiguous');
    return row;
  }
  const d = detectUrl(url);
  const outcome = await fetchSource(env, { id: itemId, kind: d.kind, type: 'essay', url, file_key: null, capture_text: null, source_name: null, title: null }, { library: false });
  if (outcome.kind !== 'text') throw new Error(outcome.kind === 'none' ? outcome.reason : 'That link is a recording; cite a text');
  const text = outcome.text.trim();
  if (wordCount(text) < 40) throw new Error('The page gave almost no text to cite');
  const where = printedSource(url, outcome.fields.canonical_url, outcome.fields.source_name);
  return store(env, itemId, { kind: 'web', title: outcome.fields.title?.trim() || where.publisher, ...where, text: text.slice(0, EVIDENCE_MAX_CHARS), revision: null }, via);
}

/**
 * The link and publisher a note prints, decided by the address the Desk fetched, not by what the page
 * says about itself: a page's canonical link is used only on the same site (it could point anywhere),
 * and its site name only when the host plausibly belongs to it (anyone can call themselves "The
 * Guardian"); otherwise the host is the publisher.
 */
export function printedSource(fetched: string, canonical: string | undefined, siteName: string | undefined): { url: string; publisher: string } {
  const host = new URL(fetched).hostname.replace(/^www\./, '');
  let url = fetched;
  try {
    if (canonical) {
      const c = new URL(canonical);
      if (c.protocol === 'https:' && sameSite(c.hostname, host)) url = c.href;
    }
  } catch {
    // An unreadable canonical link is ignored; the fetched address stands.
  }
  const name = siteName?.trim() ?? '';
  const squash = (s: string) => s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
  const site = squash(host.split('.').slice(-3).join(''));
  const publisher = name && squash(name).length >= 3 && site.includes(squash(name)) ? name : host;
  return { url, publisher };
}

/** Same site: one host is the other or a subdomain of it (www.x.org and x.org; news.x.org and x.org). */
function sameSite(a: string, b: string): boolean {
  const x = a.replace(/^www\./, '');
  return x === b || x.endsWith(`.${b}`) || b.endsWith(`.${x}`);
}

export async function evidenceFor(env: Env, itemId: string): Promise<EvidenceRow[]> {
  return (await env.DB.prepare('SELECT * FROM evidence WHERE item_id = ? ORDER BY fetched_at').bind(itemId).all<EvidenceRow>()).results;
}

/**
 * The paragraphs of a long text that bear on a claim, verbatim and in their order, within a budget:
 * the opening paragraph always, then the ones sharing the most words with the claim. A model asked
 * to find a fact in a 60,000-word article reads these instead of the whole thing.
 */
export function passagesFor(text: string, claim: string, maxChars = 6000): string {
  const paras = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 60);
  if (!paras.length) return text.slice(0, maxChars);
  const want = new Set(wordTokens(claim));
  const scored = paras.map((p, i) => ({ i, p, score: i === 0 ? Infinity : new Set(wordTokens(p).filter((t) => want.has(t))).size }));
  const picked: typeof scored = [];
  let used = 0;
  for (const s of [...scored].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (s.score === 0) break;
    if (used + s.p.length > maxChars && picked.length) continue;
    picked.push(s);
    used += s.p.length + 2;
  }
  return picked
    .sort((a, b) => a.i - b.i)
    .map((s) => s.p)
    .join('\n\n');
}
