import { describe, expect, it } from 'vitest';
import { renderChart } from '../render';
import { fixture, flat, outside, overlaps, textBoxes } from './testutil';
import type { Chart } from '../types';

describe('dot form', () => {
  for (const name of ['south-asia-life-dot', 'hemispheres-dot']) {
    for (const layout of ['wide', 'narrow'] as const) {
      it(`${name} draws at ${layout} with no text overlapping or off the drawing`, () => {
        const scene = renderChart(fixture(name), layout);
        expect(overlaps(textBoxes(scene))).toEqual([]);
        expect(outside(scene)).toEqual([]);
      });
    }
  }

  it('draws one dot per value and a whisker per interval', () => {
    const chart = fixture('hemispheres-dot');
    const nodes = flat(renderChart(chart, 'wide'));
    const dots = nodes.filter((n) => n.t === 'circle' && n.tip);
    expect(dots.length).toBe(chart.data.rows.length);
    // A whisker is a line and two caps.
    const caps = nodes.filter((n) => n.t === 'line' && n.x1 === n.x2 && n.sw === 1.25);
    expect(caps.length).toBe(chart.data.rows.length * 2);
  });

  it('draws a small sample hollow and says when a value is missing', () => {
    const chart: Chart = {
      ...fixture('south-asia-life-dot'),
      data: {
        columns: [
          { key: 'g', label: 'Group', type: 'text' },
          { key: 'v', label: 'Value', type: 'number' },
          { key: 'n', label: 'Sample', type: 'number' },
        ],
        rows: [
          ['A', 10, 400],
          ['B', 6, 12],
          ['C', null, 50],
        ],
      },
      encode: { label: 'g', y: 'v', n: 'n' },
      options: {},
    };
    const scene = renderChart(chart, 'narrow');
    const dots = flat(scene).filter((n) => n.t === 'circle');
    expect(dots.filter((d) => d.fill === 'bg').length).toBe(1);
    expect(textBoxes(scene).some((b) => b.text === 'no data')).toBe(true);
  });
});
