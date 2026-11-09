// The slope draws sixteen countries at both widths: every member named at both posts, its value next
// to the post, each label on a hairline from its point, the reference named in the right-hand column
// (never across the lines), values with the decimals the data calls for.

import { describe, expect, test } from 'vitest';
import type { SceneNode } from '../../charts/scene';
import { expectClean, texts } from '../testkit';
import { drawSlope } from './slope';
import { decimalsFor, slopeFixture } from './slope.fixture';
import type { Gallery } from './gallery.fixture';

// node:fs through a dynamic import, as in charts/labels.test.ts: the package's types leave Node out.
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (u: URL, enc: 'utf8') => string };
const gallery: Gallery = JSON.parse(readFileSync(new URL('../../../fixtures/stories/gallery.json', import.meta.url), 'utf8'));
const fig = slopeFixture(gallery);

describe('slope', () => {
  test.each(['wide', 'phone'] as const)('%s draws clean, every member named at both posts', (dev) => {
    const s = drawSlope(fig, dev);
    expectClean(s);
    const words = texts(s.nodes).map((b) => b.t);
    for (const m of fig.members) expect(words.filter((w) => w === m.label), m.label).toHaveLength(2);
    expect(words.filter((w) => w === 'Replacement 2.1')).toHaveLength(1);
  });
  test.each(['wide', 'phone'] as const)('%s: the reference is named outside the posts, and every label has its leader', (dev) => {
    const s = drawSlope(fig, dev);
    const posts = s.nodes.filter((n): n is Extract<SceneNode, { t: 'line' }> => n.t === 'line' && n.x1 === n.x2).map((n) => n.x1);
    const right = Math.max(...posts);
    const rule = texts(s.nodes).find((b) => b.t === 'Replacement 2.1')!;
    expect(rule.x).toBeGreaterThan(right + 10);
    // One hairline per label (two per member) and the reference's dashed one.
    const leaders = s.nodes.filter((n) => n.t === 'path' && n.stroke === 'ink2');
    expect(leaders.filter((n) => n.t === 'path' && !n.dash)).toHaveLength(fig.members.length * 2);
    expect(leaders.filter((n) => n.t === 'path' && n.dash)).toHaveLength(1);
  });
  test('the decimals come from the data: one place for fertility', () => {
    expect(fig.decimals).toBe(1);
    expect(decimalsFor([0.72, 7.81])).toBe(1);
    expect(decimalsFor([12, 85])).toBe(0);
    expect(decimalsFor([0.41, 0.93])).toBe(2);
    expect(fig.unit).toBe('Children per woman');
  });
  test('the loud member is the only line in the ink', () => {
    const s = drawSlope(fig, 'wide');
    const inked = s.nodes.filter((n) => n.t === 'line' && n.stroke === 'ed');
    expect(inked).toHaveLength(1);
  });
  test('the values come from the rows', () => {
    const india = fig.members.find((m) => m.label === 'India')!;
    expect(india.focus).toBe('loud');
    expect(india.from).toBeGreaterThan(india.to);
  });
  test('three in the ink is refused', () => {
    const f = { ...fig, members: fig.members.map((m, i) => (i < 3 ? { ...m, focus: 'second' as const } : m)) };
    expect(() => drawSlope(f, 'wide')).toThrow(/at most one more/);
  });
});
