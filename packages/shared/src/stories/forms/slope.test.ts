import { describe, expect, test } from 'vitest';
import { expectClean, texts } from '../testkit';
import { drawSlope } from './slope';
import { slopeFixture } from './slope.fixture';
import type { Gallery } from './gallery.fixture';

// node:fs through a dynamic import, as in charts/labels.test.ts: the package's types leave Node out.
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (u: URL, enc: 'utf8') => string };
const gallery: Gallery = JSON.parse(readFileSync(new URL('../../../fixtures/stories/gallery.json', import.meta.url), 'utf8'));
const fig = slopeFixture(gallery);

describe('slope', () => {
  test.each(['wide', 'phone'] as const)('%s draws clean, every member named', (dev) => {
    const s = drawSlope(fig, dev);
    expectClean(s);
    const words = texts(s.nodes).map((b) => b.t);
    for (const m of fig.members) expect(words, m.label).toContain(m.label);
    expect(words).toContain('Replacement 2.1');
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
