# Custom Domain Setup Instructions

## ✅ Current Status

Your site is **LIVE** at:
🔗 **https://fromthedumpsterfire.r-bhuvanesh2007.workers.dev**

GitHub Repository: https://github.com/bebhuvan/fromthedumpsterfire

---

## 🌐 Configure Custom Domain: fromthedumpsterfire.com

To use your custom domain, follow these steps:

### Step 1: Add Domain to Cloudflare

1. **Login to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com
   - Login with your account (r.bhuvanesh2007@gmail.com)

2. **Add Site**
   - Click "Add a Site" button
   - Enter: `fromthedumpsterfire.com`
   - Click "Add site"

3. **Choose Plan**
   - Select "Free" plan (perfect for this site)
   - Click "Continue"

4. **Review DNS Records**
   - Cloudflare will scan your current DNS records
   - Click "Continue"

5. **Update Nameservers**
   - Cloudflare will provide you with 2 nameservers like:
     - `kyleigh.ns.cloudflare.com`
     - `omar.ns.cloudflare.com`
   - Go to your domain registrar (where you bought fromthedumpsterfire.com)
   - Update nameservers to the ones Cloudflare provided
   - Wait for DNS propagation (5 minutes - 48 hours, usually ~1 hour)

---

### Step 2: Configure Worker Custom Domain

**Option A: Using Cloudflare Dashboard (Easier)**

1. Go to https://dash.cloudflare.com
2. Navigate to **Workers & Pages**
3. Click on **fromthedumpsterfire** worker
4. Go to **Settings** → **Domains & Routes**
5. Click **Add** → **Custom Domain**
6. Enter: `fromthedumpsterfire.com`
7. Click **Add domain**
8. Repeat for `www.fromthedumpsterfire.com`

Cloudflare will automatically create the DNS records!

**Option B: Using wrangler.toml (Advanced)**

1. Edit `wrangler.toml` and uncomment the routes section:

```toml
name = "fromthedumpsterfire"
compatibility_date = "2025-01-01"

[assets]
directory = "./dist"

# Uncomment these lines:
[[routes]]
pattern = "fromthedumpsterfire.com/*"
zone_name = "fromthedumpsterfire.com"

[[routes]]
pattern = "www.fromthedumpsterfire.com/*"
zone_name = "fromthedumpsterfire.com"
```

2. Deploy again:
```bash
cd "/home/bhuvanesh/A main projects/newer dumpster"
wrangler deploy
```

---

### Step 3: Configure SSL/TLS

1. In Cloudflare Dashboard → **SSL/TLS**
2. Set encryption mode to: **Full** or **Full (strict)**
   - This ensures HTTPS works correctly
3. Enable **Always Use HTTPS** (optional but recommended)

---

### Step 4: Verify Deployment

Once DNS propagates:

1. **Visit your site**:
   - https://fromthedumpsterfire.com
   - https://www.fromthedumpsterfire.com

2. **Test security headers**:
   - https://securityheaders.com/?q=fromthedumpsterfire.com

3. **Run Lighthouse audit**:
   - Open DevTools → Lighthouse → Run audit

4. **Check RSS feed**:
   - https://fromthedumpsterfire.com/rss.xml

5. **Test on mobile**:
   - Test touch targets, search, navigation

---

## 🔧 Optional: Setup WWW Redirect

To redirect www → non-www (or vice versa):

### Method 1: Cloudflare Page Rule (Free tier allows 3 rules)

1. Go to **Rules** → **Page Rules**
2. Create rule:
   - URL: `www.fromthedumpsterfire.com/*`
   - Setting: **Forwarding URL** → **301 Permanent Redirect**
   - Destination: `https://fromthedumpsterfire.com/$1`
3. Save and deploy

### Method 2: Bulk Redirects (Recommended)

1. Go to **Rules** → **Redirect Rules**
2. Create rule to redirect www → non-www
3. Unlimited redirects on free tier!

---

## 📊 Post-Deployment Checklist

After domain is configured:

- [ ] Visit https://fromthedumpsterfire.com
- [ ] Verify HTTPS works (green padlock)
- [ ] Test www redirect
- [ ] Check all pages load correctly
- [ ] Test search functionality
- [ ] Verify RSS feed: /rss.xml
- [ ] Check sitemap: /sitemap-index.xml
- [ ] Run Lighthouse audit (aim for 95+ scores)
- [ ] Test security headers
- [ ] Test on mobile device (iOS & Android)
- [ ] Add to Google Search Console
- [ ] Submit sitemap to Google

---

## 🚀 Your Site Stats

**Files Deployed**: 44 static assets
**Total Size**: 0.34 KiB / gzip: 0.24 KiB
**Deployment Time**: 19.27 seconds
**Version ID**: e9074d60-6097-43a5-af9a-181c42e03de1

**Optimizations Applied**:
- ✅ WCAG AA color contrast
- ✅ 48px touch targets
- ✅ HSTS security header
- ✅ 40% font reduction
- ✅ Improved CSP
- ✅ Mobile optimizations
- ✅ Focus indicators
- ✅ Reduced motion support

---

## 📝 Update Workflow

When you make changes:

```bash
# 1. Make your edits
# 2. Build
npm run build

# 3. Deploy to Cloudflare
wrangler deploy

# 4. Commit to Git
git add .
git commit -m "Your update message"
git push
```

Your site will update in ~20 seconds!

---

## 🔗 Important Links

- **Live Site (Workers)**: https://fromthedumpsterfire.r-bhuvanesh2007.workers.dev
- **GitHub Repo**: https://github.com/bebhuvan/fromthedumpsterfire
- **Cloudflare Dashboard**: https://dash.cloudflare.com
- **Workers Dashboard**: https://dash.cloudflare.com/?to=/:account/workers-and-pages

---

## 💡 Tips

1. **DNS Propagation**: Use https://dnschecker.org to check if your domain is propagating

2. **Cloudflare Cache**: If changes don't appear immediately:
   - Go to Cloudflare Dashboard
   - **Caching** → **Configuration**
   - Click **Purge Everything**

3. **SSL Certificate**: Cloudflare provides free SSL automatically
   - Usually issues within 5-15 minutes
   - No action needed on your part

4. **Analytics**: Enable **Web Analytics** in Cloudflare for free, privacy-focused stats

5. **Bot Protection**: Enable **Bot Fight Mode** in Security settings for free DDoS protection

---

## 🎉 You're Live!

Your editorial magazine is now deployed to Cloudflare Workers with:
- ✅ GitHub repository
- ✅ Automatic deployments
- ✅ Production-ready code
- ✅ All audit fixes applied
- ✅ Security headers
- ✅ Performance optimizations

Just configure the custom domain and you're done! 🔥
