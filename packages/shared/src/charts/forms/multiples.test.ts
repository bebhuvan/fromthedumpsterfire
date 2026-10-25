import { describe, expect, it } from 'vitest';
import { renderChart } from '../render';
import { fixtureC, sceneProblems, shapes } from './testkit-c';

describe('multiples', () => {
  const chart = fixtureC('multiples');
  const facets = [...new Set(chart.data.rows.map((r) => String(r[0])))];

  it('draws in both layouts with nothing off the canvas', () => {
    for (const layout of ['wide', 'narrow'] as const) expect(sceneProblems(renderChart(chart, layout))).toEqual([]);
  });

  it('gives every facet its own titled panel, the focus loud', () => {
    for (const layout of ['wide', 'narrow'] as const) {
      const s = shapes(renderChart(chart, layout));
      for (const f of facets) expect(s.some((n) => n.t === 'text' && n.text === f)).toBe(true);
      const india = s.find((n) => n.t === 'text' && n.text === 'India')!;
      expect(india.t === 'text' && india.face).toBe('sansMedium');
      expect(s.some((n) => n.t === 'path' && n.stroke === 'ed')).toBe(true);
    }
  });

  it('shares one scale: every panel has the same gridline offsets', () => {
    const s = shapes(renderChart(chart, 'wide'));
    const grid = s.flatMap((n) => (n.t === 'line' && n.y1 === n.y2 && n.stroke === 'rule' ? [n] : []));
    const byPanel = new Map<number, number[]>();
    for (const g of grid) byPanel.set(Math.round(g.x1), [...(byPanel.get(Math.round(g.x1)) ?? []), g.y1]);
    const rows = [...byPanel.values()].map((ys) => ys.sort((a, b) => a - b)).map((ys) => ys.map((y) => y - ys[0]!));
    // Panels on the same row share their offsets exactly.
    const sig = rows.map((r) => r.join(','));
    expect(new Set(sig).size).toBe(1);
  });

  it('breaks a line at a missing year instead of bridging it', () => {
    const c = JSON.parse(JSON.stringify(chart));
    c.data.rows = c.data.rows.filter((r: [string, number]) => !(r[0] === 'India' && r[1] >= 1990 && r[1] <= 1995));
    const s = shapes(renderChart(c, 'wide'));
    const loud = s.filter((n) => n.t === 'path' && n.stroke === 'ed');
    expect(loud.some((p) => p.t === 'path' && (p.d.match(/M/g) ?? []).length >= 2)).toBe(true);
  });
});
