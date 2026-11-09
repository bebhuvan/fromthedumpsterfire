// The dumbbell's fixture: total fertility in 1970 and 2023 for eighteen countries, highest 2023
// first, India in the ink; every value read from the gallery's rows.

import type { DumbbellFigure } from './dumbbell';
import { country, REPLACEMENT, valueIn, type Gallery } from './gallery.fixture';

const ROWS = ['Niger', 'Nigeria', 'Ethiopia', 'Pakistan', 'Kenya', 'Egypt', 'Bangladesh', 'Indonesia', 'India', 'Mexico', 'Iran', 'France', 'United States', 'Brazil', 'Japan', 'Italy', 'China', 'South Korea'];

export function dumbbellFixture(g: Gallery, from = 1970, to = 2023): DumbbellFigure {
  const rows = ROWS.map((name) => {
    const c = country(g, name);
    return { label: name, from: valueIn(c.tfr, from, name), to: valueIn(c.tfr, to, name), ...(name === 'India' ? { focus: true } : {}) };
  }).sort((a, b) => b.to - a.to);
  // A round scale from zero to the even number above the highest value.
  const top = Math.ceil(Math.max(...rows.flatMap((r) => [r.from, r.to])) / 2) * 2;
  const ticks = Array.from({ length: top / 2 + 1 }, (_, i) => i * 2);
  return {
    form: 'dumbbell',
    from: String(from),
    to: String(to),
    unit: 'Children per woman',
    x: { domain: [0, top], ticks, phoneTicks: ticks.filter((t) => t % 4 === 0 || t === top) },
    decimals: 1,
    rows,
    rule: { x: REPLACEMENT, label: `Replacement ${REPLACEMENT}` },
  };
}
