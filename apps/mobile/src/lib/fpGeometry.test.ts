import { describe, expect, it } from 'vitest';
import { fingerprint } from '@fdf/shared/fingerprint';
import type { Haul } from '@fdf/shared/haul';
import { FP, fpGeometry, markBoxes, type Box } from './fpGeometry';
import { seedData } from './seedData';

const hauls = Object.values(seedData.hauls) as Haul[];
// The reading column on the narrowest phones we support, a common phone, and a large one.
const WIDTHS = [312, 363, 400];

describe("the fingerprint's geometry on a phone", () => {
  for (const h of hauls) {
    for (const w of WIDTHS) {
      it(`keeps Haul ${h.number}'s numbers from touching at ${w}pt`, () => {
        const g = fpGeometry(fingerprint(h), w);
        const byLane = new Map<number, typeof g.marks>();
        for (const m of g.marks) byLane.set(m.lane, [...(byLane.get(m.lane) ?? []), m]);
        for (const row of byLane.values()) {
          row.sort((a, b) => a.x - b.x);
          for (let i = 1; i < row.length; i++) expect(row[i]!.labelLeft).toBeGreaterThanOrEqual(row[i - 1]!.labelLeft + row[i - 1]!.labelWidth);
        }
        // Squares never overlap: stems are at least a square apart less the hairline.
        const xs = g.marks.map((m) => m.x).sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(FP.square * 0.6);
      });
      it(`keeps Haul ${h.number}'s year labels apart and inside the line at ${w}pt`, () => {
        const g = fpGeometry(fingerprint(h), w);
        for (const t of g.ticks) {
          expect(t.left).toBeGreaterThanOrEqual(0);
          expect(t.left + FP.tickW).toBeLessThanOrEqual(w + 0.001);
        }
        // A year's text is about 30pt wide; neighbours' text must not meet, and both ends stay.
        expect(g.ticks[0]!.align).toBe('left');
        expect(g.ticks[g.ticks.length - 1]!.end).toBe(true);
        for (let i = 1; i < g.ticks.length; i++) expect(g.ticks[i]!.text[0]).toBeGreaterThan(g.ticks[i - 1]!.text[1]);
      });
    }
  }
});

describe("the fingerprint's marks never touch each other", () => {
  const meet = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  for (const h of hauls) {
    for (const w of WIDTHS) {
      it(`Haul ${h.number} at ${w}pt: no number, square or stem crosses another mark's`, () => {
        const g = fpGeometry(fingerprint(h), w);
        for (const a of g.marks) {
          for (const b of g.marks) {
            if (a === b) continue;
            const A = markBoxes(a);
            const B = markBoxes(b);
            for (const pa of [A.label, A.square]) for (const pb of [B.label, B.square, B.stem]) expect(meet(pa, pb), `${a.n} meets ${b.n}`).toBe(false);
          }
        }
      });
    }
  }
});
