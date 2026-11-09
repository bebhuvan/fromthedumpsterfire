import { describe, expect, test } from 'vitest';
import { expectClean, texts } from '../testkit';
import type { SceneNode } from '../../charts/scene';
import { drawBars } from './bars';
import { barsFixture } from './bars.fixture';
import type { Gallery } from './gallery.fixture';

// node:fs through a dynamic import, as in charts/labels.test.ts: the package's types leave Node out.
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (u: URL, enc: 'utf8') => string };
const gallery: Gallery = JSON.parse(readFileSync(new URL('../../../fixtures/stories/gallery.json', import.meta.url), 'utf8'));
const fig = barsFixture(gallery);
type Rect = Extract<SceneNode, { t: 'rect' }>;
const rects = (dev: 'wide' | 'phone') => drawBars(fig, dev).nodes.filter((n): n is Rect => n.t === 'rect');

describe('bars', () => {
  test.each(['wide', 'phone'] as const)('%s draws clean, every bar named and valued', (dev) => {
    const s = drawBars(fig, dev);
    expectClean(s);
    const words = texts(s.nodes).map((b) => b.t);
    for (const b of fig.bars) expect(words, b.label).toContain(b.label);
    expect(words).toContain('World 2.25');
  });
  test.each(['wide', 'phone'] as const)('%s bars start at zero, square, thin, in order', (dev) => {
    const rs = rects(dev);
    expect(rs).toHaveLength(15);
    const x0 = rs[0]!.x;
    for (const r of rs) {
      expect(r.x).toBe(x0);
      expect(r.h).toBeLessThanOrEqual(22);
    }
    for (let i = 1; i < rs.length; i++) {
      expect(rs[i]!.w).toBeGreaterThanOrEqual(rs[i - 1]!.w);
      expect(rs[i]!.y - (rs[i - 1]!.y + rs[i - 1]!.h)).toBe(2);
    }
  });
  test('South Korea alone is in the ink', () => {
    const rs = rects('wide');
    expect(rs.filter((r) => r.fill === 'ed')).toHaveLength(1);
    expect(rs[fig.bars.findIndex((b) => b.label === 'South Korea')]!.fill).toBe('ed');
  });
  test('a scale that does not start at zero is refused', () => {
    expect(() => drawBars({ ...fig, x: { ...fig.x, domain: [0.5, 2.5] } }, 'wide')).toThrow(/zero/);
  });
});
