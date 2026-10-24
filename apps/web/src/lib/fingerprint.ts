// A Haul's fingerprint: its objects placed by how long ago each was made, on one line from the oldest
// to the day the Haul came out. The scale is the square root of years ago, so a Haul of mostly recent
// things with one Victorian find still spreads its recent things apart; the year labels under the
// line show the scale. No two Hauls draw the same one, so it is the Haul's mark on its cover,
// its item pages and the archive. Positions are classes on a 100-column grid (the CSP allows no inline
// styles); marks whose labels would touch are lifted into higher lanes.

import { itemYear, type Haul, type Item } from '@fdf/shared/haul';

export interface Mark {
  item: Item;
  n: number;
  year: number;
  /** Column 0..92 on the 100-column grid (the last eight leave room for the label). */
  at: number;
  lane: number;
}

export interface Fingerprint {
  from: number;
  to: number;
  marks: Mark[];
  lanes: number;
  /** Year labels under the line that do not collide: always the ends, then round years between. */
  ticks: { year: number; at: number }[];
}

const SPAN = 92;
/** Columns a label needs before the next mark in the same lane. */
const GAP = 7;
/** Least distance between two marks, in columns. */
const NUDGE = 3;
/** Least distance between two year labels, in columns (a four-digit year at 360px). */
const TICK = 14;

export function fingerprint(haul: Haul): Fingerprint {
  const out = new Date(haul.publishedAt).getUTCFullYear() || new Date().getUTCFullYear();
  const dated = haul.items.map((item, i) => ({ item, n: i + 1, year: Math.min(itemYear(item, out) ?? out, out) }));
  const oldest = Math.min(...dated.map((d) => d.year), out - 1);
  const to = out;
  // Start on a round year a little before the oldest object.
  const age = to - oldest;
  const step = age > 400 ? 100 : age > 120 ? 50 : age > 30 ? 10 : age > 8 ? 5 : 1;
  const from = Math.floor((oldest - Math.max(1, age * 0.04)) / step) * step;
  const L = Math.sqrt(to - from);
  // The square root of years ago: the day the Haul came out sits at the right end.
  const at = (y: number) => Math.round((1 - Math.sqrt(to - y) / L) * SPAN);

  const marks: Mark[] = dated
    .map((d) => ({ ...d, at: at(d.year), lane: 0 }))
    .sort((a, b) => a.at - b.at || a.n - b.n);
  // Keep marks at least NUDGE columns apart (so a taller stem never runs through a neighbour's
  // square), pushing right and, if that runs off the end, back left.
  for (let i = 1; i < marks.length; i++) marks[i]!.at = Math.max(marks[i]!.at, marks[i - 1]!.at + NUDGE);
  for (let i = marks.length - 1; i >= 0; i--) marks[i]!.at = Math.min(marks[i]!.at, SPAN - (marks.length - 1 - i) * NUDGE);
  const laneEnd: number[] = [];
  for (const m of marks) {
    let lane = laneEnd.findIndex((end) => m.at >= end);
    if (lane < 0) lane = laneEnd.length;
    laneEnd[lane] = m.at + GAP;
    m.lane = lane;
  }

  // Round years between the ends, the roundest first, kept only where their labels have room.
  const ticks = [{ year: from, at: 0 }, { year: to, at: SPAN }];
  for (const r of [100, 50, 25, 10, 5]) {
    for (let y = Math.ceil((from + 1) / r) * r; y < to; y += r) {
      const a = at(y);
      if (ticks.every((t) => Math.abs(t.at - a) >= TICK)) ticks.push({ year: y, at: a });
    }
  }
  ticks.sort((a, b) => a.at - b.at);

  return { from, to, marks: marks.sort((a, b) => a.n - b.n), lanes: laneEnd.length, ticks };
}

/** "Six objects from 1858 to 2026", for the line under the fingerprint. */
export function spanLine(fp: Fingerprint, count: number, words: (n: number) => string): string {
  const years = fp.marks.map((m) => m.year);
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  return lo === hi ? `${words(count)}, all from ${lo}` : `${words(count)} made between ${lo} and ${hi}`;
}
