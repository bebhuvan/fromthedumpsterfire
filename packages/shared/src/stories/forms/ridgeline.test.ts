// The ridgeline: each density integrates to one, the bandwidth is Silverman's, the medians are the
// rows' own, and both widths draw clean.

import { describe, expect, test } from 'vitest';
import { expectClean, texts } from '../testkit';
import type { Gallery } from './gallery.fixture';
import { density, drawRidgeline, median, silverman } from './ridgeline';
import { ridgelineFixture } from './ridgeline.fixture';

// The package's types leave out Node, so node:fs is loaded as the chart kit's tests load it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs: any = await import('node:fs' as string);
const g: Gallery = JSON.parse(fs.readFileSync(new URL('../../../fixtures/stories/gallery.json', import.meta.url), 'utf8'));
const f = ridgelineFixture(g);

describe('ridgeline', () => {
  test('six ridges of every country, the projection hatched and 2023 the story', () => {
    expect(f.ridges.map((r) => r.label)).toEqual(['1950', '1970', '1990', '2010', '2023', '2050']);
    for (const r of f.ridges) expect(r.values).toHaveLength(g.countries.length);
    expect(f.ridges.find((r) => r.role === 'focus')!.label).toBe('2023');
    expect(f.ridges.find((r) => r.role === 'projected')!.label).toBe('2050');
    expect(Math.max(...f.ridges.flatMap((r) => r.values))).toBeLessThanOrEqual(f.x.domain[1]);
  });
  test('each density integrates to about one', () => {
    const xs = Array.from({ length: 2001 }, (_, i) => -5 + i * 0.01);
    for (const r of f.ridges) {
      const d = density(r.values, silverman(r.values), xs);
      expect(d.reduce((a, b) => a + b, 0) * 0.01).toBeCloseTo(1, 3);
    }
  });
  test("Silverman's bandwidth and the median", () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // sd 3.0277, IQR 4.5 / 1.34 = 3.358: the sd is smaller.
    expect(silverman(v)).toBeCloseTo(0.9 * 3.02765 * 10 ** -0.2, 4);
    expect(median(v)).toBe(5.5);
    expect(median([3, 1, 2])).toBe(2);
  });
  test.each(['wide', 'phone'] as const)('draws clean on the %s, each median written once', (dev) => {
    const s = drawRidgeline(f, dev);
    expectClean(s);
    const words = texts(s.nodes).map((t) => t.t);
    expect(words.filter((w) => w.startsWith('Replacement'))).toHaveLength(1);
    expect(words).toContain(`Median ${median(f.ridges[0]!.values).toFixed(1)}`);
    for (const r of f.ridges.slice(1)) expect(words).toContain(median(r.values).toFixed(1));
  });
});
