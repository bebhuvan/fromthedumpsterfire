// Each content type is set in the printed form that kind of thing has always had (docs/DESIGN.md).
// The app makes the same choice in apps/mobile.

import type { Item } from '@fdf/shared/haul';

export type Form = 'opening' | 'offprint' | 'transcript' | 'broadside' | 'facing' | 'card' | 'page';

export function formOf(item: Item): Form {
  switch (item.type) {
    case 'paper':
      return 'offprint';
    case 'talk':
    case 'video':
    case 'podcast':
      return 'transcript';
    case 'poem':
      return item.excerpt ? 'broadside' : 'opening';
    case 'rhymes':
      return item.rhyme ? 'facing' : 'opening';
    case 'rabbit-hole':
      return 'card';
    case 'passage':
      return 'page';
    default:
      return 'opening';
  }
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
};

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
