import { describe, expect, it } from 'vitest';
import { renderChart } from '../render';
import { fixture, flat, outside, overlaps, textBoxes } from './testutil';

describe('slope form', () => {
  for (const layout of ['wide', 'narrow'] as const) {
    it(`draws at ${layout} with labels spread so none overlap and none fall off`, () => {
      const scene = renderChart(fixture('south-asia-life-slope'), layout);
      expect(overlaps(textBoxes(scene))).toEqual([]);
      expect(outside(scene)).toEqual([]);
    });
  }

  it('draws a line per category, the focus on top in the edition ink', () => {
    const chart = fixture('south-asia-life-slope');
    const lines = flat(renderChart(chart, 'wide')).filter((n) => n.t === 'line' && (n.sw === 2.25 || n.sw === 1.25));
    expect(lines.length).toBe(chart.data.rows.length);
    expect(lines[lines.length - 1]!.stroke).toBe('ed');
  });

  it('heads the two posts with the two columns', () => {
    const texts = textBoxes(renderChart(fixture('south-asia-life-slope'), 'narrow')).map((b) => b.text);
    expect(texts).toContain('2000');
    expect(texts).toContain('2024');
  });
});
