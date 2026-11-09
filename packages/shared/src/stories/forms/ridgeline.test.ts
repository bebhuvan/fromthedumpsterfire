// The ridgeline: each density integrates to one, the bandwidth is Silverman's, the medians are the
// rows' own, and both widths draw clean.

import { describe, expect, test } from 'vitest';
import { expectClean, texts } from '../testkit';
import type { Gallery } from './gallery.fixture';
import { boundedDensity, drawRidgeline, median, ridgeBounds, silverman } from './ridgeline';
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
  test('each density is zero outside its own values, never below zero, and still about one in all', () => {
    const xs = Array.from({ length: 2001 }, (_, i) => -5 + i * 0.01);
    for (const r of f.ridges) {
      const [lo, hi] = ridgeBounds(r.values);
      expect(lo).toBe(Math.min(...r.values));
      expect(hi).toBe(Math.max(...r.values));
      const d = boundedDensity(r.values, silverman(r.values), xs, lo, hi);
      xs.forEach((x, k) => { if (x < lo || x > hi || x < 0) expect(d[k], `${r.label} at ${x}`).toBe(0); });
      // Reflection folds the tails back in; only the mass that would cross both bounds is lost.
      expect(d.reduce((a, b) => a + b, 0) * 0.01).toBeCloseTo(1, 1);
    }
    expect(ridgeBounds([-1, 2])[0]).toBe(0);
  });
  test('the story ridge is drawn last, in front of every other', () => {
    const s = drawRidgeline(f, 'wide');
    const washes = s.nodes.filter((n) => n.t === 'path' && n.fill === 'bg');
    const focusFill = s.nodes.findIndex((n) => n.t === 'path' && n.fill === 'ed');
    expect(s.nodes.indexOf(washes[washes.length - 1]!)).toBe(focusFill - 1);
  });
  test('the axis ends at the whole number just above the highest value, and says the ridges are smoothed', () => {
    const max = Math.max(...f.ridges.flatMap((r) => r.values));
    expect(f.x.domain[1]).toBe(Math.ceil(max));
    expect(f.x.title).toMatch(/smoothed/);
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
