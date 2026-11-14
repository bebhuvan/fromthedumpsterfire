// The machine's offers as a queue the editor goes through one at a time (keep or skip), and the
// small pieces of logic the quieter Desk shares: an item's mark on the Haul page, and moving an item.

import type { Issue } from '@fdf/shared/prepublish';
import type { Draft, MarginalBody, WikiCard } from '../api';

export interface Offer {
  /** The draft's or the Wikipedia card's id. */
  id: string;
  what: 'draft' | 'wiki';
  kind: 'idea' | 'marginal' | 'card';
  itemId: string;
  itemTitle: string;
  /** The line itself: the machine's words, or the card's title. */
  text: string;
  /** Where it comes from: the piece (with the quoted words) or Wikipedia (with its lead). */
  from: { label: string; url?: string; words?: string; locator?: string };
}

const KIND_ORDER = { idea: 0, marginal: 1, card: 2 } as const;

/** "Aftermath · " before a research note's source, so the editor sees what kind of note it is. */
export const angleLabel = (angle?: string) => (angle ? `${angle[0]!.toUpperCase()}${angle.slice(1)} · ` : '');

/** What is still waiting on the editor for one item: big ideas in the piece's order, then notes, then cards. */
export function offersFor(item: { id: string; title: string }, drafts: Draft<MarginalBody>[], wiki: WikiCard[]): Offer[] {
  const at = (d: Draft<MarginalBody>) => (d.body?.cite?.kind === 'source' ? d.body.cite.start : 0);
  const fromDrafts = drafts
    .filter((d) => (d.kind === 'idea' || d.kind === 'marginal') && d.status === 'proposed' && d.body?.text)
    .sort((a, b) => KIND_ORDER[a.kind as 'idea' | 'marginal'] - KIND_ORDER[b.kind as 'idea' | 'marginal'] || at(a) - at(b))
    .map((d): Offer => {
      const cite = d.body.cite;
      const from =
        cite?.kind === 'source'
          ? { label: 'From the piece', words: cite.quote.replace(/\s*\n\s*/g, ' '), ...(d.body.locator ? { locator: d.body.locator } : {}) }
          : cite?.kind === 'wiki'
            ? { label: `From Wikipedia: ${cite.title}`, ...(wikiLead(wiki, cite.cardId) ? { words: wikiLead(wiki, cite.cardId) } : {}) }
            : cite?.kind === 'evidence'
              ? { label: `${angleLabel(d.body.angle)}From ${cite.publisher}: ${cite.title}`, url: cite.url, words: cite.quote.replace(/\s*\n\s*/g, ' ') }
              : { label: 'Source not recorded' };
      return { id: d.id, what: 'draft', kind: d.kind as 'idea' | 'marginal', itemId: item.id, itemTitle: item.title, text: d.body.text, from };
    });
  const cards = wiki
    .filter((w) => w.status === 'proposed')
    .map((w): Offer => ({ id: w.id, what: 'wiki', kind: 'card', itemId: item.id, itemTitle: item.title, text: w.title, from: { label: 'Further reading, from Wikipedia', url: w.url, words: w.summary } }));
  return [...fromDrafts, ...cards];
}

function wikiLead(wiki: WikiCard[], cardId: string): string | undefined {
  return wiki.find((w) => w.id === cardId)?.summary;
}

export const kindLabel: Record<Offer['kind'], string> = { idea: 'Big idea', marginal: 'Margin note', card: 'Further reading' };

/**
 * The offer to show: the first, in order, without an answer. An answer the Desk refused is taken back,
 * so that offer comes up again before the later ones, and nothing answered is shown twice.
 */
export function nextOffer(offers: readonly Pick<Offer, 'id'>[], answered: ReadonlySet<string>): number {
  const i = offers.findIndex((o) => !answered.has(o.id));
  return i < 0 ? offers.length : i;
}

/** An item's mark on the Haul page: ready, something to look at, or something to fix. */
export function haulMark(issues: Pick<Issue, 'severity'>[]): 'ok' | 'look' | 'fix' {
  if (issues.some((i) => i.severity === 'wrong')) return 'fix';
  return issues.length ? 'look' : 'ok';
}

/** The list with one entry moved from one place to another (both clamped to the list). */
export function moveTo<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x!);
  return out;
}
