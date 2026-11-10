# Substack artwork

For the Hauls-by-email list on Substack (DECISIONS 2026-11-09). Drawn from the brand's own source
(`docs/brand/mark.py`, the masthead in `apps/web/src/components/Masthead.astro`); 2026-11-09.

| Substack setting | File |
|---|---|
| Publication logo (square; Substack rounds the corners) | `logo-ember-on-ink.png` (the app icon), or `logo-white-on-ember.png` (the favicon) |
| Wordmark (email header, transparent) | `wordmark-light.png` for light emails, `wordmark-dark.png` for dark |
| Cover / social image (1200×630) | `cover-1200x630.png` (the site's card, `apps/web/public/og.png`) |

SVGs of the marks are alongside (`logo-*.svg`, `mark-ember-transparent.svg`). PNGs of the marks were
rendered with `rsvg-convert -w 1024`; the wordmarks with headless Chromium from the site's fonts and
marks, then trimmed.
