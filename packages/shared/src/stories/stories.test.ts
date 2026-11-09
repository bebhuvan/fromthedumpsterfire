// The data-story grammar (docs/DATA-STORIES.md): every edition's ink passes, the validator refuses
// what it must, and every plate of the fertility story draws at both widths with no label on
// another or off its figure.

import { describe, expect, test } from 'vitest';
import { ALL_INKS } from './ink';
import { drawFigure, drawKey, keyOf } from './plate';
import { untraced, validateStory, type Story } from './spec';
import { expectClean, texts } from './testkit';

// The package's types leave out Node, so node:fs is loaded as the chart kit's tests load it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs: any = await import('node:fs' as string);
const story: Story = JSON.parse(fs.readFileSync(new URL('../../fixtures/stories/fertility.json', import.meta.url), 'utf8'));
const note: string = fs.readFileSync(new URL('../../fixtures/stories/fertility-editor-note.txt', import.meta.url), 'utf8');
const copy = (): Story => JSON.parse(JSON.stringify(story));

describe('inks', () => {
  test.each(ALL_INKS.map((i) => [`${i.edition} ${i.scheme}`, i] as const))('%s', (_, i) => {
    expect(i.line).toBeGreaterThanOrEqual(4.5);
    expect(i.onInk).toBeGreaterThanOrEqual(4.5);
    expect(i.hatch).toBeGreaterThanOrEqual(3);
  });
});

describe('validateStory', () => {
  test('the fertility story passes', () => expect(validateStory(story, note)).toEqual([]));
  test('a figure the rows do not hold is refused', () => {
    const s = copy();
    s.plates[0]!.body += ' Fertility was 9.47 in one place.';
    expect(validateStory(s, note).join(' ')).toMatch(/9\.47 is not a fact of the story/);
  });
  test('a reworded margin note is refused', () => {
    const s = copy();
    s.plates[0]!.editorNote = 'Most of the world outside Africa is below that line.';
    expect(validateStory(s, note).join(' ')).toMatch(/margin note is not the editor/);
  });
  test('a reworded standfirst is refused', () => {
    const s = copy();
    s.standfirst = s.standfirst.replace('interesting', 'fascinating');
    expect(validateStory(s, note).join(' ')).toMatch(/standfirst/);
  });
  test('ranges out of order are refused', () => {
    const s = copy();
    const f = s.plates.find((p) => p.key === 'peak')!.figure;
    if (f.form !== 'lines') throw new Error('peak is a lines plate');
    const r = f.panels[0]!.series.find((x) => x.range)!.range!;
    r.lo95[3]![1] = r.hi95[3]![1] + 1;
    expect(validateStory(s, note).join(' ')).toMatch(/out of order/);
  });
  test('shares that do not add to 100 are refused', () => {
    const s = copy();
    const f = s.plates.find((p) => p.key === 'regions')!.figure;
    if (f.form !== 'stack') throw new Error('regions is a stack');
    f.layers[0]!.points[5]![1] += 7;
    expect(validateStory(s, note).join(' ')).toMatch(/add to 100/);
  });
  test('a scale that leaves out zero must say so', () => {
    const s = copy();
    s.plates.find((p) => p.key === 'floor')!.caption = 'Total fertility rate after falling below 1.5.';
    expect(validateStory(s, note).join(' ')).toMatch(/does not start at zero/);
  });
  test('a projected member before the seam is refused', () => {
    const s = copy();
    const f = s.plates.find((p) => p.key === 'crossing')!.figure;
    if (f.form !== 'swarm') throw new Error('crossing is a swarm');
    const it = f.items.find((i) => typeof i.at === 'number' && i.state === 'estimated')!;
    it.state = 'projected';
    expect(validateStory(s, note).join(' ')).toMatch(/projected members sit after the seam/);
  });
  test('a figure typed into a note on the plate is refused (notes are not evidence)', () => {
    const s = copy();
    const f = s.plates[0]!.figure;
    if (f.form !== 'lines') throw new Error('fall is a lines plate');
    f.panels[0]!.notes![0]!.lines = ['The peak: 9.87 children'];
    expect(validateStory(s, note).join(' ')).toMatch(/9\.87 is not in the rows/);
  });
  test('a number in no row or fact is refused, even a round one', () => {
    const s = copy();
    s.plates[0]!.body += ' There are 147 others.';
    expect(validateStory(s, note).join(' ')).toMatch(/147 is not a fact of the story/);
  });
  test('a reference line is not evidence: its label must cite a row or a fact', () => {
    // Labels on a figure may cite its rows (code draws them from the rows), so the test uses a value
    // no row holds; a line's own position never counts.
    const s = copy();
    const f = s.plates[0]!.figure;
    if (f.form !== 'lines') throw new Error('fall is a lines plate');
    f.panels[0]!.rules![0]! = { y: 12.5, label: 'Replacement 12.5' };
    expect(validateStory(s, note).join(' ')).toMatch(/12\.5 is not in the rows/);
  });
  test('shares labelled at a year the layers do not hold are refused', () => {
    const s = copy();
    const f = s.plates.find((p) => p.key === 'regions')!.figure;
    if (f.form !== 'stack') throw new Error('regions is a stack');
    f.labelAt = [1951.5];
    expect(validateStory(s, note).join(' ')).toMatch(/labelled at 1951\.5/);
  });
  test('figures with scale words trace to full values', () => {
    expect(untraced('146 million babies', [146_054_880])).toEqual([]);
    expect(untraced('147 million babies', [146_054_880])).toEqual(['147 million']);
    expect(untraced('67 per cent', [0.672])).toEqual([]);
  });
});

describe('plates draw cleanly', () => {
  const cases = story.plates.flatMap((p) => (['wide', 'phone'] as const).map((d) => [`${p.name}, ${d}`, p, d] as const));
  test.each(cases)('%s', (_, p, dev) => {
    const s = drawFigure(p.figure, dev, p.fold);
    expect(texts(s.nodes).length).toBeGreaterThan(3);
    expectClean(s);
  });
  test('every plate has a key that names only what it draws', () => {
    for (const p of story.plates) {
      const k = keyOf(p.figure);
      if (p.figure.form !== 'pyramid') expect(k.length, p.name).toBeGreaterThan(0);
      if (k.length) expect(drawKey(p.figure, 'phone', 340)).not.toBeNull();
    }
    const peak = keyOf(story.plates.find((p) => p.key === 'peak')!.figure).map((k) => k.mark);
    expect(peak).toEqual(['estimated', 'projected', 'range80', 'range95']);
  });
});
