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
  | 'quiet2'
  | 'quiet3'
  | 'ed'
  | 'bg'
  | 'plate'
  | 'mach'
  /** The brand's ember: the flame and the masthead's strike on a share card, never data. */
  | 'ember'
  | 'record'
  | 'normal'
  | 'hot'
  | 'cold'
  | 'white'
  | 'black'
  | `cat${0 | 1 | 2 | 3 | 4 | 5}`
  | `seq${0 | 1 | 2 | 3 | 4 | 5 | 6}`
  | `heat${0 | 1 | 2 | 3 | 4 | 5 | 6}`
  | `div${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`
  /** The diverging ramp at a fine grain (41 steps, every fourth one of div's), for warming stripes. */
  | `dv${number}`;

/** Steps in the fine diverging ramp: dv0 is div0, dv20 the middle, dv40 is div10. */
export const FINE_STEPS = 41;

export const PAINTS: readonly Paint[] = [
  'ink', 'ink2', 'rule', 'quiet', 'quiet2', 'quiet3', 'ed', 'bg', 'plate', 'mach', 'ember', 'record', 'normal', 'hot', 'cold', 'white', 'black',
  ...([0, 1, 2, 3, 4, 5] as const).map((i) => `cat${i}` as Paint),
  ...([0, 1, 2, 3, 4, 5, 6] as const).map((i) => `seq${i}` as Paint),
  ...([0, 1, 2, 3, 4, 5, 6] as const).map((i) => `heat${i}` as Paint),
  ...([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((i) => `div${i}` as Paint),
  ...Array.from({ length: FINE_STEPS }, (_, i) => `dv${i}` as Paint),
];

// OKLab, for the fine ramp: interpolating there keeps the steps even to the eye.
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function toLab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromLab([L, A, B]: [number, number, number]): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return `#${rgb.map((v) => Math.round(Math.max(0, Math.min(1, gam(Math.max(0, v)))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
const fine: Partial<Record<Scheme, string[]>> = {};
/** The fine diverging ramp of a theme, interpolated in OKLab between the validated steps of div. */
export function fineRamp(scheme: Scheme): string[] {
  return (fine[scheme] ??= Array.from({ length: FINE_STEPS }, (_, i) => {
    const p = (i / (FINE_STEPS - 1)) * 10;
    const a = Math.floor(p);
    const b = Math.min(10, a + 1);
    if (p === a) return chartInk[scheme].div[a]!;
    const la = toLab(chartInk[scheme].div[a]!);
    const lb = toLab(chartInk[scheme].div[b]!);
    const t = p - a;
    return fromLab([la[0] + (lb[0] - la[0]) * t, la[1] + (lb[1] - la[1]) * t, la[2] + (lb[2] - la[2]) * t]);
  }));
}

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
  /** A group, moved by dx, dy and scaled by s (a figure inside a share card; a map's outlines). */
  | { t: 'g'; children: SceneNode[]; dx?: number; dy?: number; s?: number };

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
    case 'ember':
      return pal.ember;
    case 'ed':
      return editionInk[scheme][edition];
    case 'quiet':
      return ink.quiet;
    case 'quiet2':
      return ink.quiet2;
    case 'quiet3':
      return ink.quiet3;
    case 'record':
      return ink.record;
    case 'normal':
      return ink.normal;
    case 'hot':
      return ink.hot;
    case 'cold':
      return ink.cold;
    case 'white':
      return '#FFFFFF';
    case 'black':
      return palettes.light.ink;
  }
  const m = /^(cat|seq|heat|div|dv)(\d+)$/.exec(p)!;
  if (m[1] === 'dv') return fineRamp(scheme)[Number(m[2])]!;
  return ink[m[1] as 'cat' | 'seq' | 'heat' | 'div'][Number(m[2])]!;
}

const luminance = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

/**
 * The colour of a label set inside a filled mark. A fill may keep its lightness across themes (the
 * categorical and ramp steps) or flip with them (the edition's ink, the greys), so the label tries
 * white, near-black, the ink and the ground, and takes whichever reads best on the fill in its worse
 * theme. One label colour then works in both themes, with every edition's ink.
 */
export function labelOn(fill: Paint): Paint {
  const cands: Paint[] = ['white', 'black', 'ink', 'bg'];
  const editions = Object.keys(editionInk.light) as Edition[];
  const worst = (label: Paint) =>
    Math.min(...(['light', 'dark'] as const).flatMap((sch) => (fill === 'ed' ? editions : (['oxblood'] as Edition[])).map((e) => contrast(paintHex(label, sch, e), paintHex(fill, sch, e)))));
  return cands.reduce((a, b) => (worst(b) > worst(a) + 1e-9 ? b : a));
}

/** The faces: the website's CSS family and weight, and the family name of the app's static cut. */
export const FACES: Record<ChartFace, { css: string; weight: number; italic: boolean; cut: string }> = {
  sans: { css: "'Schibsted Grotesk', system-ui, sans-serif", weight: 400, italic: false, cut: 'Schibsted-Regular' },
  sansMedium: { css: "'Schibsted Grotesk', system-ui, sans-serif", weight: 500, italic: false, cut: 'Schibsted-Medium' },
  serif: { css: "'Newsreader Text', Georgia, serif", weight: 400, italic: false, cut: 'NewsreaderText-Regular' },
  serifItalic: { css: "'Newsreader Text', Georgia, serif", weight: 400, italic: true, cut: 'NewsreaderText-Italic' },
  display: { css: "'Newsreader Display', Georgia, serif", weight: 500, italic: false, cut: 'NewsreaderDisplay-Medium' },
  displayRegular: { css: "'Newsreader Display', Georgia, serif", weight: 400, italic: false, cut: 'NewsreaderDisplay-Regular' },
  displayItalic: { css: "'Newsreader Display', Georgia, serif", weight: 400, italic: true, cut: 'NewsreaderDisplay-Italic' },
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
      // A stroked label is a halo: the ground drawn under the letters, so a label set over gridlines
      // or quiet marks stays clean.
      if (n.stroke) Object.assign(a, { 'paint-order': 'stroke', 'stroke-linejoin': 'round' });
      break;
  }
  if (n.t === 'line') a['stroke-linecap'] = 'butt';
  if (cls.length) a.class = cls.join(' ');
  return a;
}

/** A group's transform attribute, or '' when it has none. */
export function groupTransform(n: { dx?: number; dy?: number; s?: number }): string {
  const t = n.dx || n.dy ? `translate(${r2(n.dx ?? 0)} ${r2(n.dy ?? 0)})` : '';
  const sc = n.s !== undefined && n.s !== 1 ? `scale(${Math.round(n.s * 100000) / 100000})` : '';
  return [t, sc].filter(Boolean).join(' ');
}

/** A standalone SVG with one theme's colours resolved and the app's font cuts named (for PNGs). */
export function sceneToSvg(scene: Scene, opts: { scheme: Scheme; edition: Edition; background?: boolean }): string {
  const hex = (p: Paint) => paintHex(p, opts.scheme, opts.edition);
  const out: string[] = [];
  const walk = (nodes: SceneNode[]) => {
    for (const n of nodes) {
      if (n.t === 'g') {
        out.push(groupTransform(n) ? `<g transform="${groupTransform(n)}">` : '<g>');
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
  // The edition's ink is read where the chart is (body carries .e-<edition>), not at :root.
  const v = (p: Paint) => (p === 'ed' ? 'var(--ed,var(--ink))' : `var(--ch-${p})`);
  const rules = PAINTS.flatMap((p) => [`.ch .f-${p}{fill:${v(p)}}`, `.ch .s-${p}{stroke:${v(p)}}`]);
  const faces = (Object.keys(FACES) as ChartFace[]).map((k) => {
    const f = FACES[k];
    return `.ch .t-${k}{font-family:${f.css};font-weight:${f.weight};font-style:${f.italic ? 'italic' : 'normal'}}`;
  });
  return [...rules, ...faces].join('\n');
}

/** Custom properties for one theme ("ed" is not one: it is the page's edition ink, --ed). */
export function chartVars(scheme: Scheme): string {
  return PAINTS.filter((p) => p !== 'ed')
    .map((p) => `--ch-${p}:${paintHex(p, scheme, 'oxblood')}`)
    .join(';');
}
