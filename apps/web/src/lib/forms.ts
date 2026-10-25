// Each content type is set in the printed form that kind of thing has always had (docs/DESIGN.md).
// The app makes the same choice in apps/mobile.

import type { Item } from '@fdf/shared/haul';

export type Form = 'opening' | 'offprint' | 'transcript' | 'broadside' | 'facing' | 'card' | 'page' | 'epigraph' | 'letter' | 'clipping' | 'print' | 'jacket' | 'label' | 'figure';

export function formOf(item: Item): Form {
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

/** How long a quotation runs, so an epigraph is set large only when it is a line or two. */
export function quoteLength(text: string): 'short' | 'medium' | 'long' {
  const words = text.split(/\s+/).filter(Boolean).length;
  return words <= 30 ? 'short' : words <= 80 ? 'medium' : 'long';
}

/** The form's name for the running head, as a reader would say it. */
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

/** What a Haul holds, each type with the printed form it is set in (waiting page, About). */
export const formGuide = [
  { type: 'essay', name: 'Essays', form: 'opening' as Form, how: 'set as a magazine opens one.', detail: 'The title set huge, the reason it is here as the standfirst.' },
  { type: 'paper', name: 'Papers', form: 'offprint' as Form, how: 'as offprints: abstract first, sections numbered.', detail: 'Abstract first, sections numbered, references at the end.' },
  { type: 'talk', name: 'Talks and podcasts', form: 'transcript' as Form, how: 'as transcripts, speakers in the margin.', detail: 'Speakers in the margin, the line that matters set large.' },
  { type: 'poem', name: 'Poems', form: 'broadside' as Form, how: 'as broadsides: one sheet, nothing else on it.', detail: "One sheet in the poem's colour, nothing else on it." },
  { type: 'rhymes', name: 'Rhymes', form: 'facing' as Form, how: 'as facing pages: then on the left, now on the right.', detail: 'Then on the left, now on the right, the link between them in the gutter.' },
  { type: 'rabbit-hole', name: 'Rabbit holes', form: 'card' as Form, how: 'as catalogue cards with their cross-references.', detail: 'A call number, the headword, the entry and its cross-references.' },
  { type: 'passage', name: 'Passages', form: 'page' as Form, how: 'as a page from the book.', detail: 'The passage justified, under its running head, with its page.' },
  { type: 'quote', name: 'Quotations', form: 'epigraph' as Form, how: 'as epigraphs: the words alone, then who said them.', detail: 'The words set large and alone, the speaker and the occasion under them.' },
  { type: 'letter', name: 'Letters', form: 'letter' as Form, how: 'as the letter itself: dateline, salutation, signature.', detail: 'A sheet with its place and date, the salutation, the body and the name it was signed with.' },
  { type: 'social', name: 'Posts', form: 'clipping' as Form, how: 'as clippings: who posted it, where and when.', detail: 'The post as a clipping with its author, handle, platform and date. Never the platform’s embed.' },
  { type: 'image', name: 'Pictures', form: 'print' as Form, how: 'as mounted prints with a museum label.', detail: 'The picture in its mount, then a label with the maker, the date, the holder and the licence.' },
  { type: 'book', name: 'Books', form: 'jacket' as Form, how: 'as their jackets, with a line from inside.', detail: 'The jacket set in type, a line from the book, and why it is on the desk.' },
  { type: 'chart', name: 'Charts', form: 'figure' as Form, how: 'as figures: the chart drawn from its data, the numbers under it.', detail: 'The chart drawn from its own data, its source and licence, and every number behind it.' },
  { type: 'tool', name: 'Tools', form: 'label' as Form, how: 'as specimen labels: what it is, who makes it, in its own words.', detail: 'A ruled label: the name, the maker, what it runs on, its own description and where to get it.' },
] as const;

/** The words the editor marked in an item, shown on its sheet in the contents. */
export const marked = (item: Item): string | undefined => item.excerpt?.highlight ?? item.excerpt?.text ?? item.rhyme?.now.quote;

/**
 * A catalogue headword: a leading article moves to the end ("The Great Stink" becomes "Great Stink"
 * plus "The"). Names of people are left alone, since a two-word title is not always a person.
 */
export function headword(name: string): { head: string; article?: string } {
  const m = /^(The|A|An)\s+(.+)$/.exec(name.trim());
  return m ? { head: m[2]!, article: m[1] } : { head: name.trim() };
}

/** Speaker label for a transcript: the creator's surname, or the whole name if it is one word. */
export const speaker = (creator: string) => creator.replace(/^via\s+/i, '').trim().split(/\s+/).pop() ?? creator;

/** Short names for a code block's language, for the line above it. */
export const CODE_LANGS_SHORT: Record<string, string> = {
  bash: 'Shell', sh: 'Shell', c: 'C', cpp: 'C++', css: 'CSS', diff: 'Diff', go: 'Go', java: 'Java', javascript: 'JavaScript', js: 'JavaScript',
  json: 'JSON', markdown: 'Markdown', python: 'Python', py: 'Python', ruby: 'Ruby', rust: 'Rust', sql: 'SQL', typescript: 'TypeScript', ts: 'TypeScript',
  xml: 'HTML', html: 'HTML', yaml: 'YAML',
};
