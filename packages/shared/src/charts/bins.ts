// Histogram bins, worked out the same way wherever they are needed (the histogram and its gloss): a
// round width (1, 2, 2.5 or 5 times a power of ten) near the Freedman-Diaconis width, so there are
// between 6 and 30 bars, starting at a round number at or below the smallest value. A value on an
// edge counts in the band above it, and the largest value always has a band.

export interface Bins {
  width: number;
  start: number;
  counts: number[];
  /** The band a value falls in. */
  index(v: number): number;
}

const NICE = [1, 2, 2.5, 5];

function niceNear(w: number): number {
  const p = 10 ** Math.floor(Math.log10(w));
  let best = p;
  for (const m of [...NICE, 10]) if (Math.abs(Math.log(m * p) - Math.log(w)) < Math.abs(Math.log(best) - Math.log(w))) best = m * p;
  return best;
}

export function bins(values: number[]): Bins {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const n = v.length;
  const min = v[0] ?? 0;
  const max = v[n - 1] ?? 1;
  const q = (p: number) => (n ? v[Math.min(n - 1, Math.max(0, Math.round((n - 1) * p)))]! : 0);
  const iqr = q(0.75) - q(0.25);
  const range = max - min || 1;
  let width = niceNear(iqr > 0 ? (2 * iqr) / Math.cbrt(Math.max(1, n)) : range / 10);
  // Keep the count of bars between 6 and 30.
  const count = (w: number) => Math.floor(max / w + 1e-9) - Math.floor(min / w + 1e-9) + 1;
  for (let guard = 0; guard < 20 && count(width) > 30; guard++) width = niceNear(width * 1.6);
  for (let guard = 0; guard < 20 && count(width) < 6 && width > 1e-9; guard++) width = niceNear(width / 1.6);
  const start = Math.floor(min / width + 1e-9) * width;
  const k = count(width);
  const index = (x: number) => Math.max(0, Math.min(k - 1, Math.floor((x - start) / width + 1e-9)));
  const counts = new Array<number>(k).fill(0);
  for (const x of v) counts[index(x)]!++;
  return { width, start: Number(start.toFixed(10)), counts, index };
}
