// The dev sample Hauls' chart pictures, drawn as publish draws them, recorded in the fixtures
// (packages/shared/fixtures/dev) and written to <out> under the names the app keeps them by, so they
// can be put on a test phone (adb) and a development build shows its charts. Run after the renderer
// changes (bump CHART_RENDER_VERSION first):
//   node_modules/.bin/esbuild scripts/chart-seed-pictures.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/seed-pictures.mjs && node /tmp/seed-pictures.mjs /tmp/seed-pictures
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { APP_PICTURE, RASTER_FONTS, SHARE, appPictureSvgs, chartKey, sceneToSvg, shareScene, type Chart } from '../packages/shared/src/charts/index.ts';
import { editionOf } from '../packages/shared/src/tokens.ts';
const root = process.cwd();
const out = process.argv[2]!;
mkdirSync(out, { recursive: true });
await initWasm(readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));
const fonts = RASTER_FONTS.map((f) => new Uint8Array(readFileSync(join(root, 'apps/mobile/assets/fonts', f))));
const png = (svg: string, zoom: number) => new Resvg(svg, { fitTo: { mode: 'zoom', value: zoom }, font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'Schibsted-Regular' } }).render().asPng();
const size = (b: Uint8Array) => ({ width: new DataView(b.buffer, b.byteOffset).getUint32(16), height: new DataView(b.buffer, b.byteOffset).getUint32(20) });
const BASE = 'https://files.fromthedumpsterfire.com';
for (const f of ['packages/shared/fixtures/dev/haul-002.json', 'packages/shared/fixtures/dev/haul-003.json']) {
  const haul = JSON.parse(readFileSync(join(root, f), 'utf8'));
  if (haul.number === 3) {
    const it = haul.items.find((i: { id: string }) => i.id === 'delhi-heat');
    if (!it.blocks.some((b: { kind: string; chart?: Chart }) => b.kind === 'chart' && b.chart!.form === 'calendar')) it.blocks.push({ kind: 'chart', chart: JSON.parse(readFileSync(join(root, 'docs/design-comps/charts/data/delhi-calendar-2024.json'), 'utf8')) });
  }
  const edition = editionOf(haul.number, haul.edition);
  const slug = String(haul.number).padStart(3, '0');
  for (const it of haul.items) {
    let figure = 0;
    (it.blocks ?? []).forEach((b: { kind: string; chart?: Chart; images?: unknown }, i: number) => {
      if (b.kind !== 'chart') return;
      figure++;
      const key = chartKey(b.chart!, edition);
      const svgs = appPictureSvgs(b.chart!, edition);
      const pics = { light: png(svgs.light, APP_PICTURE.zoom), dark: png(svgs.dark, APP_PICTURE.zoom), share: png(sceneToSvg(shareScene(b.chart!, { haul: haul.number, figure, address: `fromthedumpsterfire.com/haul/${haul.number}/${it.id}` }), { scheme: 'light', edition }), SHARE.zoom) };
      const images: Record<string, unknown> = {};
      for (const [s, bytes] of Object.entries(pics)) {
        const path = `hauls/${slug}/media/${it.id}-${i + 1}-chart-${key}-${s}.png`;
        writeFileSync(join(out, path.replaceAll('/', '__')), bytes);
        images[s] = { url: `${BASE}/${path}`, ...size(bytes) };
      }
      b.images = images;
      console.log(`${slug}/${it.id}`, b.chart!.form, key);
    });
  }
  writeFileSync(join(root, f), `${JSON.stringify(haul, null, 1)}\n`);
}
