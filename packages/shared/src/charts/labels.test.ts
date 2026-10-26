// No label on any chart touches another, and none runs off its figure: every comps fixture (a real
// chart of every form), at both widths. A new fixture is checked by being put in the folder.

import { describe, expect, it } from 'vitest';
import { renderChart } from './render';
import { shareScene, SHARE } from './share';
import { textBoxes, overlapping } from './labels';
import type { Chart } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const fs: Any = await import('node:fs' as string);
const path: Any = await import('node:path' as string);
const url: Any = await import('node:url' as string);
const dir: string = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '../../../../docs/design-comps/charts/data');
const files: string[] = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json'));

describe('labels never collide', () => {
  for (const f of files) {
    const chart = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Chart;
    for (const layout of ['wide', 'narrow'] as const) {
      it(`${f.replace('.json', '')}, ${layout}`, () => {
        const scene = renderChart(chart, layout);
        const boxes = textBoxes(scene.nodes);
        expect(overlapping(boxes).map(([a, b]) => `"${a.text}" × "${b.text}"`)).toEqual([]);
        const off = boxes.filter((b) => b.x < -0.5 || b.x + b.w > scene.width + 0.5 || b.y < -0.5 || b.y + b.h > scene.height + 0.5);
        expect(off.map((b) => b.text)).toEqual([]);
        // Every name the editor made loud is written on the chart, never silently dropped.
        const written = new Set(boxes.map((b) => b.text));
        const said = (name: string) => [...written].some((t) => t.includes(name));
        expect((chart.options?.focus ?? []).filter((n) => !said(n))).toEqual([]);
      });
    }
  }
  for (const f of files) {
    it(`${f.replace('.json', '')}, share card`, () => {
      const chart = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Chart;
      const card = shareScene(chart, { haul: 1, figure: 1, address: 'fromthedumpsterfire.com/haul/1/a-rather-long-item-name-for-the-address-line-to-fit' });
      expect(card.width).toBe(SHARE.width);
      const boxes = textBoxes(card.nodes);
      expect(overlapping(boxes).map(([a, b]) => `"${a.text}" × "${b.text}"`)).toEqual([]);
      expect(boxes.filter((b) => b.x < SHARE.pad - 4 || b.x + b.w > card.width - SHARE.pad + 4 || b.y < 0 || b.y + b.h > card.height).map((b) => b.text)).toEqual([]);
    });
  }
});
