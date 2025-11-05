// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
// For Cloudflare Workers static deployment, we use output: 'static' without adapter
export default defineConfig({
  site: 'https://fromthedumpsterfire.com',
  output: 'static',
  integrations: [sitemap()],
  compressHTML: true,
  build: {
    inlineStylesheets: 'never',
    assets: '_astro',
  },
  vite: {
    build: {
      cssMinify: 'lightningcss',
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  },
  security: {
    checkOrigin: true
  }
});
