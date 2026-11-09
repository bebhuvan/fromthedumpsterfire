// The ledger (2026-11-09, a signature): at the foot of each item, whose words are on the page,
// counted by code from the bundle, so the house rule (human, machine and source never confused) is
// stated as numbers. Pure; shared by the website and the app so both count the same words.
import type { Item, LifeLine } from './haul';

export interface Ledger {
  /** The editor's own words: his note, his notes on connections and ideas, where to start. */
  editor: number;
  /** The source's words, each matched word for word: the excerpt, pull quotes, posts, ideas' passages, rhymes, a Life's quoted words. */
  source: number;
  /** The machine's words, each checked: margin notes, big ideas, the rhyme's bridge, a Life's profile. */
  machine: number;
}

/** Words in a passage: runs of non-space characters. */
export function wordCount(text: string | undefined): number {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

const sum = (xs: (string | undefined)[]) => xs.reduce((n, x) => n + wordCount(x), 0);
const lines = (ls: LifeLine[]) => sum(ls.map((l) => l.text));

export function ledger(item: Item): Ledger {
  const blocks = item.blocks ?? [];
  const ideas = item.ideas ?? [];
  const life = item.life;
  return {
    editor: sum([item.why.text, item.startHere?.note, ...item.connections.map((c) => c.note), ...ideas.map((i) => i.reaction)]),
    source: sum([
      item.excerpt?.text,
      ...blocks.map((b) => (b.kind === 'quote' || b.kind === 'post' ? b.text : undefined)),
      ...ideas.map((i) => i.quote),
      item.rhyme?.then.quote,
      item.rhyme?.now.quote,
      life?.words?.text,
    ]),
    machine:
      sum([...item.marginalia.map((m) => m.text), ...ideas.map((i) => i.text), item.rhyme?.bridge]) +
      (life
        ? lines([life.epithet, ...life.sections.flatMap((s) => s.paragraphs.flat()), ...(life.words ? [life.words.context] : []), ...life.dates.map((d) => d.line), ...(life.figures?.rows.map((r) => r.line) ?? [])])
        : 0),
  };
}
