// How long resvg (WebAssembly, as a Worker would run it) takes to draw each comps chart's app
// pictures: the phone figure at three times, light and dark, with the app's fonts. For deciding where
// the pictures are drawn (docs/DECISIONS.md, 2026-10-26).
//   node_modules/.bin/esbuild scripts/chart-raster-bench.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/bench.mjs && node /tmp/bench.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { appPictureSvgs, APP_PICTURE, RASTER_FONTS, type Chart } from '../packages/shared/src/charts/index.ts';

const root = process.cwd();
const wasm = readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm'));
const t0 = performance.now();
await initWasm(wasm);
console.log(`wasm ${(wasm.length / 1e6).toFixed(2)} MB raw, ${(gzipSync(wasm).length / 1e6).toFixed(2)} MB gzipped; init ${(performance.now() - t0).toFixed(0)} ms`);
const fonts = RASTER_FONTS.map((f) => new Uint8Array(readFileSync(join(root, 'apps/mobile/assets/fonts', f))));
console.log(`fonts ${(fonts.reduce((a, b) => a + b.length, 0) / 1e3).toFixed(0)} kB`);
const dir = join(root, 'docs/design-comps/charts/data');
let total = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const chart = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Chart;
  const svgs = appPictureSvgs(chart, 'teal');
  const a = performance.now();
  let bytes = 0;
  for (const s of ['light', 'dark'] as const) {
    const r = new Resvg(svgs[s], { fitTo: { mode: 'zoom', value: APP_PICTURE.zoom }, font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'Schibsted-Regular' } });
    bytes += r.render().asPng().length;
    r.free();
  }
  const ms = performance.now() - a;
  total += ms;
  console.log(`${f.padEnd(34)} ${ms.toFixed(0).padStart(5)} ms  ${(bytes / 1e3).toFixed(0).padStart(5)} kB`);
}
console.log(`all ${total.toFixed(0)} ms`);
