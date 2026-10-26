// Charts in the app, the parts that need no device: where a chart's picture is kept on the phone and
// the data table under it. The pictures themselves are drawn by the Desk Worker at publish from the
// website's own scene (packages/server/src/chartdraw.ts); the app only shows and keeps them.

import type { Block, Haul } from '@fdf/shared/haul';
import { chartGrouping, formatCell } from '@fdf/shared/charts/glosses';
import type { Chart } from '@fdf/shared/charts';

export type ChartBlock = Extract<Block, { kind: 'chart' }>;

/**
 * The file name a chart picture is kept under in the document directory. Published pictures sit
 * under hauls/ at immutable paths, so the name is that path with slashes as "__" (the bundles use the
 * same scheme), which also puts them inside the downloads that Settings counts and clears. Anything
 * else (a seed, a foreign host, a path that tries to climb) is not kept.
 */
export function pictureFileName(url: string): string | null {
  const m = /^https:\/\/[^/]+\/(hauls\/[A-Za-z0-9._/-]+\.png)$/.exec(url);
  if (!m || m[1]!.includes('..') || m[1]!.includes('//')) return null;
  return m[1]!.replaceAll('/', '__');
}

/** Every chart picture a Haul's bundle points to (both themes). */
export function chartPictureUrls(haul: Pick<Haul, 'items'>): string[] {
  const out: string[] = [];
  for (const item of haul.items) for (const b of item.blocks ?? []) if (b.kind === 'chart' && b.images) out.push(b.images.light.url, b.images.dark.url);
  return out;
}

/** The first chart of an item, which the figure form sets large. */
export function firstChart(blocks?: Block[]): ChartBlock | undefined {
  return blocks?.find((b): b is ChartBlock => b.kind === 'chart');
}

export interface ChartTable {
  head: string[];
  /** Which columns are numbers (set right-aligned). */
  numeric: boolean[];
  rows: string[][];
}

/** The rows behind a chart as the table prints them: every column, missing values as a dash. */
export function chartTable(chart: Pick<Chart, 'data' | 'units' | 'measure'>): ChartTable {
  const g = chartGrouping(chart as Chart);
  const cols = chart.data.columns;
  return {
    head: cols.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label)),
    numeric: cols.map((c) => c.type === 'number'),
    rows: chart.data.rows.map((r) => cols.map((c, j) => formatCell(r[j] ?? null, c, g))),
  };
}
