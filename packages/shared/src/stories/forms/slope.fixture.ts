// The slope's fixture: total fertility from 1990 to 2023 for sixteen countries, India loud, every
// value read from the gallery's rows (packages/shared/fixtures/stories/gallery.json).

import type { SlopeFigure } from './slope';
import { country, REPLACEMENT, valueIn, type Gallery } from './gallery.fixture';

const MEMBERS = ['India', 'China', 'South Korea', 'Iran', 'Bangladesh', 'Nigeria', 'United States', 'Brazil', 'Japan', 'Italy', 'Niger', 'Pakistan', 'Egypt', 'Mexico', 'Indonesia', 'France'];

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
    decimals: 1,
    members,
    rule: { y: REPLACEMENT, label: `Replacement ${REPLACEMENT}` },
  };
}
