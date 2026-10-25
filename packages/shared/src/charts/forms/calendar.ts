// Calendar: a value for every day, laid out as weeks (columns) by weekday (rows, Monday on top), one
// strip per year; on a phone each year is cut into two half-year strips so the squares stay large
// enough to read. Colour is the sequential ramp (or diverging around a stated midpoint); a day in the
// span with no value is an empty outlined square. The key prints the ramp's steps.

import type { Scene, SceneNode } from '../scene';
import { Ctx, dayNumber, shortUnit, text } from '../frame';
import { drawKey, rampFor } from '../ramp';
import { dateOfDay, MONTHS } from '../scales';
import { textWidth } from '../text';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function drawCalendar(ctx: Ctx): Scene {
  const values = new Map<number, number | null>();
  const raw = new Map<number, string>();
  for (const r of ctx.rows) {
    const s = ctx.str(r, 'x');
    const d = dayNumber(s);
    if (!Number.isFinite(d)) continue;
    values.set(d, ctx.num(r, 'y'));
    raw.set(d, s);
  }
  const days = [...values.keys()].sort((a, b) => a - b);
  const W = ctx.W;
  if (!days.length) return { width: W, height: 40, nodes: [] };
  const present = [...values.values()].filter((v): v is number => v !== null);
  const ramp = rampFor(ctx, present.length ? present : [0]);
  const first = days[0]!;
  const last = days[days.length - 1]!;

  // Blocks: each calendar year in the span, or each half-year on a phone.
  const blocks: Array<{ label: string; s: number; e: number }> = [];
  for (let y = dateOfDay(first).y; y <= dateOfDay(last).y; y++) {
    const halves = ctx.narrow
      ? [
          [Date.UTC(y, 0, 1), Date.UTC(y, 6, 1) - 86_400_000],
          [Date.UTC(y, 6, 1), Date.UTC(y + 1, 0, 1) - 86_400_000],
        ]
      : [[Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1) - 86_400_000]];
    for (const [a, b] of halves) {
      const s = Math.max(first, a! / 86_400_000);
      const e = Math.min(last, b! / 86_400_000);
      if (s <= e) blocks.push({ label: String(y), s, e });
    }
  }
  const multiYear = new Set(blocks.map((b) => b.label)).size > 1;
  const mondayOf = (d: number) => d - ((dateOfDay(d).dow + 6) % 7);
  const weeksIn = (b: { s: number; e: number }) => Math.floor((mondayOf(b.e) - mondayOf(b.s)) / 7) + 1;
  const maxWeeks = Math.max(...blocks.map(weeksIn), ctx.narrow ? 27 : 53);

  const size = ctx.s.tick;
  const dayLabelW = Math.max(...['Mon', 'Wed', 'Fri'].map((s) => textWidth(s, 'sans', size))) + 8;
  const yearLabelW = multiYear ? textWidth('0000', 'sans', size) + 10 : 0;
  const left = dayLabelW + yearLabelW;
  const gap = 2;
  const cell = Math.min(ctx.narrow ? 14 : 16, Math.floor(((W - left) / maxWeeks - gap) * 10) / 10);
  const pitch = cell + gap;
  const monthH = size + 8;
  const blockH = monthH + 7 * pitch;
  const blockGap = ctx.narrow ? 16 : 20;
  const nodes: SceneNode[] = [];
  let missing = false;
  const unit = ctx.chart.units;

  blocks.forEach((b, bi) => {
    const top = bi * (blockH + blockGap);
    const m0 = mondayOf(b.s);
    // Weekday names on the first block of each row of blocks (Mon, Wed, Fri, as a printed calendar).
    [0, 2, 4].forEach((row) => nodes.push(text(left - 6, top + monthH + row * pitch + cell * 0.5 + size * 0.36, DAY_NAMES[row]!, 'sans', size, 'ink2', 'end')));
    if (multiYear && (bi === 0 || blocks[bi - 1]!.label !== b.label)) nodes.push(text(0, top + monthH + cell * 0.5 + size * 0.36, b.label, 'sansMedium', size, 'ink'));
    // Month names over the week a month starts in, when there is room before the next.
    let lastLabelEnd = -Infinity;
    for (let d = b.s; d <= b.e; d++) {
      const dd = dateOfDay(d);
      if (dd.d !== 1 && d !== b.s) continue;
      const wk = Math.floor((mondayOf(d) - m0) / 7);
      const x = left + wk * pitch + (dd.d === 1 && (dd.dow + 6) % 7 > 3 ? pitch : 0);
      const name = MONTHS[dd.m]!;
      if (x < lastLabelEnd + 4 || x + textWidth(name, 'sans', size) > W) continue;
      nodes.push(text(x, top + size, name, 'sans', size, 'ink2'));
      lastLabelEnd = x + textWidth(name, 'sans', size);
    }
    for (let d = b.s; d <= b.e; d++) {
      const wk = Math.floor((mondayOf(d) - m0) / 7);
      const row = (dateOfDay(d).dow + 6) % 7;
      const x = left + wk * pitch;
      const y = top + monthH + row * pitch;
      const v = values.has(d) ? values.get(d)! : null;
      const label = raw.get(d) ?? '';
      if (v === null) {
        missing = true;
        nodes.push({ t: 'rect', x: x + 0.5, y: y + 0.5, w: cell - 1, h: cell - 1, stroke: 'rule', sw: 1, tip: `${label || fmt(d)}: no data` });
      } else nodes.push({ t: 'rect', x, y, w: cell, h: cell, fill: ramp.paint(v), tip: `${fmt(d)}: ${ctx.value(v)} ${unit}` });
    }
  });

  const keyY = blocks.length * (blockH + blockGap) - blockGap + 14;
  const key = drawKey(ctx, ramp, left, keyY, Math.min(W - left, ctx.narrow ? W - left : 340), { unit: shortUnit(unit) ?? '', missing });
  nodes.push(...key.nodes);
  return { width: W, height: Math.ceil(keyY + key.height + 2), nodes };
}

function fmt(d: number): string {
  const x = dateOfDay(d);
  return `${x.d} ${MONTHS[x.m]} ${x.y}`;
}
