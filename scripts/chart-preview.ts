// Render chart JSON files to PNGs for looking at while designing: one contact sheet per chart with
// the wide and phone figures in light and dark, drawn by the real renderer in a Haul's edition ink.
// Usage (from the repo root):
//   node_modules/.bin/esbuild scripts/chart-preview.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/chart-preview.mjs && node /tmp/chart-preview.mjs <out-dir> [--edition teal] [--share] <chart.json>...
// --share draws each chart's share picture (the card for social posts) instead.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { renderChart, sceneToSvg, shareScene, RASTER_FONTS, SHARE, type Chart } from '../packages/shared/src/charts/index.ts';
import type { Edition } from '../packages/shared/src/tokens.ts';

const root = process.cwd();
const args = process.argv.slice(2);
const out = args.shift()!;
let edition: Edition = 'teal';
const e = args.indexOf('--edition');
if (e >= 0) [, edition] = args.splice(e, 2) as [string, Edition];
const sh = args.indexOf('--share');
const share = sh >= 0;
if (share) args.splice(sh, 1);
mkdirSync(out, { recursive: true });
await initWasm(readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));
const fonts = RASTER_FONTS.map((f) => new Uint8Array(readFileSync(join(root, 'apps/mobile/assets/fonts', f))));
const at = (svg: string, x: number, y: number) => svg.replace('<svg ', `<svg x="${x}" y="${y}" `);
for (const f of args) {
  const chart = JSON.parse(readFileSync(f, 'utf8')) as Chart;
  if (share) {
    const card = shareScene(chart, { haul: 1, figure: 1, address: 'fromthedumpsterfire.com/haul/1' });
    const png = new Resvg(sceneToSvg(card, { scheme: 'light', edition }), { fitTo: { mode: 'zoom', value: SHARE.zoom }, font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'Schibsted-Regular' } }).render().asPng();
    const file = join(out, `${basename(f, '.json')}-share.png`);
    writeFileSync(file, png);
    console.log(file);
    continue;
  }
  const w = renderChart(chart, 'wide');
  const n = renderChart(chart, 'narrow');
  const pad = 24;
  const W = pad * 4 + w.width + n.width * 2;
  const H = pad * 2 + Math.max(w.height * 2 + pad, n.height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#8A8A8A"/>${[
    at(sceneToSvg(w, { scheme: 'light', edition }), pad, pad),
    at(sceneToSvg(w, { scheme: 'dark', edition }), pad, pad * 2 + w.height),
    at(sceneToSvg(n, { scheme: 'light', edition }), pad * 2 + w.width, pad),
    at(sceneToSvg(n, { scheme: 'dark', edition }), pad * 3 + w.width + n.width, pad),
  ].join('')}</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: 1.5 }, font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'Schibsted-Regular' } }).render().asPng();
  const file = join(out, `${basename(f, '.json')}.png`);
  writeFileSync(file, png);
  console.log(file);
}
