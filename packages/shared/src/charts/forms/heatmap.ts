// Heatmap: a value for every pair of two categories (month by year, say). Rows are named on the left,
// columns along the top (years thinned to round ones); cells sit on the sequential ramp (or the
// diverging ramp around a stated midpoint) with a hairline of ground between them, and a cell with
// no value is drawn as missing. Rows keep the order they first appear in, or go by their average
// when the editor asks for options.sort "value". On a phone a long, short table (dozens of years by
// twelve months) turns on its side, as a printed table would: the many columns run down the page so
// every cell stays big enough to read. With options.values each cell also prints its value where it
// fits (a calendar of monthly returns), in the colour that reads on its fill.

import { labelOn, type Scene, type SceneNode } from '../scene';
import { Ctx, shortUnit, text } from '../frame';
import { drawKey, rampFor } from '../ramp';
import { textWidth } from '../text';

export function drawHeatmap(ctx: Ctx): Scene {
  const colType = ctx.column('x')?.type;
  let cols = ctx.groups('x');
  if (colType === 'year' || cols.every((c) => /^-?\d+(\.\d+)?$/.test(c))) cols.sort((a, b) => Number(a) - Number(b));
  let rows = ctx.groups('label');
  const cells = new Map<string, number | null>();
  for (const r of ctx.rows) cells.set(`${ctx.str(r, 'label')}\u0000${ctx.str(r, 'x')}`, ctx.num(r, 'y'));
  if (ctx.chart.options?.sort === 'value') {
    const mean = (row: string) => {
      const v = cols.map((c) => cells.get(`${row}\u0000${c}`)).filter((x): x is number => typeof x === 'number');
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -Infinity;
    };
    rows = [...rows].sort((a, b) => mean(b) - mean(a));
  }
  const values = [...cells.values()].filter((v): v is number => v !== null);
  const ramp = rampFor(ctx, values.length ? values : [0]);
  const W = ctx.W;
  const size = ctx.s.tick;
  // A phone figure of a long, short table: years down the page, the few categories across.
  const turned = ctx.narrow && cols.length > 24 && rows.length <= 16;
  const valueAt = (row: string, col: string) => {
    const k = turned ? `${col}\u0000${row}` : `${row}\u0000${col}`;
    return cells.has(k) ? cells.get(k)! : null;
  };
  if (turned) [rows, cols] = [cols, rows];
  const numericRows = turned && (colType === 'year' || rows.every((c) => /^-?\d+$/.test(c)));
  const numericCols = !turned && (colType === 'year' || cols.every((c) => /^-?\d+$/.test(c)));

  const left = Math.ceil(Math.max(...rows.map((r) => textWidth(r, 'sans', size)))) + 8;
  const top = size + 8;
  const avail = W - left;
  const rawPitch = avail / Math.max(1, cols.length);
  // Columns keep a hairline of ground between them while there is room for one; rows always do.
  const gap = rawPitch >= 12 ? 2 : rawPitch >= 6 ? 1 : 0;
  const cw = rawPitch - gap;
  // Rows are as tall as the columns are wide while that is small; with few columns they stop at a
  // comfortable height (taller when values are printed in the cells).
  const rowCap = ctx.chart.options?.values ? (ctx.narrow ? 22 : 30) : ctx.narrow ? 20 : 26;
  const rowPitch = turned ? Math.max(8, Math.min(14, Math.floor(rawPitch * 0.42))) : Math.max(Math.min(rawPitch, rowCap), ctx.narrow ? 15 : 19);
  const rgap = rowPitch >= 10 ? 2 : 1;
  const ch = rowPitch - rgap;
  const nodes: SceneNode[] = [];
  let missing = false;
  const unit = ctx.chart.units;
  const showValues = Boolean(ctx.chart.options?.values);
  // Differences from a midpoint of zero read as changes, so they carry their sign.
  const signed = ramp.kind === 'diverging' && (ramp.midpoint?.value ?? 0) === 0;
  // One size for every value, stepped down until all of them fit; if even the smallest cannot, none is
  // printed (the table under the chart holds them), rather than leaving some out.
  let vSize = ctx.narrow ? 9.5 : 10.5;
  if (showValues) {
    const all = [...cells.values()].filter((v): v is number => v !== null).map((v) => `${signed && v > 0 ? '+' : ''}${ctx.value(v)}`);
    const widest = (sz: number) => Math.max(0, ...all.map((sv) => textWidth(sv, 'sans', sz)));
    while (vSize > 7.5 && widest(vSize) > cw - 3) vSize -= 0.5;
  }
  const valuesFit = showValues && ch >= vSize + 3 && [...cells.values()].every((v) => v === null || textWidth(`${signed && v > 0 ? '+' : ''}${ctx.value(v)}`, 'sans', vSize) <= cw - 3);

  // Column labels: all of them when they fit; for years, round years spaced to fit.
  const widest = Math.max(...cols.map((c) => textWidth(c, 'sans', size))) + 6;
  let shown: Set<string>;
  if (widest <= rawPitch) shown = new Set(cols);
  else if (numericCols) {
    const need = widest / rawPitch;
    const step = [2, 5, 10, 20, 25, 50, 100].find((s) => s >= need) ?? 100;
    shown = new Set(cols.filter((c) => Number(c) % step === 0));
  } else {
    const every = Math.ceil(widest / rawPitch);
    shown = new Set(cols.filter((_, i) => i % every === 0));
  }
  cols.forEach((c, j) => {
    if (!shown.has(c)) return;
    const x = left + j * rawPitch;
    const anchor = rawPitch >= widest ? 'middle' : 'start';
    if (anchor === 'start' && x + widest - 6 > W) return;
    nodes.push(text(anchor === 'middle' ? x + cw / 2 : x, top - 7, c, 'sans', size, 'ink2', anchor));
    if (anchor === 'start') nodes.push({ t: 'line', x1: x + 0.5, x2: x + 0.5, y1: top - 4, y2: top - 1, stroke: 'ink2', sw: 1 });
  });

  // Row labels: every row when they fit; when the rows are years run down a phone, round years only.
  const rowEvery = numericRows ? ([1, 2, 5, 10, 20, 25, 50].find((s) => s * rowPitch >= size + 4) ?? 50) : 1;
  rows.forEach((row, i) => {
    const y = top + i * rowPitch;
    if (!numericRows || Number(row) % rowEvery === 0) nodes.push(text(left - 8, y + ch / 2 + size * 0.36, row, 'sans', size, 'ink2', 'end'));
    cols.forEach((c, j) => {
      const x = left + j * rawPitch;
      const v = valueAt(row, c);
      const [rn, cn] = turned ? [c, row] : [row, c];
      if (v === null) {
        missing = true;
        if (cw >= 4) nodes.push({ t: 'rect', x: x + 0.5, y: y + 0.5, w: cw - 1, h: ch - 1, stroke: 'rule', sw: 1, tip: `${rn}, ${cn}: no data` });
        return;
      }
      const fill = ramp.paint(v);
      nodes.push({ t: 'rect', x, y, w: cw + (gap === 0 ? 0.4 : 0), h: ch, fill, tip: `${rn}, ${cn}: ${ctx.value(v)} ${unit}` });
      // The value in its cell (a calendar-returns grid), when asked and where it fits.
      if (valuesFit) nodes.push(text(x + cw / 2, y + ch / 2 + vSize * 0.35, `${signed && v > 0 ? '+' : ''}${ctx.value(v)}`, 'sans', vSize, labelOn(fill), 'middle'));
    });
  });

  const keyY = top + rows.length * rowPitch + 14;
  const key = drawKey(ctx, ramp, left, keyY, ctx.narrow ? W - left : Math.min(W - left, 360), { unit: shortUnit(unit) ?? '', missing });
  nodes.push(...key.nodes);
  return { width: W, height: Math.ceil(keyY + key.height + 2), nodes };
}
