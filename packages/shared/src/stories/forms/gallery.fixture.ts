// The gallery's rows (packages/shared/fixtures/stories/gallery.json: UN World Population Prospects
// 2024 per country, 1950 to 2100) and the few things every form's fixture reads them with.

export type Pair = [number, number];
export interface GalleryCountry { name: string; code: string; tfr: Pair[]; medianAge: Pair[]; pop: Pair[] }
export interface Gallery { countries: GalleryCountry[]; world: { tfr: Pair[]; medianAge: Pair[] } }

/** The value a series holds for a year; throws when it holds none (a row is never guessed). */
export function valueIn(series: Pair[], year: number, what = 'a value'): number {
  const row = series.find(([y]) => y === year);
  if (!row) throw new Error(`The gallery has no ${what} for ${year}.`);
  return row[1];
}

export function country(g: Gallery, name: string): GalleryCountry {
  const c = g.countries.find((k) => k.name === name);
  if (!c) throw new Error(`The gallery has no row for ${name}.`);
  return c;
}

/** The first year a series falls below a level, or null if it never does. */
export const firstBelow = (pairs: Pair[], level: number): number | null => pairs.find(([, v]) => v < level)?.[0] ?? null;

/** Replacement fertility: the level at which a generation replaces itself. A definition, not a row. */
export const REPLACEMENT = 2.1;
