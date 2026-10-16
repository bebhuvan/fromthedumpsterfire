import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Server output on Cloudflare Workers: pages render at request time from the FILES R2 bucket (see
// src/lib/runtime.ts) behind the wrapper in src/worker/index.ts. About, 404, 503 and tokens.css are
// prerendered. No inline styles or scripts are emitted, so the CSP can be script-src 'self' and
// style-src 'self'.
export default defineConfig({
  site: 'https://fromthedumpsterfire.com',
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: false,
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
  devToolbar: { enabled: false },
  server: { port: 4321 },
});
