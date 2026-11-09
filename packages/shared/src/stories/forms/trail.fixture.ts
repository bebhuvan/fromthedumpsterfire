// The trail's sample figure, from the gallery's UN rows: five countries' paths through median age and
// fertility, 1950 to 2023 as estimated and on to 2100 as projected. Rows used as they are.

import { niceAxis } from './scatter.fixture';
import { REPLACEMENT, type Gallery } from './gallery.fixture';
import type { TrailFigure } from './trail';

const MEMBERS = ['South Korea', 'China', 'India', 'Nigeria', 'United States'];
/** The UN's last estimated year in World Population Prospects 2024; later years are its projection. */
const LAST_ESTIMATE = 2023;

export function trailFixture(g: Gallery): TrailFigure {
  const members = MEMBERS.map((name) => {
    const c = g.countries.find((k) => k.name === name);
    if (!c) throw new Error(`${name} is not in the rows`);
    const age = new Map(c.medianAge);
    const points = c.tfr.filter(([yr]) => age.has(yr)).map(([yr, v]) => [yr, age.get(yr)!, v] as [number, number, number]);
    return { label: name, ...(name === 'India' ? { focus: true } : {}), points, projectedFrom: LAST_ESTIMATE + 1 };
  });
  const all = members.flatMap((m) => m.points);
  const xa = niceAxis(all.map((p) => p[1]), 5);
  const ya = niceAxis(all.map((p) => p[2]), 1, 0);
  return {
    form: 'trail',
    x: { ...xa, phoneTicks: xa.ticks.filter((t) => t % 10 === 0), title: 'Median age, years' },
    y: { unit: 'Births per woman', ...ya },
    members,
    every: 10,
    rule: { y: REPLACEMENT, label: `Replacement ${REPLACEMENT}` },
  };
}
