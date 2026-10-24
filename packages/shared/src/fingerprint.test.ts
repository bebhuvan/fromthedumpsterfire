import { describe, expect, it } from 'vitest';
import { fingerprint } from './fingerprint';
import type { Haul } from './haul';
import h1 from '../fixtures/haul-001.json';
import h2 from '../fixtures/dev/haul-002.json';

describe('fingerprint', () => {
  for (const h of [h1, h2] as unknown as Haul[]) {
    const fp = fingerprint(h);
    it(`places every object of Haul ${h.number} inside the line, apart`, () => {
      expect(fp.marks).toHaveLength(h.items.length);
      const at = fp.marks.map((m) => m.at).sort((a, b) => a - b);
      expect(at[0]).toBeGreaterThanOrEqual(0);
      expect(at[at.length - 1]).toBeLessThanOrEqual(92);
      for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(3);
    });
    it(`keeps labels in a lane from touching and year labels apart (Haul ${h.number})`, () => {
      const byLane = new Map<number, number[]>();
      for (const m of fp.marks) byLane.set(m.lane, [...(byLane.get(m.lane) ?? []), m.at]);
      for (const xs of byLane.values()) {
        xs.sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(7);
      }
      for (let i = 1; i < fp.ticks.length; i++) expect(fp.ticks[i]!.at - fp.ticks[i - 1]!.at).toBeGreaterThanOrEqual(14);
      expect(fp.ticks[0]!.year).toBeLessThanOrEqual(Math.min(...fp.marks.map((m) => m.year)));
      expect(fp.ticks.at(-1)!.year).toBe(new Date(h.publishedAt).getUTCFullYear());
    });
  }
});
