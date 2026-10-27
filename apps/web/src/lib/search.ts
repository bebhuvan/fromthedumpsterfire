// Site search. The index is built at build time into /search.json and scored in the browser with
// the same weighting as the reader app (apps/mobile/src/lib/search.ts): every query word must
// prefix-match a word in the item, and the score sums the best field weight for each word, with a
// small bonus for whole-word matches. A few hundred items at most, so a plain scan is instant.

import { lifeParagraphs } from '@fdf/shared/life';
import type { Haul, Item } from '@fdf/shared/haul';
import type { ContentType } from '@fdf/shared/tokens';

/** One searchable field: text, weight, and whether it can supply a snippet. */
export type Field = [text: string, weight: number, snippet: 0 | 1];

export interface SearchDoc {
  /** Haul number. */
  n: number;
  id: string;
  type: ContentType;
  title: string;
  italic?: string;
  creator: string;
  url: string;
  f: Field[];
}

export interface Hit {
  doc: SearchDoc;
  score: number;
  snippet?: string;
}

export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[“”"‘’'.,:;!?()]/g, ' ');

export const words = (s: string) => fold(s).split(/\s+/).filter(Boolean);

function fields(item: Item): Field[] {
  const f: Field[] = [
    [`${item.title.text} ${item.title.italic ?? ''}`.trim(), 6, 0],
    [item.creator, 5, 0],
    [item.source.name, 3, 0],
    [item.wiki.map((w) => w.title).join(' · '), 3, 0],
    [item.why.text, 1.5, 1],
    [item.excerpt?.text ?? '', 1.5, 1],
    [item.rhyme ? `${item.rhyme.then.quote} ${item.rhyme.now.quote}` : '', 1.5, 1],
    [item.marginalia.map((m) => m.text).join(' '), 1, 1],
    [(item.ideas ?? []).map((m) => m.text).join(' '), 1, 1],
    [[(item.ideas ?? []).map((m) => m.reaction ?? '').join(' '), item.startHere?.note ?? ''].join(' '), 1.5, 1],
    [item.connections.map((c) => `${c.title} ${c.note}`).join(' '), 1, 1],
    [item.life ? [item.life.epithet.text, ...lifeParagraphs(item.life)].join(' ') : '', 1, 1],
  ];
  return f.filter(([text]) => text.trim().length > 0);
}

/** The build-time index: one compact document per item, newest Haul first. */
export function buildSearchIndex(hauls: Haul[]): SearchDoc[] {
  return [...hauls]
    .sort((a, b) => b.number - a.number)
    .flatMap((h) =>
      h.items.map((item) => ({
        n: h.number,
        id: item.id,
        type: item.type,
        title: item.title.text,
        ...(item.title.italic ? { italic: item.title.italic } : {}),
        creator: item.creator,
        url: `/haul/${h.number}/${item.id}`,
        f: fields(item),
      })),
    );
}

/** Score every document against the query. Newer Hauls win ties. */
export function query(docs: SearchDoc[], q: string, limit = 50): Hit[] {
  const terms = words(q);
  if (!terms.length) return [];
  const hits: Hit[] = [];
  for (const doc of docs) {
    const fs = doc.f.map(([text, weight, snip]) => ({ text, weight, snip, ws: words(text) }));
    let score = 0;
    let snippet: string | undefined;
    let all = true;
    for (const term of terms) {
      let best = 0;
      for (const f of fs) {
        if (f.ws.some((w) => w.startsWith(term))) {
          best = Math.max(best, f.weight * (f.ws.includes(term) ? 1.2 : 1));
          if (!snippet && f.snip) snippet = around(f.text, term);
        }
      }
      if (!best) {
        all = false;
        break;
      }
      score += best;
    }
    if (all) hits.push({ doc, score: score + doc.n * 0.001, snippet });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** About 120 characters around the first match, cut at word boundaries. */
export function around(text: string, term: string): string | undefined {
  const at = fold(text).indexOf(term);
  if (at < 0) return undefined;
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 50)) + 1);
  const next = text.indexOf(' ', at + 70);
  const end = next === -1 ? text.length : next;
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/** People, places and ideas across the archive, from the Wikipedia layer, A to Z. */
export function topicIndex(hauls: Haul[]) {
  const map = new Map<string, { title: string; summary?: string; url?: string; items: { n: number; item: Item }[] }>();
  for (const h of hauls)
    for (const item of h.items)
      for (const w of item.wiki) {
        const e = map.get(w.title) ?? { title: w.title, summary: w.summary, url: w.url, items: [] };
        if (!e.summary && w.summary) e.summary = w.summary;
        if (!e.url && w.url) e.url = w.url;
        if (!e.items.some((x) => x.n === h.number && x.item.id === item.id)) e.items.push({ n: h.number, item });
        map.set(w.title, e);
      }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'en'));
}
