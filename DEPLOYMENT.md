# Deployment Guide

This site is a static Astro site that can be deployed to any static hosting provider.

## 🚀 Quick Deploy Options

### Vercel (Recommended)

1. Push your code to GitHub
2. Visit [vercel.com](https://vercel.com)
3. Import your repository
4. Configure:
   - **Framework Preset**: Astro
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Deploy!

### Netlify

1. Push your code to GitHub
2. Visit [netlify.com](https://netlify.com)
3. Click "Add new site" → "Import an existing project"
4. Configure:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. Deploy!

### Cloudflare Pages

1. Push your code to GitHub
2. Visit [pages.cloudflare.com](https://pages.cloudflare.com)
3. Create a new project
4. Configure:
   - **Framework preset**: Astro
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Deploy!

## 🔧 Build Settings

All platforms need these settings:

```
Build Command: npm run build
Output Directory: dist
Node Version: 18.x or higher
```

## 🌐 Custom Domain

After deployment, configure your custom domain:

1. Add domain in your hosting provider's dashboard
2. Update DNS records:
   ```
   Type: CNAME
   Name: @
   Value: [your-host-url]
   ```
3. Enable HTTPS (usually automatic)

## 📝 Environment Variables

If you need environment variables:

```bash
# .env (not committed to git)
PUBLIC_SITE_URL=https://fromthedumpsterfire.com
```

Add them in your hosting provider's dashboard.

## 🔄 Continuous Deployment

All recommended hosts support automatic deployments:
- Push to `main` branch → automatic deploy
- Open PR → preview deployment

## 🎯 Post-Deployment Checklist

- [ ] Verify site loads correctly
- [ ] Test RSS feed: `/rss.xml`
- [ ] Check sitemap: `/sitemap-index.xml`
- [ ] Test search on archive page
- [ ] Verify all article pages render
- [ ] Check mobile responsiveness
- [ ] Test Open Graph images
- [ ] Verify security headers (use securityheaders.com)

## 🔒 Security Headers

The site includes security headers via middleware. Verify they're working:

```bash
curl -I https://yoursite.com
```

You should see:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy: ...`
- `Referrer-Policy: strict-origin-when-cross-origin`

## 📊 Performance

Run Lighthouse audit after deployment:

```bash
npx lighthouse https://yoursite.com
```

Target scores:
- Performance: 95+
- Accessibility: 95+
- Best Practices: 95+
- SEO: 100

## 🐛 Troubleshooting

### Build fails

- Check Node version (18.x or higher)
- Clear cache: `rm -rf node_modules && npm install`
- Check build logs for missing dependencies

### Content not showing

- Verify content files are in `src/content/`
- Check frontmatter matches schema
- Ensure dates are valid

### Styles broken

- Check build output includes CSS
- Verify fonts loading from Google Fonts
- Check CSP headers aren't blocking resources

## 📱 Testing Before Deploy

```bash
# Build locally
npm run build

# Preview build
npm run preview

# Open http://localhost:4321
```

## 🔄 Update Content

To update content after deployment:

1. Add/edit Markdown files in `src/content/`
2. Commit and push to GitHub
3. Automatic deployment will trigger
4. Site updates in ~2 minutes

## 📈 Analytics (Optional)

Add analytics by editing `src/layouts/BaseLayout.astro`:

```astro
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_ID');
</script>
```

Or use:
- Plausible
- Fathom
- Simple Analytics

## 🎉 You're Live!

Your site is now live at your chosen URL. Share it with the world!
