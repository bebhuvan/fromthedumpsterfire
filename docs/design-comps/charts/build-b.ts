// Builds the comps' Delhi temperature fixtures (band, calendar, heatmap, ridgeline) from the raw
// Open-Meteo daily history in raw/. Every derived number is computed here by code, and each chart's
// `method` says how. Run (from the repo root):
//   node_modules/.bin/esbuild docs/design-comps/charts/build-b.ts --bundle --platform=node --format=esm --outfile=/tmp/build-b.mjs && node /tmp/build-b.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { bandSummary, bandMethod, BAND_ENCODE } from '../../../packages/shared/src/charts/band.ts';
import type { Chart, ChartSource } from '../../../packages/shared/src/charts/types.ts';

const dir = join(process.cwd(), 'docs/design-comps/charts');
const csv = gunzipSync(readFileSync(join(dir, 'raw/open-meteo-delhi-daily-1940-2025.csv.gz'))).toString('utf8');
const daily = csv
  .trim()
  .split('\n')
  .slice(1)
  .map((l) => {
    const [date, tmax, tmin] = l.split(',');
    return { date: date!, tmax: tmax === '' ? null : Number(tmax), tmin: tmin === '' ? null : Number(tmin) };
  });

const source: ChartSource = {
  maker: 'ECMWF Copernicus Climate Change Service (ERA5 reanalysis)',
  dataset: 'Open-Meteo Historical Weather API, daily 2 m temperature maximum and minimum',
  url: 'https://open-meteo.com/en/docs/historical-weather-api',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://open-meteo.com/en/licence',
  retrieved: '2026-10-25',
  via: { name: 'Open-Meteo.com', url: 'https://open-meteo.com/', licence: 'CC BY 4.0' },
};
const geography = 'New Delhi (28.6° N, 77.2° E; ERA5 grid cell)';
const base = { units: '°C', geography, sources: [source], sourceSpan: { from: '1940-01-01', to: '2025-12-31' } };
const write = (name: string, c: Chart) => writeFileSync(join(dir, 'data', `${name}.json`), `${JSON.stringify(c, null, 1)}\n`);

// Band: 2024, normals over 1991–2020.
const opts = { year: 2024, normalFrom: 1991, normalTo: 2020 };
write('delhi-band-2024', {
  form: 'band',
  title: 'Delhi’s 2024: the summer that would not break',
  note: 'May and June ran above the normal range for weeks, and the nights stayed hot.',
  ...base,
  span: { from: '2024-01-01', to: '2024-12-31' },
  measure: { basis: 'absolute' },
  method: bandMethod(opts, 1940),
  data: bandSummary(daily, opts),
  encode: { ...BAND_ENCODE },
});

// Calendar: each day of 2024 as its high's departure from that calendar day's 1991–2020 normal high
// (the band's normal, so the two charts agree). Diverging around zero: warmer than normal in red,
// cooler in blue.
const band2024 = bandSummary(daily, opts);
const bi = (k: string) => band2024.columns.findIndex((c) => c.key === k);
write('delhi-calendar-2024', {
  form: 'calendar',
  title: 'Every day of 2024 in Delhi, against its normal',
  note: 'Every day of January ran below its normal. May and June ran above it on about five days in six.',
  ...base,
  span: { from: '2024-01-01', to: '2024-12-31' },
  measure: { basis: 'anomaly', base: 'that calendar day’s 1991–2020 average high' },
  method: 'Each day’s high minus the average high on that calendar day over 1991–2020 (the normal, rounded to 0.1 °C), for 29 February over the leap years in that range only.',
  data: {
    columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'departure', label: 'Difference from the normal high', type: 'number' }],
    rows: band2024.rows.map((r) => {
      const hi = r[bi('high')] as number | null;
      const nhi = r[bi('normal_high')] as number | null;
      return [r[bi('date')] as string, hi === null || nhi === null ? null : Math.round((hi - nhi) * 10) / 10];
    }),
  },
  encode: { x: 'date', y: 'departure' },
  options: { colour: 'diverging', midpoint: { value: 0, label: 'the normal' } },
});

// Heatmap: each month's average high, as its departure from that month's 1961–1990 average, 1950–2025.
const monthly = new Map<string, number[]>();
for (const d of daily) {
  const y = Number(d.date.slice(0, 4));
  if (y < 1950 || d.tmax === null) continue;
  const k = d.date.slice(0, 7);
  if (!monthly.has(k)) monthly.set(k, []);
  monthly.get(k)!.push(d.tmax);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const meanOf = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const monthMean = new Map<string, number>([...monthly].map(([k, v]) => [k, meanOf(v)]));
const baseline = MONTHS.map((_, m) => meanOf([...monthMean].filter(([k]) => Number(k.slice(5, 7)) === m + 1 && Number(k.slice(0, 4)) >= 1961 && Number(k.slice(0, 4)) <= 1990).map(([, v]) => v)));
const hrows: Array<[number, string, number]> = [];
for (const [k, v] of monthMean) {
  const m = Number(k.slice(5, 7)) - 1;
  hrows.push([Number(k.slice(0, 4)), MONTHS[m]!, Math.round((v - baseline[m]!) * 10) / 10]);
}
write('delhi-heatmap-months', {
  form: 'heatmap',
  title: 'Delhi’s afternoons have not warmed the way the world has',
  note: 'Since 2000, May and June have come in below their 1961–1990 average high in about three years of four, while August has run warm.',
  ...base,
  span: { from: '1950', to: '2025' },
  sourceSpan: { from: '1940', to: '2025' },
  measure: { basis: 'anomaly', base: 'that month’s 1961–1990 average high' },
  method: 'Each cell is the average of that month’s daily highs minus the average of the same month over 1961–1990, rounded to 0.1 °C.',
  data: { columns: [{ key: 'year', label: 'Year', type: 'year' }, { key: 'month', label: 'Month', type: 'text' }, { key: 'departure', label: 'Difference from the 1961–1990 average high', type: 'number' }], rows: hrows },
  encode: { x: 'year', label: 'month', y: 'departure' },
  options: { colour: 'diverging', midpoint: { value: 0, label: 'the 1961–1990 average' }, sort: 'given' },
});

// Warming stripes: HadCRUT5's own global annual series, as the Met Office publishes it (difference
// from the 1961–1990 average); the confidence columns are left out, since stripes cannot show them.
const had = readFileSync(join(dir, 'raw/hadcrut5-global-annual-1961-1990.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
write('temperature-stripes', {
  form: 'stripes',
  title: 'Every year since 1850, as a stripe',
  note: 'Each stripe is one year of the world’s average temperature. The run of red at the end is not a blip.',
  units: '°C',
  geography: 'World',
  span: { from: '1850', to: had[had.length - 1]![0]! },
  sourceSpan: { from: '1850', to: had[had.length - 1]![0]! },
  sources: [{
    maker: 'Met Office Hadley Centre',
    dataset: 'HadCRUT.5.0.2.0, global annual mean (© British Crown Copyright, Met Office)',
    url: 'https://www.metoffice.gov.uk/hadobs/hadcrut5/',
    licence: 'Open Government Licence v3',
    licenceUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    retrieved: '2026-10-26',
  }],
  measure: { basis: 'anomaly', base: 'the 1961–1990 average' },
  data: {
    columns: [{ key: 'year', label: 'Year', type: 'year' }, { key: 'anomaly', label: 'Global average temperature, difference from 1961–1990', type: 'number' }],
    rows: had.map(([y, v]) => [Number(y), Math.round(Number(v) * 100) / 100]),
  },
  encode: { x: 'year', y: 'anomaly' },
  options: { colour: 'diverging', midpoint: { value: 0, label: 'the 1961–1990 average' } },
});

// Ridgeline: May's daily highs, by decade.
const may = daily.filter((d) => d.date.slice(5, 7) === '05' && d.tmax !== null && Number(d.date.slice(0, 4)) >= 1940);
// The 2020s are not over: that ridge is labelled by the years it holds.
const decade = (y: number) => (y >= 2020 ? '2020–25' : `${Math.floor(y / 10) * 10}s`);
write('delhi-ridgeline-may', {
  form: 'ridgeline',
  title: 'Every May day’s high in Delhi, decade by decade',
  note: 'Each ridge holds every May day’s high in one decade. This is reanalysis, a model fitted to observations, not the station record.',
  ...base,
  span: { from: '1940', to: '2025' },
  sourceSpan: { from: '1940', to: '2025' },
  measure: { basis: 'absolute' },
  data: {
    columns: [{ key: 'decade', label: 'Decade', type: 'text' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'high', label: 'Daily high', type: 'number' }],
    rows: may.map((d) => [decade(Number(d.date.slice(0, 4))), d.date, d.tmax]),
  },
  encode: { series: 'decade', y: 'high' },
  options: { focus: ['2020–25'] },
});
console.log('wrote 5 fixtures');
