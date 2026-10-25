import { describe, expect, it } from 'vitest';
import { bandMethod, bandSummary, type DailyTemp } from './band';
import { checkStyle } from '../style';

/** A history where every day's high is year/100 + month and low is that minus 10 (predictable). */
function history(from: number, to: number, f: (y: number, m: number, d: number) => [number | null, number | null] = (y, m) => [y / 100 + m, y / 100 + m - 10]): DailyTemp[] {
  const out: DailyTemp[] = [];
  for (let t = Date.UTC(from, 0, 1); t < Date.UTC(to + 1, 0, 1); t += 86_400_000) {
    const dt = new Date(t);
    const [tmax, tmin] = f(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    out.push({ date: dt.toISOString().slice(0, 10), tmax, tmin });
  }
  return out;
}

const col = (data: ReturnType<typeof bandSummary>, key: string) => data.columns.findIndex((c) => c.key === key);

describe('bandSummary', () => {
  it('has one row per day of the chosen year, with that day’s own values', () => {
    const data = bandSummary(history(1990, 2023), { year: 2023, normalFrom: 1991, normalTo: 2020 });
    expect(data.rows).toHaveLength(365);
    expect(data.rows[0]![0]).toBe('2023-01-01');
    expect(data.rows[0]![col(data, 'high')]).toBeCloseTo(20.23 + 1);
    expect(data.rows[0]![col(data, 'low')]).toBeCloseTo(20.23 + 1 - 10);
  });

  it('averages the normal years only, rounded to 0.1', () => {
    const data = bandSummary(history(1980, 2024), { year: 2024, normalFrom: 1991, normalTo: 2020 });
    // Mean of y/100 over 1991..2020 is 20.055; plus month 1 is 21.055, rounded 21.1.
    expect(data.rows[0]![col(data, 'normal_high')]).toBe(21.1);
    expect(data.rows[0]![col(data, 'normal_low')]).toBe(11.1);
  });

  it('takes records from the first year up to and including the chosen year, never after', () => {
    const data = bandSummary(history(1980, 2025), { year: 2010, normalFrom: 1991, normalTo: 2000 });
    // Highs rise every year, so the record high is the chosen year's own; the record low is 1980's.
    expect(data.rows[40]![col(data, 'record_high')]).toBeCloseTo(20.1 + 2);
    expect(data.rows[40]![col(data, 'record_low')]).toBeCloseTo(19.8 + 2 - 10);
  });

  it('gives a leap year 366 rows and averages 29 February over the leap years only', () => {
    const data = bandSummary(
      history(1991, 2024, (y, m, d) => (m === 2 && d === 29 ? [100 + y / 100, 0] : [10, 0])),
      { year: 2024, normalFrom: 1991, normalTo: 2020 },
    );
    expect(data.rows).toHaveLength(366);
    const feb29 = data.rows.find((r) => r[0] === '2024-02-29')!;
    // Leap years 1992..2020: mean of y/100 is 20.06; never mixed with 28 February's 10.
    expect(feb29[col(data, 'normal_high')]).toBe(120.1);
    expect(data.rows.find((r) => r[0] === '2024-02-28')![col(data, 'normal_high')]).toBe(10);
  });

  it('keeps missing values missing and needs half the normal years for a normal', () => {
    const data = bandSummary(
      history(1991, 2021, (y, m, d) => {
        if (y === 2021 && m === 3 && d === 1) return [null, null];
        if (m === 4 && d === 1 && y <= 2006) return [null, null]; // 16 of 30 normal years missing
        return [30, 20];
      }),
      { year: 2021, normalFrom: 1991, normalTo: 2020 },
    );
    const mar1 = data.rows.find((r) => r[0] === '2021-03-01')!;
    expect(mar1[col(data, 'high')]).toBeNull();
    expect(mar1[col(data, 'low')]).toBeNull();
    expect(mar1[col(data, 'normal_high')]).toBe(30);
    const apr1 = data.rows.find((r) => r[0] === '2021-04-01')!;
    expect(apr1[col(data, 'normal_high')]).toBeNull();
    expect(apr1[col(data, 'record_high')]).toBe(30);
  });

  it('describes its method in plain machine prose that passes the style check', () => {
    const m = bandMethod({ year: 2024, normalFrom: 1991, normalTo: 2020 }, 1940);
    expect(m).toContain('1991–2020');
    expect(m).toContain('1940 to 2024');
    expect(checkStyle(m).issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});
