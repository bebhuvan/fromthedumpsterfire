// The value forms (stripes, band, calendar, heatmap, ridgeline) on the comps' real data, and the
// rules that make them honest: one stripe per year on the stated ramp, one square per day, missing
// values drawn as missing, nothing drawn outside the figure.
import { describe, expect, it } from 'vitest';
import type { Chart } from '../types';
import type { SceneNode } from '../scene';
import { renderChart } from '../render';
import { continuousRamp, divergingRamp, sequentialRamp } from '../ramp';
import { labelOn, paintHex, PAINTS, type Paint } from '../scene';
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
  it('draws one stripe per year, each its own shade of the continuous ramp around the midpoint', () => {
    const chart = fixture('temperature-stripes');
    const scene = renderChart(chart, 'wide');
    const stripes = flat(scene.nodes).filter((n): n is Extract<SceneNode, { t: 'rect' }> => n.t === 'rect' && Boolean(n.tip));
    expect(stripes).toHaveLength(chart.data.rows.length);
    const ramp = continuousRamp(chart.data.rows.map((r) => r[1] as number), chart.options!.midpoint!);
    chart.data.rows.forEach((r, i) => expect(stripes[i]!.fill).toBe(ramp.paint(r[1] as number)));
    // Neighbouring stripes overlap by a hair, so no seam of the ground shows between them.
    for (let i = 1; i < stripes.length; i++) expect(stripes[i - 1]!.x + stripes[i - 1]!.w).toBeGreaterThan(stripes[i]!.x);
  });

  it('spreads the continuous ramp symmetrically to a round reach past the farthest year', () => {
    const r = continuousRamp([-0.6, 1.19], { value: 0, label: 'the 1961–1990 average' });
    expect(r.step).toBe(1.2);
    expect(r.paint(0)).toBe('dv20');
    expect(r.paint(1.2)).toBe('dv40');
    expect(r.paint(-1.2)).toBe('dv0');
    expect(r.index(0.6)).toBe(30);
    expect(r.index(-0.6)).toBe(10);
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
  it('has one cell per row of data, on the ramp the chart asks for', () => {
    const chart = fixture('delhi-heatmap-months');
    const cells = flat(renderChart(chart, 'wide').nodes).filter((n): n is Extract<SceneNode, { t: 'rect' }> => n.t === 'rect' && Boolean(n.tip));
    expect(cells).toHaveLength(chart.data.rows.length);
    expect(cells.every((c) => /^div\d+$/.test(c.fill ?? ''))).toBe(true);
    const asSeq = { ...fixture('delhi-heatmap-months'), options: { colour: 'sequential' as const, sort: 'given' as const } };
    const seq = flat(renderChart(asSeq, 'wide').nodes).filter((n): n is Extract<SceneNode, { t: 'rect' }> => n.t === 'rect' && Boolean(n.tip));
    expect(seq.every((c) => /^seq\d$/.test(c.fill ?? ''))).toBe(true);
  });

  it('turns a long, short table on its side on a phone, keeping every cell', () => {
    const chart = fixture('delhi-heatmap-months');
    const scene = renderChart(chart, 'narrow');
    const cells = flat(scene.nodes).filter((n): n is Extract<SceneNode, { t: 'rect' }> => n.t === 'rect' && Boolean(n.tip));
    expect(cells).toHaveLength(chart.data.rows.length);
    // Twelve months across, so every cell is wide enough to read.
    expect(Math.min(...cells.map((c) => c.w))).toBeGreaterThan(20);
    expect(scene.height).toBeGreaterThan(scene.width);
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
  it('bins sequential values into seven round-width steps that cover the data', () => {
    const r = sequentialRamp([12.3, 44.9]);
    expect(r.steps).toHaveLength(7);
    expect(r.edges[0]).toBeLessThanOrEqual(12.3);
    expect(r.edges[7]).toBeGreaterThan(44.9);
    expect(r.index(12.3)).toBe(0);
    expect(r.index(44.9)).toBe(6);
    expect(sequentialRamp([12.3, 44.9], 'heat').paint(44.9)).toBe('heat6');
  });

  it('sizes diverging bins to the bulk of the values and opens the ends for the few beyond', () => {
    // Ninety-five values within ±2 and five far out: the bins follow the ninety-five.
    const vals = [...Array.from({ length: 95 }, (_, i) => -2 + (4 * i) / 94), -9, 9, 8, -8, 7];
    const r = divergingRamp(vals, { value: 0, label: 'zero' });
    expect(r.open).toBe(true);
    expect(r.step).toBeLessThanOrEqual(0.5);
    expect(r.index(9)).toBe(10);
    expect(r.index(-9)).toBe(0);
    // Without outliers the end bins are closed and hold the extremes.
    const c = divergingRamp([-2, -1, 0, 1, 2], { value: 0, label: 'zero' });
    expect(c.open).toBe(false);
    expect(c.edges[11]).toBeGreaterThanOrEqual(2);
  });

  it('runs the diverging ramps the other way for money, so a fall is red', () => {
    const t = divergingRamp([-3, 3], { value: 0, label: 'no change' });
    const m = divergingRamp([-3, 3], { value: 0, label: 'no change' }, true);
    // The same bins, the paints mirrored: the low end blue for a temperature, red for money.
    for (const v of [-3, -1, 0, 1, 3]) expect(m.paint(v)).toBe(`div${10 - Number(t.paint(v).slice(3))}`);
    expect(Number(m.paint(-3).slice(3))).toBeGreaterThan(5);
    expect(m.steps[0]).toBe('div10');
    const c = continuousRamp([-1, 1], { value: 0, label: 'zero' }, true);
    expect(c.paint(-1)).toBe('dv40');
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

describe('labels inside fills', () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  it('reads at 3:1 or better on every filled step, in both themes', () => {
    const fills = PAINTS.filter((p) => /^(cat|seq|heat|div)\d+$|^quiet|^ed$/.test(p)) as Paint[];
    for (const f of fills) {
      const l = labelOn(f);
      for (const sch of ['light', 'dark'] as const) for (const e of ['oxblood', 'teal', 'ochre', 'slate'] as const) {
        expect(contrast(paintHex(l, sch, e), paintHex(f, sch, e)), `${l} on ${f} (${sch}, ${e})`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
