// The trail draws four countries' paths at both widths: each named once at its last estimate with the
// year, only the story's member carrying its first and last years (beside its own dots), the
// projection dashed and ending in a hollow dot, no label on another, the x domain held to the data.

import { describe, expect, test } from 'vitest';
import type { SceneNode } from '../../charts/scene';
import { expectClean, texts } from '../testkit';
import { drawTrail, TRAIL_MAX } from './trail';
import { trailFixture } from './trail.fixture';

// node:fs through a dynamic import, as in charts/labels.test.ts: the package's types leave Node out.
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (u: URL, enc: 'utf8') => string };
const gallery = JSON.parse(readFileSync(new URL('../../../fixtures/stories/gallery.json', import.meta.url), 'utf8'));
const fig = trailFixture(gallery);
const circles = (ns: SceneNode[]) => ns.filter((n): n is Extract<SceneNode, { t: 'circle' }> => n.t === 'circle');

describe('trail', () => {
  test('the fixture runs 1950 to 2100, estimated to 2023, four members, India in the ink', () => {
    for (const m of fig.members) {
      expect(m.points[0]![0]).toBe(1950);
      expect(m.points[m.points.length - 1]![0]).toBe(2100);
      expect(m.projectedFrom).toBe(2024);
    }
    expect(fig.members.length).toBeLessThanOrEqual(TRAIL_MAX);
    expect(fig.members.filter((m) => m.focus).map((m) => m.label)).toEqual(['India']);
    expect(fig.y.unit).toBe('Children per woman');
  });
  test('the x domain ends within a unit of the data, not at the next round step', () => {
    const xs = fig.members.flatMap((m) => m.points.map((p) => p[1]));
    expect(fig.x.domain[1] - Math.max(...xs)).toBeLessThanOrEqual(1.5);
    expect(Math.min(...xs) - fig.x.domain[0]).toBeLessThanOrEqual(1.5);
    for (const t of fig.x.ticks) expect(t % 5).toBe(0);
  });
  test.each(['wide', 'phone'] as const)('%s: clean, every member named once with its year, no bare year but the story\'s own', (dev) => {
    const s = drawTrail(fig, dev);
    expectClean(s);
    const boxes = texts(s.nodes), words = boxes.map((t) => t.t);
    for (const m of fig.members) expect(words.filter((w) => w === m.label), m.label).toHaveLength(1);
    expect(words.filter((w) => w === '2023')).toHaveLength(fig.members.length);
    // The first and last years only once, for the story's member, set beside its own dots.
    expect(words.filter((w) => w === '1950')).toHaveLength(1);
    expect(words.filter((w) => w === '2100')).toHaveLength(1);
    // Each year's nearest dot is one of the story's (filled at the start, hollow at the end), close by.
    const dots = circles(s.nodes);
    for (const [year, hollow] of [['1950', false], ['2100', true]] as const) {
      const b = boxes.find((t) => t.t === year)!;
      const gap = (c: (typeof dots)[number]) => Math.hypot(Math.max(b.x - c.cx, 0, c.cx - b.x - b.w), Math.max(b.y - c.cy, 0, c.cy - b.y - b.h)) - c.r;
      const near = dots.slice().sort((p, q) => gap(p) - gap(q))[0]!;
      expect(hollow ? near.stroke : near.fill, `${year} is the story's`).toBe('ed');
      expect(near.fill === 'bg', `${year}'s dot hollow or not`).toBe(hollow);
      expect(gap(near), `${year} beside its dot`).toBeLessThan(14);
    }
  });
  test.each(['wide', 'phone'] as const)('%s: the projection dashed, each ending in a hollow dot', (dev) => {
    const s = drawTrail(fig, dev);
    expect(s.nodes.filter((n) => n.t === 'path' && n.dash)).toHaveLength(fig.members.length);
    expect(circles(s.nodes).filter((c) => c.fill === 'bg')).toHaveLength(fig.members.length);
  });
  test('five members are refused', () => {
    const extra = { ...fig.members[0]!, label: 'Extra', focus: undefined };
    expect(() => drawTrail({ ...fig, members: [...fig.members, extra] }, 'wide')).toThrow(/at most 4/);
  });
});
