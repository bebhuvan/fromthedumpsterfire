# Architecture

Everything runs on Cloudflare except push delivery (FCM HTTP v1), app builds (local Gradle; EAS
only if iOS needs it) and external model APIs (reached through AI Gateway). Over-the-air app updates
are self-hosted on the Desk Worker (below).

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

1. **fetch**: resolve the source, extract clean text (Defuddle on linkedom, Readability as the fallback; unpdf / toMarkdown
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
   **research**: margin notes from the model's own knowledge, each quoting a whole Wikipedia article
   the Desk fetched (or, from a session, a page the Desk fetched for it), then judged.
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
browser (Access) ─► fdf-desk ── D1 (items, sources, excerpts, drafts, wiki_cards, evidence, checks, notes, plates,
   │                 │           chunks, suggestions, judged_pairs, threads, rhymes, hauls, haul_items,
   │                 │           haul_versions, connections, model_calls, runs, devices)
   │                 ├─ R2 MEDIA, private (uploads/, notes/, snapshots/, plates/, blocks/, books/)
   │                 ├─ R2 FILES, public (hauls/NNN/vN/haul.json, hauls/NNN/audio|plates/, hauls/index.json,
   │                 │                    shelf/shelf.json, shelf/covers/, shelf/audio/)
   │                 └─ Queue fdf-ingest ─► fdf-pipeline ─► ItemWorkflow (one per item)
reader app ─► POST /v1/devices, GET /v1/updates(/asset) (public)
                                                     ├─ Vectorize VECTORS (fdf-chunks-*), Browser Rendering BROWSER
                                                     └─ notify (FCM HTTP v1) after a publish
```

**Requests.** Every request reaches the Worker first (`run_worker_first`), so the in-Worker lock
guards the UI's assets too. Public routes are exact method + path: `POST /v1/devices` (JSON only,
shape-checked, rate limited), `GET /v1/health`, and the read-only update routes `GET /v1/updates`
and `GET /v1/updates/asset`. Everything else needs a Cloudflare Access JWT
verified against the team's certs (RS256 only; issuer, AUD, `exp`/`iat`/`email` required for the owner; email must
be `OWNER_EMAIL`; allowlisted service assertions instead require the signed client identity described below). With `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` empty, or `ENVIRONMENT` unknown, the
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

**ItemWorkflow steps.** `fetch` (per source kind: articles by the fetch order below; pages read by Defuddle on linkedom after pop-ups, script-only boxes and "also read" boxes are removed, with Readability when Defuddle finds much less (`extract/html.ts`; `sources.extractor` says which); unpdf page by page with
page offsets, Workers AI `toMarkdown` as fallback; YouTube captions through the InnerTube Android
client (human captions as they are; auto-generated ones only when the audio cannot be reached), else
Whisper on the audio stream; Apple Podcasts / RSS / og:audio with chunked Whisper on
MP3 in 3 MB byte ranges, one step per chunk; X via oEmbed; arXiv API + PDF; Crossref for DOIs; OCR
of page photos by a vision model; when the readers find under 600 characters, a Browser Rendering
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
three times with the failures listed, then anything still failing is dropped) → `research` (the
research desk, `research.ts`: up to eight leads from the model's own knowledge, each a claim, an angle
and a Wikipedia title; code resolves each title and keeps the whole article in `evidence`; the model
writes each note from that article's relevant paragraphs (`passagesFor`) and quotes it; style and
verbatim checked, one retry with the failures listed) → `judge` (each note
against its cited evidence, each idea against the stretch around its passage; a proposal that is
not fully supported is set aside as `rejected` and never shown) → `check` (links, quotes, style, citations, the editor's note) →
`ready`. Errors set the item `failed`; the spend ceiling sets it `paused`. `plate`, `embed`,
`connect` and `research` are helpers: their failures are logged and never fail the item (the spend ceiling still
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

**Article fetch order** (`fromArticleUrl` in `packages/server/src/ingest.ts`; routes in
`extract/platforms.ts`, archive in `extract/wayback.ts`). Many sites refuse Cloudflare's servers
(Substack answers 429 at times, Medium always shows a bot check), so a link is tried in this order:

1. **Platform routes chosen from the address**, before the page: Substack's post API
   (`/api/v1/posts/<slug>`; `open.substack.com/pub/…` and app links by id; any other host with a
   `/p/<slug>` path is tried as a custom domain), then the publication's `/feed` when the API
   refuses; wordpress.com blogs through `public-api.wordpress.com/wp/v2/sites/<host>/posts?slug=`;
   Medium through the author's or publication's RSS feed (`medium.com/feed/@user`), which holds
   the full text of the latest free stories.
2. **The page.** A Substack page is read from its post body element; a WordPress page that
   advertises `api.w.org` is read through its REST API instead (the post alone, with its authors),
   unless the API's copy of a long post is under half the page's.
3. **When the page refuses** (401, 403, 429, 5xx, a bot-check page, no answer) or is gone (404,
   410): the WordPress REST API by slug, a Medium-shaped link's `/feed`, then the newest Wayback
   Machine capture recorded as a 200 (CDX, then the availability API), read raw (`id_`, gunzipped
   when the archive sends the stored gzip body), else, for a refusal and not a missing page, Save
   Page Now (anonymous POST, job polled every 6 s for at most 90 s). If everything fails, a 429,
   5xx or capture still in progress stays retryable (the step's backoff runs the chain again and
   finds a capture that landed meanwhile); other refusals fail with every attempt listed.

Free content only. Substack's `audience` and `wordcount`, the feed's "Read more" tail, Medium's
`medium-feed-link`, a password-protected WordPress post and the paywall markup on Substack and
Medium pages (fetched or archived) each stop the fetch with "paid subscribers" or "members-only";
nothing is retried and no other copy is looked for, except the editor's own saved copy: with
`READWISE_TOKEN` or `INSTAPAPER_TOKEN` set, a paywalled article is read from the editor's Readwise
Reader library, then Instapaper (`packages/server/src/library.ts`, called from `fetchSource`; the
Desk's `POST /api/items/:id/library` does the same on request). Neither API finds a document by
link, so `library_docs` (migration 0008) indexes saved links by a normalised key (no scheme, www,
fragment, tracking parameters or trailing slash) and `library_sync` keeps each provider's place:
Readwise `updatedAfter` with its `pageCursor`, Instapaper `since` with an offset, a bounded number
of pages per lookup so a large first sync resumes on the next one. The text comes from Readwise's
`html_content` or Instapaper's `/bookmarks/{id}/parse`, flattened like a platform body, with
`extractor` and `meta.via.route` `readwise` or `instapaper`. Tokens go only in the Authorization
header to those two fixed hosts (redirects refused, JSON read with a byte cap, 429s waited out
from Retry-After). The item keeps the original link (a Wayback
copy never becomes `canonical_url`). `sources.meta.via` records the route, a label, the API, feed
or archive URL and the capture time; the Desk prints the label under the source, with a link to
the archived copy. APIs, feeds and the archive are asked with the Desk's own user agent, through
`guardedFetch`, with byte caps on what is streamed (8 MB for APIs and feeds, 15 MB for pages and
copies, including what a gzip copy inflates to).

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

**Models.** `packages/server/src/models/routes.json` maps tasks (`read`, `draft`, `research`, `judge`, `clean`,
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

**Blocks** (2026-10-24; `packages/server/src/blocks.ts`, routes in `workers/api/src/blocks.ts`,
table `blocks`). What the editor adds to an item, printed in order after the note and the excerpt
(`Item.blocks`): `quote` and `code` are excerpts, checked against `sources.text` when added (a quote
by `findVerbatim` or the selection's offsets, stored as the source's own characters; code by
`findCode`, whitespace runs collapsed, the editor's paste printed) and again by the Quotes check and
at publish; an item without source text takes neither. `video` (YouTube, Vimeo) and `audio`
(Spotify, Apple Podcasts, an https audio file) are parsed from the editor's link by code
(`parseVideoLink`, `parseAudioLink`); titles from oEmbed or the editor; a video's poster (YouTube
hqdefault, Vimeo's oEmbed thumbnail) and every picture are fetched with `guardedFetch` and a byte
cap (or uploaded), measured with `imageSize`, and kept in MEDIA under `blocks/<id>/`; pictures need
the editor's credit and licence. A Picture item's picture is its chosen plate (`provider 'editor'`).
`post` (2026-10-31): an X post set inside another item. The editor's link is read by `xPostUrl`
(`@fdf/shared/haul`) to `https://x.com/<handle>/status/<id>`; `addPost` asks X's public oEmbed
(`fetchXPost`, guarded and capped) for the words, author and date, never the page and never a model;
a post X ends with "…" is stored `truncated` and readers are sent to it for the rest. The site and
the app draw it as a small clipping (no X script, iframe or web view; the CSP is unchanged). Its
link joins the link check. The post's picture, if wanted, is a separate picture block with its
credit.
`POST /api/items/:id/blocks` (JSON, per-kind zod schemas), `POST /api/items/:id/picture`
(multipart), `PUT /api/items/:id/blocks/order`, `PATCH|DELETE /api/blocks/:id`,
`GET /api/blocks/:id/media` (the poster or picture, served from MEDIA to the Desk).

**Publish.** `assembleHaul` builds the bundle from D1, maps internal ids to slugs (never `note` or
`thread`, which the website routes use), and lists the voice notes and chosen plates to copy next to
the bundle. It publishes only the notes, ideas and Wikipedia cards the editor ticked (unticked ones are left
out, never a blocker), and refuses on any failing item check, any kept note or idea not confirmed by
its source, a kept idea whose passage no longer matches, a Rhyme whose quotes no longer match, a missing chosen plate, or any
`validateHaul` error; `validateHaul(haul, index, { filesBase })` also refuses any plate or audio URL
not under `FILES_BASE`, so nothing hotlinks an archive (Wikimedia refuses app image loaders).
There are two buckets: MEDIA (private) and FILES (public, only `hauls/`, `shelf/` and `data/`; data stories, published by
`publishStory`, are described in `docs/DATA-STORIES.md`). `publishHaul` is the only Haul writer to FILES: it copies the assets from MEDIA into `hauls/NNN/audio/`, `hauls/NNN/plates/` and
`hauls/NNN/media/` (video posters and block pictures, `<item>-<n>[-poster].<ext>`), writes the share
card the Desk drew in the editor's browser (`hauls/NNN/vN/card.png`, kept only if it is a 1200 x 630
PNG; `Haul.card`), then writes `hauls/NNN/vN/haul.json` (immutable; an existing version is never overwritten) and
`hauls/index.json`, records `haul_versions` (with the Desk item ids the bundle carries, `item_ids`, 0011),
and for v1 only queues one push. A correction is a new
version with a `corrections` entry. Blocks are written in order with code `tokens` from
`highlightCode` (the readers only print them); year, handle, recipient and place go on the item, and
the edition (the editor's, else `editionOf(number)`) on the bundle and its index entry. Push uses FCM HTTP v1 with an OAuth assertion signed by
WebCrypto from the `FCM_SERVICE_ACCOUNT` secret; data carries
`url: https://fromthedumpsterfire.com/haul/<n>`; unregistered tokens are disabled.
A Book item linked to the shelf (`items.shelf_id`) is written with `Item.shelf`; the publish warns
(never refuses) when the published shelf does not have that book yet.

**Where an item stands, and the check before publishing** (2026-11-09, `packages/server/src/standing.ts`,
`workers/api/src/review.ts`, `@fdf/shared/prepublish`). Every item says, in words, whether it is on the
Desk, in a Haul not yet published, or published in version N (from `haul_versions.item_ids`; a version
published before 0011 is matched once from its bundle by bundle id or source link and the answer stored).
`GET /api/items` and `GET /api/items/:id` carry `standing`; `POST`/`DELETE /api/hauls/:id/items/:itemId`
add one item to the end of a Haul or take it out of a draft. `GET /api/hauls/:id/review` runs `itemIssues`
over each item (missing or platform maker, missing date, paywall teaser, a quotation from the piece set
as the editor's words, ambiguous or off-topic Wikipedia cards, unticked suggestions), and the Desk's
check page (`/haul/:id/check`) joins it with publish's dry run. `GET /api/hauls/:id/suggestions` feeds the
tick page (`/haul/:id/suggestions`). None of these checks blocks a publish; publish's own rules do.

**The shelf** (2026-10-24; `packages/server/src/shelf.ts`, publish in `publish.ts`, routes in
`workers/api/src/shelf.ts`, screens `apps/desk/src/screens/Shelf.tsx` and `Book.tsx`, migration
`0007_shelf.sql`; the contract is `Shelf` in `packages/shared/src/shelf.ts`). The books the editor is
reading, has read or put down, published apart from the Hauls because a book takes weeks. Tables:
`books` (the id is a slug of the title, unique, made once and never changed: it is the public address
`/shelf/<id>`; title text and italic, author, year, publisher, https url, status, started, finished,
spine, and the cover's MEDIA key, size and credit fields), `book_notes` (date, where in the book, the
editor's text, and for a dictated note its `notes` row, MEDIA key, format, seconds and whether to
publish the recording), `book_lines` (text, locator, position), `shelf_versions`, and
`items.shelf_id`. Rules, enforced on the server: notes are stored as the editor gives them; a
dictated note goes through `POST /api/notes` (Whisper, then the deletion-only cleanup) and the Desk
sends the words the editor accepted with the note's id. A status switch fills the obvious date
(read: finished today unless given; reading again: finish cleared); dates must be real and a finish
cannot precede a start. Lines are typed from the page; past 60 words a line is flagged, never
refused. A cover is uploaded or fetched through `guardedFetch` with a byte cap, measured, kept in
MEDIA under `books/<id>/cover-<id>.<ext>`, and follows the picture credit rule (`checkPictureMeta`,
`sourced`: credit, licence, maker, and for an upload where it was found). Only a Book item links to
a shelf book; a book a published Haul links to cannot be deleted.

**Publish the shelf.** `assembleShelf` builds the `Shelf` from D1: every book, notes newest first
(date, then when added), lines in order, ordered with `shelfOrder`; the cover and each recording the
editor chose to publish point at copies under `shelf/covers/<book>-cover-<id>.<ext>` and
`shelf/audio/<book>-<note>.<format>` (names unique per file, so copies are immutable and skipped when
present); `ShelfBook.hauls` comes from the published bundles themselves (an item's `Item.shelf`, or a
Book item linked after its Haul was published, found in the bundle by its id; a link the bundle
cannot show is a warning). `validateShelf(shelf, { filesBase })` runs last (covers and recordings
must sit under `FILES_BASE`), and its paths are rewritten with the book's title ("The Coal Question:
author: name the author"). `publishShelf` refuses on any problem, copies missing files from MEDIA,
writes `shelf/shelf.json` (fresh `updatedAt`, `max-age=60`) and records `shelf_versions`.
`shelfChanges` compares the next shelf with the published one ("Gravity's Rainbow: put down →
reading now; 1 new note.") for the Desk. Routes: `GET|POST /api/books`, `GET|PATCH|DELETE
/api/books/:id`, `POST /api/books/:id/notes`, `PATCH|DELETE /api/book-notes/:id`,
`POST /api/books/:id/lines`, `PUT /api/books/:id/lines/order`, `PATCH|DELETE /api/book-lines/:id`,
`POST` (multipart) `|PATCH|DELETE|GET /api/books/:id/cover`, `PUT /api/items/:id/shelf` (link or
unlink), `POST /api/items/:id/shelf` (make a shelf book from the item), `GET /api/shelf/preview`,
`POST /api/shelf/publish`.

### Over-the-air app updates

The reader app runs `expo-updates` against our own server, speaking the open expo-updates protocol 1
(no Expo account). `scripts/publish-app-update.ts`, run on the laptop, exports the Android JS bundle
and assets (`EXPO_PUBLIC_USE_SEED=0`), uploads each to MEDIA as `app-updates/assets/<sha256>`, signs
the manifest with the RSA key in `~/.config/fdf/app-updates/` (never on Cloudflare), and stores it
last as `app-updates/android/<runtime>.json`; it then fetches the live route, verifies the signature
against `apps/mobile/certs/certificate.pem` and every asset's hash. `workers/api/src/updates.ts`
relays the stored body and signature byte for byte, answers a phone already on the update with a
signed `noUpdateAvailable`, and serves assets as immutable downloads by hash only. The app refuses
any manifest its embedded certificate does not verify (checked: a manifest with a stale signature
was rejected on the emulator). The runtime version is the native fingerprint (`runtimeVersion:
{ policy: "fingerprint" }`, embedded in the APK as `assets/fingerprint`), so an update reaches only
the builds whose native code it fits; a native change (a new module, `app.json` plugin settings,
Firebase) needs a new APK. Phones check on launch and run a downloaded update from the next cold
start. `--rollback` stores a signed `rollBackToEmbedded` directive, which sends phones back to the
JS they were installed with. Losing the private key means no further updates for installed builds
until they install an APK carrying a new certificate, so keep a copy of it somewhere safe.

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

## Charts (2026-10-25, refined 2026-10-26)

A chart is an item block (`{ kind: 'chart', chart, images }`) carrying its data rows; a Chart item is
printed as the figure. The spec, the honesty validator, the renderer (twenty-one forms, a scene of
shapes with colours by role, labels placed so they never collide), the CSV and temperature-band
helpers, the map outlines (Natural Earth, India's point of view) and the share picture are in
`packages/shared/src/charts`; the Our World in Data and World Bank adapters (guarded, byte-capped,
licences as stated or refused) in `packages/server/src/charts.ts`. The website draws the SVG from the
rows per render (two widths, a container query picks one; scenes memoised per isolate). At publish the
Desk Worker draws each chart's app pictures (light and dark PNGs of the phone figure) and its share
picture with resvg WebAssembly (`packages/server/src/chartdraw.ts`, the module bundled by
`workers/api/src/draw.ts`, the app's font cuts from the Desk's assets) and writes them next to the
bundle under names that carry the chart's key; `POST /api/charts/share` draws a share picture to
download. The Desk compiles no WebAssembly. Details: `docs/CHARTS.md`.

## Agent and terminal editing (2026-10-24)

`npm run editorial -- ...` is a Node client of the same private API as the Desk UI. No parallel
D1 writer or publisher. Codex and Claude Code can capture, review, edit, preview and explicitly
publish from this machine or a remote checkout. Owner login uses cloudflared's application JWT;
remote sessions use Access service credentials. Access still signs a per-application assertion;
the Worker verifies RS256, issuer, audience, expiry and the service's signed `common_name`.
`ACCESS_SERVICE_CLIENT_IDS` enables exact clients; `ACCESS_SERVICE_PUBLISH_CLIENT_IDS` is a subset
with publishing permission. Unset means no machine access. Services cannot read settings/UI/files
or call DELETE; draft clients cannot call any publishing route. Existing CSRF and content-type
checks apply unchanged, with Origin and x-desk set by the client. No public routes were added.

Read-only client requests retry at most twice; writes never auto-retry because completion may be
unknown after disconnection. Credentials remain in private env/config files, redirects are refused,
responses are capped, and errors scrub configured credentials. The setup helper creates a dedicated
90-day Access service token and its Service Auth policy, preserves the owner policies, and saves
the secret privately; allowlisting and API deployment are separate activation steps. Setup may
use the separately authenticated cf CLI (`--cf-auth`), which refreshes its own OAuth login;
Wrangler login alone does not establish Access-management permissions. Instructions,
payloads, remote provisioning, rotation and revocation: `docs/EDITORIAL.md`.
