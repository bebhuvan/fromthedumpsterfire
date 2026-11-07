import { describe, expect, it } from 'vitest';
import { bodyIsRich, bodyParagraphs, embedKind, linkGroups, markRuns, noteBody, noteParts, noteRuns, partsPlain, runsText } from '../src/fieldnote';
import type { Haul, NoteEmbed, NoteRun } from '../src/haul';
import { validateHaul } from '../src/validate';
import devHaulJson from '../fixtures/dev/haul-002.json';

const NOTE = `## Where we come from

If we don't know where we come from, can we know where we are?

As I write this, I'm reminded of King's [*Letter from Birmingham Jail*](https://www.africa.upenn.edu/Articles_Gen/Letter_Birmingham.html), where he writes:

> Injustice anywhere is a threat to justice everywhere.

Ferguson [waved the term away](https://www.youtube.com/watch?v=rHQJYu_6j3I) in a *piece in Aeon*.

https://www.youtube.com/watch?v=HKhxfpOFFL0&t=1555s

> History, therefore, I think is hugely important.
>
> It reminds us that there were other ways.

https://x.com/visakanv/status/1234567890

https://example.org/essay

## No one survives history's judgement
Guha's _Gandhi Before India_ (see https://en.wikipedia.org/wiki/Gandhi_(film)) and more.`;

const video: NoteEmbed = { kind: 'video', provider: 'youtube', id: 'HKhxfpOFFL0', title: 'The lecture', start: 1555 };

describe('field note text', () => {
  it('reads headings, paragraphs, quotations and lone links', () => {
    const parts = noteParts(NOTE);
    expect(parts.map((p) => p.kind)).toEqual(['heading', 'paragraph', 'paragraph', 'quotation', 'paragraph', 'link', 'quotation', 'link', 'link', 'heading', 'paragraph']);
    expect(parts[6]).toEqual({ kind: 'quotation', paragraphs: ['History, therefore, I think is hugely important.', 'It reminds us that there were other ways.'] });
    expect(parts.filter((p) => p.kind === 'link').map((p) => p.kind === 'link' && p.embed)).toEqual(['video', 'post', null]);
  });

  it('marks links and italics, never touching an address', () => {
    expect(noteRuns("King's [*Letter from Birmingham Jail*](https://www.africa.upenn.edu/Articles_Gen/Letter_Birmingham.html), where")).toEqual([
      { text: "King's " },
      { text: 'Letter from Birmingham Jail', url: 'https://www.africa.upenn.edu/Articles_Gen/Letter_Birmingham.html', em: true },
      { text: ', where' },
    ]);
    expect(noteRuns('a [piece in *Aeon*](https://aeon.co/x).')).toEqual([{ text: 'a ' }, { text: 'piece in ', url: 'https://aeon.co/x' }, { text: 'Aeon', url: 'https://aeon.co/x', em: true }, { text: '.' }]);
    expect(noteRuns('(see https://en.wikipedia.org/wiki/Gandhi_(film)) and')).toEqual([{ text: '(see ' }, { text: 'https://en.wikipedia.org/wiki/Gandhi_(film)', url: 'https://en.wikipedia.org/wiki/Gandhi_(film)' }, { text: ') and' }]);
    expect(noteRuns('a snake_case_word and 2*3*4 stay')).toEqual([{ text: 'a snake_case_word and 2*3*4 stay' }]);
  });

  it('only deletes marks: what prints is the text with characters taken out, never added or moved', () => {
    const within = (small: string, big: string) => {
      let k = 0;
      for (const ch of big) if (ch === small[k]) k++;
      return k === small.length;
    };
    expect(within(partsPlain(noteParts(NOTE)).join(''), NOTE)).toBe(true);
    for (const p of noteParts(NOTE)) if (p.kind === 'paragraph') expect(within(runsText(noteRuns(p.text)), p.text)).toBe(true);
  });

  it('builds the body with resolved embeds, and lists the ones it could not resolve', () => {
    const { body, missing } = noteBody(noteParts(NOTE), (url) => (url.includes('HKhxfpOFFL0') ? video : undefined));
    expect(missing).toEqual(['https://x.com/visakanv/status/1234567890']);
    expect(body.find((b) => b.kind === 'video')).toEqual(video);
    expect(body.find((b) => b.kind === 'paragraph' && b.runs[0]?.url === 'https://example.org/essay')).toBeTruthy();
    expect(bodyIsRich(body)).toBe(true);
    const paras = bodyParagraphs(body);
    expect(paras[0]).toBe('Where we come from');
    expect(paras.some((p) => p.includes('https://www.youtube.com'))).toBe(false);
    expect(bodyIsRich(noteBody(noteParts('One.\n\nTwo.'), () => undefined).body)).toBe(false);
  });

  it('marks the highlight across runs and groups a link’s runs', () => {
    const runs = noteRuns('Read [the *whole* thing](https://a.example/x) today.');
    const marked = markRuns(runs, 'whole thing today');
    expect(runsText(marked)).toBe(runsText(runs));
    expect(marked.filter((r) => r.mark).map((r) => r.text).join('')).toBe('whole thing today');
    expect(linkGroups(marked).map((g) => g.url ?? '')).toEqual(['', 'https://a.example/x', '']);
  });

  it('knows which links embed', () => {
    expect(embedKind('https://youtu.be/rHQJYu_6j3I')).toBe('video');
    expect(embedKind('https://vimeo.com/76979871')).toBe('video');
    expect(embedKind('https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk')).toBe('audio');
    expect(embedKind('https://twitter.com/jack/status/20')).toBe('post');
    expect(embedKind('https://www.bbc.com/news/world-asia-india-34265882')).toBeNull();
  });
});

describe('the field note in the bundle', () => {
  const dev = devHaulJson as unknown as Haul;
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  it('accepts the sample body, and its plain paragraphs are the body’s words', () => {
    expect(validateHaul(dev).errors).toEqual([]);
    expect(bodyParagraphs(dev.fieldNote.body!)).toEqual(dev.fieldNote.paragraphs);
  });
  it('refuses a body with an unknown piece, a link that is not the web, or a broken embed', () => {
    const paths = (f: (h: Haul) => void) => {
      const h = clone(dev);
      f(h);
      return validateHaul(h).errors.map((e) => `${e.path} ${e.rule}`);
    };
    expect(paths((h) => h.fieldNote.body!.push({ kind: 'chart' } as never))).toContain(`fieldNote.body[${dev.fieldNote.body!.length}].kind shape`);
    expect(paths((h) => ((h.fieldNote.body![2] as { runs: NoteRun[] }).runs[1]!.url = 'javascript:alert(1)'))).toContain('fieldNote.body[2].runs[1].url link-url');
    expect(paths((h) => (h.fieldNote.body!.find((b) => b.kind === 'video') as { id: string }).id = 'not an id!')).toEqual([expect.stringMatching(/^fieldNote\.body\[\d+\]\.id embed$/)]);
    expect(paths((h) => (h.fieldNote.body!.find((b) => b.kind === 'post') as { url: string }).url = 'https://evil.example/a/status/1')).toEqual([expect.stringMatching(/^fieldNote\.body\[\d+\]\.url embed$/)]);
  });
  it('checks embed pictures are hosted with the bundle', () => {
    const r = validateHaul(dev, undefined, { filesBase: 'https://files.example' });
    expect(r.errors.map((e) => e.path)).toContain(`fieldNote.body[${dev.fieldNote.body!.findIndex((b) => b.kind === 'video')}].poster.url`);
  });
});
