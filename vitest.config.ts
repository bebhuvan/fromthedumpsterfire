import { defineConfig, configDefaults } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '.claude/**', 'apps/mobile/android/**'] },
  // The Desk Worker imports resvg's wasm as a compiled module (wrangler bundles it); in Node the
  // tests get its bytes instead.
  resolve: { alias: { '@resvg/resvg-wasm/index_bg.wasm': fileURLToPath(new URL('./packages/server/test/resvg-wasm.ts', import.meta.url)) } },
});
