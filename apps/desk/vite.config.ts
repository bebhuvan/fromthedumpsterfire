import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Desk is served as static assets by workers/api. `npm run dev` proxies the API to a local
// `wrangler dev` on 8787 (with DEV_AUTH_BYPASS=1 in workers/api/.dev.vars).
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, target: 'es2022' },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8787', '/share': 'http://127.0.0.1:8787', '/files': 'http://127.0.0.1:8787' },
  },
});
