// The cascade, from the gallery's rows: the 40 most populous countries in 2023, in the order their
// fertility first fell below replacement (2.1), each year from 1950 to 2023 a cell. The ordering, the
// crossing years and the groups are worked out here from the stored rows; the bins in drawHeatmap.

import type { HeatmapFigure, HeatmapRow } from './heatmap';
import { firstBelow, REPLACEMENT, valueIn, type Gallery } from './gallery.fixture';

/** Names too long for a row, shortened (wide, phone). */
const SHORT: Record<string, [string, string]> = {
  COD: ['DR Congo', 'DR Congo'],
  USA: ['United States', 'US'],
  GBR: ['United Kingdom', 'UK'],
  ZAF: ['South Africa', 'S. Africa'],
  KOR: ['South Korea', 'S. Korea'],
};

const SEAM = 2023;

export function cascadeFixture(g: Gallery, focus = 'IND'): HeatmapFigure {
  const [y0, y1] = [1950, SEAM];
  const top = g.countries.slice().sort((a, b) => valueIn(b.pop, SEAM) - valueIn(a.pop, SEAM)).slice(0, 40);
  const rows: HeatmapRow[] = top.map((c) => {
    const crossed = firstBelow(c.tfr, REPLACEMENT);
    const values = c.tfr.filter(([y]) => y >= y0 && y <= y1).map(([, v]) => v);
    return {
      key: c.code,
      label: SHORT[c.code]?.[0] ?? c.name,
      phoneLabel: SHORT[c.code]?.[1],
      focus: c.code === focus || undefined,
      values,
      crossed,
      group: crossed === null ? 2 : crossed <= SEAM ? 0 : 1,
    };
  });
  // Crossed first at the top; never by 2100 last; ties by name.
  rows.sort((a, b) => (a.crossed ?? Infinity) - (b.crossed ?? Infinity) || a.label.localeCompare(b.label));
  const last = g.countries[0]!.tfr[g.countries[0]!.tfr.length - 1]![0];
  return {
    form: 'heatmap',
    years: [y0, y1],
    mid: REPLACEMENT,
    midLabel: `Replacement ${REPLACEMENT}`,
    step: 0.25,
    perSide: 5,
    unit: 'Children per woman',
    crossedHead: [['First year', 'below 2.1'], ['Below', '2.1']],
    groups: [
      { label: `Fell below 2.1 by ${SEAM}` , phone: `Below 2.1 by ${SEAM}` },
      { label: 'Projected to fall below 2.1 (UN)', phone: 'Projected to fall below' },
      { label: `Not below 2.1 by ${last}, by the UN projection`, phone: `Not below 2.1 by ${last}` },
    ],
    rows,
  };
}
