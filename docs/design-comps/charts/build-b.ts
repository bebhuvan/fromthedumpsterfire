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

// Calendar: each day's high in 2024.
const y2024 = daily.filter((d) => d.date.startsWith('2024-'));
write('delhi-calendar-2024', {
  form: 'calendar',
  title: 'Every day of 2024 in Delhi, by its high',
  ...base,
  span: { from: '2024-01-01', to: '2024-12-31' },
  measure: { basis: 'absolute' },
  data: { columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'high', label: 'Daily high', type: 'number' }], rows: y2024.map((d) => [d.date, d.tmax]) },
  encode: { x: 'date', y: 'high' },
  options: { colour: 'sequential' },
});

// Heatmap: mean daily high by month and year, 1950–2025 (one decimal).
const monthly = new Map<string, number[]>();
for (const d of daily) {
  const y = Number(d.date.slice(0, 4));
  if (y < 1950 || d.tmax === null) continue;
  const k = d.date.slice(0, 7);
  if (!monthly.has(k)) monthly.set(k, []);
  monthly.get(k)!.push(d.tmax);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hrows: Array<[number, string, number]> = [];
for (const [k, v] of monthly) hrows.push([Number(k.slice(0, 4)), MONTHS[Number(k.slice(5, 7)) - 1]!, Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10]);
write('delhi-heatmap-months', {
  form: 'heatmap',
  title: 'Seventy-six years of Delhi’s months, by their average high',
  ...base,
  span: { from: '1950', to: '2025' },
  sourceSpan: { from: '1940', to: '2025' },
  measure: { basis: 'absolute' },
  method: 'Each cell is the average of that month’s daily highs, rounded to 0.1. The chart starts in 1950; the source runs from 1940.',
  data: { columns: [{ key: 'year', label: 'Year', type: 'year' }, { key: 'month', label: 'Month', type: 'text' }, { key: 'high', label: 'Average daily high', type: 'number' }], rows: hrows },
  encode: { x: 'year', label: 'month', y: 'high' },
  options: { colour: 'sequential', sort: 'given' },
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
console.log('wrote 4 fixtures');
