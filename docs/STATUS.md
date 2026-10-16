# Status

## Done

- 2026-10-15: brief, architecture, design system and decisions written. Design canvas published.
- 2026-10-15: `packages/shared`: design tokens, Haul bundle types, sample Haul 001 fixture with
  invariant tests (highlights exist in text, links resolve within the bundle, citations present).
- 2026-10-15: `apps/mobile` reader app (Expo 57, React Navigation native stack):
  cover, field note with route, glossed item (standard, Rhymes and poem layouts), thread timeline,
  archive, how-it's-made. Light and dark. Offline-first bundle cache. Voice notes stream on tap.
  Articles open in an in-app browser tab; video and podcast links open in their own apps. Deep links
  for fromthedumpsterfire.com/haul/… Release builds use R8 and resource shrinking.
- 2026-10-15: warm palette (apricot, coral, butter, sky, mint, pistachio). App gains a bottom bar
  (Latest · Threads · Search · Saved); on-device search with type filters, an A–Z topic index and
  Surprise me; Saved and read markers stored on the phone; Continue reading; Threads across the
  archive; Settings (notifications, appearance, text size, offline storage, note to the editor,
  privacy); Share a quote; corrections log on the cover. Push client registers the FCM token with
  `POST /v1/devices` (server side is in the Desk work); the Firebase file is optional at build time.
- 2026-10-15: Desk v1 started by a parallel agent on its own branch (capture, pipeline, review,
  publish, push sending, Access).

- 2026-10-16: **the Desk v1** (`apps/desk`, `workers/api`, `workers/pipeline`, `packages/server`,
  `migrations/0001_desk.sql`; additive `packages/shared` modules: style, verbatim, cleanup, detect,
  validate). Capture of links (articles, Substack, YouTube, podcasts, X, arXiv, DOIs, PDFs), passages
  with sources, PDF uploads, page photos (OCR) and voice notes; the per-item Workflow; review with
  select-to-excerpt; Haul composer with questions, route, preview, publish and corrections; push
  endpoint and FCM sender. Preview deployed at https://fdf-desk-preview.r-bhuvanesh2007.workers.dev.
- 2026-10-16: **voice profile** (`docs/VOICE.md`, `packages/shared/src/voice.ts`, export
  `@fdf/shared/voice`). Measured from 134k words of the editor's Substack notes (2022–25), 25k words
  of raw 2026 dictation and 87k words of his Claude Code prompts, against AI-polished and
  model-written contrast sets. Exports `editorVoice` (prompt block for title and route drafts),
  `aiTells` and `voiceCheck` (17 machine-prose tells that checkStyle does not cover; the editor's
  notes trip them 2.3 times per 10k words, model-written notes 85 times), `dictionaryHints` and
  `dictationGarbles` for transcription. Wired in: `checkStyle` (machine mode) runs the voice tells,
  so every machine-prose gate catches them; title options, the route draft and thread titles get
  `editorVoice`; editor voice notes send `dictionaryHints` to Whisper as `initial_prompt`.

- 2026-10-16: **native model providers** (`packages/server/src/models/{providers/*,http,gateway,cost,schema,types}.ts`,
  `migrations/0003_model_call_tokens.sql`, `docs/MODELS.md`, `scripts/smoke-models.ts`). One
  adapter per provider behind the unchanged `generateJson`: Gemini 3.8 Flash (`generateContent`,
  JSON schema via `responseJsonSchema`, `thinkingLevel`, inline PDFs and images, media resolution),
  Claude Haiku 5.5 (Messages API, structured outputs, prompt caching on system and source, adaptive
  thinking, PDF and image blocks), DeepSeek Flash (V4.1, JSON mode, explicit thinking on or off,
  cache-hit tokens) and Z.ai GLM-5.3-Flash and the free GLM-4.7-Flash. Gemini, Claude and DeepSeek
  go through AI Gateway's provider endpoints; Z.ai is called directly (no built-in gateway
  provider). Capabilities and prices per model in `routes.json`; thinking level, PDF and media
  resolution per task. The ledger records cached, cache-written and reasoning tokens and prices
  each; the ceiling is checked against each call's worst case before it is sent. Retries on 429
  and 5xx with backoff and Retry-After; auth errors, spend caps and empty balances fall through to
  the next model. Draft sends its source as cacheable context (redrafts cost about a tenth);
  read attaches the source PDF for models that read PDFs; scanned PDFs (up to 60 pages) are now
  transcribed instead of refused; the Rhyme bridge has its own `bridge` task. New chains put paid
  models first (the editor's choice), Workers AI last in every chain: about $0.03 per item.
  The Desk's settings page shows thinking, direct calls, and cached and thinking tokens per call.

### Models: what was verified (2026-10-16)

- `npm run verify`: every workspace typechecks; 255 tests. New in `providers.test.ts` (37):
  request shape per provider (schema trimming for Claude, `responseJsonSchema` for
  Gemini, thinking on and off per provider, no temperature where refused, PDFs and images, cache
  marks only above the minimum), usage parsing with cached, cache-write and reasoning tokens,
  long-prompt and cache pricing, retries with Retry-After, no retry on auth errors, spend caps or
  empty balances, timeouts, DeepSeek's blank-line padding, key scrubbing, the gateway URL and
  metadata header with the key only in a header, Z.ai direct, fallback down the chain on 529 and
  on a truncated answer with every call in the ledger at the right cost, the repair turn, PDF
  capability gates, the pre-call ceiling check, and scanned-PDF transcription in page batches.
- Local end to end (`wrangler dev`, both Workers, real Workers AI, no provider keys): a pasted
  Jevons passage ran read, plate, embed, draft and judge to `ready` through the new router; the
  ledger rows carry the new token columns. The first run found a regression (draft's `low`
  thinking let Kimi and DeepSeek on Workers AI reason through all 8,000 tokens); Workers AI now
  always runs with thinking off, and the rerun cost $0.007. Preview D1 migrated to 0003; preview
  Workers deployed (pipeline `3b6544dc`, Desk `ae563573`).
- Keys for all four providers set on both Workers in preview and production. Real smoke test, direct and through the preview gateway, every answer valid, about $0.006:
  results in `docs/MODELS.md` (Smoke test). It found Gemini refusing the `response_format` object
  on `generateContent`; the adapter now sends `responseMimeType` + `responseJsonSchema` only.
  It also found the AI Gateway answering repeat requests from its response cache (a Redraft would
  get the old draft back, charged as new); generation calls now skip that cache.
  Plate and clean now use the paid GLM-5.3-Flash (editor's choice): the free GLM-4.7-Flash was
  overloaded on two of five smoke calls.

### Desk: what was verified (2026-10-16)

- Local (`wrangler dev`, both Workers): captured a real article (Hamming transcript, 14,447 words),
  the arXiv Transformer paper (15-page PDF, page locators), an uploaded PDF (Bahdanau et al.), a
  rendered book-page photo (OCR read the text and "p. 12"), a YouTube talk (captions, timestamp
  locators), a Substack essay and an X post. All reached `ready` with drafts, verbatim excerpt
  candidates, cited notes judged against their evidence, Wikipedia cards and link checks.
- In a headless browser: typed the editor's note (autosaved), selected a sentence in the reader to
  make the excerpt, marked the highlight inside it, kept and cut notes and cards, ran checks to all
  green, composed Haul 001 (two items), got machine questions and a drafted route, previewed and
  published. `hauls/001/v1/haul.json` and `hauls/index.json` validated with `scripts/verify-bundle.ts`;
  a correction published v2 with its `corrections` entry; v1 was left untouched.
- A voice note (synthesised speech with fillers) was transcribed by Whisper and cleaned by the model;
  the deletion-only diff accepted it after it removed exactly "Okay, so, um, like, you know".
- Deployed preview: an item queued through the Cloudflare Queues API ran the deployed Workflow end
  to end (fetch, R2 snapshot, read, wiki, draft, judge, check) on Workers AI for $0.014. Unsigned
  requests to the deployed Desk (UI, assets, API, files, share target, spoofed email header, forged
  and `alg: none` tokens) all get 403; `/v1/health` is 200 and `POST /v1/devices` validates input.
- `npm test`: 104 tests (shared rules and bundle validator, SSRF guard, Access/CSRF/bypass attempts,
  pipeline pure functions, FCM JWT signing).

### Production (live, 2026-10-16)

| | |
|---|---|
| Website | `fdf-web` on fromthedumpsterfire.com and www (waiting page until Haul 001). The old static Issue 017 Worker `from-the-dumpster-fire` was deleted at the editor's request; its source is in `~/Ideas/Dumpster main site`. |
| Desk | `fdf-desk` on desk.fromthedumpsterfire.com behind Access app "FDF Desk" (owner email only) |
| Public API | api.fromthedumpsterfire.com: only `POST /v1/devices` and `GET /v1/health` answer; device registration checked end to end |
| Pipeline | `fdf-pipeline`, Workflow `fdf-item`, queues `fdf-ingest` / `fdf-ingest-dlq` |
| Data | D1 `fdf-desk` (migrations 0001–0003), R2 `fdf-media` (private), R2 `fdf-files` (public on files.fromthedumpsterfire.com: only `hauls/` and `seed/`), Vectorize `fdf-chunks` |
| Models | AI Gateways `fdf` and `fdf-preview`; spend ceiling 10 USD a month, warning at 8 (a default; change `SPEND_*` vars). Native provider adapters (Gemini, Claude, DeepSeek, Z.ai) with keys set on both Workers; in production since 2026-10-16 (pipeline `dd2c25cc`, Desk `c810af29`) |
| Preview | Desk `fdf-desk-preview` behind Access app "FDF Desk (preview)". The site's preview Worker `fdf-web-preview` was deleted on 2026-10-16 at the editor's request; `npm run deploy:web:preview` recreates it |

Access team domain: `nameless-cell-b28f.cloudflareaccess.com`. Deploy: `npm run deploy:production`
(Desk + pipeline), `npm run deploy:web`; migrations: `npm run db:migrate:production`.

### What the editor must do

1. **Push:** `FCM_SERVICE_ACCOUNT` (Firebase service-account JSON) as a secret on the pipeline, and
   `apps/mobile/google-services.json` for the app. iOS push needs FCM tokens on iOS or an APNs sender.
2. **editor@fromthedumpsterfire.com:** the domain's mail is Proton Mail, so create the address in
   Proton. Cloudflare Email Routing would replace the Proton MX records.
3. Optional: `SMITHSONIAN_API_KEY`, `RIJKSMUSEUM_API_KEY`, `BROWSER_FALLBACK=on`, an `IMAGES` binding.
4. Optional: an R2 lifecycle rule on `fdf-media` to abort incomplete multipart uploads.

- 2026-10-16: **the Desk, milestone 6** (`migrations/0002_plates_connections_rhymes.sql`;
  `packages/server/src/{plates,connect,rhymes}.ts`, `extract/{browser,stream}.ts`; Desk screens
  Plates, Links, Rhyme). Public-domain plates for items and Haul covers; machine-suggested
  connections with a verified quote from both ends; Threads from kept links; Rhymes authoring;
  Browser Rendering fallback for JS-only pages (opt-in); long audio in overlapping chunks with
  timestamps; voice-note formats; two R2 buckets (MEDIA private, FILES public, only publish writes
  it); Workers AI prices checked. Preview migrated and deployed.

### Desk milestone 6: what was verified (2026-10-16)

- Local end to end (`wrangler dev`, both Workers, real Workers AI, Vectorize `fdf-chunks-preview`,
  Browser Rendering): captured Wikipedia's The Coal Question, Jevons paradox and Rebound effect.
  - **Plates:** the `plate` step proposed searches such as "William Stanley Jevons portrait", "The
    Coal Question 1865 book", "James Watt steam engine engraving" and stored 4 to 7 fetch-checked
    public-domain candidates per item (Commons and The Met; AIC's IIIF host answered 403 to a bot
    challenge, so its candidates failed the check, as designed). Choosing the 1858 Jevons portrait
    copied 1,525,368 bytes (1276 x 1536, measured from the JPEG) into MEDIA `plates/`; the editor's
    caption replaced the metadata one. The Haul cover reused the items' candidates (Watt's double
    engine, 1280 x 1614).
  - **Connections:** after embedding, each item found the others by vectors (cosine 0.85), shared
    Wikipedia cards and mechanisms. The judge proposed three "Cites"/"Extends" edges at 0.95, each
    with a quote from both ends found word for word (Jevons's "It is wholly a confusion of ideas…"
    in The Coal Question; the paradox article's own rendering of it). Approving without a note was
    refused; two were kept with notes in the editor's words, one rejected.
  - **Thread:** "Suggest threads" found one cluster and drafted it; the first title (eight words) was
    redrafted; years came out 1865, 1865, 2007 (the model's 1865 for the paradox article is in that
    article's text; the article date 2004 was not used); the editor renamed it "The price / of
    efficiency", set 1980 for the rebound article and approved.
  - **Rhyme:** then = The Coal Question (selected in the reader), now = the Rebound effect article
    (pasted, found verbatim); a paraphrase was refused; the machine's bridge passed the style check;
    checks: quotes 3 of 3, links pass.
  - **Publish:** Haul 001 (three items and the Rhyme) published; `npx tsx scripts/verify-bundle.ts
    http://localhost:8787/files hauls/001/v1/haul.json https://fdf-desk-preview.r-bhuvanesh2007.workers.dev/files`
    printed `plates: 2 + cover, rhymes: 1, threads: 1, connections: 2`, fetched all three plate files
    (200) and ended `VALID`. The thread's provenance reads "The machine proposed 3 links among these
    pieces. The editor kept 2, each with a passage quoted from both ends."
  - **JS-only page:** https://hn.algolia.com/?q=jevons%20paradox gave 0 characters to Readability;
    the browser pass rendered it (37 KB of HTML, 4,393 characters of text, 0 requests blocked) and
    the item went through as extractor `browser`.
  - **Voice notes:** three 2-second files all uploaded as `audio/mp4` were stored as m4a (AAC),
    webm and mp4 (Opus in MP4) from their bytes.
- The run found and fixed: duplicate suggestions when two items judged the same pair at once (pairs
  are now claimed first), Wikipedia footnote markers breaking verbatim quotes (now dropped at
  extraction), an embedding batch of 50 that hung (batches of 20, and a 150 s timeout on every
  Workers AI call), notes that said "piece A", irrelevant Met results, Commons catalogue ids in titles.
- Deployed preview: migration 0002 applied to `fdf-desk-preview`; both Workers deployed with
  VECTORS, BROWSER, MEDIA and FILES. A redraft of the probe item queued through the Queues API ran
  `read`, `plate` (4 candidates) and `embed` (21 vectors into `fdf-chunks-preview`) on the deployed
  pipeline, then draft, judge and check, and reached `ready` ($0.014). The Desk answers 302 to
  Cloudflare Access for every path, including `/v1/health`.
- `npm run verify`: all workspaces typecheck; 214 tests. New: publish end to end on SQLite with the
  real migrations (bucket separation, plates, cover, audio formats, Rhyme, kept connection, Thread,
  `filesBase` refusing hotlinks, reserved item ids), plates (licence gate, image measurement,
  fetch-check, caps), connections (chunking, verbatim at both ends, retry, no double payment under
  concurrency, clustering), a synthetic 2 h 50 min MP3 through mocked Whisper (every second once,
  timestamps), the three-hour cap and spend estimate, DASH segment chunking, format sniffing, and the
  byte caps and Browser Rendering request checks from the security review.
- Spend: about $0.21 of Workers AI locally (ledger) plus a few seconds of Browser Rendering; the
  deployed probe $0.014.

### Desk: known gaps

- Long plain m4a, webm or ogg files over 20 MB (not MP3, not YouTube's DASH MP4) still cannot be
  split; the item fails with a message asking for an MP3 or a transcript. MP3 times are estimated
  from the bitrate (exact for CBR and Xing-tagged VBR).
- The reader app hides webm and ogg voice notes on iOS. mp4 notes with Opus inside are recorded as
  `mp4`; check one on an iPhone before relying on it.
- The Met's web-large renditions are about 600 px wide; Commons and AIC renditions are larger. With
  an `IMAGES` binding the Desk could take originals and resize them.
- Wikipedia extractions still include the reference list, which adds noise to embeddings.
- Thread years for reference articles need the editor's eye (the model's year is kept only if it
  appears in the item's text). The thread slug is fixed when drafted, even if the editor renames it.
- Plate captions copied as cover candidates before the Commons clean-up keep their catalogue ids
  until the editor edits them.
- The preview D1 holds one probe item ("How to Work Hard") from the deployed pipeline test.

- 2026-10-16: **the website** (`apps/web`): every published Haul, served by the `fdf-web` Worker.
  Pages for the latest Haul, each Haul (cover, field note with the route, contents, colophon,
  corrections), items (standard, Rhymes, poem; excerpt with highlight, cited marginalia in the machine
  voice, Wikipedia cards, connections, next item), threads, archive, about, search, 404, RSS, sitemap
  and OG tags. Light and dark (system, plus a toggle kept in localStorage). Fonts are self-hosted woff2
  subsets of the app's cuts (about 230 KB for all eight; a page loads four or five). Client JS is the
  theme toggle (0.6 KB) and search (3.3 KB).
- 2026-10-16: **the website renders at request time.** Pages are rendered by Astro on the Worker from
  the bundles in R2 (binding `FILES`: `fdf-files` in production, `fdf-public-preview` in preview), so a
  Desk publish or correction shows within a minute with no rebuild or deploy. Rendered pages are kept
  in the edge cache under a key made of the deploy version, the index's `updatedAt` and the path.
  Production is live at https://fromthedumpsterfire.com (waiting page until Haul 001); preview at
  https://fdf-web-preview.r-bhuvanesh2007.workers.dev (since deleted).
- 2026-10-16: **the Salvage design on the web** (`docs/DESIGN.md`). Struck masthead in every header,
  the big one on the waiting page; ghost number and the contents as specimens of each form on the Haul
  cover; every
  item set in its printed form (`src/lib/forms.ts`: opening, offprint, transcript, broadside, facing
  pages, catalogue card, page from the book) with a working margin, running head, thumb tab, See also
  index and ember folio. Archive, threads, thread, about, search, 404 and 503 redone to match. Chips,
  pills, rounded cards, the boxed marginalia and the SVG arrows are gone (`Chip.astro`, `Arrow.astro`
  deleted). Verified locally with `wrangler dev` on the sample Haul and with an empty bucket (waiting
  page): 360, 390 and 1280 px, light and dark, no horizontal scroll; `npm run verify` passes.
- 2026-10-16: **landing and transcript pass.** The home cover carries the nameplate (struck masthead
  with a strap line); the route cites items by number in ember; the field note ends on the ember B.;
  specimens use the full width and the card shows its plate; the transcript puts the dateline under the
  speaker, gives the speaker's words the width, and sets all machine notes as one MACHINE turn; the
  archive has a search line. Fixed a phone overflow on the rabbit-hole page (the plate widened its
  grid). Checked at 390, 1280 and 1600 px, light and dark.
- 2026-10-16: **See also and About.** See also entries are catalogue guide cards (a ruled edge with a
  staggered tab in the colour of what each points to) instead of grey slips. About is rebuilt from the
  magazine's forms: a big title, the two voices as a transcript, five house rules each with the check
  behind it, and a key to the forms (`formGuide` in `apps/web/src/lib/forms.ts`). Deployed to production
  (version 9e99b1dd) after merging main; the preview Worker was then deleted. The reader app does not have this pass or the landing pass yet.
- 2026-10-16: **SEO, GEO, and LLM search visibility pass.** Complete Generative Engine Optimization (GEO)
  and traditional search optimization for the public site:
  - **LLM endpoints & Markdown mirrors**: `/llms.txt` (curated index following the llms.txt standard),
    `/llms-full.txt` (full Markdown corpus of every published issue with Editor vs Machine attribution),
    and per-page Markdown mirrors (`/haul/<n>.md`, `/haul/<n>/<item>.md`, `/haul/<n>/thread/<id>.md`)
    with `<link rel="alternate" type="text/markdown">` and `Accept: text/markdown` content negotiation.
  - **Schema.org Microdata**: Zero `set:html` and strict `script-src 'self'` CSP preserved by using
    HTML5 Microdata (`Periodical`, `PublicationIssue`, `Article`, `CreativeWork`, `ItemList`,
    `BreadcrumbList`) and Wikipedia knowledge-graph grounding (`itemprop="mentions"` with `<link itemprop="sameAs">`).
  - **OpenGraph & Twitter Card completeness**: public-domain cover plates resolved for social sharing,
    `article:published_time`, `article:modified_time` from corrections, `article:author`, `article:section`,
    `article:tag`, and `max-image-preview:large` / `max-snippet:-1` robots directives.
  - **Enhanced feeds & crawlability**: rich RSS 2.0 with full `content:encoded`, `dc:creator`, and topic
    `<category>` tags; sitemap with accurate `lastmod` on all sections and LLM endpoints; `robots.txt`
    welcoming AI and search crawlers (`Googlebot`, `Bingbot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`,
    `Claude-SearchBot`, `Applebot`); HTTP `Link` discovery headers; cross-Haul connection linking;
    enriched Wikipedia summaries in `/search` A–Z index.
  - `apps/web` tests expanded from 26 to 43; `npm run verify` passes with 229 tests green across the repo.

### Web: what was verified (2026-10-16)

- `npm run verify`: every workspace typechecks (including `astro check` for apps/web) and 229 tests
  pass; 43 are the web's: safeHref, search index and scoring, the request-time store (validation,
  fallback to the previous version, 503 when no version is good, missing or bad index, a new publish
  seen after the index TTL, validation cached per path and etag), the cache key and policy, RSS
  escaping and full `content:encoded`, tokens CSS, app-link generation, the Worker's redirects,
  `llms.txt` and `llms-full.txt` formatting and attribution, per-page Markdown mirrors, `Accept: text/markdown`
  negotiation, HTTP `Link` discovery headers, cross-Haul link resolution, and sitemap last-modified dates.
- **No-rebuild path, on the deployed preview:** with the preview bucket empty the site showed the
  waiting page; I uploaded the sample Haul to `fdf-public-preview` (`hauls/001/v1/haul.json` and
  `hauls/index.json`) and, without redeploying, the home page showed Haul 1 within 12 seconds, with
  every item, thread, search and feed route answering 200. I then deleted both objects and the
  waiting page came back. The preview bucket is empty again.
- **Bad data, locally (wrangler dev with local R2):** a v2 bundle whose highlight was not in its
  excerpt was logged as failing validation and the page served v1. Earlier, a bundle whose creator was
  `<script>…</script>` rendered with the text escaped everywhere.
- Screenshots of every page at 360, 390 and 1280 px, light and dark, from the deployed preview with the
  sample Haul: no horizontal scroll, no console or CSP errors. The toggle switches and persists across
  pages; search returns ranked rows; computed styles confirm machine text in Schibsted Grotesk in
  machine blue and editor notes in Newsreader italic.
- **Size and CPU:** `wrangler deploy --dry-run` gives 776 KiB, 202 KiB gzipped (free plan limit 3 MB).
  `wrangler tail` on the preview (which renders every request, because the Cache API is off on
  workers.dev) reported 0 to 1 ms CPU per page, feed, sitemap and search index (free plan limit 10 ms).
- **Production** after `npm run deploy:web`: waiting page 200, second request `x-fdf-cache: HIT`;
  CSP, HSTS, nosniff and `cache-control: public, max-age=30` on pages, no noindex on the apex;
  `www.` redirects to the apex with path and query; unknown paths and `/haul/1` return the 404 page
  with status 404; `/haul/1/note` redirects to the field note; POST returns 405; fonts are
  `immutable`.

### Web: what the editor must do

1. **Nothing per publish.** The Desk writes `hauls/NNN/vN/haul.json` and `hauls/index.json` to the
   production bucket `fdf-files`; the site shows them within a minute. For preview, the Desk's preview
   publish must write to `fdf-public-preview` (the site's preview binding).
2. **Deploys** are only for code changes: `npm run deploy:web:preview`, `npm run deploy:web`.
3. **App links:** set `ANDROID_CERT_SHA256` (release signing certificate SHA-256, from
   `eas credentials` or Play Console › App integrity) and, for iOS, `APPLE_APP_ID` (`TEAMID.com.fromthedumpsterfire.app`)
   in the build environment, then deploy. Until then no `/.well-known/assetlinks.json` is published and
   Android will not verify the app's `autoVerify` intent filter. TODO: fingerprint unknown.

### Web: known gaps

- A publish shows within about a minute: up to 20 s for an isolate to re-read the index, then up to
  30 s of browser cache. The edge cache never serves an old Haul, because its key changes with
  `updatedAt`.
- If a bundle fails validation and no earlier version (up to five back) validates, that Haul's pages
  answer 503 and the failure is in the Worker logs. If the index itself is unreadable and the isolate
  has no good copy, every data page answers 503 (the static `/503` page).
- `www.` requests for fonts and hashed CSS/JS are served without the redirect, because those files
  skip the Worker.
- The app's archive deep link is `/hauls`; the site's archive is `/archive` (and `/hauls` redirects
  there). Both open the app on Android because its intent filter matches the `/haul` prefix.
- An item with the id `note` can't be reached (`/haul/<n>/note` is the app's field-note link). The
  Desk's slug generator should avoid `note` and `thread`.
- Voice notes use the browser's own audio player (no custom player, no JS).
- No per-item OG image unless the item has a plate; the default share image is `public/og.png`
  (rendered from `scripts/og.html`).

## Milestones

1. **Reader app**: built; next is on-device polish and a real first Haul. ← in progress
2. **Publish path**: bundle writer with the invariant checks: built; production live.
3. **Pipeline v1**: item Workflow: fetch, transcribe, clean (deletion-only), reading card, draft, checks: built.
4. **Desk v1**: tray, item review, voice capture, Android share target, quote extraction: built,
   production live behind Access.
5. **Web**: built and live; renders from R2 at request time, so publishes need no deploy.
6. **Connections**: Vectorize, entity linking, edge judging, Threads: built on the Desk; plates and
   Rhymes authoring too.
7. **Backfill**: import old site archive and reading history.
8. **Push**: client done; needs google-services.json, the Worker endpoint and FCM credentials.

## Known gaps

- The sample Haul ships inside the app until the first real Haul is published. Build launch binaries
  with `EXPO_PUBLIC_USE_SEED=0`.
- Design: the editor finds the web and app too bare. `docs/DESIGN-BRIEF.md` is being worked on in a
  separate session ("FDF design", branch `fdf-design`).
- Podcast: proposed as one episode per Haul at `/haul/<n>/listen` (player from an external host,
  chapters linked to items, show notes, full transcript collapsed, also in the app). Not built; waiting
  on the editor.
- No drop caps in the app (React Native text can't wrap around a float); the web edition keeps them.

## Open questions for the editor

- Budget ceiling once paid models are on (about $0.03 an item; the ceiling is 10 USD a month). The judge is DeepSeek Flash with thinking, Gemini 3.8 Flash next; Claude Sonnet 5.5 is defined in routes.json if a stronger judge is wanted.
- Backfill: the old Substack (62 posts, `~/AA/Bhuvan-backups/dumpsterfire`) and the 2026 static site are
  candidates; the 2026 site's notes were model-written, so they should not be imported as the editor's.
- Final pick of the app icon (current: ember flame on ink).
- Whether `checkStyle` should allow "leverage"/"leveraged" in finance contexts (your own notes use it
  20 times as a finance term; see `docs/VOICE.md`).
