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
- **Navigation:** React Navigation native stack, not Expo Router. Expo Router 57 pulls in Reanimated,
  Worklets, @expo/ui, glass effect, SF Symbols and a drawer as dependencies, and Expo links transitive
  native modules into the Android build. The app needs none of them. `@expo/dom-webview` is excluded
  from autolinking for the same reason.
- **App data:** the reader app has no API dependency. It reads immutable Haul bundles and a small index
  straight from R2 (files.fromthedumpsterfire.com), caches them on disk, and renders synchronously.
- **Brand:** classy system with one ember accent for the brand only; app icon is the ember flame on ink.
- **Fonts:** static, Latin-subset cuts of Newsreader (text 16, display 72) and Schibsted Grotesk,
  embedded at build time. About 650 KB for eight files.

## 2026-10-16 (the Desk)

- **Desk UI is a Vite + React SPA in `apps/desk`, not Astro routes.** The Desk is an app for one
  person: selection-to-excerpt, autosaving textareas, keyboard navigation, live pipeline status. It
  needs no SEO or server rendering, and islands would only add a framework boundary. It is served as
  static assets by the Desk Worker, so it shares the API's origin and Access lock. The public website
  stays Astro. Dependencies: React and React DOM only.
- **Two Workers.** `workers/api` (Desk UI + API + the public device route) and `workers/pipeline`
  (ItemWorkflow + queue consumer). Shared server code is `packages/server`.
- **The Worker is a second lock behind Access.** Every request (assets included) runs the Worker,
  which verifies the Access JWT itself and fails closed when Access is unconfigured. Public routes
  are listed by exact method and path. Rejected: trusting `Cf-Access-Authenticated-User-Email`, or
  serving static assets before the Worker.
- **Models through a task router with fallbacks.** Task chains live in
  `packages/server/src/models/routes.json`; keys decide availability; Workers AI models (DeepSeek V4
  Flash, Kimi K2.6 with thinking off, Llama 4 Scout for vision) are the working fallback when no
  provider keys are set. Reasoning models are run with thinking off: with it on, long drafts spent
  the whole output budget on reasoning and returned truncated JSON.
- **Spend is enforced from our own ledger** (`model_calls`), checked before every call; AI Gateway
  logs are a second view, not the source of truth. Production ships with a zero ceiling (no calls)
  until the editor sets one.
- **Machine prose that fails the house style is regenerated twice with the failures listed, then
  dropped**, never shown with a warning. A note the checker calls "partly" offers a narrower
  correction only if it is not longer than the original.
- **Wikipedia card summaries default to the first sentence of Wikipedia's own extract**, not a
  machine gloss, so the serif text on the card is Wikipedia's words; the editor can rewrite it.
- **Route lines drafted by the machine stay `by: machine`** until the editor rewrites one or marks it
  theirs. The machine never writes in the editor's first person.
- **Connections are editor-made for now** (typed, with a one-sentence note in the editor's words).
  Machine edge-judging is milestone 6.

## 2026-10-16 (design: Salvage)

- **Visual system is Salvage** (`docs/DESIGN.md`), chosen by the editor from three comps (Margin,
  Sheets, Index; all in `docs/design-comps/`) as the best of the three. Not any one alone: Margin was
  the most austere, Sheets put colour everywhere without a working margin, and Index's huge
  highlighted line competed with the forms.
- **Each content type has its printed form**: magazine opening, offprint, transcript, broadside,
  facing pages, catalogue card, page from the book. Chosen by type in `apps/web/src/lib/forms.ts` and
  in the app's item screen.
- **One loud thing per screen**: the struck masthead on the waiting page, the ghost number on the
  Haul cover, the form itself on item pages.
- **Ember may be used beyond the flame**, small and on purpose: the strike through "Internet", the
  editor's "B.", the folio, the current-page underline. The editor asked for "a little of our own
  design take (red embers)" without loudness. Still never body text, machine text or a fill.
- **No pills, chips, badges, rounded tinted cards or boxed machine notes.** The editor called the
  blue-text box and the rounded cards clichés. Machine notes are blue sans set as typography with
  their source; Wikipedia and connections are an index with dotted leaders. Boxes are allowed only
  as made things: the swatch sheets, the broadside, the catalogue card, the book page.
- **The rhyme bridge is machine text**, set in blue sans in the gutter.
- **Catalogue headwords move a leading article to the end** ("Great Stink, The"). Names of people are
  not inverted, because a two-word title is not always a person ("Bell Labs").
