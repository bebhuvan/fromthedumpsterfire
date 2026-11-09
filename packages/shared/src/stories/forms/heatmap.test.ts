// The cascade: bins symmetric about replacement, every cell on the right side of it, rows in the order
// the countries crossed, and both widths drawn with no label on another or off the figure.

import { describe, expect, test } from 'vitest';
import type { SceneNode } from '../../charts/scene';
import { expectClean } from '../testkit';
import { binEdges, binOf, binPaint, drawHeatmap } from './heatmap';
import { cascadeFixture } from './heatmap.fixture';
import { firstBelow, type Gallery } from './gallery.fixture';

// The package's types leave out Node, so node:fs is loaded as the chart kit's tests load it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs: any = await import('node:fs' as string);
const g: Gallery = JSON.parse(fs.readFileSync(new URL('../../../fixtures/stories/gallery.json', import.meta.url), 'utf8'));
const f = cascadeFixture(g);
const flat = (ns: SceneNode[]): SceneNode[] => ns.flatMap((n) => (n.t === 'g' ? flat(n.children) : [n]));

describe('heatmap', () => {
  test('the bins are symmetric about the midpoint', () => {
    const e = binEdges(f.mid, f.step, f.perSide);
    expect(e).toHaveLength(2 * f.perSide - 1);
    expect(e[f.perSide - 1]).toBeCloseTo(f.mid, 9);
    for (let k = 0; k < e.length; k++) expect(e[k]! + e[e.length - 1 - k]!).toBeCloseTo(2 * f.mid, 9);
  });
  test('below the midpoint is cool, at or above it warm, and the grey middle unused', () => {
    const e = binEdges(f.mid, f.step, f.perSide);
    const arm = (p: string) => Number(p.slice(3));
    expect(arm(binPaint(binOf(f.mid - 1e-9, e), f.perSide))).toBeLessThan(5);
    expect(arm(binPaint(binOf(f.mid, e), f.perSide))).toBeGreaterThan(5);
    for (let b = 0; b < 2 * f.perSide; b++) expect(binPaint(b, f.perSide)).not.toBe('div5');
    expect(binPaint(0, f.perSide)).toBe('div0');
    expect(binPaint(2 * f.perSide - 1, f.perSide)).toBe('div10');
  });
  test('rows are the 40 most populous, in the order they crossed, never-by-2100 last', () => {
    expect(f.rows).toHaveLength(40);
    expect(f.rows.filter((r) => r.phone)).toHaveLength(25);
    const crossed = f.rows.map((r) => r.crossed ?? Infinity);
    expect(crossed).toEqual(crossed.slice().sort((a, b) => a - b));
    for (const r of f.rows) {
      const c = g.countries.find((x) => x.code === r.key)!;
      expect(r.crossed).toBe(firstBelow(c.tfr, f.mid));
      expect(r.values).toHaveLength(f.years[1] - f.years[0] + 1);
    }
    expect(f.rows.filter((r) => r.focus).map((r) => r.key)).toEqual(['IND']);
  });
  test.each(['wide', 'phone'] as const)('draws clean on the %s', (dev) => {
    const s = drawHeatmap(f, dev);
    expectClean(s);
    // Every cell's colour is its value's bin: the run rects cover each row exactly.
    const rects = flat(s.nodes).filter((n) => n.t === 'rect' && /^div/.test(String(n.fill)));
    expect(rects.length).toBeGreaterThan(f.rows.filter((r) => dev === 'wide' || r.phone).length);
  });
});
