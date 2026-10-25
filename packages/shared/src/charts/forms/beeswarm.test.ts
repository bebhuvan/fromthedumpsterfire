import { describe, expect, it } from 'vitest';
import { renderChart } from '../render';
import { swarm } from './beeswarm';
import { fixtureC, sceneProblems, shapes } from './testkit-c';

describe('beeswarm', () => {
  const chart = fixtureC('beeswarm');

  it('draws in both layouts with nothing off the canvas, one dot per row of data', () => {
    for (const layout of ['wide', 'narrow'] as const) {
      const scene = renderChart(chart, layout);
      expect(sceneProblems(scene)).toEqual([]);
      const dots = shapes(scene).filter((n) => n.t === 'circle');
      expect(dots.length).toBe(chart.data.rows.length);
    }
  });

  it('packs dots so none overlap', () => {
    const xs = Array.from({ length: 300 }, (_, i) => 100 + ((i * 37) % 97) + (i % 7) * 0.3);
    const r = 4;
    const p = swarm(xs, r);
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) expect(Math.hypot(p[i]!.x - p[j]!.x, p[i]!.dy - p[j]!.dy)).toBeGreaterThanOrEqual(2 * r - 1e-6);
  });

  it('is deterministic and keeps each dot at its value', () => {
    const xs = [5, 5, 5, 6, 7, 5.5];
    expect(swarm(xs, 3)).toEqual(swarm(xs, 3));
    swarm(xs, 3).forEach((p, i) => expect(p.x).toBe(xs[i]));
  });

  it('never overlaps dots in the drawn chart', () => {
    for (const layout of ['wide', 'narrow'] as const) {
      const dots = shapes(renderChart(chart, layout)).flatMap((n) => (n.t === 'circle' ? [n] : []));
      for (let i = 0; i < dots.length; i++)
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i]!;
          const b = dots[j]!;
          // Loud dots are drawn a little larger; packing leaves a 1px gap for them.
          expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThanOrEqual(a.r + b.r - 0.6);
        }
    }
  });
});
