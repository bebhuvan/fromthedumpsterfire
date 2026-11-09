// The map: every country with data in a bin, the bins symmetric about replacement on the diverging
// ramp (cool below, warm above), India outlined in the ink and named, the key whole, at both widths.

import { describe, expect, test } from 'vitest';
import type { SceneNode } from '../../charts/scene';
import { WORLD } from '../../charts/geo/world';
import { expectClean, texts } from '../testkit';
import { drawMap, mapBins } from './map';
import { mapFixture } from './map.fixture';

// node:fs through a dynamic import, as in charts/labels.test.ts: the package's types leave Node out.
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (u: URL, enc: 'utf8') => string };
const gallery = JSON.parse(readFileSync(new URL('../../../fixtures/stories/gallery.json', import.meta.url), 'utf8'));
const fig = mapFixture(gallery);
const flat = (ns: SceneNode[]): SceneNode[] => ns.flatMap((n) => (n.t === 'g' ? flat(n.children) : [n]));

describe('map', () => {
  test('only rows the map cannot draw are set aside, and they are named', () => {
    expect(fig.unmapped).toEqual(['Kosovo']);
    expect(fig.values.length + fig.unmapped.length).toBe(gallery.countries.length);
  });
  test('bins are symmetric about 2.1, cool below and warm above, open at the ends', () => {
    const { edges, paints, paintOf } = mapBins(fig);
    expect(edges).toHaveLength(9);
    expect(edges[4]).toBe(2.1);
    for (let i = 0; i < edges.length; i++) expect(edges[i]! + edges[edges.length - 1 - i]!).toBeCloseTo(4.2, 9);
    for (let i = 1; i < edges.length; i++) expect(edges[i]! - edges[i - 1]!).toBeCloseTo(0.25, 9);
    expect(paints).toEqual(['div0', 'div1', 'div2', 'div3', 'div4', 'div6', 'div7', 'div8', 'div9', 'div10']);
    expect(paintOf(0.5)).toBe('div0');
    expect(paintOf(2.09)).toBe('div4');
    expect(paintOf(2.1)).toBe('div6');
    expect(paintOf(6)).toBe('div10');
  });
  test.each(['wide', 'phone'] as const)('%s: every country with data gets its bin; India outlined and named', (dev) => {
    const s = drawMap(fig, dev);
    expectClean(s);
    const marks = flat(s.nodes);
    const { paintOf } = mapBins(fig);
    const filled = marks.filter((n) => (n.t === 'path' || n.t === 'circle') && n.tip && n.fill?.startsWith('div'));
    expect(filled).toHaveLength(fig.values.length);
    for (const v of fig.values) {
      const m = filled.find((n) => 'tip' in n && n.tip === `${v.name}: ${v.v}`);
      expect(m, v.name).toBeDefined();
      expect('fill' in m! && m.fill).toBe(paintOf(v.v));
    }
    const missing = marks.filter((n) => 'tip' in n && n.tip?.endsWith('no data'));
    expect(missing.length + filled.length).toBe(WORLD.length);
    const india = WORLD.find((w) => w[0] === 'IND')![3];
    expect(marks.some((n) => n.t === 'path' && n.d === india && n.stroke === 'ed' && !n.fill)).toBe(true);
    const words = texts(s.nodes).map((t) => t.t);
    expect(words).toEqual(expect.arrayContaining(['India', 'Replacement 2.1', 'No data', '2.1']));
  });
  test('a row the map cannot place throws', () => {
    expect(() => drawMap({ ...fig, values: [...fig.values, { code: 'XXX', name: 'Atlantis', v: 2 }] }, 'wide')).toThrow(/not on the map/);
  });
});
