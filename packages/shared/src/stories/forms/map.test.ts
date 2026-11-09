// The map: every country with data in a bin, the bins symmetric about replacement on the diverging
// ramp (cool below, warm above), India outlined in the ink and named, the key whole, at both widths.

import { describe, expect, test } from 'vitest';
import type { SceneNode } from '../../charts/scene';
import { WORLD } from '../../charts/geo/world';
import { expectClean, texts } from '../testkit';
import { ramp } from '../ramp';
import { drawMap } from './map';
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
  test('the bins are the story ramp\'s, about 2.1, a quarter wide', () => {
    expect(ramp(fig.bins).edges[4]).toBe(2.1);
    expect(fig.unit).toBe('Children per woman, 2023');
  });
  test.each(['wide', 'phone'] as const)('%s: every country with data gets its bin; India outlined and named', (dev) => {
    const s = drawMap(fig, dev);
    expectClean(s);
    const marks = flat(s.nodes);
    const { paintOf } = ramp(fig.bins);
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
    expect(words).toEqual(expect.arrayContaining(['India 1.98', 'Replacement 2.1', 'No data', '2.1']));
    // India's name is on none of its small neighbours.
    const name = texts(s.nodes).find((t) => t.t.startsWith('India'))!;
    for (const code of ['BGD', 'LKA', 'NPL', 'BTN']) {
      const d = WORLD.find((w) => w[0] === code)!;
      const [x, y] = [d[4] * (s.width / 1000), 4 + (d[5] - 2.4) * (s.width / 1000)];
      expect(x > name.x && x < name.x + name.w && y > name.y && y < name.y + name.h, `India's name on ${code}`).toBe(false);
    }
  });
  test('a row the map cannot place throws', () => {
    expect(() => drawMap({ ...fig, values: [...fig.values, { code: 'XXX', name: 'Atlantis', v: 2 }] }, 'wide')).toThrow(/not on the map/);
  });
});
