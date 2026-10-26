// Bars: amounts compared. Categories run as horizontal bars (label column on the left, the value at
// each bar's tip); years run as columns along a time axis. Every bar starts at zero. Square ends,
// a gap of ground between touching columns, uncertainty as a whisker, small samples hollow, a
// missing value said in words where its bar would be.

import type { Annotation, Cell } from '../types';
import type { Paint, Scene, SceneNode } from '../scene';
import { Ctx, drawCallouts, drawPeriods, drawYAxis, halo, hline, text, vline, yLabelWidth, shortUnit, annotX } from '../frame';
import { formatTime, linear, niceTicks, yearTicks } from '../scales';
import { textWidth, wrapText } from '../text';
import { tightAxis } from './area';
import { drawRowLabel, drawValueAxisTop, labelColumn, orderRows, whisker } from './category';

const SMALL_N = 30;

/** The paint for a bar: diverging by sign around the midpoint, else focus (edition ink) and quiet. */
function barPaint(ctx: Ctx, name: string, all: string[], v: number | null): Paint {
  if (ctx.colour === 'diverging' && v !== null) {
    const mid = ctx.chart.options?.midpoint?.value ?? 0;
    return v >= mid ? 'div8' : 'div2';
  }
  // One series: every bar is the loud thing unless the editor picked some.
  return ctx.chart.options?.focus?.length ? ctx.paintFor(name, all) : 'ed';
}

const isFocus = (ctx: Ctx, name: string) => Boolean(ctx.chart.options?.focus?.includes(name));

export function drawBar(ctx: Ctx): Scene {
  return ctx.has('label') ? drawHorizontal(ctx) : drawColumns(ctx);
}

function drawHorizontal(ctx: Ctx): Scene {
  const W = ctx.W;
  const rows = orderRows(ctx, ctx.rows, (r) => ctx.num(r, 'y'));
  const names = rows.map((r) => ctx.str(r, 'label'));
  const labels = labelColumn(ctx, names, (l) => isFocus(ctx, l));
  const vals: number[] = [0];
  for (const r of rows) for (const role of ['y', 'lo', 'hi'] as const) {
    const v = ctx.num(r, role);
    if (v !== null) vals.push(v);
  }
  const neg = Math.min(...vals) < 0;
  const t = niceTicks(Math.min(...vals), Math.max(...vals), ctx.narrow ? 3 : 5);
  const valueW = Math.max(textWidth('no data', 'sans', ctx.s.small), ...rows.map((r) => {
    const v = ctx.num(r, 'y');
    return v === null ? 0 : textWidth(ctx.value(v), isFocus(ctx, ctx.str(r, 'label')) ? 'sansMedium' : 'sans', ctx.s.label);
  }));
  const lh = ctx.s.label * 1.18;
  const pitch = Math.max(ctx.narrow ? 28 : 30, labels.maxLines * lh + 10);
  const th = Math.min(22, pitch - 8);
  const top = ctx.s.tick + 14;
  const x0 = labels.width + 14 + (neg ? valueW + 8 : 0);
  // When the whiskers run past the last tick, the value label still needs its room.
  const x1 = W - valueW - 12;
  const sx = linear(t.domain, [x0, x1]);
  const H = top + rows.length * pitch + 8;
  const unit = shortUnit(ctx.chart.units);
  const nodes: SceneNode[] = [];
  nodes.push(...drawValueAxisTop(ctx, sx, t.ticks, t.step, top, H - 6, unit));
  const z = sx(0);
  rows.forEach((r, i) => {
    const name = names[i]!;
    const yc = top + i * pitch + pitch / 2;
    const v = ctx.num(r, 'y');
    const focus = isFocus(ctx, name);
    nodes.push(...drawRowLabel(ctx, labels.lines.get(name)!, labels.width + 6, yc, focus));
    if (v === null) {
      nodes.push(text(z + 6, yc + ctx.s.small * 0.35, 'no data', 'sans', ctx.s.small, 'ink2'));
      return;
    }
    const paint = barPaint(ctx, name, names, v);
    const n = ctx.num(r, 'n');
    const hollow = n !== null && n < SMALL_N;
    const xa = Math.min(z, sx(v));
    const w = Math.abs(sx(v) - z);
    const tip = `${name}: ${ctx.value(v)} ${ctx.chart.units}${n !== null ? ` (n = ${n})` : ''}`;
    nodes.push(hollow ? { t: 'rect', x: xa + 0.75, y: yc - th / 2 + 0.75, w: Math.max(0, w - 1.5), h: th - 1.5, stroke: paint, sw: 1.5, tip } : { t: 'rect', x: xa, y: yc - th / 2, w, h: th, fill: paint, tip });
    const lo = ctx.num(r, 'lo');
    const hi = ctx.num(r, 'hi');
    let end = v >= 0 ? sx(v) : sx(v);
    if (lo !== null && hi !== null) {
      nodes.push(...whisker(sx(lo), sx(hi), yc, 'ink'));
      end = v >= 0 ? Math.max(end, sx(hi)) : Math.min(end, sx(lo));
    }
    const label = ctx.value(v);
    nodes.push(halo(v >= 0 ? end + 6 : end - 6, yc + ctx.s.label * 0.35, label, focus ? 'sansMedium' : 'sans', ctx.s.label, focus ? 'ink' : 'ink2', v >= 0 ? 'start' : 'end'));
  });
  nodes.push(vline(Math.round(z) + 0.5, top, H - 6, 'ink'));
  // A reference rule on the value axis, drawn vertically.
  for (const a of ctx.chart.annotations ?? []) {
    if (a.kind !== 'rule' || typeof a.value !== 'number') continue;
    const x = sx(a.value);
    if (x < x0 - 1 || x > x1 + 1) continue;
    nodes.push(vline(x, top, H - 6, 'ink2', 1));
    const face = a.by === 'editor' ? 'serifItalic' : 'sans';
    const size = a.by === 'editor' ? ctx.s.note - 1 : ctx.s.small;
    const right = x + 6 + textWidth(a.text, face, size) < W;
    nodes.push(text(right ? x + 5 : x - 5, H + size, a.text, face, size, a.by === 'editor' ? 'ink' : 'mach', right ? 'start' : 'end'));
  }
  const hasRuleText = (ctx.chart.annotations ?? []).some((a) => a.kind === 'rule' && typeof a.value === 'number');
  return { width: W, height: H + (hasRuleText ? ctx.s.note + 6 : 0), nodes };
}

/** The same chart with only some of its annotations, for handing the rest to the shared layer. */
export function withAnnotations(ctx: Ctx, keep: (a: Annotation) => boolean): Ctx {
  const c = Object.assign(Object.create(Object.getPrototypeOf(ctx)) as Ctx, ctx);
  Object.defineProperty(c, 'chart', { value: { ...ctx.chart, annotations: (ctx.chart.annotations ?? []).filter(keep) } });
  return c;
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * An annotation set beside a mark (a column's end, a bar's tip): left or right of it, else above or
 * below, whichever lands clear of the other marks and inside the plot. No leader is needed.
 */
export function besideMark(ctx: Ctx, a: Extract<Annotation, { kind: 'point' }>, x: number, y: number, halfW: number, taken: Box[], plot: { x0: number; x1: number; y0: number; y1: number }): SceneNode[] {
  const face = a.by === 'editor' ? 'serifItalic' : 'sans';
  const paint: Paint = a.by === 'editor' ? 'ink' : 'mach';
  const size = a.by === 'editor' ? ctx.s.note : ctx.s.small + 0.5;
  const lh = size * 1.22;
  const lines = wrapText(a.text, face, size, ctx.narrow ? 120 : 170);
  const w = Math.max(...lines.map((s) => textWidth(s, face, size)));
  const h = lines.length * lh;
  const cands = [
    { bx: x - halfW - 8 - w, by: y - h / 2, anchor: 'end' as const },
    { bx: x + halfW + 8, by: y - h / 2, anchor: 'start' as const },
    { bx: x - w / 2, by: y - h - 10, anchor: 'middle' as const },
    { bx: x - w / 2, by: y + 10, anchor: 'middle' as const },
  ];
  const score = (c: { bx: number; by: number }) => {
    let s = 0;
    if (c.bx < plot.x0 || c.bx + w > plot.x1) s += 1000;
    if (c.by < plot.y0 - 4 || c.by + h > plot.y1) s += 500;
    for (const t of taken) if (c.bx < t.x + t.w && c.bx + w > t.x && c.by < t.y + t.h && c.by + h > t.y) s += 100;
    return s;
  };
  const best = cands.reduce((p, q) => (score(q) < score(p) ? q : p));
  taken.push({ x: best.bx, y: best.by, w, h });
  const tx = best.anchor === 'end' ? best.bx + w : best.anchor === 'middle' ? best.bx + w / 2 : best.bx;
  return lines.map((s, i) => text(tx, best.by + size * 0.9 + i * lh, s, face, size, paint, best.anchor));
}

function drawColumns(ctx: Ctx): Scene {
  const W = ctx.W;
  const type = ctx.column('x')?.type;
  const pts = ctx.rows
    .map((r) => ({ r, x: ctx.xval(r), raw: ctx.cell(r, 'x'), v: ctx.num(r, 'y') }))
    .filter((p): p is { r: Cell[]; x: number; raw: Cell; v: number | null } => p.x !== null)
    .sort((a, b) => a.x - b.x);
  const xs = pts.map((p) => p.x);
  const diffs = xs.slice(1).map((x, i) => x - xs[i]!).filter((d) => d > 0).sort((a, b) => a - b);
  const step = diffs.length ? diffs[Math.floor(diffs.length / 2)]! : 1;
  const H = ctx.narrow ? 280 : 360;
  const top = 22;
  const bottom = H - 30;
  const vals: number[] = [0];
  for (const p of pts) for (const role of ['y', 'lo', 'hi'] as const) {
    const v = ctx.num(p.r, role);
    if (v !== null) vals.push(v);
  }
  const ax = tightAxis(ctx, vals, [bottom, top], { zero: true });
  const unit = shortUnit(ctx.chart.units);
  const left = Math.ceil(yLabelWidth(ctx, ax, unit)) + 10;
  const right = W - 6;
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const sx = linear([xmin - step / 2, xmax + step / 2], [left, right]);
  const band = Math.abs(sx(xmin + step) - sx(xmin));
  const gap = band >= 8 ? 2 : band >= 4 ? 1 : 0;
  const th = Math.max(1, Math.min(24, band - gap));
  const sy = ax.scale;
  const names = pts.map((p) => String(p.raw));
  const nodes: SceneNode[] = [];
  const frame = {
    x0: left,
    x1: right,
    y0: top,
    y1: bottom,
    sx: (v: Cell) => {
      const x = annotX(v, ctx);
      return x === null ? null : sx(x);
    },
    sy,
    point: (a: { x: Cell }) => {
      const x = annotX(a.x, ctx);
      const p = pts.find((q) => x !== null && Math.abs(q.x - x) < 1e-6 && q.v !== null);
      return p ? { x: sx(p.x), y: sy(p.v!) } : null;
    },
  };
  // Periods cover whole columns: widen them by half a step each side.
  nodes.push(
    ...drawPeriods(ctx, {
      ...frame,
      sx: (v: Cell) => {
        const x = annotX(v, ctx);
        return x === null ? null : sx(x);
      },
    }),
  );
  nodes.push(...drawYAxis(ctx, ax, left, right, { unit }));
  const z = sy(0);
  const labelled = new Set<number>();
  const vs = pts.filter((p) => p.v !== null);
  if (vs.length) {
    labelled.add(vs[vs.length - 1]!.x);
    labelled.add(vs.reduce((a, b) => (b.v! > a.v! ? b : a)).x);
    const min = vs.reduce((a, b) => (b.v! < a.v! ? b : a));
    if (min.v! < 0) labelled.add(min.x);
  }
  for (const p of pts) if (isFocus(ctx, String(p.raw))) labelled.add(p.x);
  const boxes: Box[] = [];
  const valueW = new Map<number, number>();
  const marks: Array<[number, number]> = [];
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const p of pts) {
    const cx = sx(p.x);
    const label = type === 'date' ? formatTime(String(p.raw), 'date') : String(p.raw);
    if (p.v === null) {
      nodes.push({ t: 'circle', cx, cy: z - 4, r: 2, stroke: 'ink2', sw: 1, tip: `${label}: no data` });
      continue;
    }
    const paint = barPaint(ctx, String(p.raw), names, p.v);
    const n = ctx.num(p.r, 'n');
    const y = sy(p.v);
    const tip = `${label}: ${ctx.value(p.v)} ${ctx.chart.units}`;
    const ya = Math.min(y, z);
    const h = Math.abs(z - y);
    nodes.push(n !== null && n < SMALL_N ? { t: 'rect', x: cx - th / 2 + 0.75, y: ya + 0.75, w: th - 1.5, h: Math.max(0, h - 1.5), stroke: paint, sw: 1.5, tip } : { t: 'rect', x: cx - th / 2, y: ya, w: th, h, fill: paint, tip });
    marks.push([cx, y]);
    rects.push({ x: cx - th / 2 - 2, y: ya - 2, w: th + 4, h: h + 4 });
    const lo = ctx.num(p.r, 'lo');
    const hi = ctx.num(p.r, 'hi');
    let end = y;
    if (lo !== null && hi !== null) {
      nodes.push(vline(cx, sy(lo), sy(hi), 'ink', 1.25), hline(cx - 3, cx + 3, sy(lo), 'ink', 1.25), hline(cx - 3, cx + 3, sy(hi), 'ink', 1.25));
      end = p.v >= 0 ? Math.min(y, sy(hi)) : Math.max(y, sy(lo));
    }
    if (labelled.has(p.x)) {
      const s = ctx.value(p.v);
      const w = textWidth(s, 'sans', ctx.s.small);
      const ly = p.v >= 0 ? end - 5 : end + ctx.s.small + 3;
      const box = { x: cx - w / 2 - 3, y: ly - ctx.s.small - 1, w: w + 6, h: ctx.s.small + 4 };
      if (!boxes.some((b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)) {
        boxes.push(box);
        valueW.set(p.x, w);
        rects.push({ x: cx - w / 2 - 2, y: ly - ctx.s.small - 1, w: w + 4, h: ctx.s.small + 4 });
        nodes.push(halo(Math.max(left + w / 2, Math.min(right - w / 2, cx)), ly, s, isFocus(ctx, String(p.raw)) ? 'sansMedium' : 'sans', ctx.s.small, 'ink', 'middle'));
      }
    }
  }
  // The time axis: every year when they fit, else round years; dates by month and year.
  const fits = pts.length <= (ctx.narrow ? 7 : 14);
  let ticks: Array<{ x: number; label: string }>;
  if (type === 'year' || type === 'number') {
    const ys = fits ? xs : yearTicks(xmin, xmax, ctx.narrow ? 4 : 8);
    ticks = ys.map((x) => ({ x, label: String(x) }));
  } else {
    const k = Math.max(1, Math.ceil(pts.length / (ctx.narrow ? 4 : 7)));
    ticks = pts.filter((_, i) => i % k === 0).map((p) => ({ x: p.x, label: formatTime(String(p.raw), 'date').replace(/^\d+ /, '') }));
  }
  for (const tk of ticks) {
    const x = sx(tk.x);
    if (x < left - 1 || x > right + 1) continue;
    nodes.push(vline(Math.round(x) + 0.5, bottom, bottom + 4, 'ink2'));
    nodes.push(text(x, bottom + 6 + ctx.s.tick, tk.label, 'sans', ctx.s.tick, 'ink2', 'middle'));
  }
  nodes.push(...drawCallouts(withAnnotations(ctx, (a) => a.kind === 'rule'), { ...frame, marks }, rects));
  // A callout on a column sits beside the column's end, clear of its neighbours; the column is the mark.
  for (const a of ctx.chart.annotations ?? []) {
    if (a.kind !== 'point') continue;
    const x = annotX(a.x, ctx);
    const p = pts.find((q) => x !== null && Math.abs(q.x - x) < 1e-6 && q.v !== null);
    if (!p) continue;
    nodes.push(...besideMark(ctx, a, sx(p.x), sy(p.v!), Math.max(th / 2, (valueW.get(p.x) ?? 0) / 2) + 2, rects, { x0: left, x1: right, y0: top, y1: bottom }));
  }
  return { width: W, height: H, nodes };
}
