import { describe, expect, it } from 'vitest';
import { renderChart } from '../render';
import { placeLabels, logAxis, logLabel } from './scatter';
import { fixtureC, overlap, sceneProblems, shapes, textBox } from './testkit-c';

describe('scatter', () => {
  const chart = fixtureC('scatter');
  const focus = new Set(chart.options!.focus);

  it('draws in both layouts with nothing off the canvas, one dot per complete row', () => {
    for (const layout of ['wide', 'narrow'] as const) {
      const scene = renderChart(chart, layout);
      expect(sceneProblems(scene)).toEqual([]);
      const dots = shapes(scene).filter((n) => n.t === 'circle' && n.tip);
      expect(dots.length).toBe(chart.data.rows.filter((r) => typeof r[1] === 'number' && typeof r[2] === 'number').length);
    }
  });

  it('no two labels overlap, and labels name only the focus countries', () => {
    for (const layout of ['wide', 'narrow'] as const) {
      const labels = shapes(renderChart(chart, layout)).flatMap((n) => (n.t === 'text' && focus.has(n.text) ? [textBox(n)] : []));
      expect(labels.length).toBeGreaterThan(3);
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) expect(overlap(labels[i]!, labels[j]!)).toBe(false);
    }
  });

  it('says the x axis is a log scale', () => {
    const texts = shapes(renderChart(chart, 'wide')).flatMap((n) => (n.t === 'text' ? [n.text] : []));
    expect(texts.some((t) => /log scale/.test(t))).toBe(true);
  });

  it('sizes dots by area, not radius', () => {
    const dots = shapes(renderChart(chart, 'wide')).flatMap((n) => (n.t === 'circle' && n.tip ? [n] : []));
    const big = dots.find((d) => d.tip!.startsWith('India'))!;
    const small = dots.find((d) => d.tip!.startsWith('Japan'))!;
    const pop = (name: string) => chart.data.rows.find((r) => r[0] === name)![3] as number;
    expect((big.r / small.r) ** 2).toBeCloseTo(pop('India') / pop('Japan'), 1);
  });

  it('places labels without collisions, or not at all', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ x: 100 + (i % 6) * 9, y: 100 + Math.floor(i / 6) * 9, r: 3, text: `Label ${i}`, size: 12, face: 'sans' as const }));
    const placed = placeLabels(items, { x: 0, y: 0, w: 400, h: 400 }, []).filter(Boolean);
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!.box;
      const b = placed[j]!.box;
      expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y).toBe(false);
    }
  });

  it('ends a log axis at the 1-2-5 steps around the data', () => {
    const ax = logAxis(830, 131_000, [0, 100]);
    expect(ax.scale.domain).toEqual([500, 200_000]);
    expect(logLabel(1000)).toBe('1k');
    expect(logLabel(2_000_000_000)).toBe('2bn');
  });
});
