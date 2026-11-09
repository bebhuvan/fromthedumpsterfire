// The map's sample figure, from the gallery's UN rows: fertility in 2023 for every country in them,
// matched to the map by ISO code, binned a quarter of a birth wide around replacement. A row whose
// code is not an ISO one and whose name the map does not know (Our World in Data's Kosovo) cannot be
// drawn; it is listed in `unmapped` so the caption can say so, never dropped in silence.

import { worldIndex } from '../../charts/geo/countries';
import type { MapFigure } from './map';
import { REPLACEMENT, valueIn, type Gallery } from './gallery.fixture';

const YEAR = 2023;

export function mapFixture(g: Gallery): MapFigure & { unmapped: string[] } {
  const rows = g.countries.map((c) => ({ code: c.code, name: c.name, v: valueIn(c.tfr, YEAR, `${c.name} fertility`) }));
  const onMap = (r: { code: string; name: string }) => (worldIndex(r.code) ?? worldIndex(r.name)) !== undefined;
  return {
    form: 'map',
    values: rows.filter(onMap),
    unmapped: rows.filter((r) => !onMap(r)).map((r) => r.name),
    bins: { centre: REPLACEMENT, width: 0.25, perSide: 5 },
    centreLabel: 'Replacement',
    unit: `Births per woman, ${YEAR}`,
    focus: ['IND'],
  };
}
