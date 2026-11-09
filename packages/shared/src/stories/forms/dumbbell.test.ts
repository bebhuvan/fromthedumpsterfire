import { describe, expect, test } from 'vitest';
import { expectClean, texts } from '../testkit';
import { drawDumbbell } from './dumbbell';
import { dumbbellFixture } from './dumbbell.fixture';
import type { Gallery } from './gallery.fixture';

// node:fs through a dynamic import, as in charts/labels.test.ts: the package's types leave Node out.
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync: (u: URL, enc: 'utf8') => string };
const gallery: Gallery = JSON.parse(readFileSync(new URL('../../../fixtures/stories/gallery.json', import.meta.url), 'utf8'));
const fig = dumbbellFixture(gallery);

describe('dumbbell', () => {
  test.each(['wide', 'phone'] as const)('%s draws clean, every row named with its later value', (dev) => {
    const s = drawDumbbell(fig, dev);
    expectClean(s);
    const words = texts(s.nodes).map((b) => b.t);
    for (const r of fig.rows) expect(words, r.label).toContain(r.label);
    expect(words).toEqual(expect.arrayContaining(['1970', '2023', 'Replacement 2.1']));
  });
  test('rows run from the highest 2023 value down', () => {
    const tos = fig.rows.map((r) => r.to);
    expect(tos).toEqual(tos.slice().sort((a, b) => b - a));
    expect(fig.rows).toHaveLength(18);
  });
  test('only India is in the ink: a ring, a dot, a connector', () => {
    const s = drawDumbbell(fig, 'wide');
    const inked = s.nodes.filter((n) => n.t !== 'g' && n.t !== 'text' && (n.stroke === 'ed' || n.fill === 'ed'));
    expect(inked).toHaveLength(3);
    const india = s.nodes.find((n) => n.t === 'text' && n.text === 'India');
    expect(india).toMatchObject({ face: 'sansMedium', fill: 'ink' });
  });
  test('the ring is hollow and the dot solid', () => {
    const s = drawDumbbell(fig, 'wide');
    const circles = s.nodes.filter((n) => n.t === 'circle');
    expect(circles.filter((c) => c.fill === 'bg')).toHaveLength(18);
  });
});
