import { describe, expect, it } from 'vitest';
import { renderChart } from '../render';
import { Ctx } from '../frame';
import { stackOf } from './area';
import { fixtureC, sceneProblems, shapes } from './testkit-c';

describe('area', () => {
  const chart = fixtureC('area');

  it('draws in both layouts with nothing off the canvas', () => {
    for (const layout of ['wide', 'narrow'] as const) expect(sceneProblems(renderChart(chart, layout))).toEqual([]);
  });

  it('stacks to the total of the rows at every year', () => {
    const st = stackOf(new Ctx(chart, 'wide'));
    st.xs.forEach((x, k) => {
      const sum = chart.data.rows.filter((r) => r[0] === x).reduce((a, r) => a + (r[2] as number), 0);
      expect(st.totals[k]).toBeCloseTo(sum, 6);
      expect(st.bands[st.bands.length - 1]![k]![1]).toBeCloseTo(sum, 6);
      // Each band starts where the one below ends.
      for (let i = 1; i < st.bands.length; i++) expect(st.bands[i]![k]![0]).toBeCloseTo(st.bands[i - 1]![k]![1], 9);
    });
    expect(st.bands[0]!.every((b) => b![0] === 0)).toBe(true);
  });

  it('breaks the whole stack where a part is missing, never stacking over a hole', () => {
    const c = fixtureC('area');
    c.data.rows = c.data.rows.map((r) => (r[0] === 2010 && r[1] === 'Hydro' ? [r[0], r[1], null] : r));
    const st = stackOf(new Ctx(c, 'wide'));
    const k = st.xs.indexOf(2010);
    expect(st.totals[k]).toBeNull();
    expect(st.bands.every((b) => b[k] === null)).toBe(true);
  });

  it('names every part on the chart', () => {
    for (const layout of ['wide', 'narrow'] as const) {
      const texts = shapes(renderChart(chart, layout)).flatMap((n) => (n.t === 'text' ? [n.text] : []));
      const joined = texts.join(' ');
      for (const name of new Set(chart.data.rows.map((r) => String(r[1])))) for (const w of name.split(' ')) expect(joined).toContain(w);
    }
  });

  it('starts at zero with an ink baseline', () => {
    const s = shapes(renderChart(chart, 'wide'));
    expect(s.some((n) => n.t === 'text' && n.text === '0')).toBe(true);
    expect(s.some((n) => n.t === 'line' && n.stroke === 'ink' && n.y1 === n.y2)).toBe(true);
  });
});
