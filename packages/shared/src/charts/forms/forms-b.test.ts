// The value forms (stripes, band, calendar, heatmap, ridgeline) on the comps' real data, and the
// rules that make them honest: one stripe per year on the stated ramp, one square per day, missing
// values drawn as missing, nothing drawn outside the figure.
import { describe, expect, it } from 'vitest';
import type { Chart } from '../types';
import type { SceneNode } from '../scene';
import { renderChart } from '../render';
import { divergingRamp, sequentialRamp } from '../ramp';
import { kde, silverman } from './ridgeline';

import stripes from '../../../../../docs/design-comps/charts/data/temperature-stripes.json';
import band from '../../../../../docs/design-comps/charts/data/delhi-band-2024.json';
import calendar from '../../../../../docs/design-comps/charts/data/delhi-calendar-2024.json';
import heatmap from '../../../../../docs/design-comps/charts/data/delhi-heatmap-months.json';
import ridgeline from '../../../../../docs/design-comps/charts/data/delhi-ridgeline-may.json';

const ALL: Record<string, unknown> = { 'temperature-stripes': stripes, 'delhi-band-2024': band, 'delhi-calendar-2024': calendar, 'delhi-heatmap-months': heatmap, 'delhi-ridgeline-may': ridgeline };
/** A fresh copy of a fixture, so a test may change it. */
const fixture = (name: string): Chart => JSON.parse(JSON.stringify(ALL[name])) as Chart;
const flat = (nodes: SceneNode[]): SceneNode[] => nodes.flatMap((n) => (n.t === 'g' ? flat(n.children) : [n]));

const FIXTURES = ['temperature-stripes', 'delhi-band-2024', 'delhi-calendar-2024', 'delhi-heatmap-months', 'delhi-ridgeline-may'];

describe('value forms render the comps data', () => {
  for (const name of FIXTURES) {
    for (const layout of ['wide', 'narrow'] as const) {
      it(`${name} (${layout}) stays inside its figure`, () => {
        const scene = renderChart(fixture(name), layout);
        expect(scene.width).toBe(layout === 'wide' ? 720 : 375);
        for (const n of flat(scene.nodes)) {
          if (n.t === 'rect') {
            expect(n.x).toBeGreaterThanOrEqual(-0.01);
            expect(n.x + n.w).toBeLessThanOrEqual(scene.width + 0.7);
            expect(n.y + n.h).toBeLessThanOrEqual(scene.height + 0.01);
          }
          if (n.t === 'text') {
            expect(n.y).toBeLessThanOrEqual(scene.height);
            expect(n.text).not.toMatch(/NaN|undefined|Infinity/);
          }
        }
      });
    }
  }
});

describe('stripes', () => {
  it('draws one stripe per year, coloured by the diverging ramp around the midpoint', () => {
    const chart = fixture('temperature-stripes');
    const scene = renderChart(chart, 'wide');
    const stripes = flat(scene.nodes).filter((n): n is Extract<SceneNode, { t: 'rect' }> => n.t === 'rect' && Boolean(n.tip));
    expect(stripes).toHaveLength(chart.data.rows.length);
    const ramp = divergingRamp(chart.data.rows.map((r) => r[1] as number), chart.options!.midpoint!);
    chart.data.rows.forEach((r, i) => expect(stripes[i]!.fill).toBe(ramp.paint(r[1] as number)));
  });

  it('leaves a missing year blank and says so in the key', () => {
    const chart = fixture('temperature-stripes');
    chart.data.rows = chart.data.rows.filter((r) => r[0] !== 1900);
    const nodes = flat(renderChart(chart, 'narrow').nodes);
    expect(nodes.filter((n) => n.t === 'rect' && n.tip)).toHaveLength(chart.data.rows.length);
    expect(nodes.some((n) => n.t === 'text' && n.text === 'No data')).toBe(true);
  });
});

describe('calendar', () => {
  it('has one square per day, and a missing day is an outline', () => {
    const chart = fixture('delhi-calendar-2024');
    chart.data.rows = chart.data.rows.map((r) => (r[0] === '2024-03-10' ? [r[0], null] : r));
    const cells = flat(renderChart(chart, 'wide').nodes).filter((n): n is Extract<SceneNode, { t: 'rect' }> => n.t === 'rect' && Boolean(n.tip));
    expect(cells).toHaveLength(366);
    const missing = cells.find((c) => c.tip!.startsWith('2024-03-10') || c.tip!.startsWith('10 Mar 2024'))!;
    expect(missing.fill).toBeUndefined();
    expect(missing.stroke).toBe('rule');
  });
});

describe('heatmap', () => {
  it('has one cell per row of data, on the sequential ramp', () => {
    const chart = fixture('delhi-heatmap-months');
    const cells = flat(renderChart(chart, 'wide').nodes).filter((n): n is Extract<SceneNode, { t: 'rect' }> => n.t === 'rect' && Boolean(n.tip));
    expect(cells).toHaveLength(chart.data.rows.length);
    expect(cells.every((c) => /^seq\d$/.test(c.fill ?? ''))).toBe(true);
  });
});

describe('band', () => {
  it('draws the year’s days as bars in the edition ink and names its hottest day', () => {
    const chart = fixture('delhi-band-2024');
    const nodes = flat(renderChart(chart, 'wide').nodes);
    expect(nodes.filter((n) => n.t === 'rect' && n.fill === 'ed' && n.tip)).toHaveLength(366);
    const hi = Math.max(...chart.data.rows.map((r) => r[2] as number));
    expect(nodes.some((n) => n.t === 'text' && n.text.startsWith(`${hi.toFixed(1)}°`))).toBe(true);
  });

  it('marks days that set or equalled a record', () => {
    const chart = fixture('delhi-band-2024');
    chart.data.rows[100]![6] = chart.data.rows[100]![2] ?? null; // make 2024's high that day the record
    const nodes = flat(renderChart(chart, 'wide').nodes);
    expect(nodes.filter((n) => n.t === 'circle' && n.fill === 'hot')).toHaveLength(2); // the day, and the key's sample
  });
});

describe('ramps', () => {
  it('bins sequential values into nine round-width steps that cover the data', () => {
    const r = sequentialRamp([12.3, 44.9]);
    expect(r.edges[0]).toBeLessThanOrEqual(12.3);
    expect(r.edges[9]).toBeGreaterThan(44.9);
    expect(r.index(12.3)).toBe(0);
    expect(r.index(44.9)).toBe(8);
  });

  it('centres the diverging ramp on the midpoint', () => {
    const r = divergingRamp([-0.4, 1.5], { value: 0, label: 'zero' });
    expect(r.index(0)).toBe(5);
    expect(r.index(-r.step / 2 + 1e-6)).toBe(5);
    expect(r.index(1.5)).toBeGreaterThan(5);
    expect(r.index(-0.4)).toBeLessThan(5);
  });
});

describe('ridgeline density', () => {
  it('uses Silverman’s bandwidth and integrates to one', () => {
    const vals = Array.from({ length: 200 }, (_, i) => Math.sin(i) * 3 + 40);
    const h = silverman(vals);
    expect(h).toBeGreaterThan(0.3);
    expect(h).toBeLessThan(2);
    const grid = Array.from({ length: 2001 }, (_, i) => 25 + (i * 30) / 2000);
    const d = kde(vals, h, grid);
    const area = d.reduce((a, b) => a + b, 0) * (30 / 2000);
    expect(area).toBeCloseTo(1, 2);
  });
});
