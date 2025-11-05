# 🚀 Deploy to Cloudflare Workers - Quick Start

**Time to deploy: ~5 minutes**

## Prerequisites

- Cloudflare account (free tier works!)
- Node.js installed
- Project built successfully

## Step-by-Step Deployment

### 1. Install Wrangler (Cloudflare CLI)

```bash
npm install -g wrangler
```

### 2. Login to Cloudflare

```bash
wrangler login
```

This opens your browser for authentication. ✅

### 3. Build Your Site

```bash
npm run build
```

Expected output: `✓ 63 page(s) built in ~1.3s`

### 4. Deploy!

```bash
wrangler deploy
```

**First deployment output:**
```
Total Upload: 2.5 MB / gzip: 850 KB
Uploaded fromthedumpsterfire (X.XX sec)
Published fromthedumpsterfire
  https://fromthedumpsterfire.YOUR-SUBDOMAIN.workers.dev
```

🎉 **Your site is live!**

---

## Post-Deployment Steps

### Verify Optimizations

```bash
# Check if custom worker is running
curl -I https://fromthedumpsterfire.YOUR-SUBDOMAIN.workers.dev/

# Look for these headers:
# ✅ Server-Timing: edge;desc="Cloudflare Workers"
# ✅ X-Worker-Cache: MISS (first request) or HIT (subsequent)
# ✅ Cache-Control: public, max-age=...
```

### Test Performance

1. Open site in browser
2. Open DevTools → Network tab
3. Reload page (Cmd/Ctrl + Shift + R)
4. Check:
   - TTFB (should be <100ms after first load)
   - Look for "103 Early Hints" in network timeline
   - Verify `cf-cache-status: HIT` on subsequent loads

### Configure Custom Domain (Optional)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to: **Workers & Pages** → **fromthedumpsterfire**
3. Click **Custom Domains**
4. Add your domain: `fromthedumpsterfire.com`
5. DNS automatically configured! ✨

---

## Cloudflare Dashboard Settings

### Enable Free Optimizations

Navigate to: `Your Domain → Speed`

1. **Auto Minify**
   - ✅ JavaScript
   - ✅ CSS
   - ✅ HTML

2. **Brotli**
   - ✅ Enabled (default)

3. **Early Hints**
   - ✅ Enabled

Navigate to: `Your Domain → Caching`

4. **Caching Level**
   - ✅ Standard

5. **Browser Cache TTL**
   - ✅ Respect Existing Headers

6. **Always Online**
   - ✅ Enabled

---

## Continuous Deployment (GitHub Actions)

### Create Workflow File

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npm run build

      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Setup GitHub Secret

1. **Get Cloudflare API Token:**
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"
   - Use "Edit Cloudflare Workers" template
   - Copy token

2. **Add to GitHub:**
   - Repo → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `CLOUDFLARE_API_TOKEN`
   - Paste token
   - Save

3. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Add Cloudflare Workers deployment"
   git push origin main
   ```

   ✅ Auto-deploys on every push!

---

## Performance Monitoring

### View Analytics

**Cloudflare Dashboard:**
1. Navigate to: **Workers & Pages** → **fromthedumpsterfire**
2. Click **Metrics & Analytics**
3. View:
   - Requests per second
   - Success rate
   - CPU time
   - Cache hit rate

### Real User Monitoring

**Browser DevTools:**
```javascript
// Check cache status
performance.getEntriesByType('resource')
  .map(r => ({
    name: r.name,
    duration: r.duration,
    serverTiming: r.serverTiming
  }))
```

### Lighthouse Audit

```bash
# Install Lighthouse CLI
npm install -g lighthouse

# Run audit
lighthouse https://yoursite.com --view
```

**Expected Scores:**
- Performance: 95+
- Accessibility: 95+
- Best Practices: 100
- SEO: 100

---

## Troubleshooting

### "Error: Must provide API token"

```bash
wrangler login
# Or set manually:
export CLOUDFLARE_API_TOKEN="your-token-here"
```

### "Error: No such file or directory: dist"

```bash
# Build first!
npm run build
```

### Worker not showing custom headers

```bash
# Check wrangler.toml has:
cat wrangler.toml | grep "main"

# Should output:
# main = "src/_worker.js"

# Redeploy:
wrangler deploy
```

### Cache not working

```bash
# Clear browser cache (Cmd/Ctrl + Shift + R)
# Check headers:
curl -I https://yoursite.com/

# Should see:
# X-Worker-Cache: MISS (first) or HIT (second request)
```

---

## Commands Cheat Sheet

```bash
# Build
npm run build

# Deploy
wrangler deploy

# View logs (realtime)
wrangler tail

# List deployments
wrangler deployments list

# Rollback to previous
wrangler rollback

# Local development with Workers
wrangler dev

# Delete deployment
wrangler delete
```

---

## Cost Estimate

### Free Tier (Sufficient for most blogs)
- ✅ 100,000 requests/day
- ✅ Unlimited bandwidth
- ✅ 10ms CPU time per request
- ✅ Global edge network
- **Cost: $0/month**

### Paid Tier (if you exceed free tier)
- ⚡ 10 million requests/month
- ⚡ 30s CPU time per request
- ⚡ Priority support
- **Cost: $5/month**

**Typical blog traffic:** 1,000-10,000 requests/day = **Free tier is enough!**

---

## Next Steps

1. ✅ Deploy to Cloudflare Workers
2. ✅ Verify optimizations are active
3. ✅ Configure custom domain
4. ✅ Enable Cloudflare dashboard settings
5. ✅ Setup GitHub Actions CI/CD
6. ✅ Run Lighthouse audit
7. ✅ Monitor analytics

---

## Support

- 📖 [Full Documentation](./CLOUDFLARE_OPTIMIZATIONS.md)
- 🚀 [Deployment Guide](./CLOUDFLARE_WORKERS_DEPLOYMENT.md)
- 🔧 [Wrangler Docs](https://developers.cloudflare.com/workers/wrangler/)
- 💬 [Cloudflare Community](https://community.cloudflare.com/)

---

**Happy deploying!** 🚀✨

Your site will be served from 275+ data centers worldwide with:
- ⚡ <100ms TTFB (cached)
- 🌍 Global edge caching
- 🔒 Enterprise security
- 📊 Real-time analytics
- 💰 $0/month (free tier)
