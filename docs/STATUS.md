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

Go-live check (2026-10-17): production D1 `fdf-desk` has 0001–0003 recorded and nothing pending;
`fdf-desk` (c810af29) and `fdf-pipeline` (dd2c25cc) were deployed from 415e8df, and no Desk, worker,
package or migration file has changed since; HEAD builds and dry-runs for production (pipeline
1,032 KiB gzipped, Desk 610 KiB); `npm run verify` 265 tests. Live: every Desk path 302s to Access;
api. answers only `/v1/health` (200), else 403. The editor's first real capture (The Conversation,
bird migration) ran the paid chain through gateway `fdf` to `ready` for $0.006. Not yet exercised in
production: an authenticated session checked by someone other than the editor, and a publish (0 Hauls).
Without `FCM_SERVICE_ACCOUNT` a publish still succeeds and the notify job logs `configured: false`;
v1 is the only version that queues a push, so Haul 001 will not be announced if FCM is added later.

Access team domain: `nameless-cell-b28f.cloudflareaccess.com`. Deploy: `npm run deploy:production`
(Desk + pipeline), `npm run deploy:web`; migrations: `npm run db:migrate:production`.

### What the editor must do

1. **Push:** done for Android (2026-10-17): Firebase project `from-the-dumpster-fire`,
   `FCM_SERVICE_ACCOUNT` set on production `fdf-pipeline`, `apps/mobile/google-services.json` in place
   (gitignored). Install the 0.3.0 push APK and allow notifications so the phone registers
   (`devices` was empty when set). Not yet on preview. iOS needs FCM tokens on iOS or an APNs sender.
2. **Editor's email:** the app's Settings and Menu now write to bhuvan@bebhuvan.com (the editor's choice,
   2026-10-24), so editor@fromthedumpsterfire.com is no longer needed. (Earlier note: the domain's mail is Proton Mail, so create the address in
   Proton. Cloudflare Email Routing would replace the Proton MX records.)
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

- 2026-10-17: **the Desk, reworked after the editor's first real use.** Measured on the production
  record of the first capture (The Conversation, bird migration): titles were labels or mood lines,
  the two excerpts were one-liners that missed the piece's best scene, the notes were Wikipedia
  trivia, and two notes arrived marked "partly right" with a "use corrected" button. Changed:
  - **Reading and drafting** on Claude Sonnet 5.5; drafting falls back to Gemini 3.8 Flash, then
    DeepSeek, then Haiku. Haiku, Gemini Flash, DeepSeek Flash, Sonnet and Gemini 4 Argon were run on
    the same two items (MODELS.md); Argon matched Sonnet at 1.7 times the cost and is defined but in
    no chain. Five titles from named angles; three excerpt
    candidates of one or two paragraphs within `excerptCap` (about a seventh of the piece, 250 words; raised 2026-11-08 to a fifth and 400 words
    at most), each with a line on why; zero to three notes that must pass a "glad to learn this here"
    test; for long talks, podcasts, videos and papers, three to seven **big ideas**, each attributed
    and tied to a verbatim passage with its time or page (`packages/shared/src/quoting.ts`).
  - **Judge**: proposals it does not confirm (partly, unsupported or no verdict) are set aside
    (`rejected`) and never shown; ideas
    are judged against the stretch around their passage. **Publish**: only ticked lines print;
    unticked ones never block.
  - **Further reading**: the reading card now picks two to four articles a curious reader would open,
    each with a reason (entities fill in only when it picks fewer than two); an exact Wikipedia title
    is looked up before search; cards show the matching sentence of Wikipedia's lead, verbatim.
    Limit: a description the model gives instead of a title ("Arrow stork") can still land on the
    broad article ("White stork"); add the right one by name on the Desk.
  - Model answers with one list item too many are trimmed, not rejected (the read step was paying
    for a repair turn on most items).
  - **Desk item page** as numbered steps (why, excerpt, big ideas, title, notes and further reading,
    plate, what is missing; More holds the rest); phones get the steps first. Types labelled by what
    they are; capture no longer asks for one.
  - **Your own transcript** (paste, or .txt/.md/.vtt/.srt; subtitle times become locators) for talks,
    videos and podcasts, and **upload the PDF yourself** on an item whose link will not give it up.
    YouTube's audio cannot be fetched reliably from Workflow steps (403 on chunk fetches, seen today),
    so long old videos without punctuated captions are best fed a transcript made on the laptop.
  - **Website and app**: multi-paragraph excerpts, the big ideas (machine voice, numbered, quote and
    time), and links that name the person ("Read Amy L. Scarpignato in The Conversation").
  - Migration `0004_excerpt_why.sql` (additive: `excerpts.why`).
- Verified 2026-10-17: `npm run verify`, all workspaces, tests listed by vitest. On preview with the
  real models: the bird article and Karpathy's one-hour LLM talk drafted by Haiku and by Sonnet side
  by side (MODELS.md); Sonnet's five talk ideas all passed the widened judge; further reading led
  with "Pfeilstorch". Locally: the item page at 1440 px and 390 px (light and dark), a full
  why → excerpt → ideas → ready run through the API, a local publish validated by
  `scripts/verify-bundle.ts`, the website rendering ideas and two-paragraph excerpts, a real yt-dlp
  VTT (12,151 words, 70 timed paragraphs, no repeats) and a PDF uploaded to an existing item.
- Preview deployed with all of this (Desk `af247cce`, pipeline `cd49256d`); test items `it_test_*`
  are in the preview D1.
- **Production, 2026-10-17** (the editor approved going live): migration 0004 applied to `fdf-desk`;
  Desk `408edbfc`, pipeline `bf19a13e`, website `1c409c49`. Checked after: every Desk path 302s to
  Access, api. answers only `/v1/health`; the editor's bird-migration item redrafted on the
  production pipeline (Sonnet read and draft, $0.057); the site's waiting page 200 with CSP and HSTS,
  `www.` 301 to the apex. Deployed from an uncommitted working tree on main.
- Known: some sites give only the first of several authors (the bird piece has two); fix "By" under
  More. The public type label still says "Essay" for news reports; the Desk says "Article or essay".

- 2026-10-17 (later): **more ideas for long recordings, the editor's take on each, and Start
  here** (migration `0005_start_here.sql`: `items.start_at`, `items.start_note`). Verified on
  preview with Lex Fridman's 2 h 23 min conversation with Sam Altman (YouTube refused it to
  Cloudflare, "confirm you're not a bot", so its captions were fetched with yt-dlp on the laptop and
  loaded through the transcript parser): 11 ideas, 10 confirmed, in time order from 5:32 to 1:40:59
  (one at 2:10:41 set aside), reading and drafting about $0.23. Locally: the Desk's take box and
  Start here step, the API refusing a malformed start time, a publish and a correction carrying the
  take and a Start here linking to `&t=3617s`, and the site rendering both at 390 px. Preview Desk
  `1fdf6f42`, pipeline `506c7867`. **Not yet in production.** The reader app shows both after its
  next build.

- 2026-10-17 (later): **the Desk on a phone.** Sections in a bottom bar (above the home indicator);
  on an item, a sticky switch between "The work" and "The piece", which reads as a full page and
  takes selections for excerpts (the Make excerpt bar sits above the bottom bar); capture starts as
  one paste box with voice note and PDF in reach; 44 px buttons, 22 px checkboxes, 16 px inputs (no
  iOS zoom); keyboard hints hidden on touch screens; Settings no longer scrolls sideways (its
  key-value grid wraps). Checked at 390 px, light and dark, on every Desk screen: no horizontal
  overflow, the switch sticks under the header, a simulated selection raises Make excerpt above
  the bar. Preview Desk `b4864cd7`, pipeline `9eba0a2d`.
- **Production, 2026-10-17 (second deploy, approved by the editor):** migration 0005 applied; Desk
  `85f2803c`, pipeline `3ded599a` (with the fix below), website `3b027264`. Checked: Desk 302 to
  Access, api. only `/v1/health`, site 200 with CSP and HSTS. The editor's item redrafted on the
  production pipeline; that run found stale cards from the first reading still filling the
  further-reading slots, so a new reading now replaces unticked cards (kept ones, and cards a kept
  note cites, stay). After the fix the item's cards are Pfeilstorch, eBird, Bird ringing, Red knot.
- **Reader app 0.3.0 launch APK** (2026-10-17): `EXPO_PUBLIC_USE_SEED=0`, arm64, targetSdk 36,
  signed with the laptop's debug key (sideloading only; the Play Store needs an upload key and an
  .aab). Checked in the file: the seed switch is inlined (the variable name is absent from the Hermes
  bundle; the sample JSON is still packed but unreachable), and it reads files.fromthedumpsterfire.com.
  Not run on a device here (the emulator is x86_64). Rebuilt with google-services.json (sender
  573328278264) as from-the-dumpster-fire-0.3.0-push.apk; FCM_SERVICE_ACCOUNT is set on production.
- **Settings and push before the first Haul; over-the-air updates** (2026-10-17): Settings was
  linked only from a Haul cover's footer, so with no Haul it was unreachable and push could not be
  turned on. Now a word in the top row of the cover and the waiting page, which also offers "Tell me
  when it lands". On the emulator: the button got an FCM token, the production `devices` row
  appeared, and the Settings switch set it to disabled. OTA (`expo-updates`, self-hosted, signed;
  ARCHITECTURE "Over-the-air app updates"): fdf-desk production 09818722 serves `/v1/updates`; on
  the emulator a published update downloaded on one launch and ran on the next, a manifest with a
  stale signature was refused, and `--rollback` restored the embedded JS. Production now holds that
  roll-back directive (safe: phones on their embedded JS get "no update"). APK
  from-the-dumpster-fire-0.3.0-ota.apk (arm64, runtime 942dd8e9…; the emulator test ran on fd374857…,
  before a `.gitignore` edit moved the fingerprint) replaces the push APK;
  older APKs have no updater, so each reader needs this one install. Signing key:
  `~/.config/fdf/app-updates/private-key.pem` (back it up). Publish: `npm run app:update`.
- **Failed fetches and Delete** (2026-10-18): a Substack link failed with 429 and the editor had no
  way to discard it. Item page: a red Delete (confirm; refused for a published Haul's item) beside
  Archive, removing rows, MEDIA files (upload, snapshot, voice notes) and, via a `purge` queue
  message to the pipeline, the item's vectors; rhymes that cited it lose the link. A failed item
  opens with a "The fetch failed" panel: plain reason, Try again, paste the text (stored as `pasted`),
  upload a PDF. 429 and 503 are now retried by the fetch step (15 s, 30 s, 60 s) instead of failing
  at once. Checked on a local Desk at phone width and a local delete (rows gone, 1 file, 13 vectors).
- **Sources that refuse Cloudflare** (2026-10-18): articles now go through platform routes before
  the page and the Wayback Machine after a refusal (ARCHITECTURE "Article fetch order"):
  Substack's post API and feed (custom domains and app links too), WordPress REST (from the page's
  `api.w.org` link, by slug after a refusal, wordpress.com through its public API), Medium's RSS,
  then the latest raw Wayback copy or a Save Page Now capture. Paid and members-only posts fail with
  a plain message and are never stored as previews. The source line on the Desk says where the text
  came from (`meta.via`), with a link to an archived copy. Substack pages, fetched or archived, are
  read from the post body (Readability kept "Share" and "No posts"). Delete now also removes the
  stored text file and the item's run history. Tests: 316 (22 new, fixtures in
  `packages/server/test/fixtures/fetch`, no network).
- **Verified on production, 2026-10-18** (pipeline `baa4cc06`, the same code as now), test items
  `it_fetchtest_*`, all cleaned up afterwards (rows, MEDIA files, vectors, runs):

  | Link | Route | Words | Result |
  |---|---|---|---|
  | sugataraju.substack.com, "The new ordinariness of Rahul Gandhi" | Substack API (an earlier run took the page; on preview, the Wayback copy) | 1,944 | ready |
  | sugataraju.substack.com, "Each player in its own separate groove" | Substack feed (API refused) | 725 | ready |
  | slowboring.com (Substack, custom domain), "Destroying the West…" | Substack API | 2,352 | ready |
  | slowboring.com, "The voice of a generation" (paid) | Substack API | 61 of 1,456 | failed: "for paid subscribers" |
  | themarginalian.org (self-hosted WordPress) | WordPress REST via `api.w.org` | 364 | ready |
  | terrytao.wordpress.com | wordpress.com public API | 257 | ready |
  | karpathy.medium.com, "Software 2.0" | Medium feed | 2,131 | ready |
  | medium.com/@ev, "Welcome to Medium" (not in the feed) | bot check, then Wayback copy of 12 Nov 2020 | 549 | ready |

  Substack's refusals come and go: the same link took three routes on three runs. Save Page Now
  ran from the laptop (anonymous POST, job, status, snapshot) and in tests, but no production run
  needed it, so it has not yet run from Cloudflare. Models for the test runs: $0.34 production,
  $0.12 preview. Production now: pipeline `109322d9`, Desk `e8f418a2`; preview: pipeline
  `fc9cee5c`, Desk `cbd9aca2`. Desk 302 to Access, api. only `/v1/health`. The editor's two items
  that failed with 429 before this (`it_01m56b…`) are untouched: Try again on the Desk now uses
  the new routes.
- **Pages read by Defuddle** (2026-10-18): `extract/html.ts` now reads a page with Defuddle on
  linkedom, falling back to Readability when Defuddle finds under 60 per cent of its text, after
  removing dialogs, pop-ups, script-only (`[hidden]`, `v-cloak`), print-hidden and "also read"
  boxes; exact furniture lines ("Share", "Subscribe", "No posts") are dropped and footnote
  back-links skipped. Pages that leave out `<body>` (valid HTML) used to come back empty; they now
  read. `sources.extractor` is `defuddle`, `readability` or `page`. Chosen on a side-by-side of 19
  real pages (DECISIONS 2026-10-18). Tests: 322 (6 new in `extract-html.test.ts`, made-up text in
  the shapes of the real pages). Pipeline production `9da99db4`, preview `b3372552`. Checked on
  production with `it_fetchtest_d*` items, cleaned up afterwards (rows, files, 157 vectors, runs),
  $0.38 of model calls:

  | Link | Read by | Words | Author | Result |
  |---|---|---|---|---|
  | sugataraju.substack.com, "The new ordinariness of Rahul Gandhi" | Substack page body (the page answered this time) | 1,944 | Sugata Srinivasaraju | ready |
  | danluu.com, "Willingness to look stupid" (no `<body>` tag) | Defuddle | 5,759 (was 0) | Dan Luu | ready |
  | The Hindu, "Metrics to minds" | Defuddle | 1,327 | Shelley Walia | ready; no login pop-up or "also read" links |
  | The Guardian, Elif Shafak interview | Defuddle | 2,239 | Lisa Allardice (was a profile URL) | ready |
  | paulgraham.com, "How to Do Great Work" | Defuddle | 11,822 | Paul Graham | ready; footnote markers no longer split paragraphs |

  The Hindu's date shows as 16 October: the page says 00:16 IST on the 17th, and `yearOrDate`
  reads it in UTC.

- 2026-10-24: **the Desk publishes the new bundle: blocks, seven new types, editions, the share card.**
  - **Blocks** (migration `0006_blocks.sql`, additive; `packages/server/src/blocks.ts`, routes in
    `workers/api/src/blocks.ts`). On the item page, "Add to this item": pull quotes (select a line in
    the reader and choose Pull quote, or paste), code (paste, language from `CODE_LANGS`, live
    `highlightCode` preview), video (YouTube watch, youtu.be, Shorts, embed, live, with t= or start=;
    Vimeo, channel, group and player links; unlisted Vimeo refused), podcast or audio (Spotify
    episode or show, Apple Podcasts show or episode, or an https audio file that answers a guarded
    HEAD or ranged GET with an audio type) and pictures (upload or link, images only, 15 MB cap,
    credit and licence required). Rows move up, down, or go. Quotes and code are excerpts: a quote
    prints the source's own characters; code matches with whitespace runs collapsed and the
    editor's paste prints. **An item with no stored source text takes no quotes or code** (the
    refusal says to paste the text first): there would be nothing to check them against. Titles come
    from oEmbed (YouTube, Vimeo, Spotify) or the editor (Apple, audio files); YouTube's hqdefault and
    Vimeo's thumbnail are kept in MEDIA as posters. Pull quotes and code join the Quotes check; video
    and audio links join the Links check.
  - **Types.** Quotation, letter, speech, post (social), picture, book, tool in the type select with
    their printed forms. Capture types x.com/twitter.com status links, Bluesky posts, Substack Notes,
    Threads and Mastodon-style `/@user/<id>` posts as `social` (an X post used to be `post`, which now
    means a blog post), Spotify episode links as podcasts. Posts and letters and speeches get their
    handle, recipient and place; every item a year. A **Picture** item's picture becomes its chosen
    plate (`plates.provider = 'editor'`, the editor's credit and licence) and an uploaded Picture is
    not transcribed (the pipeline skips reading and drafting; checks still run). Short quotations and
    posts print whole (the captured text becomes the excerpt). Quotations, posts, pictures and tools
    get no big ideas; a speech reads as long form.
  - **Publish** writes blocks in order (code with tokens), copies posters and pictures to
    `hauls/NNN/media/`, writes year, handle, recipient, place, and the edition (always written:
    the editor's, else `editionOf(number)`) into the bundle and the index entry. A Picture without
    its picture, or a quote or code block that no longer matches its source, stops the publish.
  - **The Haul composer** has an edition ink picker (eight inks, default by number) and the two new
    cover swatches. **The share card** (Haul.card, 1200 x 630 PNG) is drawn by the Desk in the
    editor's browser with canvas (`apps/desk/src/lib/card.ts`), shown in the preview and sent with the
    publish; `publish.ts` keeps it only if it is a PNG of that size under 2 MB and writes
    `hauls/NNN/vN/card.png`. If the canvas or fonts fail, the Haul publishes without one.
  - highlight.js's types pull in the DOM library, which breaks the Workers' fetch types, so the
    Worker projects type-check against a stub (`packages/server/types/highlight.d.ts`, tsconfig
    `paths`). The reader app maps the seven new types to its nearest existing forms until its own
    forms land.
  - **Verified.** `npm run verify`: type checks clean, 356 tests (new: `packages/server/test/blocks.test.ts`
    for every link shape, verbatim refusals, oEmbed, posters, audio checks and pictures with the
    network stubbed; `workers/api/test/blocks.test.ts` for the routes, the multipart picture upload,
    the new fields, the edition and a publish with a card; the publish end-to-end test on SQLite
    with the real migrations now covers blocks, tokens, FILES copies, a Picture's plate, the edition
    and the card). Locally (`wrangler dev` of the Desk Worker alone, local D1 and R2, no pipeline and
    no model calls): a pasted item took a pull quote, code, a YouTube video and a Vimeo video (real
    oEmbed titles and posters), a Spotify show, and an uploaded picture; a misquote, foreign code, an
    HTML page as audio and a removed Vimeo video were refused with their messages. The Haul was
    published from the composer in headless Chrome (the card drawn in the browser and sent);
    `scripts/verify-bundle.ts` said VALID, and the card, both posters and the picture were served
    from FILES with their image types. Screens checked at 390 px and 1280 px.
  - **Not done.** The Desk shows no per-block edit form yet (the API takes edits: locator, caption,
    language, code, title, start, credit and licence; the editor removes and re-adds meanwhile).
    Bluesky, Threads and Substack Notes are fetched as pages (no platform API yet); when a page gives
    nothing, paste the post's text. The publish preview's phone frame is wider than a 390 px screen
    (it was before this change).
- **Reader app for launch** (2026-10-24): the app now matches the website's new design, and has a
  real menu. The bar is the website's navigation in its order (Latest, Threads, Archive, Search,
  Menu; small sans words, an ember rule under the current one). Menu is a contents page: the struck
  masthead large with its strap, then Reading (the latest Haul with its number in edition ink, every
  Haul, threads, search, saved) and The house (how it's made, settings, a note to the editor).
  Saved is now a pushed page from the menu; Archive is a tab (deep link `/hauls` unchanged).
  Settings is set as a page (groups under sans labels and ink rules, serif descriptions, appearance
  as three little pages, text size as "Aa" at each size, square switches drawn with views). About
  carries the house rules with their checks, the two voices as a transcript and a key to every
  form. Editions: a 4pt band in the Haul's edition ink on every page of a Haul, the cover's number
  and the running head in that ink, the cover's ghost numeral gone. The fingerprint is drawn from
  `@fdf/shared/fingerprint` with views (`ui/Fingerprint.tsx`, geometry in `lib/fpGeometry.ts`), full
  on the cover, mini in the running head and the archive. The masthead's strike and caret are the
  website's marks as 1 KB white PNGs tinted ember (`assets/marks/`). New forms on the item page and
  as specimens: epigraph, letter, clipping, mounted print, jacket, specimen label; speech as a
  transcript. Blocks (`ui/Blocks.tsx`): pull quote, code (system monospace, roles from
  `palette.code`, numbered gutter, sideways scroll), video poster opening YouTube or Vimeo, audio
  files in the editor's player, Spotify and Apple episodes as a row that opens their app, pictures.
  Development builds carry the sample Hauls 002 and 003.

  What was verified: release APK on the emulator (1080x2280 at 440dpi, 393x829pt), every screen in
  light and dark: cover of Hauls 001 to 003, every new form and block kind, menu, settings, about,
  archive, threads, thread, search with results, saved, field note. Screenshots before and after
  are in the session scratchpad (`app-shots/before`, `app-shots/after`). `fpGeometry` is tested
  at 312, 363 and 400pt for every sample Haul (no number, square or stem crosses another mark's,
  year labels never meet); the first run found a lifted square crossing a number below it and
  stems too close on a 360pt phone, both fixed. `expo export` with `EXPO_PUBLIC_USE_SEED=0` has
  none of the sample text (24 KB smaller than with it); it also showed Metro's cache ignores the
  flag, so `app:update` now exports with `--clear`. The runtime fingerprint is unchanged
  (`942dd8e9…` before and after, same machine), so this ships over the air; no new dependency.
  `npm run verify` on the merged branch: every workspace typechecks, 393 tests pass (the Desk's
  type maps for the new types came with the Desk work).

  Known gaps: plates in the dev samples point at Wikimedia, which refuses the app, so the mounted
  print shows its "could not load" note in development (real Hauls copy plates to our files host).
  Code uses the system monospace, not DM Mono, to avoid a native font change.
- **The shelf's publishing flow on the Desk** (2026-10-24): the books the editor is reading, with
  his dated notes, published apart from the Hauls as `shelf/shelf.json` (the `Shelf` contract in
  `packages/shared/src/shelf.ts`, unchanged in meaning). Migration `0007_shelf.sql` (additive:
  `books`, `book_notes`, `book_lines`, `shelf_versions`, `items.shelf_id`). Server rules in
  `packages/server/src/shelf.ts`, Publish the shelf in `publish.ts` (ARCHITECTURE "The shelf"), zod
  routes in `workers/api/src/shelf.ts`, and a Shelf section on the Desk (nav and phone bar): the
  list by Reading now, Read, Put down; a book page with a status switch and dates, notes newest
  first with Add note (typed or dictated; both versions shown, the recording publishable), lines
  with the long-line flag and ordering, the cover with its credit, details and spine, and the Haul
  items pointing to it; Publish the shelf with what changed since the last publish and the check
  result. A Book item's page has On the shelf (link, unlink, or put the item on the shelf). A Haul
  publish writes `Item.shelf` and warns until the shelf has the book. FILES now holds `hauls/` and
  `shelf/`. Also fixed: editing a picture block was always refused (`patchBlock` checked the credit
  rule without the stored maker). `validateShelf` now also refuses a note's recording off the files
  base (optional `filesBase`, like covers).
  - **Verified.** `npm run verify`: type checks clean, 413 tests (new: `packages/server/test/shelf.test.ts`
    for slugs, status dates, real dates, the cover credit rule, the long-line flag, the change
    summary and a dictated note through `processNote` with a rewording cleanup refused by the token
    diff; a shelf section in the SQLite publish test with the real migrations: a Haul publish
    writing `Item.shelf`, a valid shelf.json with the cover and a recording copied under `shelf/`,
    the order, notes newest first, Haul links from the published bundle, refusals with the book's
    title and no writes; `workers/api/test/shelf.test.ts` for every route's validation, the voice
    path through `/api/notes`, the multipart cover, the item picker and a publish). Locally
    (`wrangler dev` of the Desk Worker alone with local D1 and R2, AI binding removed, so no model
    calls): migration 0007 applied, four books, notes, lines (a 64-word line flagged and kept), an
    uploaded cover, a Book item captured and linked, the shelf published (v1, no problems), then a
    change summarised as "Gravity's Rainbow: put down → reading now; 1 new note."; the served
    shelf.json passed `validateShelf` against the preview files base and its cover came back from
    FILES as image/jpeg. Headless Chrome at 390 px and 1280 px, light and dark, on the shelf, a book
    page and a Book item's page (linked and unlinked): no horizontal overflow.
  - **Not done / for the editor.** Dictation was not tried live (it needs Workers AI); the tests
    cover it with a mocked Whisper. Not deployed and migration 0007 not applied to preview or
    production. The website and the app read `shelf/shelf.json` from their own branches. Covers and
    recordings left behind by a replaced cover stay in FILES (immutable names; harmless).

- **Launch day, the website and the brand** (2026-10-24, branch `launch-2026-10-24`, not yet deployed):
  - *Editions and the fingerprint*: each Haul's edition ink (a band on the top edge, its number, its
    marks) and its fingerprint (objects on one line by year, square-root scale of years ago, lanes so
    labels never touch; `@fdf/shared/fingerprint`) on the cover, in every item's running head and in
    the archive. The cover's pastel ghost numeral is gone.
  - *Masthead* as a proof correction (hand-drawn ember strike, proofreader's caret; masks in
    `apps/web/public/marks`). *Brand mark*: the internet on fire (a flame with the globe cut out),
    the editor's pick; app icon, Android adaptive and monochrome icons, splash, notification icon,
    favicon, apple-touch-icon and the header marks, from `docs/brand/mark.py`.
  - *New forms*: epigraph (quotation), the letter, clipping (social post), mounted print (picture),
    jacket (book), specimen label (tool); speech as a transcript; specimens of each on the cover.
  - *Rich media*: pull quotes, code (DM Mono, tokens highlighted at publish), YouTube/Vimeo/Spotify/
    Apple players (frame-src names only those), audio files, pictures. *Credit*: every picture prints
    who made it, who holds it, the licence and a link back; the Desk refuses a picture without the
    maker (and, for an upload, where it was found). About's first house rule says so.
  - *The shelf* (`/shelf`, `/shelf/<id>`, `@fdf/shared/shelf`, published as `shelf/shelf.json`):
    spines on a shelf rule (titles never cut), the editor's dated notes as a journal, lines copied
    out, the Hauls a book appeared in. The edge cache keys shelf pages on the shelf's `updatedAt`.
  - Default share image redrawn with the corrected masthead; Hauls get a share card drawn by the Desk.
  - Development samples: Hauls 002 and 003 and a shelf in `packages/shared/fixtures/dev` (local only).
  - Verified locally (`wrangler dev` on the built Worker, seed on): every page at 1280 and 390 px,
    light and dark, no horizontal scroll; the fingerprint's spacing is tested; `npm run verify`
    passes. App: the masthead lost "the" on the editor's phone (a larger system text size wrapped it
    onto a hidden line); it is now one line that ignores text size, checked on the emulator at 130%.
    Launch APK (`EXPO_PUBLIC_USE_SEED=0`, arm64, debug-signed for sideloading) carries no sample
    data and reads files.fromthedumpsterfire.com. The new icon and the shelf's /shelf intent filter moved the runtime fingerprint; the launch
    APK built at 12:59 with the shelf is `e903061b…`: over-the-air updates published from now on reach
    only that APK; the recommendation is one new APK for every reader (awaiting the editor's yes).

- **The shelf in the reader app** (2026-10-24): the editor's books, not reviews. `useShelf()` in
  `apps/mobile/src/lib/data.ts` reads `shelf/shelf.json` offline-first (disk copy at once, a check at
  most every 20 minutes with `If-None-Match`, nothing kept that fails `validateShelf`; a 404 means no
  shelf yet). Development builds carry `fixtures/dev/shelf.json`; the `EXPO_PUBLIC_USE_SEED=0`
  export has none of it (0 hits for `Sample note`, `seeing-like-a-state`, `Wengrow`). The Menu lists
  "The shelf" under Reading, always listed (changed the same day: the editor could not find it before the first publish); the bar is unchanged (it stays the website's
  navigation; the shelf changes over weeks). Screens: `screens/Shelf.tsx` (groups of cloth spines on
  shelf rules, wrapping on narrow phones, then a text row per book) and `screens/Book.tsx` (jacket,
  status with dates, notes as a dated journal, lines from the book, "In Haul 002", the book's link).
  Haul 002's book item links to "All my notes on this book". The jacket is now `ui/Jacket.tsx`,
  shared with the item page. Deep links `/shelf` and `/shelf/<id>`; `app.json` adds `/shelf` to the
  Android intent filter, so this needs the new APK (runtime `219fdff4…`), not an over-the-air update.
  Pure logic in `lib/shelf.ts` with 11 tests. Checked on the emulator (release APK, 393pt wide) in
  light and dark, at font scale 1.3, and at a forced 204pt width (spines wrap onto a second shelf
  with its own rule; nothing clips). Screenshots: session scratchpad `app-shots/shelf/`.

- **Over-the-air update published** (2026-10-24, the editor's go): update `33f49845…` for runtime
  `e903061b…` (the launch APK): the shelf always in the Menu, Search as a page with a real field, the
  note to the editor going to bhuvan@bebhuvan.com. The live route served a manifest whose signature
  verified and every asset matched its hash. Undo: `npm run app:update -- --rollback`.


## The code in the open (2026-11-01)

- Public at https://github.com/bebhuvan/fromthedumpsterfire (`main` and `launch-2026-10-24`), linked from the
  site's footer ("The code", `SOURCE_URL` in `apps/web/src/lib/site.ts`). Before the first push the history was
  rewritten: every commit signed `bhuvan@bebhuvan.com`, and the editor's Gmail replaced with `owner@example.com`.
  Local branches made before that (lives, charts-kit, the worktrees) still carry the old history; don't push them.
  The editor's checkout has a local `pre-push` hook (in `.git/hooks`, never pushed) that refuses any commit signed
  by another address or carrying a private one. The pre-rewrite history is kept off the repo, in
  `~/.local/share/fdf/backups/`.
- `OWNER_EMAIL` is no longer a var in `workers/api/wrangler.jsonc`. It is a secret on both Desk Workers (set
  2026-11-01, after redeploying each without the var). Without it Access lets nobody in (fail closed). To change it:
  `npx wrangler secret put OWNER_EMAIL -c workers/api/wrangler.jsonc --env production` (and `--env preview`).

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
8. **Push**: Android wired end to end in production; first real send is Haul 001's v1 publish.

## Known gaps

- The sample Haul ships inside development builds until the first real Haul is published (the site
  shows its waiting page meanwhile, so the two differ). Build launch binaries with
  `EXPO_PUBLIC_USE_SEED=0`. Fixed 2026-10-17: the sample sat at `hauls/001/v1/haul.json`, and
  because the app never refetches a bundle it holds, a sample build would have shown the sample
  under the real Haul 001 after launch. It now lives under `seed/` (`apps/mobile/src/lib/seed.ts`).
  Builds made before this fix keep the bug: replace them before Haul 001.
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
- The page fetch itself (older code) still sends a Chrome user agent (`BROWSER_UA` in
  `extract/http.ts`) because some publishers serve a stub to unknown agents. The new routes use the
  Desk's own agent. Switch the page fetch to the Desk's agent too? It is more honest, but a few
  sites that work today may then need the Wayback route.

## Agent editorial client (2026-10-24)

- `npm run editorial -- ...`: Codex, Claude Code and terminal editing through the existing Desk API.
  Capture links/batches/passages/files/audio, inspect/wait/edit/check items, order and edit Hauls,
  preview, explicitly publish, and use the general JSON/multipart command for existing block,
  connection, plate and shelf routes. `docs/EDITORIAL.md` is the operating guide; linked from both
  AGENTS.md and CLAUDE.md. Private working payloads live in gitignored `.editorial/`.
- Service-token support in the existing Worker lock: exact signed client allowlist, separate
  publish scope, no settings/UI/files/permanent DELETE access. Owner login and localhost-only
  development bypass unchanged. No public routes or database migrations added by this feature.
- `npm run editorial:setup`: read-only plan by default; explicit apply creates a 90-day Access
  credential and dedicated Service Auth policy, writes mode-600 config and receipt, attempts
  rollback on known failure. Needs Access admin API permissions; remote editors need only the
  resulting narrow service pair.
- **Activated (2026-10-24).** The authenticated **cf** CLI (separate from Wrangler) refreshed
  its OAuth login and successfully managed the existing Desk Access apps. Setup now supports
  `--cf-auth`, so no separate admin token is needed on this trusted machine. Created distinct
  draft-only Access service credentials for production and preview, valid until **2027-01-22**,
  saved mode 600 under `~/.config/fdf/editorial/{production,preview}.env` with private receipts.
  The Client IDs are allowlisted in the matching Worker environments; publishing remains disabled.
- Deployed **only auth/identity changes on the deployed-era source (`325134c`)**, preserving the
  old API and avoiding unrelated launch work/migrations. Production Desk version
  `620fc6f6-e4ce-4b1f-b67a-fba1cf6172f6`; preview `964c1cb8-df37-4ef8-92cd-398d4910b975`.
  Pipeline, website and app were not redeployed. The newer block/shelf APIs still await their launch
  deployment, so those client commands require that deployment before they work live.
- **Live verified:** production CLI status identifies the production service with publish/delete
  false; invalid capture is rejected by normal API validation, publishing/settings/DELETE refuse
  the credential, anonymous API requests fail and the Desk UI redirects to Access. Both original
  owner policies were compared and preserved. On preview, a new draft Haul was created, edited
  and read back through the CLI; publishing was denied. The disposable preview draft was removed
  through a guarded exact-ID cleanup. No production content was edited and no Haul was published.
  Private evidence, deployed source snapshot/patch and rollback version IDs are retained under
  `.wrangler/editorial-activation/`; the temporary build checkout was removed.
- The isolated deployed-era API typechecked and passed 20 security/service-auth tests with the
  correct workspace dependencies. The newer development tree is verified separately below.
- **Verified:** `npm run verify` on Node 22.22.3: all workspaces typecheck and **439 tests pass**.
  Client/auth/provisioning tests cover the real Worker routes, SQLite migrations, R2 stand-ins,
  raw audio transcription preservation, quotation refusal, draft/publish permissions, setup planning
  and rollback. A real local Wrangler Worker on an isolated database additionally accepted CLI
  status, capture, commentary edit and readback, Haul creation/order, and a preview that correctly
  reported incomplete content; no production content or public bundle was written. Local evidence
  (gitignored): `.wrangler/editorial-smoke/evidence.json`.

  Desk assets build and production Worker `wrangler deploy --dry-run` also pass. The isolated local
  smoke Worker was stopped after verification; its private fixture data remains gitignored.

## The editor's note on About (2026-10-25)

- The About page on the website and in the app opens with the editor's note ("From the editor",
  signed B.), the editor's dictation tightened at the editor's request. One source for both:
  `packages/shared/src/about.ts` (`@fdf/shared/about`), paragraphs of text, links and italic titles.
  Links checked live on 2026-10-25 (LinkedIn refuses automated checks; the editor confirmed it).
- Live on the website (2026-10-25, below). The app gets it with the next over-the-air update.

## Launch deployed (2026-10-25)

Branch `launch-2026-10-24` at `aff5110`, before the first Haul, at the editor's go.

- **D1 production**: migrations 0006 (blocks) and 0007 (shelf) applied; both only add tables and
  columns. Restore point before them: bookmark `0000001c-00000000-0000510f-30db4e1d1536a34dcaf30f9ca9c136fc`.
- **Desk** `fdf-desk` `f362818e-1e92-407b-b081-bace07b22252` (was `620fc6f6`), **pipeline**
  `fdf-pipeline` `ca83f534-12e7-4352-958c-fa06760ac148` (was `9da99db4`), **website** `fdf-web`
  `fa7317f6-3d9d-48a5-b85f-f02a9bd6525e` (was `3b027264`). Roll back with `wrangler rollback`.
- **Checked live**: editorial CLI status (service, publish and delete false), `/api/books` and item
  blocks answer, publish refused for the service (403); the Desk domain sends anonymous requests to
  Access (302); api. answers `/v1/health` 200, `/api/me` 403, and `/v1/updates` serves a signed
  `noUpdateAvailable`. Website: `/`, `/about`, `/shelf`, `/archive`, `/threads`, `/search`,
  `/feed.xml`, `/llms.txt` 200, unknown path 404, CSP present; the home page is still the waiting
  page; `/about` carries the editor's note.
- **Not done**: no app update yet (held for the APK decision); no Haul published.

## The editor's library: Readwise Reader and Instapaper (2026-10-25)

- A paywalled article is read from the editor's own saved copy: Readwise Reader first, then
  Instapaper (`packages/server/src/library.ts`, migration `0008_library.sql`). Automatic when the
  fetch fails as paid; on request through `POST /api/items/:id/library`, the Desk's "From my
  library" button on a failed fetch, and `npm run editorial -- library it_ID`. DECISIONS records
  the exception to "Free content only". Off until a token is set: without one, nothing changes.
- Verified offline: 11 new tests (URL matching, paid fetch falling back to Readwise, no token
  leaves the paid failure as it was, not-found reasons, Instapaper's "Parsed content unavailable"
  and paywalled flag, a 429 waited out from Retry-After, a refused token reported without the
  token, a long index built a few pages at a time, the source stored privately, the API route).
  Not tried against the live APIs (no tokens yet). Instapaper's v2 API (OAuth 2, personal token)
  is new; its docs were read from instapaper.com/developers on 2026-10-25.
- **Not deployed.** For the editor, on the laptop:
  1. Readwise: copy the token from https://readwise.io/access_token.
  2. Instapaper: create an application at https://www.instapaper.com/developers/applications/create
     (leave it in Owner Only mode; no review is needed for your own account), open it and choose
     **Generate access token**. The token is shown once.
  3. Set each as a secret on both workers (the pipeline reads it on a paid fetch, the Desk on
     request); `wrangler secret put` prompts for the value, so it never appears in the command:
     ```sh
     npx wrangler secret put READWISE_TOKEN -c workers/pipeline/wrangler.jsonc --env production
     npx wrangler secret put READWISE_TOKEN -c workers/api/wrangler.jsonc --env production
     npx wrangler secret put INSTAPAPER_TOKEN -c workers/pipeline/wrangler.jsonc --env production
     npx wrangler secret put INSTAPAPER_TOKEN -c workers/api/wrangler.jsonc --env production
     ```
  4. `npm run db:migrate:production` (0008), then `npm run deploy:production`.
  5. Check: `npm run editorial -- library <a failed paid item>`; the first lookup builds the index
     (a large Readwise library takes a few lookups, 12 pages of 100 a time).

## Session-written machine notes (2026-10-25)

- `POST /api/items/:id/marginalia` (`workers/api/src/index.ts`): a machine note written in an
  editorial session, at the editor's request (context such as a timeline). Same gates as the
  pipeline's notes: evidence found verbatim in the stored source or a Wikipedia card on the item,
  `checkStyle`, then `judgeNotes`; not fully supported means set aside unseen; arrives `proposed`
  with `model` = `<writer> (session)`. Tests in `workers/api/test/marginalia.test.ts`. Guide in
  `docs/EDITORIAL.md`.
- `findVerbatim` keeps the close of a quotation nested at the end of a pasted quote (Gelsinger's
  "‘Let there be light.’"); test in `packages/shared/test/desk-rules.test.ts`.

## Small fixes, 2026-10-25 (evening)

- Shelf: a long title no longer fails with HTTP 500 (D1 refuses LIKE patterns over 50 bytes; the slug check is a prefix compare), and slugs cut at a word break instead of mid-word (`slugify` in `packages/server/src/util.ts`). Desk `36acd5d1`/pipeline `6664ca84`.
- Two shelf books made before the fix have bad ids and need deleting on the Desk (the service credential cannot delete): `early-india-from-the-origins-to-ad-1300-early-india`, `india-after-gandhi-the-history-of-the-worlds-largest-democra`.
- Web footer: "A mobile app is coming soon." (web `3a6ea152`). Remove it when the Play Store listing is live.

## Haul 001 ready on the Desk (2026-10-25)

- Draft `hl_01m5spzqqsfnnb3fs08n`, "Wild, wild *times*", 17 items, 15 kept machine notes (all Claude: Sonnet from the pipeline, Opus from the session). Preview: no problems, no bundle errors, no warnings. The editor publishes it from the Desk; the session credential is draft-only.
- Web `0e8864e7`: the timeline facelift, quotations sized by length (`quoteLength`), "1 minute". The app still draws the old timeline and large epigraphs; bring it level before the next APK/OTA.

## The chart kit (built 2026-10-25 and 26 on `charts-kit`; merged and deployed 2026-10-26)

**Deployed 2026-10-26 (the editor's go):** `charts-kit` merged into `launch-2026-10-24` (fast-forward),
`CHART_RENDER_VERSION` 3. Desk `fdf-desk` 8a151cd0, pipeline `fdf-pipeline` 8e03853b, web `fdf-web`
a1baef4b, app over-the-air update fc0c647f for runtime `e903061b` (the launch APK), signature and assets
checked live. `GET /v1/health` ok. No migration. Haul 001 is still waiting for the editor's Publish.

Built from `docs/CHARTS-BRIEF.md`; the system is in `docs/CHARTS.md`, the night's report in
`docs/CHARTS-REPORT.md`.

- **Shared** (`packages/shared/src/charts`, export `@fdf/shared/charts`, light `@fdf/shared/charts/glosses`):
  the chart spec, sixteen forms (line, small multiples, stacked area, bars and columns, dot, dumbbell,
  slope, scatter, bump, warming stripes, temperature band, calendar, heatmap, ridgeline, beeswarm,
  waffle), the honesty validator with a test per rule, figure tracing for machine text, glosses and a
  text alternative written by code, CSV parsing, `bandSummary`, chart tokens (`chartInk`) validated
  for colour blindness and contrast in both themes. `Block` gains `chart`; content type `chart`
  (sky) is printed as the figure.
- **Server and Desk**: chart blocks checked on keep and at publish; Our World in Data and World Bank
  adapters (guarded, capped, licences as stated or refused); the Desk's chart editor (table, OWID,
  World Bank; live preview and checks); the app's pictures drawn in the browser at publish with resvg
  and accepted only under `chartKey`. Desk CSP: `script-src 'self' 'wasm-unsafe-eval'`.
- **Terminal**: `chart`, `chart-edit`, `chart-fetch`, `chart-csv`, `chart-check`, `chart-draw`; `publish`
  draws the pictures. End-to-end test against the Worker: keep, publish, PNGs next to the bundle.
- **Website**: charts drawn as SVG from the rows (wide and phone figures), the figure form, chart
  specimens on the cover, the numbers as a table. Worker 1,152 KiB, 301 KiB gzipped (was 202).
- **App**: the chart block with the published pictures kept offline, native text and table, the
  figure form and specimen. JS only (autolinking unchanged): ships over the air once published.
  Not yet seen on a device.
- **Comps**: `docs/design-comps/charts/` with real data (HadCRUT5 via OWID, World Bank WDI, Ember via
  OWID, Open-Meteo ERA5 for Delhi), screenshots in `shots/`.
- **Dev samples**: Haul 003 has a Chart item (Delhi's 2024 band and the stripes); Haul 002 a bar chart.
- `npm run verify`: 617 tests pass.

Before charts go live: merge `charts-kit`, deploy the Desk (CSP and routes) and the site, then an OTA
for the app. No migration is needed (chart blocks use the existing `blocks` table). The editor's
decisions are listed in the report.

## The chart kit, refined (2026-10-26, branch `charts-kit`; not deployed, not merged)

From `docs/CHARTS-REFINE-BRIEF.md`; the report's "Refinement, 2026-10-26" section has the before and
after screenshots and the colour decisions.

- **Colour**: neutral first; new OKLCH-generated ramps validated in both themes (a cool sequential
  default, a heat ramp kept for temperatures by a validator rule, a diverging ramp with weight at both
  ends); departures from normal on the weather charts; stripes on a continuous ramp from the Met
  Office's own HadCRUT5; diverging bins sized to the bulk with open ends.
- **Labels**: one placer (`charts/labels.ts`) with leaders and halos; area names follow their bands;
  slope brackets; callouts kept clear of marks; `labels.test.ts` checks every fixture and share card.
- **Typography**: one head line (units, place, span); one credit line; tighter figure type.
- **Pictures on the server**: the Desk Worker draws the app's pictures and each chart's share picture
  at publish (resvg bundled as a wasm module); the Desk's CSP drops `'wasm-unsafe-eval'`; the terminal
  no longer draws at publish. Checked on a local workerd: a chart published in 1.2 s.
- **Share pictures**: 1080 px cards with the flame and the struck masthead; Download the picture on
  the Desk (`POST /api/charts/share`), `chart-draw`, under each chart on the site (and a Chart item's
  og:image), Share in the app.
- **New forms**: histogram, tile map of India, world map (India's boundaries as India depicts them),
  price and drawdown, table with sparklines; heatmap values (a calendar of returns). Real-data comps.
- **Checked on a running Desk**: the chart editor (screenshots in `docs/design-comps/charts/shots/desk/`),
  publishing with server-drawn pictures, the share download.
- **Checked in the app on the Android emulator**: charts, glosses, credit and share action render in
  light and dark (screenshots in `docs/design-comps/charts/shots/app/`).
- `npm run verify`: 729 tests pass.

Before charts go live: merge `charts-kit`, deploy the Desk (routes, CSP, server drawing) and the site,
then an OTA for the app (JavaScript only). No migration is needed. On the first publish after deploy,
every chart's pictures are drawn afresh under new names (`CHART_RENDER_VERSION` is 2).


## Lives (2026-10-27, branch `lives`; merged and deployed the same day)

**Deployed 2026-10-27 (the editor's go):** `lives` fast-forwarded into `launch-2026-10-24`.
Migrations 0008 (the library tables, pending since 2026-10-25) and 0009 applied to production. Desk
`fdf-desk` 4fd49cd0, pipeline `fdf-pipeline` bbfb1d08, web `fdf-web` 648fdd88, app over-the-air
update d3f01321 for runtime `e903061b` (published from the main checkout: this worktree's generated
`android/` gives another fingerprint), signature and assets checked live. Sukumar Sen submitted:
item `it_01m5xq006v6e4qaf681m`, all four sources fetched on Cloudflare (the 24 MB report included),
54 of 54 lines confirmed by the judge, the 1953 portrait as its plate; added last to Haul 001 (20
items). Waiting for the editor: read and approve the profile, then publish Haul 001. Fixed on the
way: the judge reads dates and figures as printed and runs its batches together; the link check asks
again with GET after any failed HEAD (Amazon's links failed it) and counts a 406 as a refusal.


From `docs/LIVES-BRIEF.md`; the report is `docs/LIVES-REPORT.md`.

- **A new type, `life`** (label "Lives", lilac): a profile of one person per Haul, written by a model
  from named sources, every line checked. Schema in `packages/shared/src/haul.ts` (`Life`,
  `LifeLine`, `LifeCite`, `LifeSource`); the rules in `packages/shared/src/life.ts` (`checkLifeDraft`:
  quotes word for word, figures in the quotes including spelled-out numbers, style, headings without
  figures; `assembleLife`: kept lines only, quotes left out, uncited sources dropped; `lifeByline`);
  `validateHaul` rules for a Life. Old bundles validate unchanged.
- **The Desk**: migration `0009_lives.sql` (`life_sources`, `lives`); `packages/server/src/lives.ts`
  (sources fetched by the article fetch order, an editor's PDF for a source too slow to fetch, the
  draft refused whole on any failed check, the judge setting aside what it cannot confirm and failing
  closed, keep/cut per line, approval cleared by any change, a recheck at publish); routes in
  `workers/api/src/lives.ts`; the review screen `apps/desk/src/screens/Life.tsx`; a `life` check in
  the checks panel; a Life stays a Life (no capture or type change makes one).
- **The terminal**: `npm run editorial -- life`, `life-draft ITEM`, `life-show ITEM` (`docs/EDITORIAL.md`).
- **The website**: `apps/web/src/components/Life.astro`, the cover specimen, Markdown, search.
- **The app**: `apps/mobile/src/ui/Life.tsx`, the cover specimen, search.
- **Tokens**: `machineText` (the machine's blue, deepened for long prose), in tokens.css as
  `--machine-text`.
- **Sukumar Sen**, the first Life: 54 lines from Ramachandra Guha's *India After Gandhi* (the
  extract at The Caravan), the Election Commission's 1955 *Report on the First General Elections*
  (which Sen signed), a PTI report on Shyam Saran Negi, and Wikipedia for his last years. Checked
  against the texts the Desk's own fetch code stored: 0 problems. Payload ready, private, in
  `.editorial/lives-sen/`; in the development Haul 002 so every form can be seen.
- `npm run verify`: 749 tests pass.

Before it goes live: merge `lives`, apply migration 0009 (`npm run db:migrate:production`), deploy the
Desk and the site, then an over-the-air update for the app (JavaScript only; no native change). Then
submit Sen from `.editorial/lives-sen/README.md`, read and approve on the Desk, and add it to Haul 001.

## X posts inside an item; the licence line (2026-10-31; deployed, app included)

**Deployed 2026-10-31 (the editor's go):** web `fdf-web` 10121aea, pipeline `fdf-pipeline` 1b8607df,
Desk `fdf-desk` dd0e6b9b, app over-the-air update 760f2f55 for runtime `e903061b` (from ab42499 on
the new laptop; the signing key copied from the old one, checked against the certificate; the live
check verified the signature and every asset). On a fresh checkout `npm ci` skips `react-dom` (an
optional peer in the lockfile), Expo then drops "web" from the app's platforms and the runtime
changes (db0e094c here): run `npm install --no-save react-dom@19.3.1` before `npm run app:update`
and check the runtime it prints is the APK's. On the Desk: the
Chainalysis post, its chart (credit Chainalysis, "© the creator, shown for commentary") and Joe
Weisenthal's post end the Binance item; Shantanu Goel's post is on the SIR item, which carries the
editor's essay as its note and sits after Sukumar Sen in Haul 001 (23 items). Three failed duplicate
captures and the letmefuckingwalk item archived. The shelf (unpublished) holds two copies each of
*Early India* and *India After Gandhi*; only the owner can delete one of each.

- **`post` block**: an X post set inside another item as a small clipping in X's own words, from
  X's public oEmbed (`addPost`, `xPostUrl`, `houseDate`); never X's embed. Desk: "X post" under Add
  to this item. Site `Blocks.astro`, app `ui/Blocks.tsx`; validator rules; link check; a sample in
  development Haul 002. X ends long posts with "…": stored `truncated`, readers sent to the post.
- **Licence**: "Words written for this magazine are licensed CC BY 4.0 …" in the site's footer and
  at the foot of the app's About (`LICENCE` in `@fdf/shared/about`).
- **Access**: a draft-only editorial service token for this machine (`claude-omarchy`, expires
  2027-01-29), allowlisted in production and deployed (Desk e84c0848).
- **Desk content today**: the editor's note on the Binance item gained the Chainalysis security
  incident line; "The Second Coming" (Yeats, Cuala Press 1920 text) captured whole as item 22 of
  Haul 001 with the editor's proofread note (raw kept in `.editorial/yeats/`) and a proposed,
  judged Yeats note; Shantanu Goel's SIR Bangalore lookup captured (`it_01m68d5hx0nx7nv22cxw`).
- `npm run verify`: 754 tests pass.


## Haul 001 published (2026-10-31)

- **Published v1** from the terminal on the editor's approval: `hauls/001/v1/haul.json`, 23 items
  (the guide's 6–20 warning noted), with the share card drawn by the Desk's own `drawCard`
  (1200 × 630). Live: `/haul/1`, all 23 item pages, `/archive` and the feed answer 200; `og:image`
  is the card; the Binance page carries both posts and the credited chart; the SIR essay its post.
- Sukumar Sen: all 54 lines kept and the profile approved (2026-10-31 08:36 UTC) before publishing.
- **v2 (same day, the editor's "approved")**: item addresses now keep the whole title up to 80
  characters, a long title's head before a colon or full stop, and never end on a little word
  (`itemSlug` in `publish.ts`, Desk a8465460). Correction "Tidied the item addresses."; v1's card
  reused. All 23 new item pages answer 200; v1's addresses 404 (no redirects, at the editor's word:
  the site was hours old).
- **Publishing from Claude Code**: this machine's editorial token (`claude-omarchy`) is on
  `ACCESS_SERVICE_PUBLISH_CLIENT_IDS` (Desk 4dff444c). Rule (the editor's): a session publishes a
  Haul only after the editor says "approved" for that edition; `preview` first, the card drawn, the
  live pages checked after. `--confirm-publish` is still required by the client.
- Security check the same day: unauthenticated requests get Access (302) on every Desk path and 403
  on the API except `/v1/health`; a forged `cf-access-client-id` header gets 403; production
  `workers.dev` addresses are off; the public bucket does not list and does not serve
  `app-updates/`. The `cf` admin login used for the token was logged out. Credentials on this
  machine are mode 600 in 700 folders. The old laptop's SSH (port 8877, password login) was used
  to copy the update key; the editor may want it off again.

## Reading pass (2026-10-31; built and checked locally, not deployed, not committed)

From the editor's phone review of Haul 001. Website and app; shared code in `@fdf/shared/haul`.

- **Fixed (bugs):** the editor's notes keep their paragraphs; links written into a note (`"words" (url)`
  or `[words](url)`) print as links on the words (`noteLinks`, `noteParagraphs`, `notePlain`; lifting a
  link only deletes the marks around the words). Publish now stores them as `why.links` and gives a
  machine note checked against a Wikipedia card its `url` (validated); older bundles get both from the
  text and the item's cards at render. The cover poem keeps its line breaks. The hover frame no longer
  sticks after a tap.
- **Quotations** set by length (`quoteLength`, shared): a line or two large, a paragraph as a pull
  quote, longer as an extract behind a rule in the edition ink; one opening mark in that ink, no
  closing mark; straight marks curled for display only (`curlQuotes`). Long epigraphs open on their
  first clauses (`quoteLead`). Quotes in a row share one credit. Web `Quote.astro`, app `ui/Quote.tsx`.
- **Cover:** each object's head (number, kind, name) above it on a hairline; one left edge on phones;
  essay excerpts cut to the highlight or four lines; the poem with its title, first stanza and lines as
  written.
- **Notes:** large italic only for a line or two; long notes upright at reading size
  (`Note.astro`, `EditorNote`); the machine's notes follow the editor's on a phone.
- **Type:** website font sizes in rem (browser text size applies); phone body 19px; app body 19/29.5;
  multi-line titles loosened so letters never touch; poem and book page edge to edge on phones, book
  paragraphs indented; tagline "Irregular hauls of things worth salvaging from the internet and the
  archive" in the strap, site description and app menu.
- Before/after phone shots: `docs/design-comps/2026-10-31-reading-pass/`.
- **Not done:** the app is typechecked but not yet run on a device; Haul 001 needs a republish (with the
  editor's approval) for stored note links and margin-note links (the site shows note links already);
  the other reader-facing uses of "magazine" wait for the editor's wording; the Desk has no control yet
  for adding a link or a paragraph break, and voice cleanup still flattens paragraphs.

### Second pass (2026-10-31, same state: local only, not committed)

- Wide cover packed in item order, two to a row (`coverSpans`); the dense flow that pulled item 08 up
  beside 01 and left holes is gone.
- Source dates said as readers say them (`sourceDate`, `tidyDates` in `@fdf/shared/haul`): applied at
  publish and, for bundles already out, when the website and the app load them (NHK's
  "2026-10-24T19:40:00 JST+0900" now reads "24 October 2026").
- Single quotation marks curled too; titles, the field note, cover lines and machine notes curled for
  display (web and app).
- Poem page labels in the margin on wide screens; tool label drops an empty "Made by" (web and app);
  Life dates no longer break a year in two (web and app); machine notes put their source on its own
  line; passage specimens no longer justified or credited twice; archive search placeholder shortened;
  footer strap uses the chosen tagline; running head says "The opening", not "Magazine opening".
- Still open: "magazine" in the footer licence line and About (wording for the editor to approve).

### Flourishes (2026-10-31, approved by the editor from comps in docs/design-comps/2026-10-31-flourishes)

- Website: drop capital on the letter; marked phrases underlined by hand in ember (files in
  `public/marks/underline*.svg`, since the CSP allows no data: images); the flame between the letter
  and the contents; the folio is the flame and "Haul 001 · 9 of 23"; favicon and apple-touch icon are
  the ember tile (option B).
- App: the flame ornament and the new folio. The drop capital and the drawn underline are web only
  (React Native cannot float a letter or colour an underline on Android); the app keeps its tint.
- Not yet: the app icon (needs a new APK), the app checked on a device.

### The original, and each item's share card (2026-10-31, the editor: "make it look absolutely beautiful")

- The link to the original is a ticket at the foot of every item (web `.orig` in `ItemPage.astro`, app
  `Source` in `ItemScreen.tsx`): a wash of the item's type colour under an ink rule; above a dashed tear
  with notches, the host and `sourceAction` set large (the person's name in italic and never broken, the
  short tail "in 404 Media" kept on one line, a long label a size down); on the stub, the date and length
  (a date already in the label and a one-minute length left out) and the arrow. Text only, from the bundle: no picture or preview is fetched from the other site.
- Next shows the first sentence of the editor's note on the next item, under its title (web and app).
- Each item has its own share card (`drawItemCard` in `apps/desk/src/lib/card.ts`): the Haul card's frame,
  the item's number in a block of its type colour, its title as large as fits, maker and place, and the
  fingerprint with its own mark picked out. The Desk draws them at publish (and shows them under the
  Haul's card in the preview), `publish.ts` checks each like the Haul card and writes
  `hauls/<n>/v<version>/cards/<item>.png`, the bundle carries `item.card` (checked by `validateHaul`), and
  the item page uses it for link previews before its plate (a chart's own card still comes first).
  Haul 001 has none until it is published again.

## The field note set out, with links and embeds (2026-11-07, the editor: "ensure the main note supports links and embeds like tweets, youtube videos etc both on the website and the app")

- The field note is the essay readers meet first on a Haul's page. The editor writes it on the Desk
  (or `fn_body` from the terminal) with a few marks: `## ` headings, `> ` quotations, `[words](url)`
  links, `*titles*` in italic, and a YouTube/Vimeo, Spotify or X link alone on its line as an embed.
  `packages/shared/src/fieldnote.ts` reads the marks (only deleting them); `packages/server/src/fieldnote.ts`
  resolves embeds with the item-block functions in `blocks.ts` (`videoBlock`, `audioBlock`,
  `postBlock`, split out of `addVideo`/`addAudio`/`addPost`) when the note is saved, keeps them in
  `hauls.fn_embeds` (**migration 0010**, posters in MEDIA under `fieldnote/`), and `publish.ts` writes
  `fieldNote.body` (only when the note says more than plain paragraphs) with posters copied under
  `hauls/<n>/media/field-note-*`. `fieldNote.paragraphs` stays the plain words, so older app builds and
  feeds still read the note. `validateHaul` checks the body (links http/https only, embeds as blocks).
- Desk: a line on the marks under the field note, each embed with what code found (or why it was
  refused) and a retry button; the highlight is chosen from the note's words without marks; the preview
  shows the body. Website: `NoteBody.astro` (embeds through `Blocks.astro`'s new `inColumn` mode), the
  Markdown copy and the RSS feed carry the links. App: `ui/NoteBody.tsx` on the cover and the field note
  page (embeds through the exported `Video`, `AudioBlock` and `Post`).
- Development sample Haul 002 has a field note with every piece (`fixtures/dev/build.py`).
- Verified: `npm run verify`, the built website at desktop and phone width, the app's Android bundle.
  Not checked: the app on a device. Apple Podcasts links stay links (they need a typed title).
- Shipped 2026-11-07: migration 0010 on `fdf-desk` (applied with `cf d1 migrations apply`, since the
  Wrangler login on this machine has no D1 scope), `fdf-pipeline` a276e415, `fdf-desk` bf852597, `fdf-web`
  5e6bcee3, app over-the-air update 3dd2f1a7 for runtime `e903061b` (signature and assets verified).
  Haul 2's draft field note assembles with 7 headings, 5 quotations, its 8 links and italics.

## Quotations and italics in item notes (2026-11-08, the editor: "Yes, build it", for Haul 2's notes)

- An item's note (`why_text`) takes `> ` quotations and `*italic*` titles, as the field note does, plus
  links as before. `itemNote` (`@fdf/shared/fieldnote`) reads them, only deleting marks; a heading's marks
  are dropped and a lone link stays a link (no embeds in item notes). `findQuotation`
  (`@fdf/shared/verbatim`) matches a quotation with `…` gaps, each stretch word for word, in order.
- The `why` check (`steps.ts`) lists each quotation, found or not; `publish.ts` refuses a note quotation
  not in the item's source and writes `why.body` (paragraphs and quotations) only when the note has a
  quotation or italic; `why.text` stays the plain words with `why.links`, so older app builds and feeds
  still read the note. `validateHaul` allows only paragraph and quotation blocks in `why.body`.
- Website `Note.astro` (quotation upright on a rule in the edition ink; italic title upright inside the
  italic note; "B." under a closing quotation), the Markdown copy and RSS; app `EditorNote`
  (`ui/type.tsx`); the Desk shows the marks under the note. Development sample: Haul 002's Stanford item.
- Verified: `npm run verify`, the app's `tsc`, the built website at desktop and phone width.
- Shipped 2026-11-08: `fdf-pipeline` 966014e2, `fdf-desk` 52ebce96, `fdf-web` a1cab479, app over-the-air
  update ea115ca4 for runtime `e903061b` (signature and assets verified). Not checked in the app on a device.

## Longer excerpts (2026-11-08, the editor)

- The excerpt guide is now up to 400 words and a fifth of the piece (`quoting.ts`; DECISIONS 2026-11-08);
  the draft prompt allows up to four consecutive paragraphs. Applies to new drafts and to the Desk's
  guide; excerpts already chosen are unchanged. Shipped with the deploy above.

## Haul 002 published (2026-11-08, the editor: "Approved, publish tonight")

- "Goalless exploration", v1, twelve items, the field note "Here, There Be Monsters". Notes saved word for
  word from the editor's draft (three quotations changed to their sources' wording, as approved; the
  Dorset line with the paper's "[sic]"); excerpts chosen by hand in the session (no model spend); seven
  public-domain plates; the Haul's and each item's share card drawn with the Desk's `card.ts`. The deck
  and the plate captions were written in the session and are the editor's to replace. Working notes:
  `.editorial/haul-002/README.md`.

## 2026-11-09: Haul 002 versions 2 and 3, the shelf, paper pages, Wikipedia picks

- **Paper pages** (offprint, website and app): the editor's note comes first; the paper's passage
  follows under "From the paper" as an extract (rule, opening mark, credit). Deployed (fdf-web
  05c6c910; app update 8350d74a for runtime e903061b, signature verified).
- **Wikipedia cards**: the reading prompt puts the piece's own subject first and asks for bracketed
  titles; `resolveWikiTopic` no longer guesses past a disambiguation page (`exactOutcome`, tested).
  Deployed (fdf-pipeline 9a9146f7, fdf-desk 1aaa2df3). Existing items keep their cards.
- **The shelf** published for the first time: six books (`shelf/shelf.json` v1).
- **Haul 002** retitled "The Uses and Abuses of History" (v2), now 15 items: added Buntz on McCarthy
  (read from the editor's PDF), Dan Silver's note and Scott Alexander's "The Toxoplasma of Rage"
  (the editor's entries), three fertility charts from UN data via Our World in Data on the
  Geruso–Spears item, and ticked margin notes, ideas and Wikipedia cards. v3 credits Silver by name
  (the capture had "Substack").
- **Chart kit, open**: a diverging choropleth fills values near the midpoint with a grey that reads as
  "no data", and its key runs past the data (to −0.6 for fertility); crowded line-end labels drift a
  row from their lines. Worked around by using `sequential` and `multiples`; the editor will start a
  session for the fix.

## The Desk on a phone: where items stand, a check before publishing, ticks per Haul (2026-11-09, branch `claude/amazing-curran-8defdc`; not deployed)

From the editor's use on Haul 002 and a walk through every screen at phone width (`docs/DESK-REVIEW.md`,
ranked, with screenshots in `docs/desk-review/`).

- Every item says where it stands under its title (on the Desk / in Haul N, not yet published /
  published in version N), with **Add to Haul N**, **Open Haul N** and **Take out**. The tray groups
  *Published* apart.
- Every Haul has **Check before publishing** (`/haul/:id/check`: per item, *Fix* or *Look*, each linked to
  the step) and **Tick suggestions** (`/haul/:id/suggestions`: every note, idea and Wikipedia card).
- Ticks and the Haul's order update at once; 44px tap areas on ticks; *Still to do* under each item's
  title; Delete moved under More; library copy and pasted text available on every article.
- Needs before deploy: `migrations/0011_version_items.sql` applied to production (through `cf`, see the
  wrangler-account note), then `npm run deploy:production`. Older versions fill in their item ids the
  first time they are asked about. 0011 also adds a unique index so an item is in one Haul at most; it
  fails if production already has an item in two Hauls (check first:
  `SELECT item_id FROM haul_items GROUP BY item_id HAVING COUNT(*) > 1`, expected empty).
- An item taken out of a published Haul on the Haul page now says *Taken out of Haul N, but still
  published* until a correction goes out.
- Open (ranked in DESK-REVIEW): fold done steps on the item page, tray-first capture on a phone, the Haul
  page in sections on a phone, optimistic saves for the remaining item buttons, a lighter Settings page.
- **The quieter Desk** (same branch, after the editor approved the comps): Salvage look; item page
  with the note first, folded steps and one *Go through N waiting* step; keep-or-skip screens for an
  item and a whole Haul; the Haul page in printed order with marks, hold-to-move and Publish in reach.
  Checked at 390px in light and dark with headless Chromium; not yet tried on the editor's phone.
- **Deployed to production 2026-11-09** on the editor's "take it live": migration 0011 applied to
  `fdf-desk` D1 through `cf` (no item was in two Hauls), then `fdf-pipeline` and `fdf-desk` deployed
  from branch `claude/amazing-curran-8defdc`. Checked: `/v1/health` answers, the Desk still sits behind
  Access, and on the real data all 39 published items read *Published in Haul 00N, version 4*. The
  check on Haul 002 finds two items with no date (6, Robert Caro; 15, Censusnama) plus doubts.
  `launch-2026-10-24` must be fast-forwarded to this branch before the next deploy from it.


## Google Play release, preparation (2026-11-09; not uploaded)

The editor's Play developer account (personal) is verified. Personal accounts must run a closed test
with at least 12 testers opted in for 14 days in a row before production is unlocked.
- **Signing:** upload key `~/.config/fdf/play/upload.keystore` (made 2026-11-09, alias `upload`,
  SHA-256 `D7:82:51:1C:01:7C:16:4D:DE:A4:89:AF:E2:AF:28:E4:48:6F:1D:65:98:1E:80:FB:46:21:F1:89:86:8E:BA:3B`).
  Back up the whole `~/.config/fdf/play/` folder with the update-signing key. Losing it means asking
  Google to reset the upload key.
- **Build:** `cd apps/mobile && npm run prebuild:android && npm run build:android:play` gives
  `android/app/build/outputs/bundle/release/app-release.aab` (versionCode 1, version 0.3.0, all three
  architectures, `EXPO_PUBLIC_USE_SEED=0`). Raise `android.versionCode` in `app.json` for every upload.
- **Permissions:** drawing over other apps and shared storage are blocked.
- **Notifications:** Settings already has the on/off switch. Turning it off now deletes the token
  on the server (the Desk Worker change is **not deployed yet**) and is retried at launch if missed.
- **Privacy page:** `/privacy` on the website (**not deployed yet**).
- **Not done:** the design branch `claude/heuristic-visvesvaraya-55cce2` is not merged (waiting on the
  editor); store listing, screenshots, data-safety and content-rating forms; app links need the Play
  app-signing SHA-256 (Play Console › App integrity) as `ANDROID_CERT_SHA256`. Phones with the
  sideloaded APK (debug-signed) must uninstall it before installing from Play.

## Hauls by email (2026-11-09; built, not deployed)

`/subscribe` with Substack's form, links in the footer ("By email"), About, each Haul's foot ("The
next Haul"), the empty home page and the app's Menu ("Hauls by email"); the privacy page says
Substack holds the list. **Waiting on the editor's Substack address**: until `NEWSLETTER` in
`apps/web/src/lib/newsletter.ts` is set, the page says the list opens soon. Checked locally with
Substack's own publication as a stand-in: the frame loads under the CSP with no console errors, at
390px and 1280px, light and dark (screenshots in `docs/design-comps/2026-11-09-subscribe/`). Substack's
form is white in dark mode; it has no dark version. The app's Menu line needs a new build or an
over-the-air update to reach phones.
## 2026-11-09: design review and small fixes (branch claude/heuristic-visvesvaraya-55cce2, not deployed)

- **`docs/DESIGN-REVIEW.md`**: what works, what was off (ranked, with screenshots), a house style for
  quotations (three comps) and three directions for the visual grammar, with a recommendation. Comps
  and pictures in `docs/design-comps/2026-11-09-review/`. Waiting on the editor's pick.
- **Fixed, web and app:** a tool's "In its own words" is a credited quotation set by length (was 190
  words of display serif on Censusnama); quotations in the editor's notes and the field note are a
  step smaller than his words; clippings step down with length; a paper's References follow its
  figures; the cover specimen and About key no longer call a paper's passage its "Abstract"; web
  excerpts set quote marks curly as the app does.
- **Fixed, pipeline:** Wikipedia card summaries no longer stop at a middle initial ("Lyndon B.").
  Haul 002's published cards keep the cut text until they are edited and republished.
- Not deployed: the website, an app update and the pipeline all need the editor's go-ahead.
- **The proof sheet, built** (the editor's pick): 18px reading on phones, 19px on desktop; checked
  extracts as torn salvage slips with "Matched word for word" in the machine's blue; quotations in the
  editor's notes as book quotations; a salvage tag on item heads. Web and app. Not deployed.
- **Seven signatures, built** (the editor's pick): the ledger, the cover's date stamp, the 404 that
  burned, taped plates, an ornament per edition, the archive as a card drawer, the footer's slug and
  neighbours. Web and app (the 404 is web only). Not deployed.
- **The field note continued**: past 700 words the cover sets the note's opening and a "Continued" line
  to the note's own page (`/haul/<n>/note`, new on the website); a jump to the contents under the date.
  Web and app. Not deployed.

## Deployed 2026-11-09 (evening): the design work, the subscribe and privacy pages

On the editor's "Push it": `claude/heuristic-visvesvaraya-55cce2` merged into `launch-2026-10-24`
(with the Desk's and the Play Store session's work; conflicts were additions on both sides), verify
835/835, then:
- **Website** `fdf-web` version `bb68d822` (rollback: `8a780ce7`). Checked live on phones and desktop:
  the proof sheet, the signatures, the field note continued (`/haul/<n>/note`), `/subscribe` with
  fromthedumpsterfire.substack.com's form, `/privacy`, the burned 404.
- **Pipeline** `fdf-pipeline` version `65d5ed5c` (rollback: `ab79ee81`): Wikipedia summaries no longer
  stop at an initial or "c.". The Desk Worker was not redeployed here (the Play Store session's API
  change is its own to ship).
- **No over-the-air app update**: the Play Store signing work changed the app's native fingerprint
  (runtime `908c7f06`, was `e903061b`), so an update now would reach no installed copy. The app's
  design changes ship in the first Play Store build, which must be built from this branch or later.
- Pushed `launch-2026-10-24` to GitHub (gitleaks: no leaks in the 57 new commits).
- Substack artwork for the list is in `docs/brand/substack/`.
