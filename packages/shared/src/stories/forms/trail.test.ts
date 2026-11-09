// The trail draws five countries' paths at both widths: each named at its last estimate with the
// year, its first and last years labelled, the projection dashed, no label on another.

import { describe, expect, test } from 'vitest';
import { expectClean, texts } from '../testkit';
import { drawTrail } from './trail';
import { trailFixture } from './trail.fixture';

// node:fs through a dynamic import, as in charts/labels.test.ts: the package's types leave Node out.
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (u: URL, enc: 'utf8') => string };
const gallery = JSON.parse(readFileSync(new URL('../../../fixtures/stories/gallery.json', import.meta.url), 'utf8'));
const fig = trailFixture(gallery);

describe('trail', () => {
  test('the fixture runs 1950 to 2100, estimated to 2023', () => {
    for (const m of fig.members) {
      expect(m.points[0]![0]).toBe(1950);
      expect(m.points[m.points.length - 1]![0]).toBe(2100);
      expect(m.projectedFrom).toBe(2024);
    }
    expect(fig.members.filter((m) => m.focus).map((m) => m.label)).toEqual(['India']);
  });
  test.each(['wide', 'phone'] as const)('%s: clean, every member named with its years', (dev) => {
    const s = drawTrail(fig, dev);
    expectClean(s);
    const words = texts(s.nodes).map((t) => t.t);
    for (const m of fig.members) expect(words, m.label).toContain(m.label);
    expect(words.filter((w) => w === '2023')).toHaveLength(fig.members.length);
    expect(words.filter((w) => w === '1950')).toHaveLength(fig.members.length);
    expect(words.filter((w) => w === '2100')).toHaveLength(fig.members.length);
    expect(s.nodes.filter((n) => n.t === 'path' && n.dash)).toHaveLength(fig.members.length);
  });
});
