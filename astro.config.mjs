// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://fromthedumpsterfire.com',
  integrations: [sitemap()],
  compressHTML: true,
  build: {
    inlineStylesheets: 'always',
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
