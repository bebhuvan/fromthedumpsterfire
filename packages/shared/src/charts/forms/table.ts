// Table with sparklines: a few rows compared on their first and last values, with the change between
// them and each row's whole path drawn small beside it. A table, not a chart in disguise: every
// number it prints is in the rows, and the change is worked out by code (a percentage for amounts, a
// difference for rates, shares, anomalies and indexes; a gloss says which). Each sparkline is drawn to
// its own scale, from its own lowest to highest value, with its first and last values dotted. Rows go
// by their last value, highest first, or as given; the focus rows are set in medium with their line in
// the edition's ink.

import type { Scene, SceneNode } from '../scene';
import { Ctx, hline, linePath, text, withGaps } from '../frame';
import { formatTime, linear } from '../scales';
import { textWidth, wrapText } from '../text';

export interface TableRow {
  name: string;
  pts: Array<{ x: number; raw: string | number; y: number | null }>;
  first: { raw: string | number; y: number } | null;
  last: { raw: string | number; y: number } | null;
}

/** Each row's points in time order, and its first and last values. */
export function tableRows(ctx: Ctx): TableRow[] {
  const by = new Map<string, TableRow['pts']>();
  for (const r of ctx.rows) {
    const x = ctx.xval(r);
    if (x === null) continue;
    const name = ctx.str(r, 'label');
    if (!by.has(name)) by.set(name, []);
    by.get(name)!.push({ x, raw: ctx.cell(r, 'x') as string | number, y: ctx.num(r, 'y') });
  }
  const out = [...by].map(([name, pts]) => {
    pts.sort((a, b) => a.x - b.x);
    const ok = pts.filter((p) => p.y !== null);
    return { name, pts, first: ok[0] ? { raw: ok[0].raw, y: ok[0].y! } : null, last: ok.length ? { raw: ok[ok.length - 1]!.raw, y: ok[ok.length - 1]!.y! } : null };
  });
  if (ctx.chart.options?.sort === 'given') return out;
  return out.sort((a, b) => (b.last?.y ?? -Infinity) - (a.last?.y ?? -Infinity));
}

/** Whether the change column is a percentage (amounts, all above zero) or a difference. */
export function changeIsPercent(ctx: Ctx, rows: TableRow[]): boolean {
  const basis = ctx.chart.measure?.basis;
  return (basis === 'absolute' || basis === 'per-capita') && rows.every((r) => !r.first || r.first.y > 0);
}

export function drawTable(ctx: Ctx): Scene {
  const W = ctx.W;
  const rows = tableRows(ctx);
  const focus = new Set(ctx.chart.options?.focus ?? []);
  const type = (ctx.column('x')?.type ?? 'year') as 'year' | 'date';
  const when = (raw: string | number) => (type === 'date' ? formatTime(String(raw), 'date').replace(/^\d+ /, '') : String(raw));
  const pct = changeIsPercent(ctx, rows);
  const size = ctx.s.label;
  const small = ctx.s.small;
  const firstX = rows.find((r) => r.first)?.first?.raw;
  const lastX = rows.find((r) => r.last)?.last?.raw;
  const sameEnds = rows.every((r) => r.first?.raw === firstX && r.last?.raw === lastX);
  const head = [sameEnds && firstX !== undefined ? when(firstX) : 'First', sameEnds && lastX !== undefined ? when(lastX) : 'Last', 'Change'];
  const change = (r: TableRow) => {
    if (!r.first || !r.last) return '';
    if (pct) {
      const c = (r.last.y / r.first.y - 1) * 100;
      return `${c >= 0 ? '+' : '–'}${ctx.value(Math.abs(c), 0)}%`;
    }
    const d = r.last.y - r.first.y;
    return `${d >= 0 ? '+' : '–'}${ctx.value(Math.abs(d))}`;
  };
  const cell = (r: TableRow, k: 'first' | 'last') => {
    const p = r[k];
    if (!p) return 'no data';
    // When rows start or end at different times, the time goes with the value.
    return sameEnds ? ctx.value(p.y) : `${ctx.value(p.y)} (${when(p.raw)})`;
  };
  const face = (r: TableRow) => (focus.has(r.name) ? 'sansMedium' : 'sans');
  const colW = (k: number) => Math.max(textWidth(head[k]!, 'sansMedium', small), ...rows.map((r) => textWidth([cell(r, 'first'), cell(r, 'last'), change(r)][k]!, face(r), size))) + 14;
  const nameMax = ctx.narrow ? 104 : 190;
  const names = new Map(rows.map((r) => [r.name, wrapText(r.name, face(r), size, nameMax)]));
  const nameW = Math.min(nameMax, Math.max(...[...names.values()].flat().map((l) => textWidth(l, 'sansMedium', size)))) + 12;
  const [w1, w2, w3] = [colW(0), colW(1), colW(2)];
  const sparkW = Math.max(ctx.narrow ? 54 : 120, W - nameW - w1 - w2 - w3 - 12);
  const lh = size * 1.2;
  const rowH = Math.max(ctx.narrow ? 30 : 34, ...[...names.values()].map((l) => l.length * lh + 12));
  const headH = small + 14;
  const nodes: SceneNode[] = [];
  // Columns: name | first | last | change | the line. Numbers are right-aligned, as in a printed table.
  const cx = [nameW + w1, nameW + w1 + w2, nameW + w1 + w2 + w3];
  const sparkX0 = cx[2]! + 16;
  const sparkX1 = Math.min(W - 6, sparkX0 + sparkW);
  head.forEach((h, k) => nodes.push(text(cx[k]!, small + 2, h, 'sansMedium', small, 'ink2', 'end')));
  nodes.push(text(sparkX0, small + 2, sameEnds && firstX !== undefined && lastX !== undefined ? `${when(firstX)} to ${when(lastX)}` : 'Over time', 'sansMedium', small, 'ink2'));
  nodes.push(hline(0, W, headH - 4.5, 'ink', 1));
  rows.forEach((r, i) => {
    const y0 = headH + i * rowH;
    const yc = y0 + rowH / 2;
    const f = face(r);
    const ink = focus.has(r.name) || !focus.size ? 'ink' : 'ink2';
    const ls = names.get(r.name)!;
    ls.forEach((l, j) => nodes.push(text(0, yc - ((ls.length - 1) * lh) / 2 + size * 0.35 + j * lh, l, f, size, ink)));
    [cell(r, 'first'), cell(r, 'last'), change(r)].forEach((s, k) => nodes.push(text(cx[k]!, yc + size * 0.35, s, f, size, s === 'no data' ? 'ink2' : ink, 'end')));
    // The sparkline, to its own scale.
    const ok = r.pts.filter((p) => p.y !== null);
    if (ok.length > 1) {
      const xs = r.pts.map((p) => p.x);
      const lo = Math.min(...ok.map((p) => p.y!));
      const hi = Math.max(...ok.map((p) => p.y!));
      const sx = linear([Math.min(...xs), Math.max(...xs)], [sparkX0 + 3, sparkX1 - 3]);
      const sy = linear([lo, hi === lo ? lo + 1 : hi], [y0 + rowH - 8, y0 + 8]);
      const paint = focus.has(r.name) ? 'ed' : 'ink2';
      const g = withGaps(r.pts);
      nodes.push({ t: 'path', d: linePath(g.map((p) => (p ? [sx(p.x), sy(p.y!)] : null))), stroke: paint, sw: focus.has(r.name) ? 1.75 : 1.25, tip: `${r.name}: ${cell(r, 'first')} to ${cell(r, 'last')}` });
      for (const p of [ok[0]!, ok[ok.length - 1]!]) nodes.push({ t: 'circle', cx: sx(p.x), cy: sy(p.y!), r: 2.25, fill: paint });
    }
    nodes.push(hline(0, W, y0 + rowH - 0.5, 'rule', 1));
  });
  return { width: W, height: Math.ceil(headH + rows.length * rowH + 2), nodes };
}
