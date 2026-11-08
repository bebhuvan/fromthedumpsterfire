import { describe, expect, it } from 'vitest';
import { itemNote, runsText } from '../src/fieldnote';
import { noteBlocks, noteParagraphs, type Haul } from '../src/haul';
import { findQuotation } from '../src/verbatim';
import { validateHaul } from '../src/validate';
import devHaulJson from '../fixtures/dev/haul-002.json';

const NOTE = `Jay Miller’s brilliant essay in *Aeon* reminded me of that. I wrote [a post](https://bhuvan.substack.com/p/in-praise-of-dilettantism) a while back. Or, as he puts it:

> For the dilettante, every night is karaoke night.

Strip away the pejorative baggage, and the "Invest Like the Best" (https://example.org/ilb) podcast…`;

const words = (s: string) => s.replace(/[*>[\]]|\(https?:\/\/[^)]+\)|"/g, '').replace(/\s+/g, ' ').trim();

describe("an item's note", () => {
  it('reads quotations and italics, deleting only the marks', () => {
    const n = itemNote(NOTE);
    expect(n.body?.map((b) => b.kind)).toEqual(['paragraph', 'quotation', 'paragraph']);
    expect(n.quotations).toEqual(['For the dilettante, every night is karaoke night.']);
    expect(n.body![0]!.kind === 'paragraph' && n.body![0]!.runs.find((r) => r.em)?.text).toBe('Aeon');
    expect(n.links).toEqual([
      { text: 'a post', url: 'https://bhuvan.substack.com/p/in-praise-of-dilettantism' },
      { text: 'Invest Like the Best', url: 'https://example.org/ilb' },
    ]);
    // The plain text is the editor's words, in order, marks deleted.
    expect(words(n.text)).toBe(words(NOTE));
    // Older readers print the plain text with the links on the same words.
    expect(noteParagraphs(n).flat().filter((r) => r.url).map((r) => r.text)).toEqual(['a post', 'Invest Like the Best']);
  });

  it('leaves a note without quotations or italics as it was', () => {
    const plain = 'A note with "a link" (https://example.org/a) and no other marks.';
    const n = itemNote(plain);
    expect(n.body).toBeUndefined();
    expect(n.quotations).toEqual([]);
    expect(n.text).toBe('A note with a link and no other marks.');
    expect(noteBlocks(n)).toEqual([{ kind: 'paragraph', runs: [{ text: 'A note with ' }, { text: 'a link', url: 'https://example.org/a' }, { text: ' and no other marks.' }] }]);
  });

  it('keeps a heading’s words as a paragraph and a lone link as a link, never an embed', () => {
    const n = itemNote('## Aside\n\n> A line.\n\nhttps://www.youtube.com/watch?v=HKhxfpOFFL0');
    expect(n.body).toEqual([
      { kind: 'paragraph', runs: [{ text: 'Aside' }] },
      { kind: 'quotation', paragraphs: [[{ text: 'A line.' }]] },
      { kind: 'paragraph', runs: [{ text: 'https://www.youtube.com/watch?v=HKhxfpOFFL0', url: 'https://www.youtube.com/watch?v=HKhxfpOFFL0' }] },
    ]);
  });
});

describe('a quotation with words left out', () => {
  const src = 'Our times, with their high fertility, would be a historical anomaly that will come to an end. Later text.';
  it('finds each stretch between ellipses, in order', () => {
    expect(findQuotation(src, 'Our times … would be a historical anomaly that will come to an end.')?.map((s) => s.text)).toEqual(['Our times', 'would be a historical anomaly that will come to an end.']);
    expect(findQuotation(src, 'Our times... would be')).not.toBeNull();
  });
  it('refuses words not in the source, or out of order', () => {
    expect(findQuotation(src, 'Our times … will never end.')).toBeNull();
    expect(findQuotation(src, 'come to an end … Our times')).toBeNull();
    expect(findQuotation(src, '…')).toBeNull();
  });
});

describe("an item note's body in the bundle", () => {
  const dev = devHaulJson as unknown as Haul;
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  it('accepts paragraphs and quotations, refuses anything else', () => {
    const h = clone(dev);
    const n = itemNote(NOTE);
    h.items[0]!.why = { text: n.text, links: n.links, body: n.body };
    expect(validateHaul(h).errors).toEqual([]);
    expect(runsText(n.body![1]!.kind === 'quotation' ? n.body![1]!.paragraphs[0]! : [])).toBe(n.quotations[0]);
    h.items[0]!.why.body!.push({ kind: 'heading', text: 'No' } as never);
    h.items[0]!.why.body![0] = { kind: 'paragraph', runs: [{ text: 'x', url: 'javascript:alert(1)' }] };
    const errs = validateHaul(h).errors.map((e) => `${e.path} ${e.rule}`);
    expect(errs).toContain('items[0].why.body[3].kind shape');
    expect(errs).toContain('items[0].why.body[0].runs[0].url link-url');
  });
});
