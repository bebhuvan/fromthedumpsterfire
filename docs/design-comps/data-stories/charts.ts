// The fertility story's figures, drawn from data/fertility.json. Each figure is drawn for a width
// and a grammar ("plates", "desk" or "specimen"); the phone figure is laid out again, not scaled.

import { areaOf, circle, el, esc, fmtPop, hatch, line, lin, measure, pathOf, Placer, spread, svg, swarm, text, type Bee } from './kit';

export type Grammar = 'plates' | 'desk' | 'specimen';
type Pt = [number, number];
export type Data = {
  world: { tfr: Pt[]; births: Pt[]; deaths: Pt[]; pop: Pt[] };
  crossing: { country: string; code: string; year: number | null; kind: 'before' | 'estimate' | 'projected' | 'never'; pop2023: number; tfr2023: number }[];
  share: Pt[];
  floor: { country: string; first: number; min: number; max_after: number; tfr2023: number; path: number[] }[];
  birthShare: Record<string, Pt[]>;
  named: Record<string, { tfr: Pt[]; pop: Pt[] }>;
  field: Record<string, number[]>;
  fieldProj: Record<string, number[]>;
};

const EST_END = 2023;
const at = (s: Pt[], y: number) => s.find((p) => p[0] === y)![1];

/** Weights and sizes per grammar. */
function G(g: Grammar, phone: boolean) {
  const base = phone ? 12 : 13;
  if (g === 'plates') return { focus: 1.9, ctx: 0.55, label: base, ann: base, tick: phone ? 10.5 : 11, grid: false, proj: 'hatch' as const };
  if (g === 'desk') return { focus: phone ? 2.5 : 3, ctx: 0.7, label: phone ? 13 : 14, ann: phone ? 13 : 15, tick: phone ? 11 : 12, grid: true, proj: 'dots' as const };
  return { focus: 1.5, ctx: 0.5, label: phone ? 11 : 12, ann: phone ? 11 : 12, tick: 10.5, grid: true, proj: 'dots' as const };
}

/** A projected stretch of a line: dotted in the desk and specimen grammars, a fine dash on a plate. */
const projCls = (g: Grammar) => (g === 'plates' ? 'proj-dash' : 'proj-dot');

/** The seam between what the UN has estimated and what it projects. */
function seam(x: number, top: number, bottom: number, g: Grammar, size: number, phone: boolean) {
  const lab = phone ? ['Estimates', 'Projected'] : ['UN estimates', 'UN projection'];
  return line(x, top, x, bottom, 'seam') +
    text(x - 6, top + size, lab[0]!, 'tk', 'end') + text(x + 6, top + size, lab[1]!, 'tk');
}

function yTicks(y: (v: number) => number, ticks: number[], x0: number, x1: number, unit: string, g: Grammar, size: number, fmt = (v: number) => String(v)) {
  const T = G(g, false);
  let s = '';
  for (const t of ticks) {
    if (T.grid) s += line(x0, y(t), x1, y(t), t === 0 ? 'zero' : 'grid');
    else s += line(x0 - 4, y(t), x0, y(t), 'tickmark');
    s += text(x0 - 6, y(t) + size * 0.35, fmt(t), 'tk', 'end');
  }
  const top = ticks[ticks.length - 1]!;
  s += text(x0 - 6 - measure(fmt(top), 'sans', size), y(top) - size - 2, unit, 'tk');
  return s;
}
function xTicks(x: (v: number) => number, ticks: number[], y0: number, size: number) {
  return ticks.map((t) => line(x(t), y0, x(t), y0 + 4, 'tickmark') + text(x(t), y0 + 6 + size, String(t), 'tk tnum', 'middle')).join('');
}

/** A machine annotation: wrapped lines in the machine's blue, with a leader to the point. */
function note(lines: string[], x: number, y: number, anchor: 'start' | 'end' | 'middle', size: number, lead?: { x: number; y: number }) {
  let s = '';
  if (lead) s += line(lead.x, lead.y, x + (anchor === 'end' ? 2 : anchor === 'start' ? -2 : 0), y - size * 0.35, 'leader') + circle(lead.x, lead.y, 2.2, 'leader-dot');
  lines.forEach((l, i) => (s += text(x, y + i * size * 1.3, l, 'ann halo', anchor)));
  return s;
}

// ---------------------------------------------------------------------------------------------
// I. The fall: every country since 1950, the world in ink, carried on by the UN to 2100.
export function fall(D: Data, w: number, g: Grammar): string {
  const phone = w < 500, T = G(g, phone);
  const m = { l: phone ? 30 : 40, r: phone ? 12 : 120, t: phone ? 46 : 52, b: 30 };
  const h = phone ? 360 : 440;
  const x = lin([1950, 2100], [m.l, w - m.r]), y = lin([0, 8], [h - m.b, m.t]);
  let s = yTicks(y, [0, 2, 4, 6, 8], m.l, w - m.r, 'children per woman', g, T.tick);
  s += seam(x(EST_END), m.t - 30, h - m.b, g, T.tick, phone);
  // Context: every country of a million people or more, to 2023.
  const years = Array.from({ length: EST_END - 1950 + 1 }, (_, i) => 1950 + i);
  const ctx = Object.entries(D.field).map(([, v]) => el('path', { d: pathOf(years.map((yr, i) => [x(yr), y(v[i]!)])), class: 'ctx', 'stroke-width': T.ctx, pathLength: 1 })).join('');
  s += `<g class="field">${ctx}</g>`;
  // What the UN projects for each of them: fainter, so the fan reads as a forecast, not a record.
  const py = Array.from({ length: 2100 - EST_END + 1 }, (_, i) => EST_END + i);
  s += `<g class="field-proj">${Object.values(D.fieldProj).map((v) => el('path', { d: pathOf(py.map((yr, i) => [x(yr), y(v[i]!)])), class: 'ctx-proj', 'stroke-width': T.ctx * 0.8 })).join('')}</g>`;
  // Replacement.
  s += line(m.l, y(2.1), w - m.r, y(2.1), 'repl');
  const world = D.world.tfr;
  const est = world.filter((p) => p[0] <= EST_END).map(([a, b]) => [x(a), y(b)] as Pt);
  const proj = world.filter((p) => p[0] >= EST_END).map(([a, b]) => [x(a), y(b)] as Pt);
  // Two named countries at the ends of the range, quiet but darker.
  for (const c of ['South Korea', 'Niger']) {
    const v = D.named[c]!.tfr.filter((p) => p[0] <= EST_END).map(([a, b]) => [x(a), y(b)] as Pt);
    s += el('path', { d: pathOf(v), class: 'named', 'stroke-width': T.focus * 0.55, pathLength: 1 });
    const end = v[v.length - 1]!;
    s += circle(end[0], end[1], 2.6, 'named-dot');
    const val = at(D.named[c]!.tfr, EST_END).toFixed(2);
    s += text(end[0] + 7, end[1] + T.label * 0.35, `${c} ${val}`, 'lab halo');
  }
  s += el('path', { d: pathOf(est), class: 'focus', 'stroke-width': T.focus, pathLength: 1 });
  s += el('path', { d: pathOf(proj), class: `focus ${projCls(g)}`, 'stroke-width': T.focus });
  const pk = world.reduce((a, b) => (b[1] > a[1] ? b : a));
  s += circle(x(pk[0]), y(pk[1]), 3.6, 'focus-dot');
  s += circle(x(EST_END), y(at(world, EST_END)), 3.6, 'focus-dot');
  const end = world[world.length - 1]!;
  // End labels on the right: the world in 2100 and the replacement line, spread apart.
  if (!phone) {
    const [ly1, ly2] = spread([y(end[1]), y(2.1)], T.label * 1.25, m.t, h - m.b);
    s += text(w - m.r + 8, ly1! + T.label * 0.35, `World ${end[1].toFixed(2)}`, 'lab lab-strong');
    s += text(w - m.r + 8, ly2! + T.label * 0.35, 'Replacement 2.1', 'lab');
  } else {
    s += text(x(2100), y(end[1]) + T.label * 1.4, `World ${end[1].toFixed(2)}`, 'lab lab-strong halo', 'end');
    s += text(x(1950) + 2, y(2.1) + T.label * 1.2, 'Replacement 2.1', 'lab halo');
  }
  // The machine's two annotations, numbers from the rows.
  s += note(phone ? ['Peak, 1963:', `${pk[1].toFixed(2)}`] : [`The world's peak, 1963:`, `${pk[1].toFixed(2)} children per woman`], x(pk[0]) + (phone ? 10 : 14), y(7.6), 'start', T.ann, { x: x(pk[0]), y: y(pk[1]) - 5 });
  const now = at(world, EST_END);
  s += note([`2023: ${now.toFixed(2)}`], x(EST_END) + 10, y(now) - (phone ? 26 : 34), 'start', T.ann, { x: x(EST_END) + 3, y: y(now) - 4 });
  s += xTicks(x, phone ? [1950, 2000, 2050, 2100] : [1950, 1975, 2000, 2023, 2050, 2075, 2100], h - m.b, T.tick);
  return svg(w, h, s, 'Total fertility rate of every country of a million people or more, 1950 to 2023, and the world to 2100.', `ds g-${g}`);
}

// ---------------------------------------------------------------------------------------------
// II. The crossing: the year each country fell below replacement, sized by its people.
const NAMED_CROSS = ['India', 'China', 'United States', 'Japan', 'Brazil', 'Russia', 'Nigeria', 'Pakistan', 'Indonesia', 'Bangladesh', 'Ethiopia', 'Egypt', 'Mexico', 'Iran', 'South Korea', 'Philippines', 'DR Congo', 'Democratic Republic of Congo', 'Germany'];

export function crossingShare(D: Data, w: number, g: Grammar): string {
  const phone = w < 500, T = G(g, phone);
  const m = { l: phone ? 34 : 40, r: phone ? 14 : 150, t: 34, b: 28 };
  const h = phone ? 190 : 200;
  const x = lin([1950, phone ? 2023 : 2100], [m.l, w - m.r]), y = lin([0, 100], [h - m.b, m.t]);
  let s = yTicks(y, [0, 50, 100], m.l, phone ? w - m.r : x(EST_END), '% of people', g, T.tick);
  const pts = D.share.map(([a, b]) => [x(a), y(b)] as Pt);
  // A year is a step: the share holds for the year, then moves.
  const step: Pt[] = [];
  pts.forEach((p, i) => { if (i) step.push([p[0], pts[i - 1]![1]]); step.push(p); });
  s += el('path', { d: areaOf(step, step.map(([a]) => [a, y(0)] as Pt)), class: 'wash' });
  s += el('path', { d: pathOf(step), class: 'focus', 'stroke-width': T.focus * 0.8, pathLength: 1 });
  const last = D.share[D.share.length - 1]!;
  s += circle(x(last[0]), y(last[1]), 3.4, 'focus-dot');
  const china = at(D.share, 1991), india = at(D.share, 2020);
  s += note(['China, 1991'], x(1991) - 8, y(china) - 12, 'end', T.ann, { x: x(1991), y: y(china) - 3 });
  s += note(['India, 2020'], x(2020) - 8, y(india) - 8, 'end', T.ann, { x: x(2020) - 1, y: y(india) - 3 });
  s += text(x(last[0]) + 8, y(last[1]) + 4, phone ? `${Math.round(last[1])}%` : `${Math.round(last[1])}% of the world's people, 2023`, 'lab lab-strong halo', phone ? 'start' : 'start');
  s += xTicks(x, phone ? [1950, 1970, 1990, 2010, 2023] : [1950, 1975, 2000, 2023, 2050, 2075, 2100].filter((t) => t <= 2100), h - m.b, T.tick);
  return svg(w, h, s, "Share of the world's people living in a country below replacement fertility, 1950 to 2023.", `ds g-${g}`);
}

export function crossing(D: Data, w: number, g: Grammar): string {
  const phone = w < 500, T = G(g, phone);
  const rows = D.crossing.filter((c) => c.year !== null || c.kind === 'never');
  const maxPop = Math.max(...rows.map((c) => c.pop2023));
  const R = phone ? 21 : 33;
  const rOf = (p: number) => Math.max(phone ? 1.7 : 2.1, R * Math.sqrt(p / maxPop));
  const nice = (c: string) => (c === 'Democratic Republic of Congo' ? 'DR Congo' : c);
  const named = new Set(NAMED_CROSS);
  if (!phone) {
    const m = { l: 40, r: 30, t: 30, b: 34 };
    const x = lin([1950, 2100], [m.l, w - m.r - 70]);
    const xNever = w - m.r - 22;
    const bees: Bee[] = rows.map((c) => ({ key: c.country, x: c.kind === 'never' ? xNever : x(Math.max(1950, c.year!)), r: rOf(c.pop2023) }));
    const placed = swarm(bees, 1.4, 130);
    const ext = Math.max(...placed.map((b) => Math.abs(b.y!) + b.r));
    const h = m.t + 2 * ext + 70 + m.b;
    const cy = m.t + 40 + ext;
    const by = new Map(placed.map((b) => [b.key, b]));
    let s = seam(x(EST_END), m.t - 18, h - m.b, g, T.tick, false);
    s += line(m.l, cy, x(2100), cy, 'axis-soft');
    s += line(xNever - 26, m.t, xNever - 26, h - m.b, 'seam');
    s += text(xNever, m.t - 18 + T.tick, 'Not by', 'tk', 'middle') + text(xNever, m.t - 18 + T.tick * 2.25, '2100', 'tk', 'middle');
    const P = new Placer({ x: 0, y: 0, w, h: h - m.b });
    for (const c of rows) {
      const b = by.get(c.country)!;
      const k = c.country === 'India' ? 'bee-focus' : c.kind === 'projected' || c.kind === 'never' ? 'bee-proj' : 'bee';
      s += el('circle', { cx: b.x, cy: cy + b.y!, r: Math.max(0.8, b.r - (k === 'bee-proj' ? 0.5 : 0)), class: k });
      P.blockCircle(b.x, cy + b.y!, b.r);
    }
    // Names: the biggest inside their circles, the rest beside on short leaders.
    let labs = '';
    for (const c of rows.filter((c) => named.has(c.country)).sort((a, b) => b.pop2023 - a.pop2023)) {
      const b = by.get(c.country)!, bx = b.x, byy = cy + b.y!;
      const name = nice(c.country), yr = c.kind === 'never' ? '' : String(c.year);
      const lw = Math.max(measure(name, 'sansMedium', T.label), measure(yr, 'sans', T.tick));
      if (b.r * 2 > lw + 8) {
        labs += text(bx, byy - 1, name, 'lab-in', 'middle') + text(bx, byy + T.tick + 1, yr, 'lab-in-sub tnum', 'middle');
        continue;
      }
      const hgt = T.label + T.tick + 4;
      const cands = [
        { x: bx - lw / 2, y: byy - b.r - 6 - hgt }, { x: bx - lw / 2, y: byy + b.r + 6 },
        { x: bx + b.r + 6, y: byy - hgt / 2 }, { x: bx - b.r - 6 - lw, y: byy - hgt / 2 },
        { x: bx - lw / 2, y: byy - b.r - 22 - hgt }, { x: bx - lw / 2, y: byy + b.r + 22 },
        { x: bx + b.r + 18, y: byy - hgt - 10 }, { x: bx - b.r - 18 - lw, y: byy + 10 },
        { x: bx - lw / 2, y: byy - b.r - 40 - hgt }, { x: bx - lw / 2, y: byy + b.r + 40 },
      ];
      const spot = cands.find((q) => P.free({ ...q, w: lw, h: hgt }));
      if (!spot) continue;
      P.take({ ...spot, w: lw, h: hgt });
      const lx = spot.x + lw / 2, top = spot.y;
      const near = top > byy ? top - 1 : top + hgt + 1;
      if (Math.abs(near - byy) > b.r + 8 || spot.x > bx + b.r || spot.x + lw < bx - b.r) labs += line(bx, byy + (near > byy ? b.r : -b.r), lx, near, 'leader-q');
      labs += text(lx, top + T.label - 1, name, 'lab lab-strong', 'middle') + text(lx, top + T.label + T.tick + 1, yr, 'tk tnum', 'middle');
    }
    s += labs;
    s += xTicks(x, [1950, 1975, 2000, 2023, 2050, 2075, 2100], h - m.b, T.tick);
    return svg(w, h, s, 'Each country of a million people or more, placed at the year its fertility fell below 2.1, sized by its population in 2023.', `ds g-${g}`);
  }
  // Phone: the years run down the page, the swarm across it.
  const m = { l: 40, r: 10, t: 34, b: 20 };
  const pxYear = 6.2;
  const yOf = (yr: number) => m.t + (yr - 1950) * pxYear;
  const cx = m.l + (w - m.l - m.r) / 2;
  const half = (w - m.l - m.r) / 2 - 2;
  const yNever = yOf(2100) + 54; // Countries that do not cross by 2100, the end of the UN's projection.
  const bees: Bee[] = rows.map((c) => ({ key: c.country, x: c.kind === 'never' ? yNever : yOf(Math.max(1950, c.year!)), r: rOf(c.pop2023) }));
  const placed = swarm(bees, 1.2, half);
  const by = new Map(placed.map((b) => [b.key, b]));
  const h = yNever + 40 + m.b;
  let s = '';
  for (const t of [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2023, 2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100]) {
    s += line(m.l, yOf(t), w - m.r, yOf(t), t === EST_END ? 'seam' : 'grid') + text(m.l - 6, yOf(t) + 4, String(t), 'tk tnum', 'end');
  }
  s += text(w - m.r, yOf(EST_END) - 5, 'Projected below', 'tk', 'end');
  s += line(m.l, yNever - 24, w - m.r, yNever - 24, 'seam') + text(m.l - 6, yNever - 2, 'Not by', 'tk', 'end') + text(m.l - 6, yNever + 10, '2100', 'tk', 'end');
  const P = new Placer({ x: m.l, y: 0, w: w - m.l - m.r, h });
  for (const c of rows) {
    const b = by.get(c.country)!;
    const k = c.country === 'India' ? 'bee-focus' : c.kind === 'projected' || c.kind === 'never' ? 'bee-proj' : 'bee';
    s += el('circle', { cx: cx + b.y!, cy: b.x, r: Math.max(0.7, b.r - (k === 'bee-proj' ? 0.5 : 0)), class: k });
    P.blockCircle(cx + b.y!, b.x, b.r);
  }
  for (const c of rows.filter((c) => named.has(c.country)).sort((a, b) => b.pop2023 - a.pop2023)) {
    const b = by.get(c.country)!, bx = cx + b.y!, byy = b.x;
    const name = nice(c.country), yr = c.kind === 'never' ? '' : ` ${c.year}`;
    if (b.r * 2 > measure(name, 'sansMedium', T.label) + 6) {
      s += text(bx, byy - 1, name, 'lab-in', 'middle') + text(bx, byy + T.tick + 1, yr.trim(), 'lab-in-sub tnum', 'middle');
      continue;
    }
    const t = name + yr, lw = measure(t, 'sansMedium', T.label), hgt = T.label + 2;
    const cands = [
      { x: bx + b.r + 5, y: byy - hgt / 2 }, { x: bx - b.r - 5 - lw, y: byy - hgt / 2 },
      { x: bx + b.r + 18, y: byy - hgt / 2 - 10 }, { x: bx - b.r - 18 - lw, y: byy - hgt / 2 + 10 },
      { x: bx + b.r + 30, y: byy - hgt / 2 + 14 }, { x: bx - b.r - 30 - lw, y: byy - hgt / 2 - 14 },
    ];
    const spot = cands.find((q) => P.free({ ...q, w: lw, h: hgt }));
    if (!spot) continue;
    P.take({ ...spot, w: lw, h: hgt });
    const left = spot.x > bx;
    if (Math.abs(spot.x - bx) > b.r + 7 && Math.abs(spot.x + lw - bx) > b.r + 7) s += line(bx + (left ? b.r : -b.r), byy, left ? spot.x - 2 : spot.x + lw + 2, spot.y + hgt / 2, 'leader-q');
    s += text(spot.x, spot.y + T.label - 1, t, 'lab lab-strong');
  }
  return svg(w, h, s, 'Each country placed at the year its fertility fell below 2.1, sized by its population in 2023.', `ds g-${g}`);
}

// ---------------------------------------------------------------------------------------------
// III. The floor: every country that fell below 1.5, from that year on. None came back.
export function floor(D: Data, w: number, g: Grammar): string {
  const phone = w < 500, T = G(g, phone);
  const m = { l: phone ? 30 : 40, r: phone ? 12 : 130, t: 40, b: 40 };
  const h = phone ? 330 : 380;
  const maxX = Math.max(...D.floor.map((f) => f.path.length - 1));
  const x = lin([0, Math.ceil(maxX / 10) * 10], [m.l, w - m.r]), y = lin([0.5, 2.5], [h - m.b, m.t]);
  let s = yTicks(y, [0.5, 1, 1.5, 2, 2.5], m.l, w - m.r, 'children per woman', g, T.tick, (v) => v.toFixed(1));
  // The band no country has re-entered once below 1.5.
  const top = Math.max(...D.floor.map((f) => f.max_after));
  s += el('rect', { x: m.l, y: y(2.1), width: w - m.r - m.l, height: y(top) - y(2.1), class: g === 'plates' ? 'hatched' : 'void', fill: g === 'plates' ? `url(#vh${w})` : undefined });
  if (g === 'plates') s = hatch(`vh${w}`, 'hatch-q', 4, 0.6) + s;
  s += line(m.l, y(2.1), w - m.r, y(2.1), 'repl');
  const lines = D.floor.map((f) => el('path', { d: pathOf(f.path.map((v, i) => [x(i), y(v)])), class: 'ctx-strong', 'stroke-width': T.ctx * 1.4, pathLength: 1 })).join('');
  s += `<g class="field">${lines}</g>`;
  const pick = (c: string) => D.floor.find((f) => f.country === c)!;
  const ko = pick('South Korea'), md = D.floor.reduce((a, b) => (b.max_after > a.max_after ? b : a));
  s += el('path', { d: pathOf(md.path.map((v, i) => [x(i), y(v)])), class: 'named', 'stroke-width': T.focus * 0.6, pathLength: 1 });
  s += el('path', { d: pathOf(ko.path.map((v, i) => [x(i), y(v)])), class: 'focus', 'stroke-width': T.focus, pathLength: 1 });
  const kEnd = ko.path.length - 1;
  s += circle(x(kEnd), y(ko.tfr2023), 3.4, 'focus-dot');
  const mPk = md.path.indexOf(md.max_after);
  s += circle(x(mPk), y(md.max_after), 2.8, 'named-dot');
  if (!phone) {
    s += text(x(kEnd) + 8, y(ko.tfr2023) + 4, `South Korea ${ko.tfr2023.toFixed(2)}`, 'lab lab-strong halo');
    s += text(w - m.r + 8, y(2.1) + 4, 'Replacement 2.1', 'lab');
  } else {
    s += text(x(kEnd), y(ko.tfr2023) + 18, `South Korea ${ko.tfr2023.toFixed(2)}`, 'lab lab-strong halo', 'end');
    s += text(w - m.r, y(2.1) - 6, 'Replacement 2.1', 'lab halo', 'end');
  }
  s += note(phone ? [`Highest return: ${md.country},`, `${md.max_after.toFixed(2)}`] : [`The highest any has climbed back: ${md.country}, ${md.max_after.toFixed(2)}`], x(mPk) + 10, y(md.max_after) - 12, 'start', T.ann, { x: x(mPk) + 2, y: y(md.max_after) - 3 });
  s += xTicks(x, Array.from({ length: x.d[1] / 10 + 1 }, (_, i) => i * 10), h - m.b, T.tick);
  s += text(m.l, h - 4, 'Years after first falling below 1.5', 'tk');
  return svg(w, h, s, 'Total fertility rate of each country that fell below 1.5, from the year it did.', `ds g-${g}`);
}

// ---------------------------------------------------------------------------------------------
// IV. The spike: births and deaths in the world, 1950 to 2100.
export function spike(D: Data, w: number, g: Grammar): string {
  const phone = w < 500, T = G(g, phone);
  const m = { l: phone ? 34 : 44, r: phone ? 14 : 110, t: 46, b: 30 };
  const h = phone ? 330 : 400;
  const x = lin([1950, 2100], [m.l, w - m.r]), y = lin([0, 160e6], [h - m.b, m.t]);
  let s = g === 'plates' ? hatch(`sh${w}`, 'hatch-ed', 4.5, 0.9) : '';
  s += yTicks(y, [0, 50e6, 100e6, 150e6], m.l, w - m.r, 'million a year', g, T.tick, (v) => String(v / 1e6));
  s += seam(x(EST_END), m.t - 30, h - m.b, g, T.tick, phone);
  const B = D.world.births, De = D.world.deaths;
  const cross = B.find((p) => p[0] > EST_END && at(De, p[0]) > p[1])![0];
  // Natural increase: the gap while births lead, washed (hatched where projected on a plate).
  const span = (a: number, b: number) => B.filter((p) => p[0] >= a && p[0] <= b);
  const top = (a: number, b: number) => span(a, b).map(([yr, v]) => [x(yr), y(v)] as Pt);
  const bot = (a: number, b: number) => span(a, b).map(([yr]) => [x(yr), y(at(De, yr))] as Pt);
  s += el('path', { d: areaOf(top(1950, EST_END), bot(1950, EST_END)), class: 'wash' });
  s += el('path', { d: areaOf(top(EST_END, cross), bot(EST_END, cross)), class: g === 'plates' ? 'hatched' : 'wash-proj', fill: g === 'plates' ? `url(#sh${w})` : undefined });
  const ln = (S: Pt[], a: number, b: number) => pathOf(S.filter((p) => p[0] >= a && p[0] <= b).map(([yr, v]) => [x(yr), y(v)]));
  s += el('path', { d: ln(De, 1950, EST_END), class: 'named', 'stroke-width': T.focus * 0.6, pathLength: 1 });
  s += el('path', { d: ln(De, EST_END, 2100), class: `named ${projCls(g)}`, 'stroke-width': T.focus * 0.6 });
  s += el('path', { d: ln(B, 1950, EST_END), class: 'focus', 'stroke-width': T.focus, pathLength: 1 });
  s += el('path', { d: ln(B, EST_END, 2100), class: `focus ${projCls(g)}`, 'stroke-width': T.focus });
  const pk = B.filter((p) => p[0] <= EST_END).reduce((a, b) => (b[1] > a[1] ? b : a));
  s += circle(x(pk[0]), y(pk[1]), 3.6, 'focus-dot');
  s += circle(x(cross), y(at(B, cross)), 3.6, 'focus-dot');
  const popPk = D.world.pop.reduce((a, b) => (b[1] > a[1] ? b : a));
  s += note(phone ? [`Births peak, ${pk[0]}:`, `${(pk[1] / 1e6).toFixed(0)} million`] : [`Births peak in ${pk[0]}:`, `${(pk[1] / 1e6).toFixed(0)} million babies`], x(pk[0]) - 12, y(pk[1]) - 30, 'end', T.ann, { x: x(pk[0]) - 2, y: y(pk[1]) - 5 });
  const popLine = popPk[0] === cross ? `the world's population peaks, ${(popPk[1] / 1e9).toFixed(1)} billion` : `population peaks ${popPk[0]}`;
  s += note(phone ? [`${cross}: deaths overtake`, 'births; population', `peaks, ${(popPk[1] / 1e9).toFixed(1)} billion`] : [`${cross}: deaths overtake births and`, popLine], x(cross) - (phone ? 6 : 10), y(at(B, cross)) + (phone ? 36 : 44), 'end', T.ann, { x: x(cross) - 2, y: y(at(B, cross)) + 5 });
  const bEnd = B[B.length - 1]!, dEnd = De[De.length - 1]!;
  if (!phone) {
    const [l1, l2] = spread([y(bEnd[1]), y(dEnd[1])], T.label * 1.3, m.t, h - m.b);
    s += text(w - m.r + 8, l1! + 4, 'Births', 'lab lab-strong') + text(w - m.r + 8, l2! + 4, 'Deaths', 'lab');
  } else {
    s += text(x(1950) + 4, y(at(B, 1950)) - 10, 'Births', 'lab lab-strong halo') + text(x(1950) + 4, y(at(De, 1950)) + 18, 'Deaths', 'lab halo');
  }
  s += xTicks(x, phone ? [1950, 2000, 2050, 2100] : [1950, 1975, 2000, 2023, 2050, 2075, 2100], h - m.b, T.tick);
  return svg(w, h, s, 'Births and deaths in the world each year, 1950 to 2023, and the UN medium projection to 2100.', `ds g-${g}`);
}

// ---------------------------------------------------------------------------------------------
// V. Generations at South Korea's rate: an illustration, from one number.
export function generations(D: Data, w: number, g: Grammar): string {
  const phone = w < 500, T = G(g, phone);
  const tfr = at(D.named['South Korea']!.tfr, EST_END);
  const ratio = tfr / 2.1;
  const counts = [100, Math.round(100 * ratio), Math.round(100 * ratio * ratio)];
  const names = ['Adults today', 'Their children', 'Their grandchildren'];
  const cols = 10, gap = phone ? 2 : 3;
  const block = phone ? (w - 40) / 3 : Math.min(180, (w - 120) / 3);
  const dot = (block - gap * (cols - 1)) / cols;
  const colGap = phone ? 20 / 2 : 60;
  const h = 30 + block + 76;
  const base = 20 + block;
  const left = (w - (3 * block + 2 * colGap)) / 2;
  let s = '';
  counts.forEach((c, k) => {
    const x0 = left + k * (block + colGap);
    for (let i = 0; i < c; i++) {
      const r = Math.floor(i / cols), col = i % cols;
      s += el('rect', { x: x0 + col * (dot + gap), y: base - (r + 1) * dot - r * gap, width: dot, height: dot, class: k === 0 ? 'sq-ink' : 'sq-focus' });
    }
    s += text(x0, base + 36, `${c}`, 'num-big tnum') + text(x0, base + 36 + T.label + 8, names[k]!, 'lab');
  });
  return svg(w, h, s, `100 adults, ${counts[1]} children and ${counts[2]} grandchildren at a fertility rate of ${tfr.toFixed(2)}.`, `ds g-${g}`);
}

// ---------------------------------------------------------------------------------------------
// VI. Where the world's babies are born: 1950, 2023, 2100.
export function births100(D: Data, w: number, g: Grammar): string {
  const phone = w < 500, T = G(g, phone);
  const years = [1950, 2023, 2100];
  const af = 'Africa (UN)', as = 'Asia (UN)';
  const cols = 10, gap = phone ? 2 : 3;
  const colGap = phone ? 14 : 48;
  const block = phone ? (w - 2 * colGap - 8) / 3 : Math.min(190, (w - 2 * colGap - 40) / 3);
  const cell = (block - gap * 9) / cols;
  const left = (w - (3 * block + 2 * colGap)) / 2;
  const h = 34 + block + 64;
  let s = '';
  years.forEach((yr, k) => {
    const a = Math.round(at(D.birthShare[af]!, yr)), b = Math.round(at(D.birthShare[as]!, yr));
    const x0 = left + k * (block + colGap), y0 = 30;
    for (let i = 0; i < 100; i++) {
      const r = 9 - Math.floor(i / 10), c = i % 10;
      const cls = i < a ? 'sq-focus' : i < a + b ? 'sq-q3' : 'sq-q';
      s += el('rect', { x: x0 + c * (cell + gap), y: y0 + r * (cell + gap), width: cell, height: cell, class: cls });
    }
    s += text(x0, y0 - 10, String(yr), 'lab lab-strong tnum');
    s += text(x0, y0 + block + 22, `${a} in Africa`, 'lab lab-strong tnum') + text(x0, y0 + block + 22 + T.label * 1.35, `${b} in Asia`, 'lab tnum');
  });
  return svg(w, h, s, 'Of every 100 babies born in the world, how many are born in Africa and in Asia: 1950, 2023 and 2100.', `ds g-${g}`);
}

// ---------------------------------------------------------------------------------------------
// VII. India: fertility, and the people it adds up to. Two panels on one time axis.
export function india(D: Data, w: number, g: Grammar): string {
  const phone = w < 500, T = G(g, phone);
  const m = { l: phone ? 34 : 44, r: phone ? 14 : 110, t: 44, b: 30 };
  const h1 = phone ? 230 : 260, h2 = phone ? 170 : 190, gapY = 36;
  const h = h1 + gapY + h2;
  const x = lin([1950, 2100], [m.l, w - m.r]);
  const y1 = lin([0, 6.5], [h1 - 10, m.t]);
  const y2 = lin([0, 2e9], [h - m.b, h1 + gapY + 28]);
  let s = yTicks(y1, [0, 2, 4, 6], m.l, w - m.r, 'children per woman', g, T.tick);
  s += yTicks(y2, [0, 1e9, 2e9], m.l, w - m.r, 'people', g, T.tick, (v) => (v === 0 ? '0' : `${v / 1e9} bn`));
  s += seam(x(EST_END), m.t - 30, h - m.b, g, T.tick, phone);
  s += line(m.l, y1(2.1), w - m.r, y1(2.1), 'repl');
  const I = D.named['India']!, Wd = D.world.tfr;
  const seg = (S: Pt[], y: (v: number) => number, a: number, b: number) => pathOf(S.filter((p) => p[0] >= a && p[0] <= b).map(([yr, v]) => [x(yr), y(v)]));
  s += el('path', { d: seg(Wd, y1, 1950, EST_END), class: 'named', 'stroke-width': T.focus * 0.55, pathLength: 1 });
  s += el('path', { d: seg(Wd, y1, EST_END, 2100), class: `named ${projCls(g)}`, 'stroke-width': T.focus * 0.55 });
  s += el('path', { d: seg(I.tfr, y1, 1950, EST_END), class: 'focus', 'stroke-width': T.focus, pathLength: 1 });
  s += el('path', { d: seg(I.tfr, y1, EST_END, 2100), class: `focus ${projCls(g)}`, 'stroke-width': T.focus });
  s += el('path', { d: seg(I.pop, y2, 1950, EST_END), class: 'focus', 'stroke-width': T.focus, pathLength: 1 });
  s += el('path', { d: seg(I.pop, y2, EST_END, 2100), class: `focus ${projCls(g)}`, 'stroke-width': T.focus });
  const cr = I.tfr.find((p) => p[0] > 1950 && p[1] < 2.1)!;
  s += circle(x(cr[0]), y1(cr[1]), 3.4, 'focus-dot');
  s += note(phone ? [`${cr[0]}: below`, 'replacement'] : [`${cr[0]}: below replacement`], x(cr[0]) + 14, y1(3.7), 'start', T.ann, { x: x(cr[0]) + 2, y: y1(cr[1]) - 5 });
  const pk = I.pop.reduce((a, b) => (b[1] > a[1] ? b : a));
  s += circle(x(pk[0]), y2(pk[1]), 3.4, 'focus-dot');
  s += note([`${pk[0]}: peaks at ${(pk[1] / 1e9).toFixed(2)} billion`], x(pk[0]), y2(pk[1]) - 16, 'middle', T.ann);
  if (!phone) {
    s += text(w - m.r + 8, y1(at(I.tfr, 2100)) + 14, 'India', 'lab lab-strong') + text(w - m.r + 8, y1(at(Wd, 2100)) - 4, 'World', 'lab');
    s += text(w - m.r + 8, y1(2.1) - 14, 'Replacement', 'lab');
  } else {
    s += text(x(1950) + 4, y1(at(I.tfr, 1950)) - 8, 'India', 'lab lab-strong halo') + text(x(1990), y1(at(Wd, 1990)) - 10, 'World', 'lab halo');
  }
  s += xTicks(x, phone ? [1950, 2000, 2050, 2100] : [1950, 1975, 2000, 2023, 2050, 2075, 2100], h - m.b, T.tick);
  return svg(w, h, s, "India's total fertility rate and its population, 1950 to 2023, and the UN medium projection to 2100.", `ds g-${g}`);
}

// ---------------------------------------------------------------------------------------------
// A word-sized line for the specimen grammar: a country's path, 1950 to 2023, its end dotted.
export function spark(D: Data, country: string, w = 84, h = 22): string {
  const v = (country === 'World' ? D.world.tfr : D.named[country]!.tfr).filter((p) => p[0] <= EST_END);
  const x = lin([1950, EST_END], [1, w - 3]), y = lin([0, 8], [h - 1, 1]);
  const d = pathOf(v.map(([a, b]) => [x(a), y(b)]));
  const e = v[v.length - 1]!;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${line(0, y(2.1), w, y(2.1), 'repl-spark')}${el('path', { d, class: 'spark-line' })}${circle(x(e[0]), y(e[1]), 1.8, 'focus-dot')}</svg>`;
}

/** Small multiples for the specimen grammar: one panel a country, one shared scale, 1950 to 2100. */
export function multiples(D: Data, w: number, countries: string[]): string {
  const phone = w < 500;
  const cols = phone ? 3 : 6, gx = phone ? 10 : 16, gy = 30;
  const pw = (w - gx * (cols - 1)) / cols, ph = phone ? 62 : 74;
  const rows = Math.ceil(countries.length / cols);
  const h = rows * (ph + gy) + 8;
  const x = lin([1950, 2100], [0, pw]), y = lin([0, 8], [ph, 0]);
  let s = '';
  countries.forEach((c, i) => {
    const ox = (i % cols) * (pw + gx), oy = Math.floor(i / cols) * (ph + gy) + 18;
    const S = D.named[c]!.tfr;
    s += `<g transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)})">`;
    s += line(0, y(0), pw, y(0), 'zero') + line(0, y(2.1), pw, y(2.1), 'repl') + line(x(EST_END), 0, x(EST_END), ph, 'seam');
    s += el('path', { d: pathOf(D.world.tfr.map(([a, b]) => [x(a), y(b)])), class: 'ctx-strong', 'stroke-width': 0.8 });
    s += el('path', { d: pathOf(S.filter((p) => p[0] <= EST_END).map(([a, b]) => [x(a), y(b)])), class: 'focus', 'stroke-width': 1.6 });
    s += el('path', { d: pathOf(S.filter((p) => p[0] >= EST_END).map(([a, b]) => [x(a), y(b)])), class: 'focus proj-dot', 'stroke-width': 1.6 });
    const now = at(S, EST_END);
    s += circle(x(EST_END), y(now), 2.3, 'focus-dot');
    s += text(0, -6, c, 'lab lab-strong') + text(pw, -6, now.toFixed(2), 'tk tnum', 'end');
    s += '</g>';
  });
  return svg(w, h, s, 'Total fertility rate, 1950 to 2100, in twelve countries, each against the world.', 'ds g-specimen');
}

export { esc, fmtPop };
