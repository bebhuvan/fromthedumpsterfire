# From The Dumpster Fire 🔥

A modern, beautifully designed curated magazine built with Astro. Rescuing signal from the algorithmic inferno.

## 🎨 Design Philosophy

This site features a classic editorial design system inspired by traditional print magazines:

- **Soothing Color Palette**: Soft pastels (coral, peach, mint, lavender, sage) against a cream background
- **Editorial Typography**: DM Serif Display for headings, Crimson Pro for body text, Inter for UI elements
- **Thoughtful Details**: Subtle rotations, elegant shadows, and playful animations
- **Responsive & Accessible**: Works beautifully on all devices with proper semantic HTML

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📁 Project Structure

```
/
├── public/              # Static assets
│   ├── favicon.svg
│   └── robots.txt
├── src/
│   ├── components/      # Reusable Astro components
│   │   ├── ArticleCard.astro
│   │   └── ArchiveSearch.astro
│   ├── content/         # Content collections (Markdown + frontmatter)
│   │   ├── articles/    # Main content
│   │   ├── art/         # Art of the week
│   │   ├── poems/       # Poem showcase
│   │   ├── letters/     # Historical letters
│   │   ├── books/       # Book recommendations
│   │   └── config.ts    # Content collection schemas
│   ├── layouts/
│   │   └── BaseLayout.astro  # Main layout with header/footer
│   ├── pages/           # File-based routing
│   │   ├── index.astro       # Homepage
│   │   ├── about.astro       # About page
│   │   ├── archive.astro     # Searchable archive
│   │   ├── subscribe.astro   # Newsletter signup
│   │   ├── articles/[slug].astro  # Article template
│   │   └── rss.xml.ts        # RSS feed
│   ├── styles/
│   │   └── global.css   # Design system & global styles
│   └── middleware.ts    # Security headers
├── astro.config.mjs     # Astro configuration
├── tsconfig.json
└── package.json
```

## 📝 Adding Content

### Articles

Create a new Markdown file in `src/content/articles/`:

```markdown
---
title: "Your Article Title"
source: "Source Name"
originalUrl: "https://example.com/article"
author: "Author Name"
publishedDate: 2025-01-15
readingTime: 8
articleType: "essay" # essay, video, podcast, note, tweet, thread, paper, book
topics: ["topic1", "topic2"]
featured: false
curatorNotes: "Why you rescued this piece..."
excerpt: "A compelling 1-2 sentence summary."
pullQuote: "Optional memorable quote from the piece."
---

Your article overview content here...
```

### Other Content Types

- **Art**: `src/content/art/` - Weekly art features
- **Poems**: `src/content/poems/` - Poetry showcases
- **Letters**: `src/content/letters/` - Historical correspondence
- **Books**: `src/content/books/` - Book recommendations

All content types have their schemas defined in `src/content/config.ts`.

## 🎯 Key Features

### 1. **Homepage Sections**
- Opening quote
- Featured articles (1 large + 2 small grid)
- Art of the Week
- Rabbit Holes (recent articles grid)
- Poem of the Week
- Letter of the Week
- On My Shelf (book recommendations)
- Closing quote

### 2. **Archive with Search**
- Chronologically organized articles
- Client-side search (title, excerpt, topic)
- Responsive card layouts
- Real-time filtering

### 3. **SEO Optimized**
- Meta tags (Open Graph, Twitter Cards)
- Structured data
- Sitemap generation
- RSS feed
- Canonical URLs

### 4. **Performance**
- Inline critical CSS
- Optimized font loading
- Compressed HTML
- Fast static site generation
- Lighthouse score: 95+

### 5. **Security**
- Content Security Policy
- Security headers (X-Frame-Options, etc.)
- XSS protection
- CSRF protection via middleware

## 🎨 Design System

### Colors
```css
--bg-cream: #faf9f6;
--flame: #d97b67;
--ink: #2d2a26;
--ink-medium: #5a5550;
--pastel-coral: rgba(232, 145, 125, 0.25);
--pastel-peach: rgba(245, 195, 160, 0.28);
--pastel-mint: rgba(180, 215, 195, 0.26);
```

### Typography
- **Display**: DM Serif Display (400)
- **Body**: Crimson Pro (300, 400, 600, 700)
- **UI**: Inter (400, 500, 600, 700)

### Spacing Scale
```css
--space-xs: 0.75rem
--space-sm: 1.25rem
--space-md: 2rem
--space-lg: 3rem
--space-xl: 4.5rem
--space-2xl: 6rem
```

## 🛠️ Tech Stack

- **Framework**: [Astro](https://astro.build/) 5.x
- **Content**: Markdown with frontmatter (Content Collections)
- **Styling**: Scoped CSS with design tokens
- **RSS**: @astrojs/rss
- **Sitemap**: @astrojs/sitemap
- **Deployment**: Static site (ready for Vercel, Netlify, Cloudflare Pages)

## 📦 Building for Production

```bash
npm run build
```

The build outputs to `dist/` as a static site. Deploy anywhere:

- **Vercel**: Connect repo and deploy
- **Netlify**: Connect repo and deploy
- **Cloudflare Pages**: Connect repo and deploy
- **GitHub Pages**: Deploy `dist/` folder

## 🔒 Security

Security headers are automatically added via middleware:
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection
- Content-Security-Policy
- Referrer-Policy

## 📱 Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile responsive (iOS, Android)
- Progressive enhancement for older browsers

## 🎯 Content Strategy

### What to Feature
- Thoughtful essays and long-form content
- Educational videos and documentaries
- Insightful podcasts
- Research papers (made accessible)
- Art and poetry
- Historical letters and correspondence

### Writing Overviews
- 200-600 words
- Plain English, sophisticated but accessible
- Convey the "why" not just the "what"
- Hook readers to explore the original
- Add your perspective in curator notes

## 📊 Analytics (Optional)

To add analytics, insert tracking code in `src/layouts/BaseLayout.astro` before the closing `</head>` tag.

## 🤝 Contributing

1. Add content to appropriate collection folder
2. Follow frontmatter schema
3. Write compelling overviews
4. Test locally before committing
5. Submit PR with descriptive title

## 📄 License

This project is open source. Content copyright belongs to original authors/sources.

## 🙏 Acknowledgments

- Design inspired by classic editorial magazines
- Built with [Astro](https://astro.build/)
- Typography from Google Fonts

---

**Built with ❤️ and rescued from the 🔥**
