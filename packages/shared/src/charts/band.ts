// The temperature band's table, computed from a daily history (for the band form). The published
// chart carries this table, not the history: every number drawn is in it, and bandMethod() says how
// each column was made, in words a reader can check.
//
// For each calendar day of the chosen year (365 or 366 rows):
// - low, high: that day's own minimum and maximum, as recorded (missing stays missing).
// - normal_low, normal_high: the mean of the daily minimums (maximums) on that calendar day over the
//   years normalFrom to normalTo, rounded to 0.1. A mean needs values in at least half of the years
//   in the range that have that calendar day, else it is missing. 29 February is averaged over the
//   leap years in the range only (no borrowing from 28 February or 1 March).
// - record_low, record_high: the lowest minimum (highest maximum) on that calendar day in any year
//   from the first year of the history up to and including the chosen year. A day of the chosen year
//   whose value equals its record set (or equalled) that record.

import type { ChartData } from './types';

export interface DailyTemp {
  date: string;
  tmax: number | null;
  tmin: number | null;
}

export interface BandOptions {
  year: number;
  normalFrom: number;
  normalTo: number;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const round1 = (v: number) => Math.round(v * 10) / 10;

export function bandSummary(daily: DailyTemp[], opts: BandOptions): ChartData {
  const byDay = new Map<string, Array<{ y: number; tmax: number | null; tmin: number | null }>>();
  for (const d of daily) {
    const m = /^(\d{4})-(\d{2}-\d{2})$/.exec(d.date);
    if (!m) continue;
    const y = Number(m[1]);
    if (y > opts.year) continue;
    const key = m[2]!;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push({ y, tmax: d.tmax, tmin: d.tmin });
  }
  const yearsWith = (key: string) => {
    let n = 0;
    for (let y = opts.normalFrom; y <= opts.normalTo; y++) if (key !== '02-29' || isLeap(y)) n++;
    return n;
  };
  const rows: ChartData['rows'] = [];
  const start = Date.UTC(opts.year, 0, 1);
  const days = isLeap(opts.year) ? 366 : 365;
  for (let i = 0; i < days; i++) {
    const dt = new Date(start + i * 86_400_000);
    const key = `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    const date = `${opts.year}-${key}`;
    const hist = byDay.get(key) ?? [];
    const own = hist.find((h) => h.y === opts.year);
    const inNormal = hist.filter((h) => h.y >= opts.normalFrom && h.y <= opts.normalTo);
    const need = Math.ceil(yearsWith(key) / 2);
    const mean = (vals: number[]) => (vals.length >= need && vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null);
    const mins = hist.map((h) => h.tmin).filter((v): v is number => v !== null);
    const maxs = hist.map((h) => h.tmax).filter((v): v is number => v !== null);
    rows.push([
      date,
      own?.tmin ?? null,
      own?.tmax ?? null,
      mean(inNormal.map((h) => h.tmin).filter((v): v is number => v !== null)),
      mean(inNormal.map((h) => h.tmax).filter((v): v is number => v !== null)),
      mins.length ? Math.min(...mins) : null,
      maxs.length ? Math.max(...maxs) : null,
    ]);
  }
  return {
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'low', label: `Daily low, ${opts.year}`, type: 'number' },
      { key: 'high', label: `Daily high, ${opts.year}`, type: 'number' },
      { key: 'normal_low', label: `Normal low (${opts.normalFrom}–${opts.normalTo} average)`, type: 'number' },
      { key: 'normal_high', label: `Normal high (${opts.normalFrom}–${opts.normalTo} average)`, type: 'number' },
      { key: 'record_low', label: 'Record low', type: 'number' },
      { key: 'record_high', label: 'Record high', type: 'number' },
    ],
    rows,
  };
}

/** The encoding the band form needs for a bandSummary table. */
export const BAND_ENCODE = { x: 'date', lo: 'low', hi: 'high', normalLo: 'normal_low', normalHi: 'normal_high', recordLo: 'record_low', recordHi: 'record_high' } as const;

/** How the band's table was made, in plain words (machine text: it passes the style check). */
export function bandMethod(opts: BandOptions, firstYear: number): string {
  return (
    `Normal range: the average daily low and high on each calendar day over ${opts.normalFrom}–${opts.normalTo}, rounded to 0.1. ` +
    `29 February is averaged over the leap years in that range. ` +
    `Records: the lowest low and highest high on each calendar day from ${firstYear} to ${opts.year}; ` +
    `a marked day of ${opts.year} set or equalled its record.`
  );
}
