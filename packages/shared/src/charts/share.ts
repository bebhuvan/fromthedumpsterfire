// The share picture: one chart as a card for social posts and Substack, whole without the page around
// it. The Haul's ink along the top edge; the publication's flame and struck masthead ("From the
// ~~Internet~~ Dumpster Fire", as on the website) with the figure's place; the editor's title in the
// display face and the note in the italic serif; what the numbers are; the phone figure itself; the
// machine's glosses in its blue; the credit; and the chart's address. Drawn on the server at publish
// (with the app's pictures) and copied next to the bundle; the website and the app offer it under
// the chart, and the Desk and the terminal draw it before publishing.

import type { Chart } from './types';
import type { Paint, Scene, SceneNode } from './scene';
import type { ChartFace } from './metrics';
import { renderChart } from './render';
import { creditLine, chartGlosses, headLine } from './glosses';
import { textWidth, wrapBalanced, wrapPretty } from './text';
import { CARET, FLAME, GLOBE, STRIKE } from './marks';

/** The card is 432 units wide, drawn at 2.5 times: a 1080 px wide PNG. */
export const SHARE = { width: 432, zoom: 2.5, pad: 28 } as const;

export interface ShareOptions {
  /** The Haul's number and the figure's number in its item, for the line at the top. */
  haul?: number;
  figure?: number;
  /** Where the chart lives, printed at the foot ("fromthedumpsterfire.com/haul/1/…"). */
  address?: string;
}

/** A mark's unit-box path, moved and stretched into a box. */
function place(d: string, x: number, y: number, w: number, h: number): string {
  return d.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_, a: string, b: string) => `${(x + Number(a) * w).toFixed(2)},${(y + Number(b) * h).toFixed(2)}`);
}

/** The flame with its globe, h tall, its top-left at x, y. The globe is drawn in the ground over the flame. */
export function flameNodes(x: number, y: number, h: number): SceneNode[] {
  const w = h * FLAME.ratio;
  const k = w / 46;
  const cx = x + GLOBE.cx * w;
  const cy = y + GLOBE.cy * h;
  const r = GLOBE.r * k;
  const rx = GLOBE.rx * k;
  return [
    { t: 'path', d: place(FLAME.d, x, y, w, h), fill: 'ember' },
    { t: 'circle', cx, cy, r, stroke: 'bg', sw: GLOBE.ring * k },
    { t: 'path', d: `M${(cx - rx).toFixed(2)},${cy.toFixed(2)}A${rx.toFixed(2)},${r.toFixed(2)} 0 1 0 ${(cx + rx).toFixed(2)},${cy.toFixed(2)}A${rx.toFixed(2)},${r.toFixed(2)} 0 1 0 ${(cx - rx).toFixed(2)},${cy.toFixed(2)}Z`, stroke: 'bg', sw: GLOBE.line * k },
    { t: 'line', x1: cx - r, x2: cx + r, y1: cy, y2: cy, stroke: 'bg', sw: GLOBE.line * k },
  ];
}

/** "From the ~~Internet~~ Dumpster Fire", the strike and caret in ember, baseline at y. Returns its width too. */
export function mastheadNodes(x: number, y: number, size: number): { nodes: SceneNode[]; width: number } {
  const nodes: SceneNode[] = [];
  const space = textWidth(' ', 'displayRegular', size);
  let cx = x;
  const word = (s: string, face: ChartFace, fill: Paint) => {
    nodes.push({ t: 'text', x: cx, y, text: s, face, size, fill });
    const w = textWidth(s, face, size);
    cx += w;
    return w;
  };
  word('From the', 'displayItalic', 'ink');
  cx += space;
  const ix = cx;
  const iw = word('Internet', 'displayRegular', 'ink2');
  // The hand-drawn strike across the word's middle, a little past each end, as on the website.
  nodes.push({ t: 'path', d: place(STRIKE, ix - 0.06 * size, y - 0.5 * size, iw + 0.14 * size, 0.3 * size), fill: 'ember' });
  // The proofreader's caret, where "Dumpster Fire" goes in.
  const ch = 0.24 * size;
  nodes.push({ t: 'path', d: place(CARET.d, cx + 0.04 * size, y - 0.04 * size, ch * CARET.ratio, ch), fill: 'ember' });
  cx += space;
  word('Dumpster Fire', 'displayRegular', 'ink');
  return { nodes, width: cx - x };
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
  // The Haul's ink along the top edge, as on every page of the Haul.
  nodes.push({ t: 'rect', x: 0, y: 0, w: W, h: 5, fill: 'ed' });
  let y = 5 + 30;
  // The flame and the masthead, the figure's place at the right.
  const flameH = 27;
  nodes.push(...flameNodes(p - 3, y - flameH + 4, flameH));
  const mast = mastheadNodes(p + flameH * FLAME.ratio + 3, y, 15.5);
  nodes.push(...mast.nodes);
  const where = [opts.haul ? `Haul ${String(opts.haul).padStart(3, '0')}` : '', opts.figure ? `figure ${opts.figure}` : ''].filter(Boolean).join(', ');
  if (where) nodes.push({ t: 'text', x: W - p, y, text: where.charAt(0).toUpperCase() + where.slice(1), face: 'sans', size: 11.5, fill: 'ink2', anchor: 'end' });
  y += 12;
  nodes.push({ t: 'line', x1: p, x2: W - p, y1: y + 0.5, y2: y + 0.5, stroke: 'ink', sw: 1 });
  y += 14;

  const block = (s: string, face: ChartFace, size: number, lh: number, fill: 'ink' | 'ink2' | 'mach', gapAfter: number, balance = false) => {
    for (const line of (balance ? wrapBalanced : wrapPretty)(s, face, size, inner)) {
      y += size * lh;
      nodes.push({ t: 'text', x: p, y: y - size * (lh - 1) - size * 0.22, text: line, face, size, fill });
    }
    y += gapAfter;
  };
  block(chart.title, 'display', 27, 1.1, 'ink', 6, true);
  if (chart.note?.trim()) block(chart.note.trim(), 'serifItalic', 15, 1.36, 'ink', 4);
  block(headLine(chart), 'sans', 11.5, 1.4, 'ink2', 12);

  // The phone figure, as the app shows it.
  const fig = renderChart(chart, 'narrow');
  nodes.push({ t: 'g', dx: p + (inner - fig.width) / 2, dy: y, children: fig.nodes });
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
