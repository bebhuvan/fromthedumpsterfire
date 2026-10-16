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
  `dictationGarbles` for transcription. Not yet wired into `packages/server` prompts.

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

### Desk: what the editor must do

1. **Turn on Cloudflare Access for the preview** (Wrangler's login cannot create Access apps):
   Workers & Pages → `fdf-desk-preview` → Settings → Domains & Routes → workers.dev → enable
   Cloudflare Access, with a policy that allows only owner@example.com (and no App Launcher).
   Copy the application's AUD tag and your team domain (`<team>.cloudflareaccess.com`) into
   `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` under `env.preview.vars` in `workers/api/wrangler.jsonc`,
   then `npm run deploy:preview`. Until both are set, the Worker refuses every request.
2. **Create the AI Gateway** `fdf-preview` (AI → AI Gateway). Until then Workers AI calls go direct
   (marked `workers-ai-direct` in Settings) and external providers are unreachable.
3. **Optional provider keys** (Wrangler secrets on both Workers, preview env), never in config:
   `GOOGLE_AI_STUDIO_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`; or store
   them in the gateway (BYOK), set `"byok": true` via `MODEL_ROUTES` and add `CF_AIG_TOKEN`.
   Set with `npx wrangler secret put NAME -c workers/pipeline/wrangler.jsonc --env preview` (and the
   same with `workers/api/wrangler.jsonc`, which runs voice cleanup and field-note help).
4. **Push:** `FCM_SERVICE_ACCOUNT` (the Firebase service-account JSON) as a secret on
   `workers/pipeline`. iOS tokens from Expo are APNs tokens, which FCM HTTP v1 cannot address; iOS
   push needs the app to register FCM tokens (Firebase iOS SDK) or a separate APNs sender.
5. **Production** (nothing created yet): D1 `fdf-desk` (id into both configs), R2 `fdf-files` with
   the custom domain `files.fromthedumpsterfire.com` (public read, CORS GET for the site), queues
   `fdf-ingest` and `fdf-ingest-dlq`, AI Gateway `fdf`, an Access app for
   `desk.fromthedumpsterfire.com`, routes for `desk.` and `api.fromthedumpsterfire.com/v1/*`, the
   secrets above, a real `SPEND_CEILING_USD` (it ships at 0, meaning no model calls), an R2
   lifecycle rule to abort incomplete multipart uploads, then
   `npx wrangler d1 migrations apply DB --remote -c workers/api/wrangler.jsonc --env production`.

### Desk: known gaps

- Edge Access is not yet on for the preview (step 1 above); the in-Worker lock is what refuses
  requests today.
- No plates (public-domain image matching), no machine connections/Threads, no Rhymes authoring,
  no Vectorize yet (milestones 6 and later). Editor-made connections are supported.
- Long non-MP3 audio (m4a/webm over 20 MB) cannot be split for Whisper; YouTube videos without
  captions rely on a small audio stream. JS-only pages need Browser Rendering (not wired).
- Voice notes recorded in Chrome are WebM/Opus, which iOS cannot play if published as audio.
- `apps/mobile` typecheck fails on `p.swatch.peach` (pre-existing; the swatch was renamed in shared).
- Model prices in `routes.json` for Workers AI are estimates; check them against the dashboard.
- The preview D1 holds one probe item ("How to Work Hard") from the deployed pipeline test.
- `@fdf/shared/voice` is not wired yet: `editorVoice` into the title/route prompts, `voiceCheck`
  beside `checkStyle` in the regeneration loop, `dictionaryHints` into the transcription prompt.

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
  https://fdf-web-preview.r-bhuvanesh2007.workers.dev.

### Web: what was verified (2026-10-16)

- `npm run verify`: every workspace typechecks (including `astro check` for apps/web) and 174 tests
  pass; 26 are the web's: safeHref, search index and scoring, the request-time store (validation,
  fallback to the previous version, 503 when no version is good, missing or bad index, a new publish
  seen after the index TTL, validation cached per path and etag), the cache key and policy, RSS
  escaping, tokens CSS, app-link generation and the Worker's redirects.
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
2. **Publish path**: bundle writer with the invariant checks: built; production bucket to create.
3. **Pipeline v1**: item Workflow: fetch, transcribe, clean (deletion-only), reading card, draft, checks: built.
4. **Desk v1**: tray, item review, voice capture, Android share target, quote extraction: built,
   preview deployed; edge Access to switch on.
5. **Web**: built and live; renders from R2 at request time, so publishes need no deploy.
6. **Connections**: Vectorize, entity linking, edge judging, Threads.
7. **Backfill**: import old site archive and reading history.
8. **Push**: client done; needs google-services.json, the Worker endpoint and FCM credentials.

## Known gaps

- The sample Haul ships inside the app until the first real Haul is published. Build launch binaries
  with `EXPO_PUBLIC_USE_SEED=0`.
- No plates in the sample Haul yet; the layout supports them.
- No drop caps in the app (React Native text can't wrap around a float); the web edition keeps them.

## Open questions for the editor

- Model choice and budget ceiling for the judge model.
- Where the old site's archive and reading history live, for backfill.
- Final pick of the app icon (current: ember flame on ink).
- Whether `checkStyle` should allow "leverage"/"leveraged" in finance contexts (your own notes use it
  20 times as a finance term; see `docs/VOICE.md`).
