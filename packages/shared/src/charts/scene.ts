// The scene: what a chart draws, as plain shapes with colours named by role. The website turns a
// scene into inline SVG elements whose colours are classes (so one SVG follows the reader's theme and
// the CSP never sees an inline style); sceneToSvg turns it into a standalone SVG with the colours of
// one theme resolved, which the Desk and the terminal rasterise into the app's PNGs. Both read the
// same table (paintHex and FACES), so the website and the app draw the same chart.

import { chartInk, editionInk, palettes, type Edition, type Scheme } from '../tokens';
import type { ChartFace } from './metrics';

/** A colour by role: ink, the edition's ink (the one loud thing), a series, a ramp step, a ground. */
export type Paint =
  | 'ink'
  | 'ink2'
  | 'rule'
  | 'quiet'
  | 'ed'
  | 'bg'
  | 'plate'
  | 'mach'
  | 'record'
  | 'normal'
  | 'hot'
  | 'cold'
  | `cat${0 | 1 | 2 | 3 | 4 | 5}`
  | `seq${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
  | `div${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;

export const PAINTS: readonly Paint[] = [
  'ink', 'ink2', 'rule', 'quiet', 'ed', 'bg', 'plate', 'mach', 'record', 'normal', 'hot', 'cold',
  ...([0, 1, 2, 3, 4, 5] as const).map((i) => `cat${i}` as Paint),
  ...([0, 1, 2, 3, 4, 5, 6, 7, 8] as const).map((i) => `seq${i}` as Paint),
  ...([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((i) => `div${i}` as Paint),
];

interface Mark {
  fill?: Paint;
  stroke?: Paint;
  /** Stroke width in px. */
  sw?: number;
  /** Opacity of the fill (washes, bands). */
  fo?: number;
  /** A tooltip (SVG <title>): the row behind the mark, in words. */
  tip?: string;
}

export type SceneNode =
  | (Mark & { t: 'rect'; x: number; y: number; w: number; h: number })
  | (Mark & { t: 'line'; x1: number; y1: number; x2: number; y2: number })
  | (Mark & { t: 'path'; d: string })
  | (Mark & { t: 'circle'; cx: number; cy: number; r: number })
  | (Mark & { t: 'text'; x: number; y: number; text: string; face: ChartFace; size: number; anchor?: 'start' | 'middle' | 'end' })
  | { t: 'g'; children: SceneNode[] };

export interface Scene {
  width: number;
  height: number;
  nodes: SceneNode[];
}

/** The hex for a paint in a theme (the edition's ink for "ed"). */
export function paintHex(p: Paint, scheme: Scheme, edition: Edition): string {
  const pal = palettes[scheme];
  const ink = chartInk[scheme];
  switch (p) {
    case 'ink':
      return pal.ink;
    case 'ink2':
      return pal.ink2;
    case 'rule':
      return pal.rule;
    case 'bg':
      return pal.bg;
    case 'plate':
      return pal.plate;
    case 'mach':
      return pal.machine;
    case 'ed':
      return editionInk[scheme][edition];
    case 'quiet':
      return ink.quiet;
    case 'record':
      return ink.record;
    case 'normal':
      return ink.normal;
    case 'hot':
      return ink.hot;
    case 'cold':
      return ink.cold;
  }
  const m = /^(cat|seq|div)(\d+)$/.exec(p)!;
  return ink[m[1] as 'cat' | 'seq' | 'div'][Number(m[2])]!;
}

/** The faces: the website's CSS family and weight, and the family name of the app's static cut. */
export const FACES: Record<ChartFace, { css: string; weight: number; italic: boolean; cut: string }> = {
  sans: { css: "'Schibsted Grotesk', system-ui, sans-serif", weight: 400, italic: false, cut: 'Schibsted-Regular' },
  sansMedium: { css: "'Schibsted Grotesk', system-ui, sans-serif", weight: 500, italic: false, cut: 'Schibsted-Medium' },
  serif: { css: "'Newsreader Text', Georgia, serif", weight: 400, italic: false, cut: 'NewsreaderText-Regular' },
  serifItalic: { css: "'Newsreader Text', Georgia, serif", weight: 400, italic: true, cut: 'NewsreaderText-Italic' },
};

/** The font files the PNG renderer must load (from apps/mobile/assets/fonts). */
export const RASTER_FONTS = [...new Set(Object.values(FACES).map((f) => `${f.cut}.ttf`))];

const r2 = (n: number) => Math.round(n * 100) / 100;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The presentation of a node as attributes, for the website: colours as classes ("f-cat0 s-bg"),
 * geometry and widths as attributes. The same classes are defined in chartCss().
 */
export function nodeAttrs(n: Exclude<SceneNode, { t: 'g' }>): Record<string, string | number> {
  const cls: string[] = [];
  const a: Record<string, string | number> = {};
  if (n.fill) cls.push(`f-${n.fill}`);
  else a.fill = 'none';
  if (n.stroke) cls.push(`s-${n.stroke}`);
  if (n.sw !== undefined) a['stroke-width'] = n.sw;
  if (n.fo !== undefined) a['fill-opacity'] = n.fo;
  switch (n.t) {
    case 'rect':
      Object.assign(a, { x: r2(n.x), y: r2(n.y), width: r2(Math.max(0, n.w)), height: r2(Math.max(0, n.h)) });
      break;
    case 'line':
      Object.assign(a, { x1: r2(n.x1), y1: r2(n.y1), x2: r2(n.x2), y2: r2(n.y2) });
      break;
    case 'path':
      a.d = n.d;
      if (n.stroke) Object.assign(a, { 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      break;
    case 'circle':
      Object.assign(a, { cx: r2(n.cx), cy: r2(n.cy), r: r2(n.r) });
      break;
    case 'text':
      cls.push(`t-${n.face}`);
      Object.assign(a, { x: r2(n.x), y: r2(n.y), 'font-size': n.size });
      if (n.anchor && n.anchor !== 'start') a['text-anchor'] = n.anchor;
      break;
  }
  if (n.t === 'line') a['stroke-linecap'] = 'butt';
  if (cls.length) a.class = cls.join(' ');
  return a;
}

/** A standalone SVG with one theme's colours resolved and the app's font cuts named (for PNGs). */
export function sceneToSvg(scene: Scene, opts: { scheme: Scheme; edition: Edition; background?: boolean }): string {
  const hex = (p: Paint) => paintHex(p, opts.scheme, opts.edition);
  const out: string[] = [];
  const walk = (nodes: SceneNode[]) => {
    for (const n of nodes) {
      if (n.t === 'g') {
        out.push('<g>');
        walk(n.children);
        out.push('</g>');
        continue;
      }
      const a = nodeAttrs(n);
      delete a.class;
      if (n.fill) a.fill = hex(n.fill);
      if (n.stroke) a.stroke = hex(n.stroke);
      if (n.t === 'text') {
        const f = FACES[n.face];
        a['font-family'] = f.cut;
      }
      const attrs = Object.entries(a)
        .map(([k, v]) => `${k}="${esc(String(v))}"`)
        .join(' ');
      if (n.t === 'text') out.push(`<text ${attrs}>${esc(n.text)}</text>`);
      else out.push(`<${n.t} ${attrs}/>`);
    }
  };
  walk(scene.nodes);
  const bg = opts.background === false ? '' : `<rect width="${scene.width}" height="${scene.height}" fill="${palettes[opts.scheme].bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}">${bg}${out.join('')}</svg>`;
}

/**
 * The website's chart classes: f-<paint> and s-<paint> read custom properties set per theme
 * (chartVars), so one inline SVG follows the theme. Text faces are t-<face>.
 */
export function chartCss(): string {
  const rules = PAINTS.flatMap((p) => [`.ch .f-${p}{fill:var(--ch-${p})}`, `.ch .s-${p}{stroke:var(--ch-${p})}`]);
  const faces = (Object.keys(FACES) as ChartFace[]).map((k) => {
    const f = FACES[k];
    return `.ch .t-${k}{font-family:${f.css};font-weight:${f.weight};font-style:${f.italic ? 'italic' : 'normal'}}`;
  });
  return [...rules, ...faces].join('\n');
}

/** Custom properties for one theme; "ed" follows the page's edition ink (--ed, set on <body>). */
export function chartVars(scheme: Scheme): string {
  return PAINTS.map((p) => `--ch-${p}:${p === 'ed' ? 'var(--ed,var(--ink))' : paintHex(p, scheme, 'oxblood')}`).join(';');
}
