// Each content type is set in the printed form that kind of thing has always had (docs/DESIGN.md).
// The same choice as the website's apps/web/src/lib/forms.ts: a type that lacks what its form needs
// (a quotation without its words, a picture without its plate) falls back to a magazine opening.

import type { Item } from '@fdf/shared/haul';
import type { ContentType } from '@fdf/shared/tokens';

export type Form = 'opening' | 'offprint' | 'transcript' | 'broadside' | 'facing' | 'card' | 'page' | 'epigraph' | 'letter' | 'clipping' | 'print' | 'jacket' | 'label' | 'figure';

export function formOf(item: Pick<Item, 'type' | 'excerpt' | 'plate' | 'rhyme' | 'blocks'>): Form {
  switch (item.type) {
    case 'paper':
      return 'offprint';
    case 'talk':
    case 'video':
    case 'podcast':
    case 'speech':
      return 'transcript';
    case 'quote':
      return item.excerpt ? 'epigraph' : 'opening';
    case 'letter':
      return item.excerpt ? 'letter' : 'opening';
    case 'social':
      return item.excerpt ? 'clipping' : 'opening';
    case 'image':
      return item.plate ? 'print' : 'opening';
    case 'book':
      return 'jacket';
    case 'tool':
      return 'label';
    case 'poem':
      return item.excerpt ? 'broadside' : 'opening';
    case 'rhymes':
      return item.rhyme ? 'facing' : 'opening';
    case 'rabbit-hole':
      return 'card';
    case 'passage':
      return 'page';
    case 'chart':
      return item.blocks?.some((b) => b.kind === 'chart') ? 'figure' : 'opening';
    default:
      return 'opening';
  }
}

/** The form's name for the running head, as a reader would say it (the website's words). */
export const formName: Record<Form, string> = {
  opening: 'Magazine opening',
  offprint: 'Offprint',
  transcript: 'Transcript',
  broadside: 'Broadside',
  facing: 'Facing pages',
  card: 'Catalogue card',
  page: 'A page from the book',
  epigraph: 'Epigraph',
  letter: 'The letter',
  clipping: 'Clipping',
  print: 'A mounted print',
  jacket: 'The jacket',
  label: 'Specimen label',
  figure: 'The figure',
};

/** Index form of a title: "The Great Stink" becomes "Great Stink," with "The" set after it. */
export const headword = (t: string) => {
  const m = /^(The|A|An) (.+)$/.exec(t.trim());
  return m ? { word: m[2]![0]!.toUpperCase() + m[2]!.slice(1) + ',', article: m[1]! } : { word: t.trim(), article: '' };
};

/** Speaker label for a transcript: the creator's surname, or the whole name if it is one word. */
export const speaker = (creator: string) => (creator.replace(/^via\s+/i, '').trim().split(/\s+/).pop() ?? creator).toUpperCase();

export const titleText = (i: Pick<Item, 'title'>) => i.title.text + (i.title.italic ? ' ' + i.title.italic : '');

/** A site's bare host, for a tool's "Where": "https://www.datasette.io/x" becomes "datasette.io". */
export function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1]!.replace(/^www\./, '') : '';
}

/** What a Haul holds, each type with the printed form it is set in (waiting page, About). */
export const formGuide: { type: ContentType; name: string; form: Form; how: string; detail: string }[] = [
  { type: 'essay', name: 'Essays', form: 'opening', how: 'set as a magazine opens one.', detail: 'The title set huge, the reason it is here as the standfirst.' },
  { type: 'paper', name: 'Papers', form: 'offprint', how: 'as offprints: abstract first, sections numbered.', detail: 'Abstract first, sections numbered, references at the end.' },
  { type: 'talk', name: 'Talks and podcasts', form: 'transcript', how: 'as transcripts, speakers in the margin.', detail: 'Speakers in the margin, the line that matters set large.' },
  { type: 'poem', name: 'Poems', form: 'broadside', how: 'as broadsides: one sheet, nothing else on it.', detail: "One sheet in the poem's colour, nothing else on it." },
  { type: 'rhymes', name: 'Rhymes', form: 'facing', how: 'as facing pages: then on the left, now on the right.', detail: 'Then on the left, now on the right, the link between them in the gutter.' },
  { type: 'rabbit-hole', name: 'Rabbit holes', form: 'card', how: 'as catalogue cards with their cross-references.', detail: 'A call number, the headword, the entry and its cross-references.' },
  { type: 'passage', name: 'Passages', form: 'page', how: 'as a page from the book.', detail: 'The passage justified, under its running head, with its page.' },
  { type: 'quote', name: 'Quotations', form: 'epigraph', how: 'as epigraphs: the words alone, then who said them.', detail: 'The words set large and alone, the speaker and the occasion under them.' },
  { type: 'letter', name: 'Letters', form: 'letter', how: 'as the letter itself: dateline, salutation, signature.', detail: 'A sheet with its place and date, the salutation, the body and the name it was signed with.' },
  { type: 'social', name: 'Posts', form: 'clipping', how: 'as clippings: who posted it, where and when.', detail: 'The post as a clipping with its author, handle, platform and date. Never the platform’s embed.' },
  { type: 'image', name: 'Pictures', form: 'print', how: 'as mounted prints with a museum label.', detail: 'The picture in its mount, then a label with the maker, the date, the holder and the licence.' },
  { type: 'book', name: 'Books', form: 'jacket', how: 'as their jackets, with a line from inside.', detail: 'The jacket set in type, a line from the book, and why it is on the desk.' },
  { type: 'tool', name: 'Tools', form: 'label', how: 'as specimen labels: what it is, who makes it, in its own words.', detail: 'A ruled label: the name, the maker, what it runs on, its own description and where to get it.' },
  { type: 'chart', name: 'Charts', form: 'figure', how: 'as figures: the chart drawn from its data, the numbers beside it.', detail: 'The chart drawn large from its own rows, its source and licence under it, and the numbers a tap away.' },
];
