import { defineConfig } from 'astro/config';

// Static output, served by the fdf-web Worker (src/worker/index.ts) from Workers static assets.
// No inline styles or scripts are emitted, so the CSP can be script-src 'self' and style-src 'self'.
export default defineConfig({
  site: 'https://fromthedumpsterfire.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
  devToolbar: { enabled: false },
  server: { port: 4321 },
});
