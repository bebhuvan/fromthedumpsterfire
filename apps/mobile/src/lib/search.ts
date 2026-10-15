// On-device search over every Haul on the phone. A few hundred items at most, so a plain scan with
// field weights is instant and needs no index library or server.

import type { Haul, Item } from '@fdf/shared/haul';

export interface Hit {
  n: number;
  item: Item;
  score: number;
  snippet?: string;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[“”"‘’'.,:;!?()]/g, ' ');

const words = (s: string) => fold(s).split(/\s+/).filter(Boolean);

type Field = { text: string; weight: number; snippet?: boolean };

function fields(item: Item): Field[] {
  return [
    { text: `${item.title.text} ${item.title.italic ?? ''}`, weight: 6 },
    { text: item.creator, weight: 5 },
    { text: item.source.name, weight: 3 },
    { text: item.wiki.map((w) => w.title).join(' · '), weight: 3 },
    { text: item.why.text, weight: 1.5, snippet: true },
    { text: item.excerpt?.text ?? '', weight: 1.5, snippet: true },
    { text: item.rhyme ? `${item.rhyme.then.quote} ${item.rhyme.now.quote}` : '', weight: 1.5, snippet: true },
    { text: item.marginalia.map((m) => m.text).join(' '), weight: 1, snippet: true },
    { text: item.connections.map((c) => `${c.title} ${c.note}`).join(' '), weight: 1, snippet: true },
  ];
}

/** Every query word must prefix-match some word in the item; score sums field weights. */
export function search(hauls: Haul[], query: string, limit = 50): Hit[] {
  const q = words(query);
  if (!q.length) return [];
  const hits: Hit[] = [];
  for (const haul of hauls) {
    for (const item of haul.items) {
      let score = 0;
      let snippet: string | undefined;
      let all = true;
      const fs = fields(item).map((f) => ({ ...f, ws: words(f.text) }));
      for (const term of q) {
        let best = 0;
        for (const f of fs) {
          if (f.ws.some((w) => w.startsWith(term))) {
            best = Math.max(best, f.weight * (f.ws.includes(term) ? 1.2 : 1));
            if (!snippet && f.snippet) snippet = around(f.text, term);
          }
        }
        if (!best) {
          all = false;
          break;
        }
        score += best;
      }
      if (all) hits.push({ n: haul.number, item, score: score + haul.number * 0.001, snippet });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function around(text: string, term: string) {
  const at = fold(text).indexOf(term);
  if (at < 0) return undefined;
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 50)) + 1);
  const end = Math.min(text.length, text.indexOf(' ', at + 70) === -1 ? text.length : text.indexOf(' ', at + 70));
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/** People, places and ideas across the archive, from the Wikipedia layer, A to Z. */
export function topicIndex(hauls: Haul[]) {
  const map = new Map<string, { title: string; count: number }>();
  for (const h of hauls) for (const item of h.items) for (const w of item.wiki) {
    const e = map.get(w.title) ?? { title: w.title, count: 0 };
    e.count += 1;
    map.set(w.title, e);
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function itemsForTopic(hauls: Haul[], topic: string) {
  return hauls.flatMap((h) => h.items.filter((i) => i.wiki.some((w) => w.title === topic)).map((item) => ({ n: h.number, item })));
}

export function randomFind(hauls: Haul[]) {
  const all = hauls.flatMap((h) => h.items.map((item) => ({ n: h.number, item })));
  return all[Math.floor(Math.random() * all.length)];
}
