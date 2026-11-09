// The cascade: every cell on the right side of replacement, rows in the order the countries crossed,
// every row on the phone as on the wide plate, and both widths drawn with no label on another or off
// the figure. The bins themselves are the story ramp's (ramp.test.ts).

import { describe, expect, test } from 'vitest';
import type { SceneNode } from '../../charts/scene';
import { expectClean, texts } from '../testkit';
import { ramp } from '../ramp';
import { drawHeatmap } from './heatmap';
import { cascadeFixture } from './heatmap.fixture';
import { firstBelow, type Gallery } from './gallery.fixture';

// The package's types leave out Node, so node:fs is loaded as the chart kit's tests load it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs: any = await import('node:fs' as string);
const g: Gallery = JSON.parse(fs.readFileSync(new URL('../../../fixtures/stories/gallery.json', import.meta.url), 'utf8'));
const f = cascadeFixture(g);

describe('heatmap', () => {
  const R = ramp({ centre: f.mid, width: f.step, perSide: f.perSide });
  // Top-level rects only: the key's swatches sit in a group.
  const cellsOf = (dev: 'wide' | 'phone') => drawHeatmap(f, dev).nodes.filter((n): n is Extract<SceneNode, { t: 'rect' }> => n.t === 'rect' && /^div/.test(String(n.fill)));
  test('rows are the 40 most populous, in the order they crossed, never-by-2100 last', () => {
    expect(f.rows).toHaveLength(40);
    const crossed = f.rows.map((r) => r.crossed ?? Infinity);
    expect(crossed).toEqual(crossed.slice().sort((a, b) => a - b));
    for (const r of f.rows) {
      const c = g.countries.find((x) => x.code === r.key)!;
      expect(r.crossed).toBe(firstBelow(c.tfr, f.mid));
      expect(r.values).toHaveLength(f.years[1] - f.years[0] + 1);
    }
    expect(f.rows.filter((r) => r.focus).map((r) => r.key)).toEqual(['IND']);
  });
  test('the phone draws every row the wide plate draws, each cell in its bin', () => {
    for (const dev of ['wide', 'phone'] as const) {
      const cells = cellsOf(dev);
      const rowsY = [...new Set(cells.map((c) => c.y))];
      expect(rowsY, dev).toHaveLength(f.rows.length);
      rowsY.sort((a, b) => a - b).forEach((y, i) => {
        const r = f.rows[i]!;
        const run = cells.filter((c) => c.y === y).sort((a, b) => a.x - b.x);
        const cw = run.reduce((a, c) => a + c.w, 0) / r.values.length;
        // Each year's cell lies in a run of its own bin's paint.
        r.values.forEach((v, k) => {
          const x = run[0]!.x + (k + 0.5) * cw;
          expect(run.find((c) => c.x <= x && x < c.x + c.w)!.fill, `${r.label} ${f.years[0] + k}`).toBe(R.paintOf(v));
        });
      });
    }
  });
  test.each(['wide', 'phone'] as const)('draws clean on the %s, every name written, a solid group named in its band', (dev) => {
    const s = drawHeatmap(f, dev);
    expectClean(s);
    const words = texts(s.nodes).map((t) => t.t);
    for (const r of f.rows) expect(words).toContain(dev === 'phone' ? r.phoneLabel ?? r.label : r.label);
    const never = f.rows.filter((r) => r.group === 2);
    const solid = never.every((r) => r.values.every((v) => R.binOf(v) === R.paints.length - 1));
    expect(words.some((w) => w.startsWith('At or above 3.1 every year'))).toBe(solid);
  });
});
