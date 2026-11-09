// The scatter draws the gallery's countries at both widths, every named member labelled, none
// on another or off the figure, the biggest drawn first.

import { describe, expect, test } from 'vitest';
import type { SceneNode } from '../../charts/scene';
import { expectClean, texts } from '../testkit';
import { drawScatter } from './scatter';
import { scatterFixture } from './scatter.fixture';

// node:fs through a dynamic import, as in charts/labels.test.ts: the package's types leave Node out.
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (u: URL, enc: 'utf8') => string };
const gallery = JSON.parse(readFileSync(new URL('../../../fixtures/stories/gallery.json', import.meta.url), 'utf8'));
const fig = scatterFixture(gallery);

describe('scatter', () => {
  test('the fixture takes every country of a million people or more, India in the ink', () => {
    expect(fig.points.length).toBeGreaterThan(150);
    expect(fig.points.every((p) => p.weight >= 1e6)).toBe(true);
    expect(fig.points.filter((p) => p.focus).map((p) => p.label)).toEqual(['India']);
    expect(fig.points.filter((p) => p.named || p.focus)).toHaveLength(12);
  });
  test.each(['wide', 'phone'] as const)('%s: clean, every named member labelled, biggest drawn first', (dev) => {
    const s = drawScatter(fig, dev);
    expectClean(s);
    const words = texts(s.nodes).map((t) => t.t);
    for (const p of fig.points.filter((q) => q.named || q.focus)) expect(words, p.label).toContain(p.label);
    expect(words).toContain('Replacement 2.1');
    expect(words).toEqual(expect.arrayContaining(['1 billion', '100 million']));
    const circles = s.nodes.filter((n): n is Extract<SceneNode, { t: 'circle' }> => n.t === 'circle' && n.fill !== undefined);
    const data = circles.filter((c) => c.fill !== 'ed');
    for (let i = 1; i < data.length; i++) expect(data[i]!.r).toBeLessThanOrEqual(data[i - 1]!.r);
    expect(circles.filter((c) => c.fill === 'ed')).toHaveLength(1);
  });
  test('a label with nowhere to go throws', () => {
    const crowded = { ...fig, points: fig.points.map((p) => ({ ...p, named: true })) };
    expect(() => drawScatter(crowded, 'phone')).toThrow(/No room/);
  });
});
