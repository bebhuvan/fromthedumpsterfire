// Where the fingerprint's pieces sit on a phone. The marks and ticks come from @fdf/shared/fingerprint
// (columns 0..92 on a 100-column line); this turns columns into points for a measured width, so the
// cover draws the same fingerprint as the website with absolutely placed views.

import type { Fingerprint } from '@fdf/shared/fingerprint';

/** Sizes, in points, matching the website's fingerprint (global.css .fp-*). */
export const FP = {
  /** The number above each square. */
  label: 12,
  labelGap: 5,
  square: 14,
  /** Stem under the square in lane 0; each higher lane adds `lift`, enough that a lifted square
   * clears the number of a mark in the lane below (16 + 34 > 12 + 5 + 14 + 16). */
  stem: 16,
  lift: 34,
  axis: 1.5,
  /** Year labels under the line. */
  tickW: 44,
} as const;

export interface MarkBox {
  n: number;
  /** x of the stem (the year's exact place on the line). */
  x: number;
  /** Total height from the label's top to the line. */
  height: number;
  stem: number;
  /** The number's box, for overlap checks: left edge and width. */
  labelLeft: number;
  labelWidth: number;
  lane: number;
}

/** A box in points, measured up from the line: x from the left, y0 to y1 above the line. */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** What a mark draws: its number, its square and its stem, for overlap checks. */
export function markBoxes(m: MarkBox): { label: Box; square: Box; stem: Box } {
  return {
    label: { x0: m.labelLeft, x1: m.labelLeft + m.labelWidth, y0: m.height - FP.label, y1: m.height },
    square: { x0: m.x - 6.5, x1: m.x + 7.5, y0: m.stem, y1: m.stem + FP.square },
    stem: { x0: m.x, x1: m.x + 1, y0: 0, y1: m.stem },
  };
}

/** A year's text is about 30pt wide at 12.5px; this is its span inside the tick box. */
const YEAR_W = 30;
const TICK_AIR = 4;
const tickText = (left: number, align: 'left' | 'right' | 'center'): [number, number] =>
  align === 'left' ? [left, left + YEAR_W] : align === 'right' ? [left + FP.tickW - YEAR_W, left + FP.tickW] : [left + (FP.tickW - YEAR_W) / 2, left + (FP.tickW + YEAR_W) / 2];

export const colX = (at: number, width: number) => (at / 100) * width;

/** Width of a two-digit label at 12px in the sans (tabular figures), with a little air. */
const LABEL_W = 16;

/**
 * Least distance between two stems, in points: a number reaches 10.4pt right of its stem, so a
 * neighbour's stem must start beyond it. The shared NUDGE (3 columns) is about 11pt on a 360pt line
 * but less on a narrow phone, so the app enforces it in points too.
 */
const MIN_APART = 11.5;

export function fpGeometry(fp: Fingerprint, width: number) {
  // Columns to points, then the same nudge as the shared fingerprint, in points: push right, and if
  // that runs past the line's last place, back left.
  const order = [...fp.marks].sort((a, b) => a.at - b.at || a.n - b.n);
  const xs = new Map(order.map((m) => [m.n, colX(m.at, width)]));
  const end = colX(92, width);
  for (let i = 1; i < order.length; i++) xs.set(order[i]!.n, Math.max(xs.get(order[i]!.n)!, xs.get(order[i - 1]!.n)! + MIN_APART));
  for (let i = order.length - 1; i >= 0; i--) xs.set(order[i]!.n, Math.min(xs.get(order[i]!.n)!, end - (order.length - 1 - i) * MIN_APART));
  const marks: MarkBox[] = fp.marks.map((m) => {
    const x = xs.get(m.n)!;
    const stem = FP.stem + FP.lift * m.lane;
    // The number sits a little left of the stem, as on the web (translateX(-35%)).
    return { n: m.n, x, stem, height: FP.label + FP.labelGap + FP.square + stem, labelLeft: x - LABEL_W * 0.35, labelWidth: LABEL_W, lane: m.lane };
  });
  const height = Math.max(40, ...marks.map((m) => m.height));
  const placed = fp.ticks.map((t, i) => {
    const x = colX(t.at, width);
    const end = i === fp.ticks.length - 1;
    const start = t.at === 0;
    // Ends are flush with the line's ends; the rest are centred on their year.
    const left = start ? 0 : end ? width - FP.tickW : x - FP.tickW / 2;
    const align = (start ? 'left' : end ? 'right' : 'center') as 'left' | 'right' | 'center';
    return { year: t.year, left, align, end, text: tickText(left, align) };
  });
  // The shared ticks are spaced for the web's 360px line; on a narrower phone a middle year whose
  // text would meet a neighbour's is dropped (the ends always stay).
  const ticks: typeof placed = [];
  const last = placed[placed.length - 1];
  for (const t of placed) {
    const prev = ticks[ticks.length - 1];
    const clearsPrev = !prev || t.text[0] > prev.text[1] + TICK_AIR;
    const clearsEnd = t === last || !last || t.text[1] + TICK_AIR < last.text[0];
    if (t === placed[0] || t === last || (clearsPrev && clearsEnd)) ticks.push(t);
  }
  return { marks, ticks, height };
}
