// Each content type is set in the printed form that kind of thing has always had (docs/DESIGN.md).
// The app makes the same choice in apps/mobile.

import type { Item } from '@fdf/shared/haul';

export type Form = 'opening' | 'offprint' | 'transcript' | 'broadside' | 'facing' | 'card' | 'page' | 'epigraph' | 'letter' | 'clipping' | 'print' | 'jacket' | 'label' | 'figure' | 'life';

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
    case 'life':
      return item.life ? 'life' : 'opening';
    default:
      return 'opening';
  }
}

/** How long a quotation runs, so it is set large only when it is a line or two (shared with the app). */
export { quoteLength } from '@fdf/shared/haul';

/** The form's name for the running head, as a reader would say it. */
export const formName: Record<Form, string> = {
  opening: 'The opening',
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
  life: 'The life',
};

/** How wide each form sits on the wide cover: big things, middling things, small things. */
const coverSize = (f: Form): 'w' | 'm' | 'n' =>
  f === 'broadside' || f === 'offprint' || f === 'page' || f === 'jacket' ? 'n' : f === 'card' || f === 'print' || f === 'letter' || f === 'clipping' || f === 'label' || f === 'life' ? 'm' : 'w';

/**
 * The wide cover's rows, in item order: two objects to a row of twelve columns (three when three small
 * ones meet), each pair sized by what the two are, so every row is full and nothing jumps the queue.
 */
export function coverSpans(forms: Form[]): number[] {
  const spans: number[] = [];
  for (let i = 0; i < forms.length; ) {
    const a = coverSize(forms[i]!);
    const b = i + 1 < forms.length ? coverSize(forms[i + 1]!) : undefined;
    const c = i + 2 < forms.length ? coverSize(forms[i + 2]!) : undefined;
    if (a === 'n' && b === 'n' && c === 'n') { spans.push(4, 4, 4); i += 3; continue; }
    if (!b) { spans.push(a === 'n' ? 6 : 8); i += 1; continue; }
    const pair = a === b ? [6, 6] : a === 'n' ? [4, 8] : b === 'n' ? [8, 4] : a === 'w' ? [7, 5] : [5, 7];
    spans.push(...pair);
    i += 2;
  }
  return spans;
}

/** What a Haul holds, each type with the printed form it is set in (waiting page, About). */
export const formGuide = [
  { type: 'essay', name: 'Essays', form: 'opening' as Form, how: 'opened as a feature opens in print.', detail: 'The title set huge, the reason it is here as the standfirst.' },
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
  { type: 'life', name: 'Lives', form: 'life' as Form, how: 'as a life: the name, a profile with every source named, a life in dates.', detail: 'One person per Haul: the name set large, a profile written by the machine from named sources and checked line by line, their own words, a life in dates and further reading.' },
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
