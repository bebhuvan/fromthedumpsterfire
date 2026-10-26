// The chart drawer for publish (packages/server/src/chartdraw.ts): resvg's WebAssembly, which wrangler
// bundles as a compiled module (Workers cannot compile wasm from bytes at run time), and the app's
// font cuts from the Desk's own assets (/fonts, the same files as apps/mobile/assets/fonts). Loaded
// only when a Haul is published, so no other request pays for it.

import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import { resvgDrawer, type ChartDrawer } from '@fdf/server/chartdraw';
import type { Env } from '@fdf/server/env';

export async function chartDrawer(env: Env): Promise<ChartDrawer> {
  return resvgDrawer(wasm, async (file) => {
    if (!env.ASSETS) throw new Error('the Desk has no assets to load the chart fonts from');
    const r = await env.ASSETS.fetch(new Request(`https://desk.invalid/fonts/${file}`));
    if (!r.ok) throw new Error(`the chart font ${file} did not load (${r.status})`);
    return new Uint8Array(await r.arrayBuffer());
  });
}
