// The trail's sample figure, from the gallery's UN rows: four countries' paths through median age and
// fertility, 1950 to 2023 as estimated and on to 2100 as projected. Rows used as they are.
// Four, not five: China's path (its famine years) knots into South Korea's and India's at both ends.

import { niceAxis } from './scatter.fixture';
import { REPLACEMENT, type Gallery } from './gallery.fixture';
import type { TrailFigure } from './trail';

const MEMBERS = ['Nigeria', 'India', 'United States', 'South Korea'];
/** The UN's last estimated year in World Population Prospects 2024; later years are its projection. */
const LAST_ESTIMATE = 2023;

/**
 * A domain from the data's own ends, rounded out to whole units with half a unit to spare (so no path
 * runs along the frame), and the ticks on the round step inside it. Nothing stretches to the next step.
 */
export function clipAxis(values: number[], step: number): { domain: [number, number]; ticks: number[] } {
  const lo = Math.floor(Math.min(...values) - 0.5), hi = Math.ceil(Math.max(...values) + 0.5);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return { domain: [lo, hi], ticks };
}

export function trailFixture(g: Gallery): TrailFigure {
  const members = MEMBERS.map((name) => {
    const c = g.countries.find((k) => k.name === name);
    if (!c) throw new Error(`${name} is not in the rows`);
    const age = new Map(c.medianAge);
    const points = c.tfr.filter(([yr]) => age.has(yr)).map(([yr, v]) => [yr, age.get(yr)!, v] as [number, number, number]);
    return { label: name, ...(name === 'India' ? { focus: true } : {}), points, projectedFrom: LAST_ESTIMATE + 1 };
  });
  const all = members.flatMap((m) => m.points);
  const xa = clipAxis(all.map((p) => p[1]), 5);
  const ya = niceAxis(all.map((p) => p[2]), 1, 0);
  return {
    form: 'trail',
    x: { ...xa, phoneTicks: xa.ticks.filter((t) => t % 10 === 0), title: 'Median age, years' },
    y: { unit: 'Children per woman', ...ya },
    members,
    every: 10,
    rule: { y: REPLACEMENT, label: `Replacement ${REPLACEMENT}` },
  };
}
