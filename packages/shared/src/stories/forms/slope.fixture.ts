// The slope's fixture: total fertility from 1990 to 2023 for sixteen countries, India loud, every
// value read from the gallery's rows (packages/shared/fixtures/stories/gallery.json).

import type { SlopeFigure } from './slope';
import { country, REPLACEMENT, valueIn, type Gallery } from './gallery.fixture';

const MEMBERS = ['India', 'China', 'South Korea', 'Iran', 'Bangladesh', 'Nigeria', 'United States', 'Brazil', 'Japan', 'Italy', 'Niger', 'Pakistan', 'Egypt', 'Mexico', 'Indonesia', 'France'];

/**
 * Decimals for values on posts, from the data: whole numbers when they spread over tens, one place over
 * units (fertility: 0.7 to 7.8, as on the dumbbell), two below that.
 */
export function decimalsFor(values: number[]): 0 | 1 | 2 {
  const span = Math.max(...values) - Math.min(...values);
  return span >= 10 ? 0 : span >= 1 ? 1 : 2;
}

export function slopeFixture(g: Gallery, from = 1990, to = 2023): SlopeFigure {
  const members = MEMBERS.map((name) => {
    const c = country(g, name);
    return { label: name, from: valueIn(c.tfr, from, name), to: valueIn(c.tfr, to, name), ...(name === 'India' ? { focus: 'loud' as const } : {}) };
  });
  const top = Math.ceil(Math.max(...members.flatMap((m) => [m.from, m.to])));
  return {
    form: 'slope',
    from: String(from),
    to: String(to),
    unit: 'Children per woman',
    y: { domain: [0, top] },
    decimals: decimalsFor(members.flatMap((m) => [m.from, m.to])),
    members,
    rule: { y: REPLACEMENT, label: `Replacement ${REPLACEMENT}` },
  };
}
