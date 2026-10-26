// The temperature band, after the New York Times weather chart Tufte admired: for each day of one
// year, the record range (pale), the normal range (darker), and that day's own low to high (a thin
// bar in the edition's ink). Days that set or equalled a record are marked; the year's hottest and
// coldest days are named. A small key on the chart explains the layers. Rows come from bandSummary
// (band.ts) or any table with the same seven roles; nothing is computed here but positions.

import type { Scene, SceneNode } from '../scene';
import { Ctx, drawYAxis, hline, shortUnit, text, vline, yLabelWidth, type YAxis } from '../frame';
import { dateOfDay, dayNumber, linear, MONTHS, niceTicks } from '../scales';
import { textWidth, wrapText } from '../text';

interface Day {
  d: number;
  date: string;
  lo: number | null;
  hi: number | null;
  nlo: number | null;
  nhi: number | null;
  rlo: number | null;
  rhi: number | null;
}

export function drawBand(ctx: Ctx): Scene {
  const days: Day[] = ctx.rows
    .map((r) => {
      const date = ctx.str(r, 'x');
      return { d: dayNumber(date), date, lo: ctx.num(r, 'lo'), hi: ctx.num(r, 'hi'), nlo: ctx.num(r, 'normalLo'), nhi: ctx.num(r, 'normalHi'), rlo: ctx.num(r, 'recordLo'), rhi: ctx.num(r, 'recordHi') };
    })
    .filter((d) => Number.isFinite(d.d))
    .sort((a, b) => a.d - b.d);
  const W = ctx.W;
  const narrow = ctx.narrow;
  const vals = days.flatMap((d) => [d.lo, d.hi, d.nlo, d.nhi, d.rlo, d.rhi]).filter((v): v is number => v !== null);
  const unit = shortUnit(ctx.chart.units);
  const deg = unit === '°C' || unit === '°F' ? '°' : '';
  const t = niceTicks(Math.min(...vals), Math.max(...vals), narrow ? 5 : 6);

  const top = 8;
  const H = narrow ? 330 : 440;
  const bottom = H - 26;
  const ax: YAxis = { scale: linear(t.domain, [bottom, top]), ticks: t.ticks, step: t.step };
  const left = Math.ceil(yLabelWidth(ctx, ax, unit)) + 10;
  const right = W - 2;
  const d0 = days[0]?.d ?? 0;
  const d1 = (days[days.length - 1]?.d ?? 0) + 1;
  const sx = linear([d0, d1], [left, right]);
  const dayW = (right - left) / Math.max(1, d1 - d0);
  const sy = ax.scale;
  const nodes: SceneNode[] = [];

  // Months: a hairline at each month's start, the month's name under its middle.
  const first = dateOfDay(d0);
  const monthStarts: number[] = [];
  for (let y = first.y, m = first.m; ; m++) {
    if (m > 11) ((m = 0), y++);
    const s = Date.UTC(y, m, 1) / 86_400_000;
    if (s >= d1) break;
    monthStarts.push(Math.max(s, d0));
  }
  nodes.push(...drawYAxis(ctx, ax, left, right, { unit }));
  monthStarts.forEach((s, i) => {
    const e = monthStarts[i + 1] ?? d1;
    if (i > 0) nodes.push(vline(Math.round(sx(s)) + 0.5, top, bottom, 'rule'));
    const name = MONTHS[dateOfDay(s).m]!;
    nodes.push(text((sx(s) + sx(e)) / 2, bottom + 6 + ctx.s.tick, narrow ? name.slice(0, 1) : name, 'sans', ctx.s.tick, 'ink2', 'middle'));
  });

  // The three layers, back to front. Bars are a day wide, square, with no gap between days.
  const recW = dayW + 0.35;
  for (const d of days) if (d.rlo !== null && d.rhi !== null) nodes.push({ t: 'rect', x: sx(d.d), y: sy(d.rhi), w: recW, h: sy(d.rlo) - sy(d.rhi), fill: 'record' });
  for (const d of days) if (d.nlo !== null && d.nhi !== null) nodes.push({ t: 'rect', x: sx(d.d), y: sy(d.nhi), w: recW, h: sy(d.nlo) - sy(d.nhi), fill: 'normal' });
  // Gridlines cut through the bands in the ground colour, as on the printed weather chart.
  for (const tk of ax.ticks) if (tk !== ax.ticks[0]) nodes.push(hline(left, right, Math.round(sy(tk)) + 0.5, 'bg', 1));
  // A fine bar for each day, half a day wide, so the normal band shows between the days.
  const barW = Math.max(0.55, dayW * 0.5);
  for (const d of days) {
    if (d.lo === null || d.hi === null) continue;
    nodes.push({ t: 'rect', x: sx(d.d) + (dayW - barW) / 2, y: sy(d.hi), w: barW, h: Math.max(0.8, sy(d.lo) - sy(d.hi)), fill: 'ed', tip: `${fmtDate(d.d)}: low ${ctx.value(d.lo, 1)}${deg}, high ${ctx.value(d.hi, 1)}${deg}` });
  }
  // Records set or equalled that year.
  const r = narrow ? 1.5 : 1.9;
  const hot = days.filter((d) => d.hi !== null && d.rhi !== null && d.hi >= d.rhi);
  const cold = days.filter((d) => d.lo !== null && d.rlo !== null && d.lo <= d.rlo);
  for (const d of hot) nodes.push({ t: 'circle', cx: sx(d.d) + dayW / 2, cy: sy(d.hi!) - r - 2, r, fill: 'hot', tip: `${fmtDate(d.d)}: record high ${ctx.value(d.hi!, 1)}${deg}` });
  for (const d of cold) nodes.push({ t: 'circle', cx: sx(d.d) + dayW / 2, cy: sy(d.lo!) + r + 2, r, fill: 'cold', tip: `${fmtDate(d.d)}: record low ${ctx.value(d.lo!, 1)}${deg}` });

  // The year's hottest and coldest days, named in the machine's voice (the numbers are the rows').
  const withHi = days.filter((d) => d.hi !== null);
  const withLo = days.filter((d) => d.lo !== null);
  const hottest = withHi.length ? withHi.reduce((a, b) => (b.hi! > a.hi! ? b : a)) : null;
  const coldest = withLo.length ? withLo.reduce((a, b) => (b.lo! < a.lo! ? b : a)) : null;
  const year = first.y;

  // The key: a sample day drawn large, its layers named, set where the chart is emptiest.
  const key = drawBandKey(ctx, { hot: hot.length, cold: cold.length, year, dot: r });
  const emptiest = (x0: number, x1: number) => {
    let hiPx = bottom;
    for (const d of days) {
      const x = sx(d.d);
      if (x + dayW < x0 || x > x1) continue;
      const v = d.rhi ?? d.hi ?? d.nhi;
      if (v !== null) hiPx = Math.min(hiPx, sy(v));
    }
    return hiPx - top;
  };
  const leftFree = emptiest(left, left + key.w + 16);
  const rightFree = emptiest(right - key.w - 16, right);
  let height = H;
  const taken: Array<{ x: number; y: number; w: number; h: number }> = [];
  if (Math.max(leftFree, rightFree) >= key.h + 6) {
    const kx = leftFree >= rightFree ? left + 10 : right - key.w - 6;
    nodes.push(...key.at(kx, top + 2));
    taken.push({ x: kx, y: top + 2, w: key.w, h: key.h });
  } else {
    nodes.push(...key.at(left, H + 6));
    height = H + key.h + 10;
  }

  // Callouts sit beside their day, level with it, on whichever side is clear of the key.
  const size = ctx.s.small + 0.5;
  const callout = (d: Day, v: number, line1: string, above: boolean) => {
    const x = sx(d.d) + dayW / 2;
    const y = sy(v) + (above ? -r * 2 - 2 : r * 2 + 2);
    const line2 = fmtDate(d.d, true);
    const w = Math.max(textWidth(line1, 'sansMedium', size), textWidth(line2, 'sans', size));
    const h = size * 2.3;
    const ty = above ? Math.max(top + size, y - 2) : Math.min(bottom - size * 1.4, y + size);
    const sides = [x + 12 + w <= right ? 'right' : null, x - 12 - w >= left ? 'left' : null].filter(Boolean) as Array<'right' | 'left'>;
    const clash = (side: 'right' | 'left') => {
      const bx = side === 'right' ? x + 12 : x - 12 - w;
      return taken.some((t) => bx < t.x + t.w && bx + w > t.x && ty - size < t.y + t.h && ty - size + h > t.y);
    };
    const side = sides.find((sd) => !clash(sd)) ?? sides[0];
    if (!side) return;
    const tx = side === 'right' ? x + 12 : x - 12;
    const anchor = side === 'right' ? 'start' : 'end';
    nodes.push({ t: 'line', x1: side === 'right' ? x + 3 : x - 3, y1: y, x2: side === 'right' ? tx - 3 : tx + 3, y2: ty - size * 0.35, stroke: 'ink', sw: 0.75 });
    nodes.push(text(tx, ty, line1, 'sansMedium', size, 'ink', anchor));
    nodes.push(text(tx, ty + size * 1.25, line2, 'sans', size, 'ink2', anchor));
    taken.push({ x: side === 'right' ? tx : tx - w, y: ty - size, w, h });
  };
  if (hottest) callout(hottest, hottest.hi!, `${ctx.value(hottest.hi!, 1)}${deg}, the year’s highest`, true);
  if (coldest) callout(coldest, coldest.lo!, `${ctx.value(coldest.lo!, 1)}${deg}, the year’s lowest`, false);
  return { width: W, height: Math.ceil(height), nodes };
}

function fmtDate(d: number, long = false): string {
  const x = dateOfDay(d);
  return long ? `${x.d} ${MONTHS[x.m]}` : `${x.d} ${MONTHS[x.m]} ${x.y}`;
}

/** The key as a sample day: a record bar, the normal band inside it, a day's bar, each named level with it. */
function drawBandKey(ctx: Ctx, n: { hot: number; cold: number; year: number; dot: number }) {
  const size = ctx.s.small;
  const lh = size + 5;
  const names = ['Record high', 'Normal range', `${n.year} low to high`, 'Record low'];
  const days = (k: number) => `${k} ${k === 1 ? 'day' : 'days'}`;
  const marks: Array<{ s: string; p: 'hot' | 'cold' | null }> =
    n.hot || n.cold
      ? [
          { s: `Record high set or equalled: ${days(n.hot)}`, p: 'hot' },
          { s: `Record low set or equalled: ${days(n.cold)}`, p: 'cold' },
        ]
      : [{ s: `No day in ${n.year} set or equalled a record`, p: null }];
  const barW = 10;
  const textX = barW + 16;
  const namesW = textX + Math.max(...names.map((s) => textWidth(s, 'sans', size)));
  // The record lines wrap to the key's width, so the key stays narrow enough to sit inside the chart.
  const markLines = marks.map((m) => ({ p: m.p, lines: wrapText(m.s, 'sans', size, Math.max(namesW - (m.p ? textX : 0), 120)) }));
  const w = Math.max(namesW, ...markLines.flatMap((m) => m.lines.map((s) => (m.p ? textX : 0) + textWidth(s, 'sans', size))));
  const rowY = (i: number) => size * 0.75 + i * lh;
  const markRows = markLines.reduce((a, m) => a + m.lines.length, 0);
  const h = rowY(3) + 6 + markRows * (size + 3);
  const at = (x: number, y: number): SceneNode[] => {
    const out: SceneNode[] = [];
    const mid = (i: number) => y + rowY(i) - size * 0.32;
    out.push({ t: 'rect', x, y: mid(0) - 2, w: barW, h: mid(3) - mid(0) + 4, fill: 'record' });
    out.push({ t: 'rect', x, y: mid(1) - 3, w: barW, h: mid(2) - mid(1) + 6, fill: 'normal' });
    out.push({ t: 'rect', x: x + 3, y: mid(1) + 3, w: 4, h: mid(2) - mid(1) + 2, fill: 'ed' });
    names.forEach((s, i) => {
      out.push(hline(x + barW + 3, x + textX - 4, mid(i), 'ink2', 0.75));
      out.push(text(x + textX, y + rowY(i), s, 'sans', size, 'ink2'));
    });
    let k = 0;
    for (const m of markLines) {
      m.lines.forEach((s, j) => {
        const ty = y + rowY(3) + 6 + size * 0.75 + k * (size + 3);
        if (m.p && j === 0) out.push({ t: 'circle', cx: x + barW / 2, cy: ty - size * 0.32, r: n.dot + 0.4, fill: m.p });
        out.push(text(m.p ? x + textX : x, ty, s, 'sans', size, 'ink2'));
        k++;
      });
    }
    return out;
  };
  return { w, h, at };
}
