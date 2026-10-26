// The forms added 2026-10-26: histogram, tile map of India, world map, price and drawdown, table with
// sparklines, and the heatmap's cell values. Each on its real fixture, and the rules that keep them
// honest.
import { describe, expect, it } from 'vitest';
import type { Chart } from '../types';
import type { SceneNode } from '../scene';
import { renderChart } from '../render';
import { validateChart } from '../validate';
import { chartGlosses } from '../glosses';
import { bins } from '../bins';
import { textWidth } from '../text';
import { drawdowns } from '../drawdowns';
import { INDIA_TILES, indiaTile } from '../geo/india';
import { worldIndex } from '../geo/countries';
import { WORLD } from '../geo/world';

import histogram from '../../../../../docs/design-comps/charts/data/histogram-fertility.json';
import tilemap from '../../../../../docs/design-comps/charts/data/india-female-literacy.json';
import world from '../../../../../docs/design-comps/charts/data/world-internet.json';
import drawdown from '../../../../../docs/design-comps/charts/data/gold-drawdown.json';
import table from '../../../../../docs/design-comps/charts/data/south-asia-gdp-table.json';
import returns from '../../../../../docs/design-comps/charts/data/gold-monthly-returns.json';

const copy = (c: unknown): Chart => JSON.parse(JSON.stringify(c)) as Chart;
const flat = (nodes: SceneNode[]): SceneNode[] => nodes.flatMap((n) => (n.t === 'g' ? flat(n.children) : [n]));
const rules = (c: Chart) => validateChart(c).errors.map((e) => e.rule);

describe('histogram', () => {
  it('bins at a round width, counts every value once, and puts an edge value in the band above', () => {
    const b = bins([0.5, 1, 1.4, 1.5, 2, 2.2, 3.9, 6]);
    expect([1, 2, 2.5, 5].some((m) => [0.1, 1, 10].some((p) => Math.abs(b.width - m * p) < 1e-9))).toBe(true);
    expect(b.counts.reduce((a, c) => a + c, 0)).toBe(8);
    expect(b.index(b.start + b.width)).toBe(1);
    expect(b.counts.length).toBeGreaterThanOrEqual(6);
  });
  it('never makes more than 30 bars, whatever the spread', () => {
    const b = bins([...Array.from({ length: 50 }, (_, i) => 1 + i * 1e-6), 1e15]);
    expect(b.counts.length).toBeLessThanOrEqual(30);
    expect(b.counts.reduce((a, c) => a + c, 0)).toBe(51);
  });
  it('draws a bar per occupied band, one quiet series, the named rows pinned and named clear of the bars', () => {
    const chart = copy(histogram);
    for (const layout of ['wide', 'narrow'] as const) {
      const nodes = flat(renderChart(chart, layout).nodes);
      const bars = nodes.filter((n): n is Extract<SceneNode, { t: 'rect' }> => n.t === 'rect' && Boolean(n.tip));
      const b = bins(chart.data.rows.map((r) => r[2] as number));
      expect(bars).toHaveLength(b.counts.filter(Boolean).length);
      expect(bars.every((r) => r.fill === 'quiet')).toBe(true);
      const named = chart.options!.focus!;
      expect(nodes.filter((n) => n.t === 'circle' && n.fill === 'ed')).toHaveLength(named.length);
      // Every name is printed, and none sits on a bar.
      const labels = nodes.filter((n): n is Extract<SceneNode, { t: 'text' }> => n.t === 'text' && named.some((f) => n.text.startsWith(f)));
      expect(labels).toHaveLength(named.length);
      for (const l of labels) {
        const w = textWidth(l.text, l.face, l.size);
        const x0 = l.anchor === 'end' ? l.x - w : l.anchor === 'middle' ? l.x - w / 2 : l.x;
        const box = { x: x0, y: l.y - l.size * 0.75, w, h: l.size * 0.95 };
        for (const r of bars) expect(box.x < r.x + r.w && box.x + box.w > r.x && box.y < r.y + r.h && box.y + box.h > r.y, `${layout}: ${l.text} on a bar`).toBe(false);
      }
    }
  });
  it('must say what it counts', () => {
    const chart = copy(histogram);
    delete chart.options!.of;
    expect(rules(chart)).toContain('histogram');
    expect(chartGlosses(copy(histogram)).some((g) => g.startsWith('Each bar counts the countries'))).toBe(true);
  });
});

describe('tile map of India', () => {
  it('knows every state and union territory by name, code and older names', () => {
    expect(INDIA_TILES).toHaveLength(36);
    expect(new Set(INDIA_TILES.map((t) => `${t.col},${t.row}`)).size).toBe(36);
    expect(indiaTile('Orissa')?.code).toBe('OD');
    expect(indiaTile('Pondicherry')?.code).toBe('PY');
    expect(indiaTile('IN-UT')?.code).toBe('UK');
    expect(indiaTile('Jammu & Kashmir')?.code).toBe('JK');
    expect(indiaTile('Narnia')).toBeUndefined();
  });
  it('draws every tile, outlining the ones without data, and names the gaps in a gloss', () => {
    const chart = copy(tilemap);
    const tiles = flat(renderChart(chart, 'narrow').nodes).filter((n): n is Extract<SceneNode, { t: 'rect' }> => n.t === 'rect' && Boolean(n.tip));
    expect(tiles).toHaveLength(36);
    expect(tiles.filter((t) => t.fill === undefined).map((t) => t.tip!.split(':')[0]).sort()).toEqual(['Dadra and Nagar Haveli and Daman and Diu', 'Ladakh', 'Telangana']);
    expect(chartGlosses(chart).some((g) => g.startsWith('No data for') && g.includes('Telangana'))).toBe(true);
  });
  it('names the focus in full beside its tile without printing its value a second time', () => {
    for (const layout of ['wide', 'narrow'] as const) {
      const texts = flat(renderChart(copy(tilemap), layout).nodes).filter((n): n is Extract<SceneNode, { t: 'text' }> => n.t === 'text').map((n) => n.text);
      expect(texts).toContain('Kerala');
      expect(texts.filter((t) => t.includes('92.0'))).toHaveLength(1);
    }
  });
  it('refuses a place it does not know, and the same place twice', () => {
    const chart = copy(tilemap);
    chart.data.rows.push(['Atlantis', 50]);
    expect(rules(chart)).toContain('tilemap');
    const twice = copy(tilemap);
    twice.data.rows.push(['Orissa', 50]);
    expect(rules(twice)).toContain('duplicate');
  });
});

describe('world map', () => {
  // Point-in-outline on the generated paths (relative moves), to check whose side a place falls on.
  const contains = (code: string, x: number, y: number) => {
    const d = WORLD.find((w) => w[0] === code)![3];
    let inside = false;
    for (const ring of d.split('z')) {
      const pts: Array<[number, number]> = [];
      let cx = 0;
      let cy = 0;
      for (const [, cmd, a, b] of ring.matchAll(/([Ml])(-?[\d.]+)\s?(-?[\d.]+)/g)) {
        if (cmd === 'M') ((cx = Number(a)), (cy = Number(b)));
        else ((cx += Number(a)), (cy += Number(b)));
        pts.push([cx, cy]);
      }
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  };
  // Equal Earth, as scripts/chart-world.py projects.
  const project = (lon: number, lat: number) => {
    const [A1, A2, A3, A4, M] = [1.340264, -0.081106, 0.000893, 0.003796, Math.sqrt(3) / 2];
    const l = (lon * Math.PI) / 180;
    const t = Math.asin(M * Math.sin((lat * Math.PI) / 180));
    const t2 = t * t;
    const t6 = t2 * t2 * t2;
    const x = (2 * Math.sqrt(3) * l * Math.cos(t)) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1));
    const y = t * (A4 * t6 * t2 + A3 * t6 + A2 * t2 + A1);
    const k = 1000 / (2 * 2.7064);
    return [(x + 2.7064) * k, (1.3173 - y) * k] as const;
  };
  it('draws India’s boundaries as India depicts them', () => {
    for (const [lon, lat] of [[74.3, 35.9], [79.5, 35.2], [91.86, 27.59]] as const) {
      const [x, y] = project(lon, lat);
      expect(contains('IND', x, y)).toBe(true);
      expect(contains('PAK', x, y) || contains('CHN', x, y)).toBe(false);
    }
  });
  it('finds countries by code and by the names the World Bank uses', () => {
    expect(WORLD[worldIndex('IND')!]![0]).toBe('IND');
    expect(WORLD[worldIndex('Egypt, Arab Rep.')!]![0]).toBe('EGY');
    expect(WORLD[worldIndex('Korea, Rep.')!]![0]).toBe('KOR');
    expect(WORLD[worldIndex('Maldives')!]![3].startsWith('P')).toBe(true);
    expect(worldIndex('Kosovo')).toBeUndefined();
  });
  it('warns of rows with no shape and refuses a country twice', () => {
    const chart = copy(world);
    chart.data.rows.push(['Kosovo', 'XKX', 80]);
    const r = validateChart(chart);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.rule)).toContain('choropleth');
    const twice = copy(world);
    twice.data.rows.push(['India', 'IND', 1]);
    expect(rules(twice)).toContain('duplicate');
  });
  it('caps a share’s key at 100 per cent', () => {
    const texts = flat(renderChart(copy(world), 'wide').nodes).filter((n) => n.t === 'text').map((n) => (n as { text: string }).text);
    expect(texts.some((t) => /^10[1-9]/.test(t))).toBe(false);
  });
});

describe('price and drawdown', () => {
  it('measures each value against the highest before it and finds the deepest fall and its recovery', () => {
    const { pts, deepest } = drawdowns([100, 120, 60, 90, 130, 117].map((v, i) => ({ x: 2000 + i, raw: 2000 + i, v })));
    expect(pts.map((p) => Math.round(p.dd * 100))).toEqual([0, 0, -50, -25, 0, -10]);
    expect(deepest).toEqual({ peak: 1, trough: 2, recovery: 4 });
  });
  it('says the deepest fall in a gloss, from the rows', () => {
    expect(chartGlosses(copy(drawdown))).toContain('Deepest fall: 63%, from the 1980 peak to the 1999 low; back above that peak in 2009.');
  });
  it('refuses prices at or below zero', () => {
    const chart = copy(drawdown);
    chart.data.rows[3]![1] = 0;
    expect(rules(chart)).toContain('drawdown');
  });
});

describe('table with sparklines', () => {
  it('prints every row’s first and last value and its change, and draws a line per row', () => {
    const chart = copy(table);
    const nodes = flat(renderChart(chart, 'wide').nodes);
    expect(nodes.some((n) => n.t === 'text' && n.text === '+213%')).toBe(true);
    expect(nodes.filter((n) => n.t === 'path' && n.tip).length).toBe(8);
    expect(chartGlosses(chart).some((g) => g.includes('own scale') && g.includes('percentage change'))).toBe(true);
    // Every row has every year: no gap to speak of (rows of different places repeat the years).
    expect(chartGlosses(chart).some((g) => g.startsWith('Gaps'))).toBe(false);
  });
  it('keeps to 25 rows', () => {
    const chart = copy(table);
    for (let i = 0; i < 20; i++) chart.data.rows.push([`Place ${i}`, 2000, 1], [`Place ${i}`, 2024, 2]);
    expect(rules(chart)).toContain('table');
  });
});

describe('heatmap values', () => {
  it('prints a value in every cell, or in none', () => {
    for (const layout of ['wide', 'narrow'] as const) {
      const chart = copy(returns);
      const nodes = flat(renderChart(chart, layout).nodes);
      const values = nodes.filter((n) => n.t === 'text' && /^[+–]?\d+\.\d$/.test((n as { text: string }).text));
      expect([0, chart.data.rows.length]).toContain(values.length);
    }
  });
  it('belongs to heatmaps only', () => {
    const chart = copy(histogram);
    chart.options = { ...chart.options, values: true };
    expect(rules(chart)).toContain('unknown-field');
  });
});
