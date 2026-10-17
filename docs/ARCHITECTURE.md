# Architecture

Everything runs on Cloudflare except push delivery (APNs/FCM via Expo push), app builds (EAS) and
external model APIs (reached through AI Gateway).

```
Desk PWA (phone + laptop) ─┐
Telegram / iOS Shortcut ───┼─► workers/api ─► D1 + R2 ─► workers/pipeline (Workflows, Queues)
                           │                                   │
Reader app + website ◄─────┴──── published Haul bundle (R2) ◄──┘
```

## Surfaces

| Surface | Who | Tech |
|---|---|---|
| Website | readers | Astro on a Worker (`apps/web`, `fdf-web`), rendering bundles from R2 per request, fromthedumpsterfire.com |
| Reader app | readers | Expo (React Native), Android + iOS, reads published bundles, offline |
| Desk | editor only | Vite + React SPA (`apps/desk`) + PWA served by `workers/api` at desk.fromthedumpsterfire.com, behind Cloudflare Access |
| Capture | editor only | Desk share target (Android), iOS Shortcut, optional Telegram bot |

The reader app has no editor mode. All write routes sit behind Access.

## Cloudflare bindings

| Binding | Service | Use |
|---|---|---|
| `DB` | D1 | items, notes, reading cards, entities, edges, issues, checks, runs |
| `MEDIA` | R2 | voice audio, source snapshots, plates, published Haul bundles |
| `ITEM_WORKFLOW` | Workflows | per-item pipeline, durable steps with retries |
| `INGEST_QUEUE` | Queues | fan-out and backfill |
| `AI` | Workers AI | Whisper transcription, embeddings, `toMarkdown` for PDFs |
| `VECTORS` | Vectorize | embeddings for connection candidates |
| `BROWSER` | Browser Rendering | snapshots of JS-heavy pages |
| AI Gateway | | Provider endpoints for Gemini, Claude and DeepSeek (Z.ai direct); logs per task and item. Spend is enforced from the Desk's own ledger |
| Cron | | weekly link re-checks |
| Access | | protects the Desk and write routes |

## Per-item pipeline (Workflow steps)

1. **fetch**: resolve the source, extract clean text (Readability on linkedom; unpdf / toMarkdown
   for PDFs; captions or Whisper for video and audio), snapshot to R2.
2. **transcribe**: editor voice note to text (Workers AI Whisper).
3. **clean**: remove fillers and fix punctuation. Code diffs input vs output tokens and rejects any
   change that is not a deletion or punctuation.
4. **read**: reading card with a Flash model, structured JSON, validated by schema.
5. **entities**: link to Wikidata IDs; Wikipedia summaries from current revisions via the REST API.
6. **plate**: match a public-domain image (Wikimedia Commons, Met, Rijksmuseum, AIC, Smithsonian
   open-access APIs); record licence.
7. **connect**: candidates from Vectorize + shared entities + shared mechanisms; judge model types each
   edge with evidence quotes from both ends; store with confidence.
8. **draft**: title options, excerpt candidates (offsets into source text), marginalia with citations.
9. **check**: excerpts matched verbatim; links fetched (2xx); marginalia checked against cited
   sources; style check on all model prose. Failures surface on the Desk, never silently drop.

Every step writes its output and cost to D1 so the Desk can show provenance.

## Publish

The Desk's Publish action freezes the Haul in D1 and writes a versioned bundle to R2:
`hauls/001/v1/haul.json` plus assets, and updates `hauls/index.json`. The website reads the new
bundle from R2 within a minute (no rebuild); the app fetches the index, downloads the Haul for offline reading, and receives a push.
Corrections publish a new version with a visible changelog entry.

## Cost guardrails

`SPEND_WARN_USD` and `SPEND_CEILING_USD` vars per env, enforced before each model call using AI
Gateway cost logs. Flash for bulk reading; the stronger model only for edge judging and final checks.
(As built, the Desk enforces the ceiling from its own `model_calls` ledger; see below.)

## The Desk (built)

The Desk is one Worker (`workers/api`, `fdf-desk-*`) that serves the UI (`apps/desk`, a Vite + React
SPA built to static assets) and its API, plus a pipeline Worker (`workers/pipeline`, `fdf-pipeline-*`)
that owns the per-item Workflow and the queue consumer. Shared server code is `packages/server`; the
rules the app may also use (style check, verbatim matching, deletion-only cleanup, capture
detection, bundle validator) are in `packages/shared`.

```
browser (Access) ─► fdf-desk ── D1 (items, sources, excerpts, drafts, wiki_cards, checks, notes, plates,
   │                 │           chunks, suggestions, judged_pairs, threads, rhymes, hauls, haul_items,
   │                 │           haul_versions, connections, model_calls, runs, devices)
   │                 ├─ R2 MEDIA, private (uploads/, notes/, snapshots/, plates/)
   │                 ├─ R2 FILES, public (hauls/NNN/vN/haul.json, hauls/NNN/audio|plates/, hauls/index.json)
   │                 └─ Queue fdf-ingest ─► fdf-pipeline ─► ItemWorkflow (one per item)
reader app ─► POST /v1/devices (public)              ├─ Vectorize VECTORS (fdf-chunks-*), Browser Rendering BROWSER
                                                     └─ notify (FCM HTTP v1) after a publish
```

**Requests.** Every request reaches the Worker first (`run_worker_first`), so the in-Worker lock
guards the UI's assets too. Public routes are exact method + path: `POST /v1/devices` (JSON only,
shape-checked, rate limited) and `GET /v1/health`. Everything else needs a Cloudflare Access JWT
verified against the team's certs (RS256 only; issuer, AUD, `exp`/`iat`/`email` required; email must
be `OWNER_EMAIL`). With `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` empty, or `ENVIRONMENT` unknown, the
Desk refuses every request. Writes also need an exact same-origin `Origin`, the `x-desk: 1` header
and a JSON body (multipart only on uploads and the share target, which instead must be a
`Sec-Fetch-Site: none|same-origin` navigation). Responses carry a strict CSP; stored files are served
sandboxed, and anything not a known inert type downloads as `application/octet-stream`. Local
development sets `ENVIRONMENT=local` and `DEV_AUTH_BYPASS=1` in `workers/api/.dev.vars`; the bypass
is honoured only then and only on localhost.

**Capture.** `POST /api/capture` (links, many at once, or a passage with its source),
`POST /api/capture/file` (PDF, raster page photos), `POST /share` (Android Web Share Target),
`POST /api/notes` (voice notes, transcribed and cleaned synchronously). Each new item is a queue
message; the consumer starts one `ItemWorkflow` per item.

**ItemWorkflow steps.** `fetch` (per source kind: Readability on linkedom; unpdf page by page with
page offsets, Workers AI `toMarkdown` as fallback; YouTube captions through the InnerTube Android
client (human captions as they are; auto-generated ones only when the audio cannot be reached), else
Whisper on the audio stream; Apple Podcasts / RSS / og:audio with chunked Whisper on
MP3 in 3 MB byte ranges, one step per chunk; X via oEmbed; arXiv API + PDF; Crossref for DOIs; OCR
of page photos by a vision model; when Readability finds under 600 characters, a Browser Rendering
pass if enabled, see below) → snapshot raw bytes and text to R2, text to D1 → `read`
(reading card; quotables kept only if found verbatim) → `wiki` (the reading card's two to four
"further reading" picks, each with a reason, then entity queries to fill gaps, resolved with the
Wikipedia REST API; hits that share no word with the query are rejected; the card's summary is the
sentence of Wikipedia's lead that matches the reason, verbatim, else the first) → `plate`
(public-domain image candidates, below) → `embed` (chunks and card into Vectorize, then candidate
pairs) → `connect` (judged edges with quotes from both ends, below) → `draft`
(five titles from named angles; three excerpt candidates of one or two paragraphs within
`excerptCap`, each with a line on why; zero to three cited margin notes; for long talks, podcasts,
videos and papers (`wantsIdeas`) three to twelve big ideas (about one per fifteen minutes,
`ideaCount`), from every third of the piece, each attributed and tied to a verbatim passage, stored
in the order the piece makes them; audited for house style, verbatim quotes, length and real citations, regenerated up to
three times with the failures listed, then anything still failing is dropped) → `judge` (each note
against its cited evidence, each idea against the stretch around its passage; a proposal that is
not fully supported is set aside as `rejected` and never shown) → `check` (links, quotes, style, citations, the editor's note) →
`ready`. Errors set the item `failed`; the spend ceiling sets it `paused`. `plate`, `embed` and
`connect` are helpers: their failures are logged and never fail the item (the spend ceiling still
pauses it).

**Long audio.** `extract/audio.ts` plans chunks before any transcription. MP3 is cut into 3 MB byte
ranges overlapping by 128 KB (about 8 s at 128 kbps); each chunk's start time comes from the frame
header's bitrate (exact for CBR and for VBR files with a Xing/Info frame count). YouTube's DASH MP4
audio is cut on its own segment boundaries from the `sidx` index, each chunk led by the init segment,
so its times are exact. Other containers (plain m4a, webm, ogg) go whole if under 20 MB, else the
item fails with a clear message. One workflow step per chunk returns Whisper's text and timed
segments; `stitchTranscript` drops segments inside each overlap, removes words that repeat the
previous chunk, and writes paragraphs with `times` so excerpt locators read "at 1:02:14". Caps: three
hours (estimated before, and on what Whisper actually heard during), 450 MB, at most 160 chunks, and
the whole job's estimated cost must fit under the month's ceiling before the first chunk
(`assertAffordable`). Every range read stops at the range's length, whatever the server's headers say.

**Plates.** The `plate` step asks a cheap model for two to four collection searches (concrete nouns,
never URLs) and queries Wikimedia Commons (structured-data public domain or CC0, then the file
page's own licence fields), the Art Institute of Chicago (`is_public_domain`, IIIF 843 px), The Met
(`isPublicDomain`, v1.1 search, results must share a word with the query), and Smithsonian Open
Access or the Rijksmuseum only if `SMITHSONIAN_API_KEY` / `RIJKSMUSEUM_API_KEY` exist. Each candidate
keeps the institution's title, creator, date, licence and work page; its image is fetch-checked
through `guardedFetch` and measured from its bytes. Candidates are capped (12 per search, 60 per item
or cover). The editor may also search by their own query (no model), or choose no plate. Choosing
copies the rendition into MEDIA `plates/` (resized with the `IMAGES` binding only if bound and wider
than 1600 px). Thumbnails reach the Desk through `/api/plates/:id/thumb` (guarded, image types only),
since the Desk's CSP allows only its own images. Haul covers work the same way, or reuse the items'
candidates. AIC's IIIF host sits behind a bot challenge from some networks; those candidates simply
fail the fetch-check.

**Connections and Threads.** `embed` chunks the source (about 1,200 characters, 150 overlap, at most
120 chunks, sampled evenly for books) plus one reading-card text, embeds them with
`@cf/baai/bge-m3` (1024 dims) and upserts them into Vectorize (`itemId` metadata index); offsets live
in D1 `chunks`, so text is always read back from the stored source. Candidates for an item: its card
and eight sampled chunks queried against the index (other items only), shared Wikipedia cards, and
shared mechanisms from reading cards, over every item with a source, archived items included when
they are in a published Haul. A vector neighbour must reach cosine 0.6 unless an entity or mechanism
is shared; the top four go to the judge. Each pair is claimed in `judged_pairs` before the call, so
no pair is paid for twice. The judge (`connect` task) types the edge (Answers, Extends, Contradicts,
Precedent of, Same mechanism, Rhymes with, Cites) and must quote both pieces; each quote is located
with `findVerbatim` in that item's full stored text and re-anchored to its characters, the
justification must pass `checkStyle` and name both pieces, confidence must reach 0.5. Failures get
one retry with the problems listed, then are dropped. The five latest rejections are given to the
judge as negative examples. The editor keeps a suggestion only with a note in their own words (or by
explicitly adopting the machine's sentence), which becomes the `connections` row and the published
note (serif). Threads: connected components of all kept connections; components over twelve pieces
are split at their weakest edges (fewest shared neighbours); three or more pieces make a cluster.
The `thread` task drafts a title, summary and one-line gists (style-checked, regenerated twice);
years come from the items' dates, edges from the kept connection types. The editor edits and approves;
publish includes every approved thread that touches the Haul, with points outside the Haul marked
`inHaul: false` and a machine provenance line counting proposed and kept links.

**Rhymes.** An item of kind `rhyme` (type `rhymes`) with a `rhymes` row: each end points at a
captured item with a fetched source, and its quote is a selection in that source or a pasted
quotation found verbatim there (offsets stored). The bridge renders in the machine's voice, so it
must pass `checkStyle` whoever writes it; the `haul` task can draft it from the two quotes. The item's
own source fields follow the "then" end. Checks and publish re-verify both quotes at their offsets.

**Browser Rendering.** Off unless the `BROWSER` binding exists and `BROWSER_FALLBACK=on`. Every
request the rendered page makes (the navigation, each redirect hop, frames, subresources) is
intercepted and must pass the guardedFetch rules plus DNS-over-HTTPS resolution to public
addresses, or it is aborted; media, fonts and websockets are refused; the final URL is re-checked.
Subresources are fetched by the browser on Cloudflare's network, not by `guardedFetch`. Interception
cannot see WebSocket traffic, and the browser resolves DNS again after our check (a rebinding host
could differ between the two), which is why the fallback is opt-in.

**SSRF guard.** Every fetch of an editor- or source-supplied URL goes through `guardedFetch`
(`packages/server/src/extract/guard.ts`): http/https on default ports, no credentials, no internal
hostnames, no private, loopback, link-local, CGNAT or metadata addresses (IPv4, IPv6 and mapped
forms), DNS-over-HTTPS resolution checked, redirects followed by hand and re-checked (5 hops).

**Models.** `packages/server/src/models/routes.json` maps tasks (`read`, `draft`, `judge`, `clean`,
`ocr`, `haul`, `plate`, `connect`, `thread`, `bridge`) to a chain of models, plus `transcribe`
(Whisper) and `embed` (bge-m3); `generateJson`, `transcribeAudio` and `embedTexts` in `router.ts`
are the only ways to call a model. Each model declares its capabilities (JSON schema or JSON
object, vision, PDF and page limit, thinking, caching, context and output limits, whether it takes
a temperature) and its prices (input, cached input, cache write, output, reasoning, long-prompt
tier); each task declares a thinking level, whether to attach PDFs, and a media resolution. The
router skips models whose key is missing or that lack a capability the call needs, and falls back
on errors. Each provider has a native adapter in `models/providers/`: Gemini `generateContent`,
the Claude Messages API, DeepSeek and Z.ai chat completions, and Workers AI through the AI binding.
Gemini, Claude and DeepSeek go through AI Gateway's provider endpoints
(`gateway.ai.cloudflare.com/v1/{account}/{gateway}/{provider}/…`, with `cf-aig-metadata` naming the
task and item); Z.ai has no built-in gateway provider and is called directly unless `routes.gateway`
names a custom provider; Workers AI goes through the AI binding's gateway option (if the named
gateway does not exist yet, calls go direct and are logged as `workers-ai-direct`). `models/http.ts`
retries 429 and 5xx with backoff and honours `Retry-After`; auth errors and exhausted balances move
to the next model. Outputs are JSON validated with zod, with one repair turn. Every call is
recorded in `model_calls` with input tokens (cached and cache-written among them), output tokens
(reasoning among them) and cost (`models/cost.ts` prices each kind); `assertBudget` refuses a call
whose worst-case cost would take the month past `SPEND_CEILING_USD` (zero means no calls). The
draft step sends its source as cacheable `context`, so redrafts read it from Claude's prompt cache;
the read step attaches the source PDF for models that read PDFs; scanned PDFs are transcribed by
the `ocr` task (`ocrPdf` in `extract/pdf.ts`). Override routes per deploy with `MODEL_ROUTES`.
Provider capabilities, prices and sources, dated, are in `docs/MODELS.md`; Workers AI prices were
checked on 2026-10-16 against https://developers.cloudflare.com/workers-ai/platform/pricing/ (the
dated table is also in `spend.ts`). `npx tsx scripts/smoke-models.ts` runs one real call per model.

**Voice notes.** Whisper (`@cf/openai/whisper-large-v3-turbo`), then a model cleanup that is only
accepted if `checkDeletionOnly` proves it removed fillers or stutters and changed punctuation or
capitalisation, nothing else; otherwise the code-only cleanup is used. The Desk recorder asks
MediaRecorder for AAC in MP4 first (`audio/mp4;codecs=mp4a.40.2`, Safari and recent Chrome), falling
back to WebM/Ogg Opus. The server sniffs the real container and codec from the bytes and stores
`notes.format`: m4a, mp3 and wav play on iOS and Android; mp4 (Opus in MP4), webm and ogg play on
Android only. Such notes still publish, with a warning and an "Android only" badge on the Desk, and
the bundle's `Audio.format` lets the reader app skip them on iOS.

**Publish.** `assembleHaul` builds the bundle from D1, maps internal ids to slugs (never `note` or
`thread`, which the website routes use), and lists the voice notes and chosen plates to copy next to
the bundle. It publishes only the notes, ideas and Wikipedia cards the editor ticked (unticked ones are left
out, never a blocker), and refuses on any failing item check, any kept note or idea not confirmed by
its source, a kept idea whose passage no longer matches, a Rhyme whose quotes no longer match, a missing chosen plate, or any
`validateHaul` error; `validateHaul(haul, index, { filesBase })` also refuses any plate or audio URL
not under `FILES_BASE`, so nothing hotlinks an archive (Wikimedia refuses app image loaders).
There are two buckets: MEDIA (private) and FILES (public, only `hauls/`). `publishHaul` is the only
writer to FILES: it copies the assets from MEDIA into `hauls/NNN/audio/` and `hauls/NNN/plates/`,
then writes `hauls/NNN/vN/haul.json` (immutable; an existing version is never overwritten) and
`hauls/index.json`, records `haul_versions`, and for v1 only queues one push. A correction is a new
version with a `corrections` entry. Push uses FCM HTTP v1 with an OAuth assertion signed by
WebCrypto from the `FCM_SERVICE_ACCOUNT` secret; data carries
`url: https://fromthedumpsterfire.com/haul/<n>`; unregistered tokens are disabled.

### Desk resources

| | Preview (created) | Production (to create) |
|---|---|---|
| Desk Worker | `fdf-desk-preview`, https://fdf-desk-preview.r-bhuvanesh2007.workers.dev | `fdf-desk` on `desk.fromthedumpsterfire.com` (Access) and `api.fromthedumpsterfire.com/v1/*` (public) |
| Pipeline Worker | `fdf-pipeline-preview` | `fdf-pipeline` |
| D1 | `fdf-desk-preview` | `fdf-desk` (put its id in both `wrangler.jsonc`) |
| R2 MEDIA (private) | `fdf-files-preview` | `fdf-media` |
| R2 FILES (published) | `fdf-public-preview` (private, served by the Desk's `/files/*`) | `fdf-files`, public on `files.fromthedumpsterfire.com` |
| Vectorize | `fdf-chunks-preview` (1024 dims, cosine, metadata index `itemId`) | `fdf-chunks` (create the same way) |
| Browser Rendering | `BROWSER` binding (fallback off unless `BROWSER_FALLBACK=on`) | same |
| Queues | `fdf-ingest-preview`, `fdf-ingest-preview-dlq` | `fdf-ingest`, `fdf-ingest-dlq` |
| Workflow | `fdf-item-preview` | `fdf-item` |
| AI Gateway | `fdf-preview` (create in the dashboard) | `fdf` |
| Access app | on the workers.dev hostname (see STATUS) | self-hosted app for `desk.fromthedumpsterfire.com`, owner email only |

### Running the Desk

- Local: `npm run desk:build`, `npm run db:migrate:local`, then
  `node --experimental-strip-types scripts/local-dev-config.ts` and
  `npx wrangler dev -c .wrangler/dev/api.jsonc -c .wrangler/dev/pipeline.jsonc --env preview --persist-to .wrangler/state`
  (local D1, R2, Queues and Workflows; Workers AI, Vectorize and Browser Rendering are remote and
  billed). The script writes copies of the preview configs under local-only Worker names
  (`fdf-desk-local`, `fdf-pipeline-local`): wrangler's remote-bindings session runs under the
  Worker's name, and Access on the preview hostname refuses it. `workers/api/.dev.vars` must contain
  `ENVIRONMENT=local` and `DEV_AUTH_BYPASS=1` (add a small `SPEND_CEILING_USD`, and
  `BROWSER_FALLBACK=on` in `workers/pipeline/.dev.vars` to try rendering); rerun the script after
  changing them. Editing server code while a workflow runs reloads the Worker and strands that run;
  use Redraft. For UI work, `npm run dev -w @fdf/desk` proxies the API to port 8787.
- Preview: `npm run db:migrate:preview`, `npm run deploy:preview`.
- `npx tsx scripts/verify-bundle.ts <filesBase> hauls/001/v1/haul.json [publishedFilesBase]` validates a
  published bundle; with the third argument it also checks every plate and audio URL is under it and
  fetches each one. `npx tsx scripts/probe-plates.ts "query"` shows what each collection returns.

## The website (built)

`apps/web` is an Astro site with server output on one Worker, `fdf-web` (`fdf-web-preview` on
workers.dev for the preview env, deleted 2026-10-16 and recreated by `npm run deploy:web:preview` when needed). Pages render at request time from the published bundles in R2, so
the Desk's publish is the only step: no rebuild, no deploy.

```
Desk publish ─► R2 fdf-files: hauls/index.json, hauls/NNN/vN/haul.json (immutable)
                     │  FILES binding (read only)
browser ─► fdf-web Worker ─► wrapper (src/worker/index.ts)
              │                ├─ www → apex, aliases, 405, security + cache headers
              │                ├─ index updatedAt (re-read every 20 s per isolate)
              │                ├─ edge cache: key = deploy version + updatedAt + path ─► HIT
              │                └─ MISS ─► Astro render ─► store (validateHaul per path+etag) ─► cache.put
              └─ /_astro/*, /fonts/*, og.png, favicon: static assets, no Worker
```

**Wrapper.** Runs first for everything except fonts, hashed CSS/JS and a few static files
(`run_worker_first` with exclusions; their headers come from `public/_headers`). It redirects `www.`
to the apex, maps the app's aliases (`/haul/<n>/note` to `/haul/<n>#field-note`, `/haul/001/…` to
`/haul/1/…`, `/hauls` to `/archive`, trailing slashes), refuses non-GET/HEAD with 405, reads the index's
`updatedAt`, and looks the page up in `caches.default` under `deploy version / updatedAt / path` (query
ignored). On a miss it calls the Astro handler and stores 200 responses for a day; a new publish or
correction changes `updatedAt`, so old pages are simply never asked for again, and a new deploy changes
the version. Every response gets the CSP (no inline script or style), nosniff, frame-ancestors none,
HSTS, referrer and permissions policies, and `cache-control: public, max-age=30` for pages. Non-production
hosts get `X-Robots-Tag: noindex`. The Cache API is a no-op on workers.dev, so the preview renders every
request.

**Store** (`src/lib/store.ts`, bound to `FILES` in `src/lib/runtime.ts`). The index is shape-checked
(bundle paths must be `hauls/NNN/vN/haul.json`); a missing index means the waiting page; an unreadable
one falls back to the last good copy in memory, else 503. Each bundle is validated with `validateHaul`
(with the index) once per path and etag; the result is trusted for five minutes, then the etag is
re-checked with a HEAD. A bundle that fails is logged and never rendered: the store tries up to five
earlier versions (validated without the index, since a correction may change the title) and serves the
newest good one; if none, that Haul's pages answer 503. `FDF_USE_SEED=1` (in `apps/web/.dev.vars`, never
honoured in production) swaps R2 for the sample Haul for `astro dev`.

**Pages.** `/` (latest Haul, or the waiting page while the index is empty), `/haul/<n>` (cover band,
field note with the route, contents, colophon and corrections), `/haul/<n>/<item>` (standard, Rhymes
and poem layouts), `/haul/<n>/thread/<id>`, `/threads`, `/archive`, `/search` (vanilla script over
`/search.json`, same weighting as the app), `/feed.xml`, `/sitemap.xml`, all rendered on request.
Prerendered: `/about`, 404, `/503`, `/tokens.css` (from `packages/shared/src/tokens.ts`), and
`/.well-known/assetlinks.json` / `apple-app-site-association` when `ANDROID_CERT_SHA256` /
`APPLE_APP_ID` are set at build time.

**Build and deploy.** `CLOUDFLARE_ENV=preview|production astro build` (the Cloudflare Vite plugin writes
`dist/server/wrangler.json` for that env), then `wrangler deploy` from `apps/web`; the root scripts
`deploy:web:preview` and `deploy:web` do both. Worker size: 776 KiB, 202 KiB gzipped. Measured CPU: 0 to
1 ms per rendered page.
