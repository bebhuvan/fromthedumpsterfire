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
  provider keys are set. Reasoning models were first run with thinking off: with it on, long drafts
  spent the whole output budget on reasoning and returned truncated JSON. Since 2026-10-16 each task
  sets a thinking level and the adapters add a thinking allowance on top of the answer's budget, so
  judge and connect think (medium) and clean, OCR and plate do not.
- **Native provider adapters, not one OpenAI-compatible call** (2026-10-16). Gemini, Claude,
  DeepSeek and Z.ai each get their own adapter so their JSON-schema modes, thinking controls,
  prompt caching, PDF input and usage fields are used properly. Capabilities and prices are config
  in `routes.json`. Rejected: the gateway's `/compat` endpoint for everything (no PDFs, no cache
  marks, no thinking control, no cached or reasoning token counts).
- **Paid models first for bulk tasks once keys are set** (the editor's choice, 2026-10-16): Claude
  Haiku 5.5 reads, drafts and cleans; DeepSeek Flash with thinking judges notes and links (a
  different family from the drafter); GLM-5.3-Flash (paid; the free GLM-4.7-Flash was too often overloaded) proposes plate searches; Gemini 3.8 Flash
  does OCR. About $0.03 per item. Workers AI stays last in every chain. Chains and their reasoning:
  `docs/MODELS.md`.
- **The extracted text stays the source of truth when a model reads the PDF.** Native PDF input is
  context for the reading card; excerpts and quotes are matched against our own extraction.
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
  their source. Boxes are allowed only
  as made things: the swatch sheets, the broadside, the catalogue card, the book page.
- **The rhyme bridge is machine text**, set in blue sans in the gutter.
- **Catalogue headwords move a leading article to the end** ("Great Stink, The"). Names of people are
  not inverted, because a two-word title is not always a person ("Bell Labs").
- **The cover's contents are specimens**, not a stack of coloured bands (the editor found the stepped
  stack clichéd): each item is a small specimen of its own printed form (`Specimen.astro`).
- **The broadside is set in Newsreader Text italic**, not the display italic, which read tight and
  mannered at poster size. The editor picked this from four settings.
- **No dotted leaders.** See also is a set of reference slips; the search index is title and count.
- **The home page carries the nameplate.** The editor found the landing underpowered: the brand lived
  only in a small header line. The struck masthead now runs across the top of the home cover with a
  strap line; the ghost number stays the loud thing below it.
- **The route cites items by number** (small raised ember numerals), replacing the tiny type squares,
  so the route and the specimens read as one system.
- **Search is a word, not an icon**, in the navigation; the archive also has its own search line. A
  magnifier would be the only icon on the site.
- **See also is guide cards, not grey slips.** The editor found the plate-grey boxed slip generic; a
  lone slip read as a stock callout. Entries are now ruled card edges with a coloured, staggered tab.
- **About is built from the magazine's forms** (transcript, house rules with their checks, key to the
  forms) rather than labelled paragraphs, which the editor found off.

## 2026-10-16 (milestone 6 on the Desk)

- **Plates come only from institutions' open-access APIs** (Wikimedia Commons, Art Institute of
  Chicago, The Met; Smithsonian and Rijksmuseum when keyed), filtered on the institution's own
  public-domain or CC0 marking. The model proposes searches, never images or URLs. Chosen images are
  copied to our storage and published from FILES; archives are never hotlinked (Wikimedia refuses
  app image loaders).
- **Two buckets.** MEDIA is private; FILES is public and only `publish.ts` writes `hauls/` there.
- **Connections need a quote from both ends**, each verified verbatim against stored source text,
  or they are dropped. Pairs are claimed before judging so none is paid for twice. The editor keeps
  a link only with a note in their own words (or by adopting the machine's sentence explicitly),
  because the app sets connection notes in the editor's serif.
- **Threads are connected components of kept links**, large ones split at their weakest edges
  (fewest shared neighbours). Label propagation was tried and rejected: with deterministic tie-breaks
  it floods one label across a bridge edge.
- **Embeddings: `@cf/baai/bge-m3`** (multilingual, 1024 dims, the cheapest Workers AI embedding at
  $0.012 per million tokens). Batches of 20; a batch of 50 long chunks hung in testing.
- **Browser Rendering is opt-in** (`BROWSER_FALLBACK=on`): request interception vets every request,
  but WebSockets and the browser's own DNS lookup cannot be intercepted.
- **Voice notes prefer AAC in MP4**; WebM/Ogg notes still publish with a format field and an
  "Android only" warning rather than being blocked.
