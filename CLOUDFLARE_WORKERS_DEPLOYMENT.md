# Cloudflare Workers Deployment Guide

This site is configured to deploy to **Cloudflare Workers** (NOT Cloudflare Pages, which is being deprecated).

## Prerequisites

1. **Cloudflare Account**: Sign up at https://dash.cloudflare.com
2. **Wrangler CLI**: Install globally
   ```bash
   npm install -g wrangler
   ```
3. **Domain**: Add your domain to Cloudflare (optional, can use workers.dev subdomain)

## Quick Deploy

### 1. Login to Cloudflare

```bash
wrangler login
```

This will open a browser window to authenticate.

### 2. Build the Site

```bash
npm run build
```

This builds the static site with the Cloudflare adapter.

### 3. Deploy to Workers

```bash
wrangler deploy
```

This deploys your static site to Cloudflare Workers with static asset serving.

### 4. Configure Custom Domain (Optional)

If you have `fromthedumpsterfire.com` added to Cloudflare:

1. Go to Cloudflare Dashboard → Workers & Pages
2. Click on your project
3. Go to "Custom Domains"
4. Add `fromthedumpsterfire.com` and `www.fromthedumpsterfire.com`

## Configuration Files

### `wrangler.toml`

```toml
name = "fromthedumpsterfire"
compatibility_date = "2025-01-01"

# Static Assets Configuration
[assets]
directory = "./dist"
binding = "ASSETS"
```

### `astro.config.mjs`

For static sites on Cloudflare Workers, use `output: 'static'` without an adapter:

```javascript
export default defineConfig({
  site: 'https://fromthedumpsterfire.com',
  output: 'static',
  // No adapter needed for static sites on Workers
  // ... rest of config
});
```

## Continuous Deployment with GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    name: Deploy to Cloudflare Workers
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
```

### Setup GitHub Secrets

1. Generate Cloudflare API Token:
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"
   - Use "Edit Cloudflare Workers" template
   - Copy the token

2. Add to GitHub:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: (paste your token)

## Local Development

### Preview Production Build

```bash
npm run build
wrangler dev
```

This starts a local server at http://localhost:8787

### Development Server

```bash
npm run dev
```

Standard Astro dev server at http://localhost:4321

## Environment Variables (if needed)

If you need environment variables, add them to `wrangler.toml`:

```toml
[vars]
PUBLIC_SITE_URL = "https://fromthedumpsterfire.com"
```

Or set them in Cloudflare Dashboard:
- Workers & Pages → Your Project → Settings → Variables

## Security Headers

All security headers are configured in `src/middleware.ts` and will work with Cloudflare Workers:

- ✅ HSTS (Strict-Transport-Security)
- ✅ Content-Security-Policy (CSP)
- ✅ X-Frame-Options
- ✅ X-Content-Type-Options
- ✅ Permissions-Policy

## Performance Optimizations for Workers

The site is optimized for Cloudflare Workers:

1. **Static Assets**: All assets are served from Workers KV
2. **Compressed HTML**: `compressHTML: true` in Astro config
3. **Inlined Styles**: Critical CSS inlined for faster FCP
4. **Minified JS/CSS**: Lightning CSS and esbuild minification
5. **Font Optimization**: Reduced from 12 to 8 font files (40% smaller)

## Deployment Checklist

- [x] Configure `astro.config.mjs` with `output: 'static'`
- [x] Create `wrangler.toml` configuration
- [x] Build successfully: `npm run build`
- [ ] Login to Wrangler: `wrangler login`
- [ ] Deploy: `wrangler deploy`
- [ ] Configure custom domain in Cloudflare Dashboard
- [ ] Setup GitHub Actions for CI/CD (optional)
- [ ] Verify security headers at https://securityheaders.com
- [ ] Test on mobile devices
- [ ] Run Lighthouse audit

## Troubleshooting

### No Warnings Expected

With the static configuration, you should see a clean build with no warnings.

### Build Errors

If you see errors during build:

```bash
# Clean node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clean Astro cache
rm -rf .astro node_modules/.astro

# Try building again
npm run build
```

### Deployment Fails

```bash
# Verify you're logged in
wrangler whoami

# If not logged in
wrangler login

# Check wrangler version
wrangler --version

# Update if needed
npm install -g wrangler@latest
```

### Custom Domain Not Working

1. Ensure domain is added to Cloudflare
2. DNS is set to "Proxied" (orange cloud)
3. SSL/TLS mode is "Full" or "Full (strict)"
4. Wait 5-10 minutes for DNS propagation

## Cloudflare Workers vs. Pages

**Why Workers and not Pages?**

Cloudflare is consolidating Pages functionality into Workers. This project uses:

- **Static output** → No adapter needed
- **`wrangler deploy`** → Direct Workers deployment
- **Workers Static Assets** → Built-in asset serving
- **Workers Runtime** → Faster cold starts, better performance

## Cost

Cloudflare Workers **Free Tier**:
- 100,000 requests/day
- Unlimited bandwidth
- 10ms CPU time per request

For a static site like this, you'll likely stay on the free tier.

**Paid Plan** (if needed): $5/month
- 10 million requests/month
- 30s CPU time per request

## Support

- **Cloudflare Docs**: https://developers.cloudflare.com/workers/
- **Astro Cloudflare Adapter**: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- **Wrangler CLI**: https://developers.cloudflare.com/workers/wrangler/

## Post-Deployment

After deploying:

1. **Verify Security Headers**: https://securityheaders.com
2. **Run Lighthouse Audit**: DevTools → Lighthouse
3. **Test RSS Feed**: https://yoursite.com/rss.xml
4. **Test Sitemap**: https://yoursite.com/sitemap-index.xml
5. **Mobile Testing**: Test on real devices
6. **Search Console**: Add site to Google Search Console

---

✅ **Site is ready to deploy to Cloudflare Workers!**

Run `wrangler deploy` to get started.
