# Decisions

Dated, newest last. Don't reopen these without a new reason.

## 2026-10-15

- **Format:** irregular Hauls of 6–20 objects, each with a voice-first field note. No feed.
- **AI is explicit**, designed into the page: serif for the editor, blue sans for the machine, plus a colophon.
- **Linking** uses typed, evidence-backed edges judged by a model and approved by the editor.
  Clustering is used only to suggest Threads over kept edges. No force-directed "hairball" graph;
  exploration is via Threads, local neighbourhoods and timelines.
- **Imagery:** public-domain plates only, never generated images.
- **Visual direction:** white ground plus dark mode, soft bright type colours, Newsreader + Schibsted
  Grotesk. Rejected: warm cream/beige grounds; a black/white/vermilion Swiss palette (too clichéd);
  Bodoni Moda display (illegible on phones).
- **Platform:** Cloudflare for everything that can be (Workers, D1, R2, Queues, Workflows, Workers AI,
  Vectorize, AI Gateway, Access).
- **Reader app:** Expo (React Native), one TypeScript codebase for Android and iOS, sharing types and
  tokens with web and workers. Chosen over native Kotlin; a native module or a private native capture
  app can be added later if needed.
- **Editor tooling:** a separate private Desk (PWA behind Access) for capture and review. The reader
  app has no editor mode.
- **Order of work:** pipeline + Desk + web first (4 Hauls on web), then backfill + Threads, then the app.
