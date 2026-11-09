// Rankings over time, from the gallery's rows: the ten most populous countries in 2023 and their rank
// by population among those ten every ten years from 1950 to 2100, and in 2023 where the estimates
// end. The ranks are worked out here from the stored populations, ties broken by name.

import { valueIn, type Gallery, type GalleryCountry } from './gallery.fixture';
import type { BumpFigure } from './bump';
import type { Pt } from '../geom';

const SEAM = 2023;
const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** Each member's rank at each year among the members (1 the most), ties by name. */
export function ranksAmong(members: GalleryCountry[], years: number[]): Map<string, Pt[]> {
  const out = new Map<string, Pt[]>(members.map((c) => [c.code, []]));
  for (const yr of years) {
    members
      .map((c) => ({ c, v: valueIn(c.pop, yr) }))
      .sort((a, b) => b.v - a.v || a.c.name.localeCompare(b.c.name))
      .forEach(({ c }, i) => out.get(c.code)!.push([yr, i + 1]));
  }
  return out;
}

export function bumpFixture(g: Gallery, focus = 'IND'): BumpFigure {
  const ten = g.countries.slice().sort((a, b) => valueIn(b.pop, SEAM) - valueIn(a.pop, SEAM)).slice(0, 10);
  const years = g.countries[0]!.pop.map(([y]) => y);
  const [first, last] = [years[0]!, years[years.length - 1]!];
  const decades = years.filter((y) => (y - first) % 10 === 0);
  const ranks = ranksAmong(ten, [...decades, SEAM].sort((a, b) => a - b));
  return {
    form: 'bump',
    x: { domain: [first, last], ticks: decades.filter((y) => (y - first) % 30 === 0), phoneTicks: decades.filter((y) => (y - first) % 50 === 0) },
    seam: SEAM,
    dots: decades,
    // The count is the lines', so the words cannot drift from the figure.
    unit: `Rank among these ${WORDS[ten.length] ?? ten.length}`,
    lines: ten.map((c) => ({ key: c.code, label: c.name, focus: c.code === focus || undefined, ranks: ranks.get(c.code)! })),
  };
}
