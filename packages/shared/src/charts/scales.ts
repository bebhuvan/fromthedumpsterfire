// Scales, ticks and number formats for the chart kit. Pure functions, no DOM.

export type Scale = ((v: number) => number) & { domain: [number, number]; range: [number, number]; log: boolean };

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + (v - d0) * k)) as Scale;
  f.domain = domain;
  f.range = range;
  f.log = false;
  return f;
}

export function logScale(domain: [number, number], range: [number, number]): Scale {
  const l = linear([Math.log10(domain[0]), Math.log10(domain[1])], range);
  const f = ((v: number) => l(Math.log10(v))) as Scale;
  f.domain = domain;
  f.range = range;
  f.log = true;
  return f;
}

/** Steps of 1, 2, 2.5 or 5 times a power of ten: the ticks a person would draw. */
export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** A domain widened to whole steps, and the ticks inside it. */
export function niceTicks(min: number, max: number, count = 5): { domain: [number, number]; ticks: number[]; step: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { domain: [0, 1], ticks: [0, 1], step: 1 };
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(roundTo(v, step));
  return { domain: [lo, hi], ticks, step };
}

const roundTo = (v: number, step: number) => {
  const d = decimalsFor(step);
  return Number(v.toFixed(Math.min(12, d + 2)));
};

/** Powers of ten (and 2 and 5 between them when the range is short). */
export function logTicks(min: number, max: number): { domain: [number, number]; ticks: number[] } {
  const e0 = Math.floor(Math.log10(min));
  const e1 = Math.ceil(Math.log10(max));
  const ticks: number[] = [];
  const mult = e1 - e0 <= 2 ? [1, 2, 5] : [1];
  for (let e = e0; e <= e1; e++) for (const m of mult) ticks.push(m * 10 ** e);
  const inside = ticks.filter((t) => t >= min * 0.999 && t <= max * 1.001);
  const lo = Math.max(...ticks.filter((t) => t <= min * 1.0001), 10 ** e0);
  const hi = Math.min(...ticks.filter((t) => t >= max * 0.9999), 10 ** e1);
  return { domain: [lo, hi], ticks: [...new Set([lo, ...inside, hi])].sort((a, b) => a - b) };
}

/** Decimal places a step needs (0.25 needs 2, 5 needs 0). */
export function decimalsFor(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  for (let d = 0; d < 8; d++) if (Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) < 1e-6) return d;
  return 8;
}

export type Grouping = 'international' | 'indian';

/**
 * A number as the chart prints it: grouped digits (Indian grouping, 12,34,567, when the chart is in
 * rupees), a typographic minus (an en dash, which every chart face has), fixed decimals.
 */
export function formatNumber(v: number, decimals = 0, grouping: Grouping = 'international'): string {
  const neg = v < 0 && Math.abs(v) >= 0.5 * 10 ** -decimals;
  const abs = Math.abs(v).toFixed(decimals);
  const [int, frac] = abs.split('.') as [string, string | undefined];
  let g: string;
  if (grouping === 'indian' && int.length > 3) {
    const last = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    g = `${rest},${last}`;
  } else g = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '–' : ''}${g}${frac ? `.${frac}` : ''}`;
}

/** Compact tick labels for big numbers: 2.5k, 40m, 1.2bn (or lakh and crore for rupees). */
export function formatCompact(v: number, step: number, grouping: Grouping = 'international'): string {
  const abs = Math.abs(v);
  // [threshold, divisor, suffix]: thousands are written out up to 9,999, then 10k.
  const units: Array<[number, number, string]> =
    grouping === 'indian'
      ? [
          [1e7, 1e7, ' cr'],
          [1e5, 1e5, ' lakh'],
        ]
      : [
          [1e12, 1e12, 'tn'],
          [1e9, 1e9, 'bn'],
          [1e6, 1e6, 'm'],
          [1e4, 1e3, 'k'],
        ];
  for (const [t, n, suffix] of units) {
    if (abs >= t && Math.abs(step) >= n / 100) {
      const d = Math.max(0, decimalsFor(step / n));
      return `${formatNumber(v / n, Math.min(d, 2), grouping)}${suffix}`;
    }
  }
  return formatNumber(v, decimalsFor(step), grouping);
}

// ---------------------------------------------------------------- time

const DAY = 86_400_000;
const DATE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

/** Days since 1970-01-01 for YYYY-MM-DD (or the first of the month for YYYY-MM). */
export function dayNumber(s: string): number {
  const m = DATE.exec(s);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? 1)) / DAY;
}

export function dateOfDay(n: number): { y: number; m: number; d: number; dow: number } {
  const dt = new Date(n * DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate(), dow: dt.getUTCDay() };
}

/** A date as a decimal year (2024-07-02 is about 2024.5), so dates and years share one axis. */
export function decimalYear(s: string): number {
  const n = dayNumber(s);
  if (!Number.isFinite(n)) return NaN;
  const y = dateOfDay(n).y;
  const start = Date.UTC(y, 0, 1) / DAY;
  const end = Date.UTC(y + 1, 0, 1) / DAY;
  return y + (n - start) / (end - start);
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Year ticks on a decimal-year axis: every 1, 2, 5, 10, 20, 25, 50 or 100 years. */
export function yearTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = steps.find((s) => span / s <= count) ?? 1000;
  const out: number[] = [];
  for (let y = Math.ceil(min / step - 1e-9) * step; y <= max + 1e-9; y += step) out.push(y);
  return out;
}

/** Month ticks (first of each month, every k months) on a day-number axis. */
export function monthTicks(minDay: number, maxDay: number, count: number): Array<{ day: number; label: string; year: number; month: number }> {
  const a = dateOfDay(minDay);
  const months = Math.max(1, Math.round((maxDay - minDay) / 30.4));
  const every = [1, 2, 3, 4, 6, 12].find((k) => months / k <= count) ?? 12;
  const out: Array<{ day: number; label: string; year: number; month: number }> = [];
  let y = a.y;
  let m = a.m;
  if (Date.UTC(y, m, 1) / DAY < minDay) m++;
  for (let guard = 0; guard < 400; guard++) {
    if (m > 11) {
      m -= 12;
      y++;
    }
    const day = Date.UTC(y, m, 1) / DAY;
    if (day > maxDay) break;
    if (m % every === 0) out.push({ day, label: MONTHS[m]!, year: y, month: m });
    m++;
  }
  return out;
}

/** Format an x value of a time column for labels: years as they are, dates as "12 Mar 2024". */
export function formatTime(v: string | number, type: 'year' | 'date' | 'number'): string {
  if (type === 'date' && typeof v === 'string') {
    const n = dayNumber(v);
    if (!Number.isFinite(n)) return v;
    const d = dateOfDay(n);
    return /^\d{4}-\d{2}$/.test(v) ? `${MONTHS[d.m]} ${d.y}` : `${d.d} ${MONTHS[d.m]} ${d.y}`;
  }
  return String(v);
}
