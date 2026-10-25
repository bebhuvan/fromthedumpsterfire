// Waffle: parts of a whole as a grid of squares, in place of a pie. A hundred squares (each 1% of
// the total) or one per options.per units, rounded by largest remainder so they always add up.
// Parts run in contiguous columns in the categorical order; past five parts the smallest are folded
// into one quiet "other" block, and each folded part is still named with its own value.

import type { Paint, Scene, SceneNode } from '../scene';
import { Ctx, text } from '../frame';
import { formatNumber } from '../scales';
import { textWidth, wrapText } from '../text';
import { orderRows } from './category';

export interface WafflePart {
  name: string;
  value: number;
  squares: number;
  paint: Paint;
  /** For the folded block: the parts inside it. */
  parts?: Array<{ name: string; value: number }>;
}

/** Largest-remainder rounding of values to a whole number of units that add up to `total`. */
export function largestRemainder(values: number[], total: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]!++;
    left--;
  }
  return out;
}

const MAX_PARTS = 6;

/** The parts the waffle draws, in order, with their squares. */
export function waffleParts(ctx: Ctx): { parts: WafflePart[]; missing: string[]; per: number; total: number } {
  const rows = orderRows(ctx, ctx.rows, (r) => ctx.num(r, 'y'));
  const missing = rows.filter((r) => ctx.num(r, 'y') === null).map((r) => ctx.str(r, 'label'));
  let items = rows.filter((r) => ctx.num(r, 'y') !== null).map((r) => ({ name: ctx.str(r, 'label'), value: ctx.num(r, 'y')! }));
  const total = items.reduce((a, b) => a + b.value, 0);
  let folded: Array<{ name: string; value: number }> = [];
  if (items.length > MAX_PARTS) {
    // Fold the smallest parts, whatever the given order.
    const keep = new Set([...items].sort((a, b) => b.value - a.value).slice(0, MAX_PARTS - 1).map((x) => x.name));
    folded = items.filter((x) => !keep.has(x.name)).sort((a, b) => b.value - a.value);
    items = items.filter((x) => keep.has(x.name));
  }
  const per = ctx.chart.options?.per && ctx.chart.options.per > 0 ? ctx.chart.options.per : total / 100;
  const count = Math.max(1, Math.min(400, Math.round(total / per)));
  const values = [...items.map((x) => x.value), ...(folded.length ? [folded.reduce((a, b) => a + b.value, 0)] : [])];
  const squares = largestRemainder(values, count);
  const parts: WafflePart[] = items.map((x, i) => ({ ...x, squares: squares[i]!, paint: `cat${Math.min(5, i)}` as Paint }));
  if (folded.length) parts.push({ name: 'Other', value: values[values.length - 1]!, squares: squares[squares.length - 1]!, paint: 'quiet', parts: folded });
  return { parts, missing, per, total };
}

export function drawWaffle(ctx: Ctx): Scene {
  const W = ctx.W;
  const { parts, missing, per } = waffleParts(ctx);
  const count = parts.reduce((a, b) => a + b.squares, 0);
  const rowsN = 10;
  const cols = Math.max(1, Math.ceil(count / rowsN));
  const gap = 2;
  const unit = ctx.column('y')?.unit ?? (ctx.chart.units.trim().startsWith('%') ? '%' : '');
  const fmt = (v: number) => `${ctx.value(v)}${unit === '%' ? '%' : unit && unit.length <= 4 ? ` ${unit}` : ''}`;
  const keyText = per === undefined ? '' : ctx.chart.options?.per ? `Each square is ${formatNumber(per, 0, ctx.grouping)} ${ctx.chart.units}` : 'Each square is 1% of the total';

  // Wide: the grid on the left, the parts listed beside it. Narrow: the grid across, the list below.
  const listX = ctx.narrow ? 0 : undefined;
  const s = ctx.narrow ? Math.min(26, Math.floor((W - (cols - 1) * gap) / cols)) : Math.min(26, Math.floor((300 - (cols - 1) * gap) / cols));
  const gridW = cols * s + (cols - 1) * gap;
  const gridH = rowsN * s + (rowsN - 1) * gap;
  const nodes: SceneNode[] = [];
  const top = 4;
  let k = 0;
  for (const p of parts) {
    for (let j = 0; j < p.squares; j++, k++) {
      const c = Math.floor(k / rowsN);
      const r = k % rowsN;
      nodes.push({ t: 'rect', x: c * (s + gap), y: top + r * (s + gap), w: s, h: s, fill: p.paint, tip: `${p.name}: ${fmt(p.value)}` });
    }
  }

  // The list: a swatch, the name in ink, its value in ink2; folded parts named under "Other".
  const lx = listX ?? gridW + 32;
  const lw = W - lx;
  const size = ctx.s.label;
  const lh = size * 1.3;
  const keyY = top + gridH + 18;
  let y = ctx.narrow ? keyY + 30 : top + 6;
  const entries: Array<{ name: string; value: string; paint: Paint; sub?: string[] }> = parts.map((p) => ({
    name: p.name,
    value: fmt(p.value),
    paint: p.paint,
    ...(p.parts ? { sub: wrapText(p.parts.map((q) => `${q.name} ${fmt(q.value)}`).join(', '), 'sans', ctx.s.small, lw - 22) } : {}),
  }));
  const colsN = ctx.narrow && entries.length > 3 && !entries.some((e) => e.sub) ? 2 : 1;
  const colW = lw / colsN;
  let maxY = y;
  entries.forEach((e, i) => {
    const cx = lx + (i % colsN) * colW;
    const ey = colsN === 2 ? y + Math.floor(i / 2) * (lh + 8) : y;
    nodes.push({ t: 'rect', x: cx, y: ey - size * 0.8, w: 12, h: 12, fill: e.paint });
    const nameW = textWidth(e.name, 'sansMedium', size);
    nodes.push(text(cx + 20, ey + 1.5, e.name, 'sansMedium', size, 'ink'));
    nodes.push(text(cx + 20 + nameW + 8, ey + 1.5, e.value, 'sans', size, 'ink2'));
    let yy = ey;
    for (const line of e.sub ?? []) {
      yy += ctx.s.small * 1.3;
      nodes.push(text(cx + 20, yy + 1.5, line, 'sans', ctx.s.small, 'ink2'));
    }
    if (colsN === 1) y = yy + lh + 6;
    maxY = Math.max(maxY, yy + 6);
  });
  if (missing.length) {
    const lines = wrapText(`No data: ${missing.join(', ')}`, 'sans', ctx.s.small, lw - 4);
    let yy = Math.max(y, maxY + lh);
    for (const line of lines) {
      nodes.push(text(lx, yy, line, 'sans', ctx.s.small, 'ink2'));
      yy += ctx.s.small * 1.3;
    }
    maxY = yy;
  }
  // The key: what one square stands for, under the grid.
  if (keyText) nodes.push(text(0, keyY, keyText, 'sans', ctx.s.small, 'ink2'));
  const H = Math.max(keyY + 8, maxY + 8, colsN === 1 ? y : 0);
  return { width: W, height: Math.ceil(H), nodes };
}
