// The Atlas grammar: the fertility story as numbered plates. Estimates are solid; what the UN
// projects is hatched, its 80 per cent range in close hatching and its 95 per cent range in open
// hatching, with the central path dashed through them. Every label and note is placed by the Placer
// against the marks already drawn, and a browser check (check.mjs) fails on any overlap.

import { areaOf, circle, el, line, lin, measure, pathOf, Placer, spread, svg, swarm, text, type Bee, type Box } from './kit';
import type { Data as BaseData } from './charts';

type Pt = [number, number];
type Band = { lo95: Pt[]; lo80: Pt[]; median: Pt[]; hi80: Pt[]; hi95: Pt[] };
export type Data = BaseData & {
  intervals: { tfr: Record<string, Band>; births: Record<string, Band>; pop: Record<string, Band> };
  pyramid: { India: Record<string, [string, number, number, number][]> };
};

const EST = 2023;
const at = (s: Pt[], y: number) => s.find((p) => p[0] === y)![1];
const sz = (phone: boolean) => ({ tick: phone ? 10.5 : 11, lab: phone ? 12 : 13, note: phone ? 12 : 13 });
const lh = 1.3;

/** Patterns for one figure: ids carry the figure's key so two figures in a page never share one. */
function defs(id: string) {
  const pat = (name: string, gap: number, cls: string, w: number, rot: number) =>
    `<pattern id="${name}-${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(${rot})">${line(0, 0, 0, gap, cls, { 'stroke-width': w })}</pattern>`;
  return `<defs>${pat('h80', 3.2, 'hatch-ed', 1, 45)}${pat('h95', 6, 'hatch-ed', 0.8, 45)}${pat('hq', 4, 'hatch-q', 0.9, 45)}${pat('hink', 4, 'hatch-ink', 0.9, -45)}</defs>`;
}
const fillOf = (name: string, id: string) => `url(#${name}-${id})`;

/** Keep text off a polyline: small boxes along it. */
function blockPath(P: Placer, pts: Pt[], r = 3) {
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i]!;
    P.block({ x: x - r, y: y - r, w: 2 * r, h: 2 * r });
    const nx = pts[i + 1];
    if (nx) {
      const steps = Math.ceil(Math.hypot(nx[0] - x, nx[1] - y) / (2 * r));
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        P.block({ x: x + (nx[0] - x) * t - r, y: y + (nx[1] - y) * t - r, w: 2 * r, h: 2 * r });
      }
    }
  }
}
const bandBox = (P: Placer, top: Pt[], bot: Pt[]) => {
  for (let i = 0; i < top.length; i++) P.block({ x: top[i]![0] - 2, y: top[i]![1], w: 4, h: bot[i]![1] - top[i]![1] });
};

type NoteSpec = { lines: string[]; ax: number; ay: number; cls?: string; size: number; tries: [number, number, 'start' | 'end' | 'middle'][] };
/** Place a note at the first free spot among `tries` (offsets from the anchor), with a leader. */
function placeNote(P: Placer, n: NoteSpec): string {
  const w = Math.max(...n.lines.map((l) => measure(l, 'sans', n.size)));
  const h = n.lines.length * n.size * lh;
  // The preferred spots first, then rings of growing distance around the mark, nearest first.
  const ring: [number, number, 'start' | 'end' | 'middle'][] = [];
  for (let d = 18; d <= 240; d += 12) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, dx = Math.cos(a) * d, dy = Math.sin(a) * d * 0.7;
    ring.push([dx, dy + (dy < 0 ? 0 : n.size), dx > 4 ? 'start' : dx < -4 ? 'end' : 'middle']);
  }
  for (const [dx, dy, anchor] of [...n.tries, ...ring]) {
    const x0 = anchor === 'start' ? n.ax + dx : anchor === 'end' ? n.ax + dx - w : n.ax + dx - w / 2;
    const box: Box = { x: x0 - 2, y: n.ay + dy - n.size, w: w + 4, h: h + 2 };
    if (!P.free(box)) continue;
    P.take(box);
    const tx = anchor === 'start' ? x0 : anchor === 'end' ? x0 + w : x0 + w / 2;
    let s = '';
    const far = Math.hypot(dx, dy) > 14;
    if (far) {
      // The leader runs from the mark to the nearest point of the note's box.
      const lx = Math.min(Math.max(n.ax, box.x), box.x + box.w), ly = Math.min(Math.max(n.ay, box.y), box.y + box.h);
      s += line(n.ax, n.ay, lx, ly, 'leader') + circle(n.ax, n.ay, 2, 'leader-dot');
    }
    n.lines.forEach((l, i) => (s += text(tx, n.ay + dy + i * n.size * lh, l, `${n.cls ?? 'ann'} halo`, anchor)));
    return s;
  }
  throw new Error(`No room for the note "${n.lines.join(' ')}"`);
}

function yAxis(P: Placer, y: (v: number) => number, ticks: number[], x0: number, x1: number, unit: string, size: number, fmt = (v: number) => String(v)) {
  let s = '';
  for (const t of ticks) {
    s += line(x0, y(t), x1, y(t), t === 0 ? 'zero' : 'grid');
    const lab = fmt(t);
    s += text(x0 - 6, y(t) + size * 0.35, lab, 'tk', 'end');
    P.block({ x: x0 - 6 - measure(lab, 'sans', size), y: y(t) - size * 0.7, w: measure(lab, 'sans', size), h: size });
  }
  // The unit sits above the top tick, clear of the plot.
  const top = y(ticks[ticks.length - 1]!) - size * 1.25;
  s += text(x0 - 6 - measure(fmt(ticks[0]!), 'sans', size), top, unit, 'tk');
  P.block({ x: x0 - 40, y: top - size, w: measure(unit, 'sans', size) + 40, h: size + 4 });
  return s;
}
function xAxis(P: Placer, x: (v: number) => number, ticks: number[], y0: number, size: number) {
  return ticks.map((t) => {
    P.block({ x: x(t) - 16, y: y0, w: 32, h: size + 8 });
    return line(x(t), y0, x(t), y0 + 4, 'tickmark') + text(x(t), y0 + 6 + size, String(t), 'tk', 'middle');
  }).join('');
}
function seam(P: Placer, x: number, top: number, bottom: number, size: number, phone: boolean) {
  const a = phone ? 'Estimated' : 'UN estimates', b = phone ? 'Projected' : 'UN projection, hatched';
  P.block({ x: x - measure(a, 'sans', size) - 8, y: top - size, w: measure(a, 'sans', size) + measure(b, 'sans', size) + 16, h: size + 4 });
  return line(x, top + 4, x, bottom, 'seam') + text(x - 6, top, a, 'tk', 'end') + text(x + 6, top, b, 'tk');
}
/** The UN's ranges as hatching, then its central path dashed. */
function bands(id: string, B: Band, x: (v: number) => number, y: (v: number) => number, P?: Placer, from = EST + 1) {
  const f = (s: Pt[]) => s.filter((p) => p[0] >= from).map(([a, b]) => [x(a), y(b)] as Pt);
  const lo95 = f(B.lo95), hi95 = f(B.hi95), lo80 = f(B.lo80), hi80 = f(B.hi80);
  if (P) bandBox(P, hi95, lo95);
  return el('path', { d: areaOf(hi95, lo95), class: 'band95', fill: fillOf('h95', id) }) + el('path', { d: areaOf(hi80, lo80), class: 'band80', fill: fillOf('h80', id) });
}

const W = (phone: boolean, wide: number) => (phone ? 340 : wide);

// ---------------------------------------------------------------------------------------------
// I. The fall.
export function fall(D: Data, phone: boolean): string {
  const id = `fall${phone ? 'p' : 'w'}`, T = sz(phone), w = W(phone, 880);
  const m = { l: phone ? 26 : 34, r: phone ? 16 : 112, t: 44, b: 28 };
  const h = phone ? 380 : 460;
  const x = lin([1950, 2100], [m.l, w - m.r]), y = lin([0, 8], [h - m.b, m.t]);
  const P = new Placer({ x: 0, y: 0, w, h });
  let s = defs(id) + yAxis(P, y, [0, 2, 4, 6, 8], m.l, w - m.r, 'children per woman', T.tick);
  s += seam(P, x(EST), m.t - 22, h - m.b, T.tick, phone);
  const yrs = Array.from({ length: EST - 1950 + 1 }, (_, i) => 1950 + i);
  s += `<g>${Object.values(D.field).map((v) => el('path', { d: pathOf(yrs.map((yr, i) => [x(yr), y(v[i]!)])), class: 'ctx', 'stroke-width': 0.55 })).join('')}</g>`;
  const py = Array.from({ length: 2100 - EST + 1 }, (_, i) => EST + i);
  s += `<g>${Object.values(D.fieldProj).map((v) => el('path', { d: pathOf(py.map((yr, i) => [x(yr), y(v[i]!)])), class: 'ctx-proj', 'stroke-width': 0.5 })).join('')}</g>`;
  s += bands(id, D.intervals.tfr['World']!, x, y);
  s += line(m.l, y(2.1), w - m.r, y(2.1), 'repl');
  const wt = D.world.tfr;
  const est = wt.filter((p) => p[0] <= EST).map(([a, b]) => [x(a), y(b)] as Pt);
  const proj = wt.filter((p) => p[0] >= EST).map(([a, b]) => [x(a), y(b)] as Pt);
  for (const c of ['South Korea', 'Niger']) {
    const v = D.named[c]!.tfr.filter((p) => p[0] <= EST).map(([a, b]) => [x(a), y(b)] as Pt);
    s += el('path', { d: pathOf(v), class: 'named', 'stroke-width': 1.1 });
    blockPath(P, v.slice(-8), 2);
  }
  blockPath(P, est, 3);
  s += el('path', { d: pathOf(est), class: 'focus', 'stroke-width': phone ? 2.25 : 2.5 });
  s += el('path', { d: pathOf(proj), class: 'focus proj-dash', 'stroke-width': phone ? 1.6 : 1.8 });
  const pk = wt.filter((p) => p[0] <= EST).reduce((a, b) => (b[1] > a[1] ? b : a));
  const now = at(wt, EST), end = wt[wt.length - 1]!;
  s += circle(x(pk[0]), y(pk[1]), 3.5, 'focus-dot') + circle(x(EST), y(now), 3.5, 'focus-dot');
  // End labels: the named countries at 2023; the world and replacement beyond 2100 (desktop).
  for (const c of ['South Korea', 'Niger']) {
    const v = at(D.named[c]!.tfr, EST);
    s += circle(x(EST), y(v), 2.4, 'named-dot');
    s += placeNote(P, { lines: [`${c} ${v.toFixed(2)}`], ax: x(EST), ay: y(v), cls: 'lab', size: T.lab, tries: [[7, T.lab * 0.35, 'start'], [-7, T.lab * 0.35, 'end'], [7, -8, 'start'], [7, 14, 'start']] });
  }
  if (!phone) {
    const [a, b] = spread([y(end[1]), y(2.1)], T.lab * 1.35, m.t, h - m.b);
    s += text(w - m.r + 8, a! + 4, `World ${end[1].toFixed(2)}`, 'lab lab-strong') + text(w - m.r + 8, b! + 4, 'Replacement 2.1', 'lab');
    s += text(w - m.r + 8, y(at(D.intervals.tfr['World']!.lo95, 2100)) + 16, 'UN range, 95%', 'tk');
  } else {
    s += placeNote(P, { lines: ['Replacement 2.1'], ax: x(2100), ay: y(2.1), cls: 'lab', size: T.lab, tries: [[0, -8, 'end'], [0, -30, 'end']] });
  }
  s += placeNote(P, { lines: phone ? ['Peak, 1963:', pk[1].toFixed(2)] : [`The world's peak, ${pk[0]}:`, `${pk[1].toFixed(2)} children per woman`], ax: x(pk[0]), ay: y(pk[1]) - 4, size: T.note, tries: [[12, -48, 'start'], [16, -70, 'start'], [-10, -60, 'start']] });
  s += placeNote(P, { lines: [`2023: ${now.toFixed(2)}`], ax: x(EST), ay: y(now) - 4, size: T.note, tries: [[10, -30, 'start'], [14, -46, 'start'], [-12, -40, 'end']] });
  s += xAxis(P, x, phone ? [1950, 2000, 2050, 2100] : [1950, 1975, 2000, 2023, 2050, 2075, 2100], h - m.b, T.tick);
  return svg(w, h, s, 'Total fertility rate of every country of a million people or more, 1950 to 2023, the UN projection for each to 2100, and the world with the UN 80 and 95 per cent ranges.', 'ds g-atlas');
}

// ---------------------------------------------------------------------------------------------
// II. The crossing: a fold-out plate. The share of the world's people above, the countries below,
// on one time scale.
const NAMED = ['India', 'China', 'United States', 'Japan', 'Brazil', 'Russia', 'Nigeria', 'Pakistan', 'Indonesia', 'Bangladesh', 'Ethiopia', 'Egypt', 'Mexico', 'Iran', 'South Korea', 'Philippines', 'Democratic Republic of Congo', 'Germany', 'Vietnam', 'Turkey'];
const nice = (c: string) => (c === 'Democratic Republic of Congo' ? 'DR Congo' : c);

export function crossing(D: Data, phone: boolean): string {
  const id = `cross${phone ? 'p' : 'w'}`, T = sz(phone);
  const rows = D.crossing;
  const maxPop = Math.max(...rows.map((c) => c.pop2023));
  const R = phone ? 20 : 34;
  const rOf = (p: number) => Math.max(phone ? 1.6 : 2, R * Math.sqrt(p / maxPop));
  const cls = (c: (typeof rows)[number]) => (c.country === 'India' ? 'bee-focus' : c.kind === 'projected' || c.kind === 'never' ? 'bee-proj' : 'bee');
  if (!phone) {
    const w = 1030, m = { l: 92, r: 92, t: 30 };
    const x = lin([1950, 2100], [m.l, w - m.r]);
    const xBefore = 38, xNever = w - 38;
    const share = 150;
    const P = new Placer({ x: 0, y: 0, w, h: 2000 });
    // Panel 1: the share of people, on the same x scale.
    const ys = lin([0, 100], [m.t + share, m.t + 16]);
    let s = defs(id);
    s += yAxis(P, ys, [0, 50, 100], m.l, x(EST), '% of the world’s people', T.tick);
    const pts = D.share.map(([a, b]) => [x(a), ys(b)] as Pt);
    const step: Pt[] = [];
    pts.forEach((p, i) => { if (i) step.push([p[0], pts[i - 1]![1]]); step.push(p); });
    s += el('path', { d: areaOf(step, step.map(([a]) => [a, ys(0)] as Pt)), class: 'wash' });
    s += el('path', { d: pathOf(step), class: 'focus', 'stroke-width': 2 });
    blockPath(P, step, 3);
    const last = D.share[D.share.length - 1]!;
    s += circle(x(last[0]), ys(last[1]), 3.4, 'focus-dot');
    s += placeNote(P, { lines: [`${Math.round(last[1])}% in 2023`], ax: x(last[0]), ay: ys(last[1]), cls: 'lab lab-strong', size: T.lab, tries: [[9, 4, 'start']] });
    s += placeNote(P, { lines: ['China, 1991'], ax: x(1991), ay: ys(at(D.share, 1991)) - 2, size: T.note, tries: [[-8, -12, 'end'], [-10, -26, 'end']] });
    s += placeNote(P, { lines: ['India, 2020'], ax: x(2020), ay: ys(at(D.share, 2020)) - 2, size: T.note, tries: [[-8, -14, 'end'], [-8, -30, 'end']] });
    // Panel 2: the swarm.
    const bees: Bee[] = rows.map((c) => ({ key: c.country, x: c.kind === 'never' ? xNever : c.kind === 'before' ? xBefore : x(c.year!), r: rOf(c.pop2023) }));
    const placed = swarm(bees, 1.4, 150);
    const ext = Math.max(...placed.map((b) => Math.abs(b.y!) + b.r));
    const cy = m.t + share + 96 + ext;
    const h = cy + ext + 96;
    const by = new Map(placed.map((b) => [b.key, b]));
    P.bounds.h = h - 30;
    const axis = xAxis(P, x, [1950, 1975, 2000, 2023, 2050, 2075, 2100], h - 30, T.tick);
    s += line(m.l, cy, x(2100), cy, 'axis-soft');
    s += seam(P, x(EST), m.t + share + 34, h - 30, T.tick, false);
    for (const [bx, lab] of [[xBefore, 'Before'], [xNever, 'Not by']] as const) {
      s += text(bx, m.t + share + 34, lab, 'tk', 'middle') + text(bx, m.t + share + 34 + T.tick * 1.2, bx === xBefore ? '1950' : '2100', 'tk', 'middle');
      P.block({ x: bx - 28, y: m.t + share + 20, w: 56, h: 30 });
    }
    s += line(x(1950) - 26, m.t + share + 50, x(1950) - 26, h - 30, 'seam') + line(x(2100) + 26, m.t + share + 50, x(2100) + 26, h - 30, 'seam');
    for (const c of rows) {
      const b = by.get(c.country)!;
      s += el('circle', { cx: b.x, cy: cy + b.y!, r: Math.max(0.8, b.r - (cls(c) === 'bee-proj' ? 0.5 : 0)), class: cls(c) });
      P.blockCircle(b.x, cy + b.y!, b.r + 1);
    }
    for (const c of rows.filter((c) => NAMED.includes(c.country)).sort((a, b) => b.pop2023 - a.pop2023)) {
      const b = by.get(c.country)!, bx = b.x, byy = cy + b.y!;
      const name = nice(c.country), yr = c.kind === 'never' ? 'not by 2100' : String(c.year);
      const lw = Math.max(measure(name, 'sansMedium', T.lab), measure(yr, 'sans', T.tick));
      if (b.r * 2 > lw + 10) {
        s += text(bx, byy - 1, name, 'lab-in', 'middle') + text(bx, byy + T.tick + 1, yr, 'lab-in-sub', 'middle');
        continue;
      }
      const hh = T.lab + T.tick + 4;
      // Straight above or below first, then any direction, further out each ring.
      const boxes: { x: number; y: number; w: number; h: number }[] = [];
      for (const d of [6, 20, 36]) boxes.push({ x: bx - lw / 2, y: byy - b.r - d - hh, w: lw, h: hh }, { x: bx - lw / 2, y: byy + b.r + d, w: lw, h: hh });
      for (let d = 8; d <= 160; d += 12) for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        boxes.push({ x: bx + Math.cos(a) * (b.r + d + lw / 2) - lw / 2, y: byy + Math.sin(a) * (b.r + d + hh / 2) - hh / 2, w: lw, h: hh });
      }
      let done = false;
      for (const box of boxes) {
        if (!P.free(box)) continue;
        P.take(box);
        const cx = box.x + lw / 2, near = box.y > byy ? box.y - 1 : box.y + hh + 1;
        const ang = Math.atan2(near - byy, cx - bx);
        if (Math.hypot(cx - bx, near - byy) > b.r + 9) s += line(bx + Math.cos(ang) * (b.r + 1), byy + Math.sin(ang) * (b.r + 1), cx, near, 'leader-q');
        s += text(cx, box.y + T.lab - 1, name, 'lab lab-strong', 'middle') + text(cx, box.y + T.lab + T.tick + 1, yr, 'tk', 'middle');
        done = true;
        break;
      }
      if (!done) throw new Error(`No room for ${name}`);
    }
    s += axis;
    return svg(w, h, s, 'Above: the share of the world’s people living where fertility is below 2.1, 1950 to 2023. Below: each country of a million people or more at the year its fertility fell below 2.1, sized by its population in 2023; hollow where the UN projects it.', 'ds g-atlas');
  }
  // Phone: two figures, the share first, then the years running down the page.
  const w = 340;
  const m = { l: 40, r: 6, t: 30 };
  const P = new Placer({ x: 0, y: 0, w, h: 4000 });
  let s = defs(id);
  const xs = lin([1950, EST], [m.l, w - 40]), ys = lin([0, 100], [m.t + 120, m.t + 14]);
  s += yAxis(P, ys, [0, 50, 100], m.l, w - 40, '% of the world’s people', T.tick);
  const pts = D.share.map(([a, b]) => [xs(a), ys(b)] as Pt);
  const step: Pt[] = [];
  pts.forEach((p, i) => { if (i) step.push([p[0], pts[i - 1]![1]]); step.push(p); });
  s += el('path', { d: areaOf(step, step.map(([a]) => [a, ys(0)] as Pt)), class: 'wash' }) + el('path', { d: pathOf(step), class: 'focus', 'stroke-width': 2 });
  blockPath(P, step, 3);
  const last = D.share[D.share.length - 1]!;
  s += circle(xs(last[0]), ys(last[1]), 3.2, 'focus-dot') + text(xs(last[0]) + 7, ys(last[1]) + 4, `${Math.round(last[1])}%`, 'lab lab-strong');
  P.block({ x: xs(last[0]) + 5, y: ys(last[1]) - 10, w: 40, h: 16 });
  s += placeNote(P, { lines: ['China, 1991'], ax: xs(1991), ay: ys(at(D.share, 1991)) - 2, size: T.note, tries: [[-6, -12, 'end'], [-8, -26, 'end']] });
  s += placeNote(P, { lines: ['India, 2020'], ax: xs(2020), ay: ys(at(D.share, 2020)) - 2, size: T.note, tries: [[-6, -12, 'end'], [-8, -28, 'end']] });
  s += xAxis(P, xs, [1950, 1970, 1990, 2010], m.t + 120, T.tick);
  const top = m.t + 190;
  // Decades with no crossings take less room: each year gets 4.4 px, plus 2.2 px for each country.
  const count = new Map<number, number>();
  for (const c of rows) if (c.year && c.kind !== 'before') count.set(c.year, (count.get(c.year) ?? 0) + 1);
  const yOfMap = new Map<number, number>();
  let acc = top + 40;
  for (let yr = 1950; yr <= 2100; yr++) { yOfMap.set(yr, acc); acc += 3.4 + 2.6 * Math.min(4, count.get(yr) ?? 0); }
  const yOf = (yr: number) => yOfMap.get(yr)!;
  const yBefore = top + 12, yNever = yOf(2100) + 50;
  const h = yNever + 44;
  const cx = m.l + (w - m.l - m.r) / 2;
  const half = (w - m.l - m.r) / 2 - 2;
  const bees: Bee[] = rows.map((c) => ({ key: c.country, x: c.kind === 'never' ? yNever : c.kind === 'before' ? yBefore : yOf(c.year!), r: rOf(c.pop2023) }));
  const placed = swarm(bees, 1.1, half);
  const by = new Map(placed.map((b) => [b.key, b]));
  for (const t of [1960, 1970, 1980, 1990, 2000, 2010, 2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100]) {
    s += line(m.l, yOf(t), w - m.r, yOf(t), 'grid') + text(m.l - 6, yOf(t) + 4, String(t), 'tk', 'end');
  }
  s += line(m.l, yOf(EST), w - m.r, yOf(EST), 'seam') + text(m.l - 6, yOf(EST) + 4, '2023', 'tk', 'end');
  s += text(w - m.r, yOf(EST) + 14, 'Projected below', 'tk', 'end');
  P.block({ x: w - m.r - 100, y: yOf(EST) + 2, w: 100, h: 16 });
  s += text(m.l - 6, yBefore + 4, '<1950', 'tk', 'end') + line(m.l, yBefore + 18, w - m.r, yBefore + 18, 'seam');
  s += line(m.l, yNever - 26, w - m.r, yNever - 26, 'seam') + text(m.l - 6, yNever - 2, 'Not by', 'tk', 'end') + text(m.l - 6, yNever + 10, '2100', 'tk', 'end');
  for (const c of rows) {
    const b = by.get(c.country)!;
    s += el('circle', { cx: cx + b.y!, cy: b.x, r: Math.max(0.7, b.r - (cls(c) === 'bee-proj' ? 0.5 : 0)), class: cls(c) });
    P.blockCircle(cx + b.y!, b.x, b.r + 1);
  }
  for (const c of rows.filter((c) => NAMED.includes(c.country)).sort((a, b) => b.pop2023 - a.pop2023)) {
    const b = by.get(c.country)!, bx = cx + b.y!, byy = b.x;
    const name = nice(c.country), yr = c.kind === 'never' ? '' : ` ${c.year}`;
    if (b.r * 2 > measure(name, 'sansMedium', T.lab) + 6) {
      s += text(bx, byy - 1, name, 'lab-in', 'middle') + text(bx, byy + T.tick + 1, yr.trim(), 'lab-in-sub', 'middle');
      continue;
    }
    const t = name + yr, lw = measure(t, 'sansMedium', T.lab), hh = T.lab + 2;
    let done = false;
    for (const d of [5, 16, 30, 46, 64]) for (const side of [1, -1]) for (const dy of [0, -12, 12]) {
      if (done) continue;
      const box = { x: side > 0 ? bx + b.r + d : bx - b.r - d - lw, y: byy - hh / 2 + dy, w: lw, h: hh };
      if (!P.free(box)) continue;
      P.take(box);
      if (d > 5 || dy !== 0) s += line(bx + side * (b.r + 1), byy, side > 0 ? box.x - 2 : box.x + lw + 2, box.y + hh / 2, 'leader-q');
      s += text(box.x, box.y + T.lab - 1, t, 'lab lab-strong');
      done = true;
    }
    if (!done) throw new Error(`No room for ${name} (phone)`);
  }
  return svg(w, h, s, 'The share of the world’s people living where fertility is below 2.1, then each country at the year its fertility fell below 2.1, sized by its population in 2023.', 'ds g-atlas');
}

// ---------------------------------------------------------------------------------------------
// III. Twelve countries, one scale.
export function multiples(D: Data, phone: boolean, countries: string[]): string {
  const id = `mult${phone ? 'p' : 'w'}`, T = sz(phone), w = W(phone, 880);
  const cols = phone ? 3 : 4, gx = phone ? 12 : 26, gy = phone ? 40 : 46;
  const pw = (w - 22 - gx * (cols - 1)) / cols, ph = phone ? 70 : 100;
  const rowsN = Math.ceil(countries.length / cols);
  const h = rowsN * (ph + gy) + 30;
  const x = lin([1950, 2100], [0, pw]), y = lin([0, 8], [ph, 0]);
  let s = defs(id);
  // One shared scale, stated once at the top left.
  s += text(0, 13, phone ? 'Children per woman, 0 to 8, 1950 to 2100' : 'Children per woman on one scale, 0 to 8, 1950 to 2100; the world in grey', 'tk');
  countries.forEach((c, i) => {
    const ox = 22 + (i % cols) * (pw + gx), oy = Math.floor(i / cols) * (ph + gy) + 44;
    const S = D.named[c]!.tfr;
    s += `<g transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)})">`;
    s += line(0, y(0), pw, y(0), 'zero') + line(0, y(2.1), pw, y(2.1), 'repl') + line(x(EST), 0, x(EST), ph, 'seam');
    if (i % cols === 0) for (const t of [2, 6]) s += text(-5, y(t) + 3.5, String(t), 'tk', 'end');
    s += el('path', { d: pathOf(D.world.tfr.filter((p) => p[0] <= EST).map(([a, b]) => [x(a), y(b)])), class: 'named', 'stroke-width': 0.9 });
    s += el('path', { d: pathOf(S.filter((p) => p[0] <= EST).map(([a, b]) => [x(a), y(b)])), class: 'focus', 'stroke-width': phone ? 1.6 : 1.9 });
    s += el('path', { d: pathOf(S.filter((p) => p[0] >= EST).map(([a, b]) => [x(a), y(b)])), class: 'focus proj-dash', 'stroke-width': 1.3 });
    const now = at(S, EST);
    s += circle(x(EST), y(now), 2.3, 'focus-dot');
    // Name left, value right, never closer than 8 px; a long name drops the value to a second line.
    const nv = now.toFixed(2), nw = measure(c, 'sansMedium', T.lab), vw = measure(nv, 'sans', T.tick);
    s += text(0, -10, c, 'lab lab-strong');
    if (nw + vw + 8 <= pw) s += text(pw, -10, nv, 'tk', 'end');
    else s += text(pw, ph + 14, `${nv} in 2023`, 'tk', 'end');
    s += '</g>';
  });
  return svg(w, h, s, `Total fertility rate, 1950 to 2023 and the UN projection to 2100, in ${countries.length} countries, each against the world.`, 'ds g-atlas');
}

// ---------------------------------------------------------------------------------------------
// IV. The floor.
export function floor(D: Data, phone: boolean): string {
  const id = `floor${phone ? 'p' : 'w'}`, T = sz(phone), w = W(phone, 880);
  const m = { l: phone ? 30 : 36, r: phone ? 8 : 120, t: 44, b: 42 };
  const h = phone ? 360 : 420;
  const maxX = Math.max(...D.floor.map((f) => f.path.length - 1));
  const x = lin([0, Math.ceil(maxX / 10) * 10], [m.l, w - m.r]), y = lin([0.5, 2.5], [h - m.b, m.t]);
  const P = new Placer({ x: 0, y: 0, w, h });
  let s = defs(id) + yAxis(P, y, [0.5, 1, 1.5, 2, 2.5], m.l, w - m.r, 'children per woman', T.tick, (v) => v.toFixed(1));
  const top = Math.max(...D.floor.map((f) => f.max_after));
  // The gap no country has climbed back through, hatched in grey.
  s += el('rect', { x: m.l, y: y(2.1), width: w - m.r - m.l, height: y(top) - y(2.1), class: 'void', fill: fillOf('hq', id) });
  P.block({ x: m.l, y: y(2.1), w: w - m.r - m.l, h: y(top) - y(2.1) });
  s += line(m.l, y(2.1), w - m.r, y(2.1), 'repl');
  s += `<g>${D.floor.map((f) => el('path', { d: pathOf(f.path.map((v, i) => [x(i), y(v)])), class: 'ctx-strong', 'stroke-width': 0.8 })).join('')}</g>`;
  for (const f of D.floor) blockPath(P, f.path.map((v, i) => [x(i), y(v)] as Pt), 1.5);
  const ko = D.floor.find((f) => f.country === 'South Korea')!, md = D.floor.reduce((a, b) => (b.max_after > a.max_after ? b : a));
  s += el('path', { d: pathOf(md.path.map((v, i) => [x(i), y(v)])), class: 'named', 'stroke-width': 1.3 });
  s += el('path', { d: pathOf(ko.path.map((v, i) => [x(i), y(v)])), class: 'focus', 'stroke-width': phone ? 2.25 : 2.5 });
  const kEnd = ko.path.length - 1, mPk = md.path.indexOf(md.max_after);
  s += circle(x(kEnd), y(ko.tfr2023), 3.4, 'focus-dot') + circle(x(mPk), y(md.max_after), 2.6, 'named-dot');
  s += placeNote(P, { lines: [`South Korea ${ko.tfr2023.toFixed(2)}`], ax: x(kEnd), ay: y(ko.tfr2023), cls: 'lab lab-strong', size: T.lab, tries: [[8, 4, 'start'], [0, 20, 'end'], [-8, 4, 'end']] });
  if (!phone) s += text(w - m.r + 8, y(2.1) + 4, 'Replacement 2.1', 'lab');
  else s += placeNote(P, { lines: ['Replacement 2.1'], ax: w - m.r, ay: y(2.1), cls: 'lab', size: T.lab, tries: [[0, -6, 'end']] });
  const vl = phone ? 'None has come back up through here' : 'No country of a million people has come back up through here';
  const vw = measure(vl, 'sans', 11), vx = w - m.r - vw - 8;
  s += text(vx, y((2.1 + top) / 2) + 4, vl, 'void-lab');
  s += placeNote(P, { lines: phone ? ['Highest return:', `${md.country}, ${md.max_after.toFixed(2)}`] : [`The highest return: ${md.country}, ${md.max_after.toFixed(2)}`], ax: x(mPk), ay: y(md.max_after) + 3, size: T.note, tries: [[14, 46, 'start'], [30, 60, 'start'], [-14, 50, 'end']] });
  s += xAxis(P, x, Array.from({ length: x.d[1] / 10 + 1 }, (_, i) => i * 10), h - m.b, T.tick);
  s += text(m.l, h - 4, 'Years after first falling below 1.5', 'tk');
  return svg(w, h, s, 'Total fertility rate of each country of a million people or more that fell below 1.5, from the year it did, to 2023.', 'ds g-atlas');
}

// ---------------------------------------------------------------------------------------------
// VI. The peak: births with the UN's ranges, and deaths.
export function peak(D: Data, phone: boolean): string {
  const id = `peak${phone ? 'p' : 'w'}`, T = sz(phone), w = W(phone, 880);
  const m = { l: phone ? 30 : 36, r: phone ? 16 : 104, t: 44, b: 28 };
  const h = phone ? 360 : 440;
  const x = lin([1950, 2100], [m.l, w - m.r]), y = lin([0, 160e6], [h - m.b, m.t]);
  const P = new Placer({ x: 0, y: 0, w, h });
  let s = defs(id) + yAxis(P, y, [0, 50e6, 100e6, 150e6], m.l, w - m.r, 'million a year', T.tick, (v) => String(v / 1e6));
  s += seam(P, x(EST), m.t - 22, h - m.b, T.tick, phone);
  const B = D.world.births, De = D.world.deaths;
  s += bands(id, D.intervals.births['World']!, x, y, P);
  const seg = (S: Pt[], a: number, b: number) => S.filter((p) => p[0] >= a && p[0] <= b).map(([yr, v]) => [x(yr), y(v)] as Pt);
  s += el('path', { d: pathOf(seg(De, 1950, EST)), class: 'named', 'stroke-width': 1.4 }) + el('path', { d: pathOf(seg(De, EST, 2100)), class: 'named proj-dash', 'stroke-width': 1.2 });
  s += el('path', { d: pathOf(seg(B, 1950, EST)), class: 'focus', 'stroke-width': phone ? 2.25 : 2.5 }) + el('path', { d: pathOf(seg(B, EST, 2100)), class: 'focus proj-dash', 'stroke-width': 1.8 });
  blockPath(P, seg(B, 1950, 2100), 3); blockPath(P, seg(De, 1950, 2100), 3);
  const pk = B.filter((p) => p[0] <= EST).reduce((a, b) => (b[1] > a[1] ? b : a));
  const cross = B.find((p) => p[0] > EST && at(De, p[0]) > p[1])![0];
  s += circle(x(pk[0]), y(pk[1]), 3.5, 'focus-dot') + circle(x(cross), y(at(B, cross)), 3.5, 'focus-dot');
  s += placeNote(P, { lines: phone ? [`Births peak, ${pk[0]}:`, `${Math.round(pk[1] / 1e6)} million`] : [`Births peak in ${pk[0]}:`, `${Math.round(pk[1] / 1e6)} million babies`], ax: x(pk[0]), ay: y(pk[1]) - 3, size: T.note, tries: [[-14, -40, 'end'], [-10, -58, 'end'], [-20, 40, 'end']] });
  s += placeNote(P, { lines: phone ? [`${cross}: deaths`, 'overtake births'] : [`${cross}: deaths overtake births`], ax: x(cross), ay: y(at(B, cross)) + 3, size: T.note, tries: [[-10, 60, 'end'], [-10, 80, 'end'], [-10, 100, 'end']] });
  const lo = at(D.intervals.births['World']!.lo95, 2100), hi = at(D.intervals.births['World']!.hi95, 2100);
  s += placeNote(P, { lines: phone ? ['UN range in 2100:', `${Math.round(lo / 1e6)} to ${Math.round(hi / 1e6)} million`] : [`The UN's 95% range in 2100:`, `${Math.round(lo / 1e6)} to ${Math.round(hi / 1e6)} million births`], ax: x(2096), ay: y(hi) + 4, size: T.note, tries: [[-6, -34, 'end'], [-6, -52, 'end']] });
  if (!phone) {
    const [a, b] = spread([y(at(B, 2100)), y(at(De, 2100))], T.lab * 1.35, m.t, h - m.b);
    s += text(w - m.r + 8, a! + 4, 'Births', 'lab lab-strong') + text(w - m.r + 8, b! + 4, 'Deaths', 'lab');
  } else {
    s += placeNote(P, { lines: ['Births'], ax: x(1952), ay: y(at(B, 1952)), cls: 'lab lab-strong', size: T.lab, tries: [[2, -10, 'start'], [2, -24, 'start']] });
    s += placeNote(P, { lines: ['Deaths'], ax: x(1952), ay: y(at(De, 1952)), cls: 'lab', size: T.lab, tries: [[2, 18, 'start'], [2, 30, 'start']] });
  }
  s += xAxis(P, x, phone ? [1950, 2000, 2050, 2100] : [1950, 1975, 2000, 2023, 2050, 2075, 2100], h - m.b, T.tick);
  return svg(w, h, s, 'Births and deaths in the world each year, 1950 to 2023, and the UN projection to 2100 with its 80 and 95 per cent ranges for births.', 'ds g-atlas');
}

// ---------------------------------------------------------------------------------------------
// VII. Where the world's babies are born, 1950 to 2100: shares stacked to 100.
export function regions(D: Data, phone: boolean): string {
  const id = `reg${phone ? 'p' : 'w'}`, T = sz(phone), w = W(phone, 880);
  const m = { l: phone ? 30 : 36, r: phone ? 16 : 150, t: 40, b: 28 };
  const h = phone ? 330 : 400;
  const x = lin([1950, 2100], [m.l, w - m.r]), y = lin([0, 100], [h - m.b, m.t]);
  const P = new Placer({ x: 0, y: 0, w, h });
  let s = defs(id);
  const af = D.birthShare['Africa (UN)']!, as = D.birthShare['Asia (UN)']!;
  const yrs = af.map((p) => p[0]);
  const l1 = yrs.map((yr) => [x(yr), y(at(af, yr))] as Pt);
  const l2 = yrs.map((yr) => [x(yr), y(at(af, yr) + at(as, yr))] as Pt);
  const base = yrs.map((yr) => [x(yr), y(0)] as Pt), topL = yrs.map((yr) => [x(yr), y(100)] as Pt);
  s += el('path', { d: areaOf(l1, base), class: 'area-focus' });
  s += el('path', { d: areaOf(l2, l1), class: 'area-q3' });
  s += el('path', { d: areaOf(topL, l2), class: 'area-q' });
  // Ground gaps between layers, then the projection hatched over every layer.
  s += el('path', { d: pathOf(l1), class: 'gap' }) + el('path', { d: pathOf(l2), class: 'gap' });
  s += el('rect', { x: x(EST), y: y(100), width: x(2100) - x(EST), height: y(0) - y(100), class: 'hatched', fill: fillOf('hink', id) });
  s += seam(P, x(EST), m.t - 14, h - m.b, T.tick, phone);
  for (const t of [0, 50, 100]) { s += text(m.l - 6, y(t) + 4, String(t), 'tk', 'end'); }
  s += text(m.l - 6, y(100) - 14 - T.tick, 'of every 100 babies', 'tk');
  const lab = (yr: number, v: number, top: number, bot: number, name: string, cls: string) => {
    const cy = (top + bot) / 2;
    return text(x(yr), cy - 2, name, cls, 'middle') + text(x(yr), cy + T.tick + 1, String(Math.round(v)), `${cls} lab-n`, 'middle');
  };
  const at2 = (yr: number) => [at(af, yr), at(as, yr)] as const;
  for (const yr of phone ? [1965, 2085] : [1960, 2010, 2085]) {
    const [a, b] = at2(yr);
    s += lab(yr, a, y(a), y(0), 'Africa', 'in-dark');
    s += lab(yr, b, y(a + b), y(a), 'Asia', 'in-dark');
    s += lab(yr, 100 - a - b, y(100), y(a + b), phone ? 'Rest' : 'Rest of the world', 'in-light');
  }
  s += xAxis(P, x, phone ? [1950, 2000, 2050, 2100] : [1950, 1975, 2000, 2023, 2050, 2075, 2100], h - m.b, T.tick);
  if (!phone) {
    const e = at(af, 2100);
    s += text(w - m.r + 8, y(e / 2) + 4, `Africa ${Math.round(e)} in 2100`, 'lab lab-strong');
  }
  return svg(w, h, s, 'Of every 100 babies born in the world, how many are born in Africa, in Asia and in the rest of the world, 1950 to 2023, and the UN projection to 2100.', 'ds g-atlas');
}

// ---------------------------------------------------------------------------------------------
// VIII. India: its fertility against the world's, and the people it adds up to.
export function india(D: Data, phone: boolean): string {
  const id = `ind${phone ? 'p' : 'w'}`, T = sz(phone), w = W(phone, 880);
  const m = { l: phone ? 34 : 40, r: phone ? 16 : 104, t: 44, b: 28 };
  const h1 = phone ? 250 : 280, gap = 50, h2 = phone ? 200 : 230;
  const h = h1 + gap + h2;
  const x = lin([1950, 2100], [m.l, w - m.r]);
  const y1 = lin([0, 6.5], [h1 - 8, m.t]), y2 = lin([0, 2.4e9], [h - m.b, h1 + gap + 26]);
  const P = new Placer({ x: 0, y: 0, w, h });
  let s = defs(id) + yAxis(P, y1, [0, 2, 4, 6], m.l, w - m.r, 'children per woman', T.tick);
  s += yAxis(P, y2, [0, 1e9, 2e9], m.l, w - m.r, 'people', T.tick, (v) => (v === 0 ? '0' : `${v / 1e9} bn`));
  s += seam(P, x(EST), m.t - 22, h - m.b, T.tick, phone);
  s += line(m.l, y1(2.1), w - m.r, y1(2.1), 'repl');
  const I = D.named['India']!, Wd = D.world.tfr;
  const seg = (S: Pt[], y: (v: number) => number, a: number, b: number) => S.filter((p) => p[0] >= a && p[0] <= b).map(([yr, v]) => [x(yr), y(v)] as Pt);
  s += bands(id, D.intervals.tfr['India']!, x, y1, P) + bands(id, D.intervals.pop['India']!, x, y2, P);
  s += el('path', { d: pathOf(seg(Wd, y1, 1950, EST)), class: 'named', 'stroke-width': 1.2 }) + el('path', { d: pathOf(seg(Wd, y1, EST, 2100)), class: 'named proj-dash', 'stroke-width': 1 });
  for (const [S, y] of [[I.tfr, y1], [I.pop, y2]] as const) {
    s += el('path', { d: pathOf(seg(S, y, 1950, EST)), class: 'focus', 'stroke-width': phone ? 2.25 : 2.5 }) + el('path', { d: pathOf(seg(S, y, EST, 2100)), class: 'focus proj-dash', 'stroke-width': 1.8 });
    blockPath(P, seg(S, y, 1950, 2100), 3);
  }
  blockPath(P, seg(Wd, y1, 1950, 2100), 3);
  const cr = I.tfr.find((p) => p[0] > 1950 && p[1] < 2.1)!;
  s += circle(x(cr[0]), y1(cr[1]), 3.4, 'focus-dot');
  s += placeNote(P, { lines: phone ? [`${cr[0]}: below`, 'replacement'] : [`${cr[0]}: below replacement`], ax: x(cr[0]), ay: y1(cr[1]) - 3, size: T.note, tries: [[12, -56, 'start'], [14, -76, 'start'], [-12, -60, 'end']] });
  const pk = I.pop.reduce((a, b) => (b[1] > a[1] ? b : a));
  s += circle(x(pk[0]), y2(pk[1]), 3.4, 'focus-dot');
  s += placeNote(P, { lines: phone ? [`Peak ${pk[0]}:`, `${(pk[1] / 1e9).toFixed(2)} billion`] : [`${pk[0]}: peaks at ${(pk[1] / 1e9).toFixed(2)} billion`], ax: x(pk[0]), ay: y2(pk[1]) - 3, size: T.note, tries: [[-12, -40, 'end'], [-12, -58, 'end'], [12, -60, 'start']] });
  if (!phone) {
    s += text(w - m.r + 8, y1(at(I.tfr, 2100)) + 16, 'India', 'lab lab-strong') + text(w - m.r + 8, y1(at(Wd, 2100)) - 6, 'World', 'lab') + text(w - m.r + 8, y1(2.1) - 22, 'Replacement', 'lab');
    s += text(w - m.r + 8, y2(at(I.pop, 2100)) + 4, 'India', 'lab lab-strong');
  } else {
    s += placeNote(P, { lines: ['India'], ax: x(1953), ay: y1(at(I.tfr, 1953)), cls: 'lab lab-strong', size: T.lab, tries: [[0, -12, 'start'], [0, 18, 'start']] });
    s += placeNote(P, { lines: ['World'], ax: x(1990), ay: y1(at(Wd, 1990)), cls: 'lab', size: T.lab, tries: [[-4, 20, 'end'], [0, 24, 'start']] });
  }
  s += xAxis(P, x, phone ? [1950, 2000, 2050, 2100] : [1950, 1975, 2000, 2023, 2050, 2075, 2100], h - m.b, T.tick);
  return svg(w, h, s, "India's total fertility rate against the world's, and India's population, 1950 to 2023, with the UN projection and its 80 and 95 per cent ranges to 2100.", 'ds g-atlas');
}

// India's people by age: 2023 in ink, 2061 (the peak) as a hatched outline over it.
export function pyramid(D: Data, phone: boolean): string {
  const id = `pyr${phone ? 'p' : 'w'}`, T = sz(phone), w = W(phone, 880);
  const a = D.pyramid.India['2023']!.filter((r) => r[1] <= 95), b = D.pyramid.India['2061']!.filter((r) => r[1] <= 95);
  const ages = a.length, bh = phone ? 13 : 15, gapB = 2;
  const top = 40, h = top + ages * (bh + gapB) + 40;
  const mid = w / 2, half = (phone ? w / 2 - 34 : 300);
  const max = Math.max(...a.map((r) => Math.max(r[2], r[3])), ...b.map((r) => Math.max(r[2], r[3])));
  const s0 = lin([0, max], [0, half]);
  const P = new Placer({ x: 0, y: 0, w, h });
  let s = defs(id);
  const yOf = (i: number) => top + (ages - 1 - i) * (bh + gapB);
  a.forEach((r, i) => {
    s += el('rect', { x: mid - 14 - s0(r[2]), y: yOf(i), width: s0(r[2]), height: bh, class: 'bar-focus' });
    s += el('rect', { x: mid + 14, y: yOf(i), width: s0(r[3]), height: bh, class: 'bar-focus' });
  });
  // 2061 as a silhouette over 2023: one stepped outline a side, so both shapes read at once.
  const outline = (side: 1 | -1, col: 2 | 3) => {
    const pts: Pt[] = [];
    for (let i = b.length - 1; i >= 0; i--) {
      const xx = mid + side * (14 + s0(b[i]![col]));
      pts.push([xx, yOf(i) - gapB / 2], [xx, yOf(i) + bh + gapB / 2]);
    }
    return el('path', { d: pathOf([[mid + side * 14, pts[0]![1]], ...pts, [mid + side * 14, pts[pts.length - 1]![1]]]), class: 'outline-proj' });
  };
  s += outline(-1, 2) + outline(1, 3);
  a.forEach((r, i) => { if (i % 2 === 0) s += text(mid, yOf(i) + bh - 3, r[1] === 95 ? '95+' : String(r[1]), 'tk', 'middle'); });
  s += text(mid - 14, top - 12, 'Men', 'lab', 'end') + text(mid + 14, top - 12, 'Women', 'lab');
  const sc = phone ? [0, 50e6] : [0, 25e6, 50e6, 75e6];
  for (const v of sc) {
    s += line(mid - 14 - s0(v), h - 34, mid - 14 - s0(v), h - 30, 'tickmark') + line(mid + 14 + s0(v), h - 34, mid + 14 + s0(v), h - 30, 'tickmark');
    s += text(mid - 14 - s0(v), h - 18, v ? `${v / 1e6}m` : '0', 'tk', 'middle') + text(mid + 14 + s0(v), h - 18, v ? `${v / 1e6}m` : '0', 'tk', 'middle');
  }
  // A key drawn as the marks themselves.
  const kx = phone ? 6 : mid + half - 130, ky = phone ? h - 4 : top + 8;
  if (!phone) {
    s += el('rect', { x: kx, y: ky, width: 18, height: 11, class: 'bar-focus' }) + text(kx + 24, ky + 10, '2023', 'lab lab-strong');
    s += el('path', { d: `M${kx} ${ky + 31}V${ky + 20}H${kx + 18}V${ky + 31}`, class: 'outline-proj' }) + text(kx + 24, ky + 30, '2061, projected', 'lab');
  }
  void P; void T;
  return svg(w, h + (phone ? 26 : 0), s + (phone ? el('rect', { x: 0, y: h + 6, width: 16, height: 10, class: 'bar-focus' }) + text(22, h + 15, '2023', 'lab lab-strong') + el('path', { d: `M70 ${h + 16}V${h + 6}H86V${h + 16}`, class: 'outline-proj' }) + text(92, h + 15, '2061, projected', 'lab') : ''), "India's population by five-year age group and sex in 2023, and in 2061 in the UN's medium projection.", 'ds g-atlas');
}
