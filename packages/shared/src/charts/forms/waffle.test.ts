import { describe, expect, it } from 'vitest';
import { renderChart } from '../render';
import { Ctx } from '../frame';
import { fixture, flat, outside, overlaps, textBoxes } from './testutil';
import { largestRemainder, waffleParts } from './waffle';
import type { Chart } from '../types';

describe('waffle form', () => {
  for (const layout of ['wide', 'narrow'] as const) {
    it(`draws at ${layout} with no text overlapping or off the drawing`, () => {
      const scene = renderChart(fixture('india-electricity-waffle'), layout);
      expect(overlaps(textBoxes(scene))).toEqual([]);
      expect(outside(scene)).toEqual([]);
    });
  }

  it('rounds by largest remainder so the squares always add up', () => {
    expect(largestRemainder([1, 1, 1], 100)).toEqual([34, 33, 33]);
    expect(largestRemainder([70.82, 9.42, 8.55, 5, 2.59, 3.64], 100).reduce((a, b) => a + b, 0)).toBe(100);
    expect(largestRemainder([0, 0], 100)).toEqual([0, 0]);
  });

  it('draws exactly a hundred squares, each part getting its rounded share', () => {
    const chart = fixture('india-electricity-waffle');
    const { parts } = waffleParts(new Ctx(chart, 'wide'));
    const squares = flat(renderChart(chart, 'wide')).filter((n) => n.t === 'rect' && n.tip);
    expect(squares.length).toBe(100);
    for (const p of parts) expect(squares.filter((s) => s.tip!.startsWith(`${p.name}:`)).length).toBe(p.squares);
    expect(parts[0]!.name).toBe('Coal');
    expect(parts[0]!.squares).toBe(71);
  });

  it('folds the smallest parts past five into one quiet block and still names each', () => {
    const chart = fixture('india-electricity-waffle');
    const { parts } = waffleParts(new Ctx(chart, 'wide'));
    expect(parts.length).toBe(6);
    const other = parts[parts.length - 1]!;
    expect(other.paint).toBe('quiet');
    expect(other.parts!.map((p) => p.name)).toEqual(['Gas', 'Bioenergy', 'Oil']);
    const text = textBoxes(renderChart(chart, 'wide')).map((b) => b.text).join(' ');
    expect(text).toContain('Gas 2.33%');
  });

  it('takes a unit per square when given, and lists a missing part', () => {
    const chart: Chart = {
      ...fixture('india-electricity-waffle'),
      units: 'people',
      data: {
        columns: [
          { key: 'g', label: 'Group', type: 'text' },
          { key: 'v', label: 'People', type: 'number' },
        ],
        rows: [
          ['A', 300],
          ['B', 200],
          ['C', null],
        ],
      },
      encode: { label: 'g', y: 'v' },
      options: { colour: 'categorical', per: 10 },
    };
    const scene = renderChart(chart, 'narrow');
    expect(flat(scene).filter((n) => n.t === 'rect' && n.tip).length).toBe(50);
    expect(textBoxes(scene).some((b) => b.text.includes('No data: C'))).toBe(true);
  });
});
