// The bump chart: the ranks are a permutation at every moment and follow the stored populations, the
// projected stretch is dashed, and both widths draw clean.

import { describe, expect, test } from 'vitest';
import type { SceneNode } from '../../charts/scene';
import { expectClean, texts } from '../testkit';
import { drawBump } from './bump';
import { bumpFixture } from './bump.fixture';
import { valueIn, type Gallery } from './gallery.fixture';

// The package's types leave out Node, so node:fs is loaded as the chart kit's tests load it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs: any = await import('node:fs' as string);
const g: Gallery = JSON.parse(fs.readFileSync(new URL('../../../fixtures/stories/gallery.json', import.meta.url), 'utf8'));
const f = bumpFixture(g);
const flat = (ns: SceneNode[]): SceneNode[] => ns.flatMap((n) => (n.t === 'g' ? flat(n.children) : [n]));

describe('bump', () => {
  test('ten countries, ranked every ten years 1950 to 2100 and at the seam', () => {
    expect(f.lines).toHaveLength(10);
    const years = f.lines[0]!.ranks.map(([y]) => y);
    expect(years[0]).toBe(1950);
    expect(years[years.length - 1]).toBe(2100);
    expect(years).toContain(f.seam);
    expect(f.dots).toHaveLength(16);
  });
  test('the ranks at every moment are a permutation of 1 to 10, ordered by population', () => {
    const years = f.lines[0]!.ranks.map(([y]) => y);
    years.forEach((yr, i) => {
      const ranks = f.lines.map((l) => l.ranks[i]![1]).sort((a, b) => a - b);
      expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const byRank = f.lines.slice().sort((a, b) => a.ranks[i]![1] - b.ranks[i]![1]);
      const pops = byRank.map((l) => valueIn(g.countries.find((c) => c.code === l.key)!.pop, yr));
      expect(pops).toEqual(pops.slice().sort((a, b) => b - a));
    });
    // At the seam the ten are in the order they were chosen by.
    const at = f.lines.map((l) => l.ranks.find(([y]) => y === f.seam)![1]);
    expect(at).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  test.each(['wide', 'phone'] as const)('draws clean on the %s, named at both ends, projected dashed', (dev) => {
    const s = drawBump(f, dev);
    expectClean(s);
    const words = texts(s.nodes).map((t) => t.t);
    for (const l of f.lines) expect(words.filter((w) => w === (dev === 'phone' ? l.phoneLabel ?? l.label : l.label))).toHaveLength(2);
    const ed = flat(s.nodes).filter((n) => n.t === 'path' && n.stroke === 'ed');
    expect(ed.filter((n) => n.t === 'path' && n.dash)).toHaveLength(1);
    expect(ed.filter((n) => n.t === 'path' && !n.dash)).toHaveLength(1);
  });
});
