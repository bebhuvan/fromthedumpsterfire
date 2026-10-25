import { describe, expect, it } from 'vitest';
import { renderChart } from '../render';
import { fixture, flat, outside, overlaps, textBoxes } from './testutil';
import type { Chart } from '../types';

const layouts = ['wide', 'narrow'] as const;

describe('bar form', () => {
  for (const name of ['south-asia-gdp-bar', 'india-growth-columns']) {
    for (const layout of layouts) {
      it(`${name} draws at ${layout} with no text overlapping or off the drawing`, () => {
        const scene = renderChart(fixture(name), layout);
        expect(overlaps(textBoxes(scene))).toEqual([]);
        expect(outside(scene)).toEqual([]);
      });
    }
  }

  it('starts every horizontal bar at the zero line', () => {
    const scene = renderChart(fixture('south-asia-gdp-bar'), 'wide');
    const nodes = flat(scene);
    const zero = nodes.find((n) => n.t === 'line' && n.stroke === 'ink' && n.x1 === n.x2)!;
    const bars = nodes.filter((n) => n.t === 'rect' && n.fill);
    expect(bars.length).toBe(7);
    for (const b of bars) if (b.t === 'rect') expect(Math.abs(b.x - (zero as { x1: number }).x1)).toBeLessThan(1);
  });

  it('starts every column at zero, above it and below it', () => {
    const chart = fixture('india-growth-columns');
    const scene = renderChart(chart, 'wide');
    const nodes = flat(scene);
    const cols = nodes.filter((n): n is Extract<typeof n, { t: 'rect' }> => n.t === 'rect' && Boolean(n.fill) && Boolean(n.tip));
    expect(cols.length).toBe(chart.data.rows.length);
    const neg = cols.find((c) => c.tip!.startsWith('2020'))!;
    const zeroY = neg.y; // a negative column hangs from zero
    for (const c of cols) {
      if (c === neg) continue;
      expect(Math.abs(c.y + c.h - zeroY)).toBeLessThan(0.5);
    }
  });

  it('says a missing value is missing rather than dropping the row', () => {
    const scene = renderChart(fixture('south-asia-gdp-bar'), 'narrow');
    expect(textBoxes(scene).some((b) => b.text === 'no data')).toBe(true);
    expect(textBoxes(scene).some((b) => b.text === 'Afghanistan')).toBe(true);
  });

  it('keeps the order given when asked, and sorts by value otherwise', () => {
    const chart = fixture('south-asia-gdp-bar');
    const labels = (c: Chart) => textBoxes(renderChart(c, 'wide')).filter((b) => c.data.rows.some((r) => r[0] === b.text)).sort((a, b) => a.y - b.y).map((b) => b.text);
    expect(labels(chart)[0]).toBe('Maldives');
    expect(labels({ ...chart, options: { ...chart.options, sort: 'given' } })[0]).toBe('Afghanistan');
  });

  it('draws a whisker for an interval and a small sample hollow', () => {
    const chart: Chart = {
      ...fixture('south-asia-gdp-bar'),
      data: {
        columns: [
          { key: 'g', label: 'Group', type: 'text' },
          { key: 'v', label: 'Value', type: 'number' },
          { key: 'lo', label: 'Low', type: 'number' },
          { key: 'hi', label: 'High', type: 'number' },
          { key: 'n', label: 'Sample', type: 'number' },
        ],
        rows: [
          ['A', 10, 8, 12, 400],
          ['B', 6, 2, 11, 12],
        ],
      },
      encode: { label: 'g', y: 'v', lo: 'lo', hi: 'hi', n: 'n' },
      options: {},
    };
    const nodes = flat(renderChart(chart, 'wide'));
    const rects = nodes.filter((n) => n.t === 'rect');
    expect(rects.filter((r) => r.fill).length).toBe(1);
    expect(rects.filter((r) => !r.fill && r.stroke).length).toBe(1);
    expect(nodes.filter((n) => n.t === 'line' && n.stroke === 'ink' && n.sw === 1.25).length).toBe(6);
  });
});
