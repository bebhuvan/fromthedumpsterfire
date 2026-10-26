// The share picture: one chart as a card for social posts and Substack, whole without the page around
// it. The Haul's ink along the top edge, the publication and the figure's place, the editor's title in
// the display face and the note in the italic serif, what the numbers are, the phone figure itself, the
// machine's glosses in its blue, the credit line, and the address. Drawn on the server at publish
// (with the app's pictures) and copied next to the bundle; the website links to it under the chart.

import type { Chart } from './types';
import type { Scene, SceneNode } from './scene';
import type { ChartFace } from './metrics';
import { renderChart } from './render';
import { creditLine, chartGlosses, headLine } from './glosses';
import { textWidth, wrapBalanced, wrapText } from './text';

/** The card is 432 units wide, drawn at 2.5 times: a 1080 px wide PNG. */
export const SHARE = { width: 432, zoom: 2.5, pad: 28 } as const;

export interface ShareOptions {
  /** The Haul's number and the figure's number in its item, for the line at the top. */
  haul?: number;
  figure?: number;
  /** Where the chart lives, printed at the foot ("fromthedumpsterfire.com/haul/1/…"). */
  address?: string;
}

/** Glosses worth carrying on a card: all of them, but a long method stays on the page. */
function cardGlosses(chart: Chart): string[] {
  const method = chart.method?.trim();
  return chartGlosses(chart).filter((g) => g !== method || g.length <= 200);
}

export function shareScene(chart: Chart, opts: ShareOptions = {}): Scene {
  const W = SHARE.width;
  const p = SHARE.pad;
  const inner = W - 2 * p;
  const nodes: SceneNode[] = [];
  let y = 0;
  // The Haul's ink along the top edge, as on every page of the Haul.
  nodes.push({ t: 'rect', x: 0, y: 0, w: W, h: 5, fill: 'ed' });
  y = 5 + 26;
  nodes.push({ t: 'text', x: p, y, text: 'From the Dumpster Fire', face: 'sansMedium', size: 12, fill: 'ink' });
  const where = [opts.haul ? `Haul ${String(opts.haul).padStart(3, '0')}` : '', opts.figure ? `figure ${opts.figure}` : ''].filter(Boolean).join(', ');
  if (where) nodes.push({ t: 'text', x: W - p, y, text: where.charAt(0).toUpperCase() + where.slice(1), face: 'sans', size: 12, fill: 'ink2', anchor: 'end' });
  y += 12;
  nodes.push({ t: 'line', x1: p, x2: W - p, y1: y + 0.5, y2: y + 0.5, stroke: 'ink', sw: 1 });
  y += 14;

  const block = (s: string, face: ChartFace, size: number, lh: number, fill: 'ink' | 'ink2' | 'mach', gapAfter: number, balance = false) => {
    for (const line of (balance ? wrapBalanced : wrapText)(s, face, size, inner)) {
      y += size * lh;
      nodes.push({ t: 'text', x: p, y: y - size * (lh - 1) - size * 0.22, text: line, face, size, fill });
    }
    y += gapAfter;
  };
  block(chart.title, 'display', 27, 1.1, 'ink', 6, true);
  if (chart.note?.trim()) block(chart.note.trim(), 'serifItalic', 15, 1.36, 'ink', 4, true);
  block(headLine(chart), 'sans', 11.5, 1.4, 'ink2', 12);

  // The phone figure, as the app shows it.
  const fig = renderChart(chart, 'narrow');
  const scale = inner / fig.width;
  if (Math.abs(scale - 1) < 0.02) nodes.push({ t: 'g', dx: p + (inner - fig.width) / 2, dy: y, children: fig.nodes });
  else nodes.push({ t: 'g', dx: p, dy: y, children: fig.nodes });
  y += fig.height + 14;

  nodes.push({ t: 'line', x1: p, x2: W - p, y1: y + 0.5, y2: y + 0.5, stroke: 'rule', sw: 1 });
  y += 4;
  for (const g of cardGlosses(chart)) block(g, 'sans', 10.5, 1.42, 'mach', 2);
  y += 4;
  block(creditLine(chart), 'sans', 10, 1.42, 'ink2', 10);
  if (opts.address) {
    y += 8;
    // An item's address that will not fit falls back to its Haul's (".../haul/1").
    let address = opts.address;
    while (textWidth(address, 'sansMedium', 10.5) > inner && /\/haul\/\d+\//.test(address)) address = address.replace(/\/[^/]*$/, '');
    nodes.push({ t: 'text', x: p, y, text: address, face: 'sansMedium', size: 10.5, fill: 'ink' });
    y += 4;
  }
  y += p - 6;
  return { width: W, height: Math.ceil(y), nodes };
}
