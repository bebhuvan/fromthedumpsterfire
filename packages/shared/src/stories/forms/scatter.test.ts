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
  test.each(['wide', 'phone'] as const)('%s: every name beside its circle or on a leader that touches no other circle', (dev) => {
    const s = drawScatter(fig, dev);
    const boxes = texts(s.nodes);
    const discs = s.nodes.filter((n): n is Extract<SceneNode, { t: 'circle' }> => n.t === 'circle' && n.tip !== undefined);
    const leaders = s.nodes.filter((n): n is Extract<SceneNode, { t: 'line' }> => n.t === 'line' && n.stroke === 'ink2' && !n.dash);
    const gap = (b: { x: number; y: number; w: number; h: number }, px: number, py: number) => Math.hypot(Math.max(b.x - px, 0, px - b.x - b.w), Math.max(b.y - py, 0, py - b.y - b.h));
    const toSeg = (px: number, py: number, l: Extract<SceneNode, { t: 'line' }>) => {
      const dx = l.x2 - l.x1, dy = l.y2 - l.y1, t = Math.max(0, Math.min(1, ((px - l.x1) * dx + (py - l.y1) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(px - l.x1 - t * dx, py - l.y1 - t * dy);
    };
    for (const p of fig.points.filter((q) => q.named || q.focus)) {
      const b = boxes.find((t) => t.t === p.label)!;
      const c = discs.find((d) => d.tip === p.label)!;
      const beside = gap(b, c.cx, c.cy) - c.r;
      if (beside <= 12) continue;
      const l = leaders.find((n) => Math.abs(Math.hypot(n.x1 - c.cx, n.y1 - c.cy) - c.r) < 2 && gap(b, n.x2, n.y2) < 4);
      expect(l, `${p.label} is ${beside.toFixed(0)} px off with no leader`).toBeDefined();
      expect(Math.hypot(l!.x2 - l!.x1, l!.y2 - l!.y1), `${p.label}'s leader`).toBeLessThan(dev === 'phone' ? 48 : 60);
      for (const o of discs) if (o !== c) expect(toSeg(o.cx, o.cy, l!), `${p.label}'s leader runs into ${o.tip}`).toBeGreaterThan(o.r);
    }
  });
  test.each(['wide', 'phone'] as const)('%s: no name on or below the axis', (dev) => {
    const s = drawScatter(fig, dev);
    const axis = Math.max(...s.nodes.filter((n): n is Extract<SceneNode, { t: 'line' }> => n.t === 'line' && n.stroke === 'ink' && n.y1 === n.y2 && !n.dash).map((n) => n.y1));
    for (const p of fig.points.filter((q) => q.named || q.focus)) {
      const b = texts(s.nodes).find((t) => t.t === p.label)!;
      expect(b.y + b.h, p.label).toBeLessThan(axis - 1);
    }
  });
  test('a label with nowhere to go throws', () => {
    const crowded = { ...fig, points: fig.points.map((p) => ({ ...p, named: true })) };
    expect(() => drawScatter(crowded, 'phone')).toThrow(/No room/);
  });
});
