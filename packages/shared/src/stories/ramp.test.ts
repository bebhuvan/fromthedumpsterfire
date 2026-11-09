// The story ramp: one binning (symmetric about the centre, open at the ends, the grey middle unused)
// and, for every step it uses in either theme, a colour that stands off the ground, apart from its
// neighbours, apart from "no data", and (the warm arm) apart from ember.

import { describe, expect, test } from 'vitest';
import { checkRamp, ramp, rampKey } from './ramp';
import { texts } from './testkit';

const r = ramp({ centre: 2.1, width: 0.25, perSide: 5 });

describe('the story ramp', () => {
  test('edges symmetric about the centre, one width apart; the centre counts as above', () => {
    expect(r.edges).toHaveLength(9);
    expect(r.edges[4]).toBe(2.1);
    for (let i = 0; i < 9; i++) expect(r.edges[i]! + r.edges[8 - i]!).toBeCloseTo(4.2, 9);
    for (let i = 1; i < 9; i++) expect(r.edges[i]! - r.edges[i - 1]!).toBeCloseTo(0.25, 9);
    expect(r.paints).toEqual(['div0', 'div1', 'div2', 'div3', 'div4', 'div6', 'div7', 'div8', 'div9', 'div10']);
    expect(r.paintOf(0.5)).toBe('div0');
    expect(r.paintOf(2.09)).toBe('div4');
    expect(r.paintOf(2.1)).toBe('div6');
    expect(r.paintOf(9)).toBe('div10');
    expect(r.labels.map((l) => l.text)).toEqual(['1.1', '1.6', '2.1', '2.6', '3.1']);
  });
  test('fewer bins a side keep the steps nearest the middle', () => {
    expect(ramp({ centre: 0, width: 1, perSide: 2 }).paints).toEqual(['div3', 'div4', 'div6', 'div7']);
    expect(() => ramp({ centre: 0, width: 1, perSide: 6 })).toThrow(/one to five/);
    expect(() => ramp({ centre: 0, width: 0, perSide: 2 })).toThrow(/positive/);
  });
  test.each(['light', 'dark'] as const)('%s: every step stands off the ground, its neighbours, "no data" and ember', (scheme) => {
    const c = checkRamp(r, scheme);
    // 1.5:1 against the ground: no bin vanishes into the page or reads as a gap.
    for (const [i, v] of c.ground.entries()) expect(v, `${c.paints[i]} on the ground`).toBeGreaterThanOrEqual(1.5);
    // Neighbouring bins about a tenth apart in OKLab: one step reads as one step.
    for (const [i, v] of c.neighbours.entries()) expect(v, `${c.paints[i]} beside ${c.paints[i + 1]}`).toBeGreaterThanOrEqual(0.09);
    // The grey of "no data" farther from every bin than a step is from the next.
    for (const [i, v] of c.noData.entries()) expect(v, `${c.paints[i]} beside no data`).toBeGreaterThanOrEqual(0.14);
    // Ember (the site's flame) is never mistaken for a warm bin.
    for (const [i, v] of c.ember.entries()) expect(v, `${c.paints[i + 5]} beside ember`).toBeGreaterThanOrEqual(0.08);
  });
  test.each(['wide', 'phone'] as const)('the key fits the %s, the centre named and every other edge written', (dev) => {
    const width = dev === 'wide' ? 880 : 340;
    const k = rampKey(r, { unit: 'Children per woman, 2023', centreLabel: 'Replacement 2.1', noData: true, dev, width });
    expect(k.width).toBeLessThanOrEqual(width);
    const words = texts(k.nodes).map((t) => t.t);
    expect(words).toEqual(expect.arrayContaining(['Children per woman, 2023', 'Replacement 2.1', 'No data', '1.1', '2.1', '3.1']));
    expect(words).not.toContain('1.35');
  });
});
