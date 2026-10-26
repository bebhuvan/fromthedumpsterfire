// Drawdowns, worked out once for the drawdown form and its gloss: each value over the highest value
// up to it, minus one, and the deepest fall (its peak, its low, and when the price got back above
// that peak, if it has). Pure functions on the rows, light enough for the app's glosses.

export interface DrawdownPoint {
  x: number;
  raw: string | number;
  v: number;
  peak: number;
  dd: number;
}

export interface Deepest {
  peak: number;
  trough: number;
  recovery: number | null;
}

export function drawdowns(rows: Array<{ x: number; raw: string | number; v: number }>): { pts: DrawdownPoint[]; deepest: Deepest | null } {
  const sorted = rows.filter((p) => p.v > 0).sort((a, b) => a.x - b.x);
  let peak = -Infinity;
  const pts = sorted.map((p) => {
    peak = Math.max(peak, p.v);
    return { ...p, peak, dd: p.v / peak - 1 };
  });
  if (!pts.length) return { pts, deepest: null };
  let trough = 0;
  pts.forEach((p, i) => p.dd < pts[trough]!.dd && (trough = i));
  if (pts[trough]!.dd >= 0) return { pts, deepest: null };
  let pk = trough;
  while (pk > 0 && pts[pk]!.v < pts[trough]!.peak) pk--;
  let recovery: number | null = null;
  for (let i = trough + 1; i < pts.length; i++)
    if (pts[i]!.v >= pts[trough]!.peak) {
      recovery = i;
      break;
    }
  return { pts, deepest: { peak: pk, trough, recovery } };
}
