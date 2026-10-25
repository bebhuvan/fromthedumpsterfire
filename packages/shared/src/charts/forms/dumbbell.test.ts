import { describe, expect, it } from 'vitest';
import { renderChart } from '../render';
import { fixture, flat, outside, overlaps, textBoxes } from './testutil';

describe('dumbbell form', () => {
  for (const layout of ['wide', 'narrow'] as const) {
    it(`draws at ${layout} with no text overlapping or off the drawing`, () => {
      const scene = renderChart(fixture('south-asia-life-dumbbell'), layout);
      expect(overlaps(textBoxes(scene))).toEqual([]);
      expect(outside(scene)).toEqual([]);
    });
  }

  it('draws a ring and a dot for every row, joined, and names both columns in a key', () => {
    const chart = fixture('south-asia-life-dumbbell');
    const scene = renderChart(chart, 'wide');
    const nodes = flat(scene);
    expect(nodes.filter((n) => n.t === 'circle' && n.tip).length).toBe(chart.data.rows.length * 2);
    const texts = textBoxes(scene).map((b) => b.text);
    expect(texts).toContain('Men');
    expect(texts).toContain('Women');
  });
});
