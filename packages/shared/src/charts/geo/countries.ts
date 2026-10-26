// Finding a country on the world map from what a source calls it: its ISO 3166 alpha-3 code first
// (the World Bank and Our World in Data both give one), else its name as Natural Earth, the World Bank
// or Our World in Data write it.

import { WORLD } from './world';

const key = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z]/g, '');

/** Names the World Bank and Our World in Data use that differ from Natural Earth's. */
const ALIASES: Record<string, string> = {
  'Russian Federation': 'RUS', 'Egypt, Arab Rep.': 'EGY', 'Iran, Islamic Rep.': 'IRN', 'Korea, Rep.': 'KOR', 'South Korea': 'KOR',
  "Korea, Dem. People's Rep.": 'PRK', 'North Korea': 'PRK', 'Viet Nam': 'VNM', Turkiye: 'TUR', 'Turkey': 'TUR', 'Yemen, Rep.': 'YEM',
  'Venezuela, RB': 'VEN', 'Congo, Dem. Rep.': 'COD', 'Democratic Republic of Congo': 'COD', 'Congo, Rep.': 'COG', Congo: 'COG',
  'Gambia, The': 'GMB', 'Bahamas, The': 'BHS', 'Lao PDR': 'LAO', Laos: 'LAO', 'Kyrgyz Republic': 'KGZ', 'Slovak Republic': 'SVK',
  'Syrian Arab Republic': 'SYR', Syria: 'SYR', 'Micronesia, Fed. Sts.': 'FSM', "Cote d'Ivoire": 'CIV', Czechia: 'CZE', 'Czech Republic': 'CZE',
  'Hong Kong SAR, China': 'HKG', 'Macao SAR, China': 'MAC', 'West Bank and Gaza': 'PSE', Palestine: 'PSE', 'Brunei Darussalam': 'BRN',
  'Cabo Verde': 'CPV', 'Cape Verde': 'CPV', Eswatini: 'SWZ', 'St. Lucia': 'LCA', 'St. Kitts and Nevis': 'KNA', 'St. Vincent and the Grenadines': 'VCT',
  'United States': 'USA', 'United Kingdom': 'GBR', 'Timor-Leste': 'TLS', 'East Timor': 'TLS', 'North Macedonia': 'MKD',
  'Bosnia and Herzegovina': 'BIH', 'Central African Republic': 'CAF', 'Dominican Republic': 'DOM', 'Equatorial Guinea': 'GNQ',
  'Solomon Islands': 'SLB', 'South Sudan': 'SSD', 'Sao Tome and Principe': 'STP', 'Micronesia (country)': 'FSM', 'Channel Islands': 'CHI',
};

const byKey = new Map<string, number>();
WORLD.forEach(([code, name, long], i) => {
  for (const n of [code, name, long]) if (!byKey.has(key(n))) byKey.set(key(n), i);
});
for (const [n, code] of Object.entries(ALIASES)) {
  const i = WORLD.findIndex((w) => w[0] === code);
  if (i >= 0) byKey.set(key(n), i);
}

/** The index in WORLD of the country a row names, by code or name; undefined when the map has no such shape. */
export function worldIndex(codeOrName: string): number | undefined {
  const s = codeOrName.trim();
  if (/^[A-Z]{3}$/.test(s)) {
    const i = WORLD.findIndex((w) => w[0] === s);
    if (i >= 0) return i;
  }
  return byKey.get(key(s));
}
