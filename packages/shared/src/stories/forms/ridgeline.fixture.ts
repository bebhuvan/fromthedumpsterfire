// How the world's fertility spread moved: every country's total fertility rate in six years, the last
// the UN's projection, from the gallery's rows as stored. The densities and medians are worked out by
// drawRidgeline; the axis runs to the whole number above the highest value.

import { valueIn, type Gallery } from './gallery.fixture';
import type { RidgelineFigure } from './ridgeline';

const YEARS = [1950, 1970, 1990, 2010, 2023, 2050];
const SEAM = 2023;

export function ridgelineFixture(g: Gallery): RidgelineFigure {
  const ridges = YEARS.map((year) => ({
    key: String(year),
    label: String(year),
    sub: year > SEAM ? 'Projected' : undefined,
    role: year === SEAM ? 'focus' as const : year > SEAM ? 'projected' as const : 'context' as const,
    values: g.countries.map((c) => valueIn(c.tfr, year)),
  }));
  const top = Math.ceil(Math.max(...ridges.flatMap((r) => r.values)));
  return {
    form: 'ridgeline',
    x: { domain: [0, top], ticks: Array.from({ length: top + 1 }, (_, i) => i), title: 'Children per woman, every country' },
    ridges,
    rule: { x: 2.1, label: 'Replacement 2.1' },
    medianWord: 'Median',
    digits: 1,
  };
}
