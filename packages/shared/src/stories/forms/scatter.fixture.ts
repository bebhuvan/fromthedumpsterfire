// The scatter's sample figure, from the gallery's UN rows (fixtures/stories/gallery.json): median age
// against fertility in 2023 for every country of a million people or more, each circle its people.
// The rows are used as they are; the only numbers typed here are the year, the threshold, the
// replacement rate and the key's round sizes, none of them data.

import type { ScatterFigure } from './scatter';
import { REPLACEMENT, valueIn, type Gallery } from './gallery.fixture';

/** A domain on round steps that holds every value, and its ticks. */
export function niceAxis(values: number[], step: number, floor?: number): { domain: [number, number]; ticks: number[] } {
  const lo = floor ?? Math.floor(Math.min(...values) / step) * step;
  const hi = Math.ceil(Math.max(...values) / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return { domain: [lo, hi], ticks };
}

const YEAR = 2023;
const NAMED = ['India', 'China', 'United States', 'Indonesia', 'Pakistan', 'Nigeria', 'Brazil', 'Bangladesh', 'Japan', 'South Korea', 'Niger', 'Israel'];

export function scatterFixture(g: Gallery): ScatterFigure {
  const rows = g.countries
    .map((c) => ({ c, pop: valueIn(c.pop, YEAR, `${c.name} population`) }))
    .filter(({ pop }) => pop >= 1e6);
  for (const n of NAMED) if (!rows.some(({ c }) => c.name === n)) throw new Error(`${n} is not in the rows`);
  const points = rows.map(({ c, pop }) => ({
    label: c.name,
    x: valueIn(c.medianAge, YEAR, `${c.name} median age`),
    y: valueIn(c.tfr, YEAR, `${c.name} fertility`),
    weight: pop,
    ...(c.name === 'India' ? { focus: true } : NAMED.includes(c.name) ? { named: true } : {}),
  }));
  const xa = niceAxis(points.map((p) => p.x), 5);
  const ya = niceAxis(points.map((p) => p.y), 1, 0);
  return {
    form: 'scatter',
    x: { ...xa, phoneTicks: xa.ticks.filter((t) => t % 10 === 0), title: `Median age, years, ${YEAR}` },
    y: { unit: `Births per woman, ${YEAR}`, ...ya },
    points,
    rule: { y: REPLACEMENT, label: `Replacement ${REPLACEMENT}` },
    sizeKey: { title: 'People', circles: [{ weight: 1e9, label: '1 billion' }, { weight: 1e8, label: '100 million' }] },
  };
}
