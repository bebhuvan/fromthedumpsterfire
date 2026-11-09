// The bars' fixture: the fifteen places in the gallery with the lowest total fertility in 2023,
// lowest first, South Korea in the ink, and the world's 2023 value as the reference; every value
// read from the gallery's rows.

import type { BarsFigure } from './bars';
import { valueIn, type Gallery } from './gallery.fixture';

export function barsFixture(g: Gallery, year = 2023, count = 15): BarsFigure {
  const bars = g.countries
    .map((c) => ({ label: c.name, value: valueIn(c.tfr, year, c.name) }))
    .sort((a, b) => a.value - b.value)
    .slice(0, count)
    .map((b) => (b.label === 'South Korea' ? { ...b, focus: true } : b));
  const world = valueIn(g.world.tfr, year, 'the world');
  // A tight, round scale: zero to the half above the largest value drawn.
  const top = Math.ceil(Math.max(world, ...bars.map((b) => b.value)) * 2) / 2;
  const ticks = Array.from({ length: top * 2 + 1 }, (_, i) => i / 2);
  return {
    form: 'bars',
    unit: `Children per woman, ${year}`,
    x: { domain: [0, top], ticks },
    decimals: 2,
    bars,
    rule: { x: world, label: `World ${world.toFixed(2)}` },
  };
}
