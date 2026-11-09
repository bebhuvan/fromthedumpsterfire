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

## 2026-10-17 (the Desk, after the editor's first real use)

- **Excerpts may run to two paragraphs** (the editor's call), capped at about a seventh of the piece
  and 250 words (`excerptCap` in `packages/shared/src/quoting.ts`). No statute sets a safe length;
  Indian fair dealing and US fair use both weigh the share taken, whether it substitutes for the
  original, and whether it serves commentary, so the guide is proportional and always sits beside
  the editor's note. The Desk warns past the guide and never blocks.
- **Long talks, podcasts, videos and papers get their big ideas** (3 to 7), drafted by the machine,
  each attributed by name and tied to a verbatim passage with its time or page, judged against the
  stretch around that passage, ticked by the editor. They print in the machine's blue sans; the
  passages are the multiple excerpts a long piece needs. Rejected: the editor rewriting every idea
  (too slow for a two-hour podcast) and printing machine summaries without a quoted source.
- **YouTube auto-captions are replaced by a Whisper transcript** when the audio is reachable:
  unpunctuated captions full of "uh" make quotes unprintable. Where only auto-captions exist, ideas
  print with their time, not the caption text.
- **Drafting moved to Claude Sonnet 5.5** after a side-by-side on real items (MODELS.md). About
  $0.03 to $0.06 a draft; the editor's rule is not to cut per-call quality for pennies.
- **Machine lines the checker cannot fully confirm are set aside, never shown** (status
  `rejected`), the same rule as prose that fails the house style. The "partly right, use the
  corrected version" flow is gone: it was the most confusing part of the first Desk.
- **Only what the editor ticks is printed.** Unticked notes, ideas and Wikipedia cards no longer
  block publishing; they are simply left out. Margin notes are fewer (zero to three) and must
  pass a "would a smart reader be glad to learn this here" test.
- **Further reading is chosen for a curious reader**, not from the entity list: two to four
  specific articles with a reason each, and the card shows the sentence of Wikipedia's own lead that
  matches the reason (verbatim), falling back to the first.
- **The item page is a sequence**: why it's here, the excerpt, the big ideas, the title, notes and
  further reading, a plate, then a plain list of what is missing. Redraft, refetch, details,
  connections and suggestions sit under More. On a phone the steps come before the source.
- **Types are labelled by what they are** on the Desk ("Article or essay", "Podcast or interview"),
  with the printed form each gives; capture no longer asks for a type.
- **Every link to the original names the person** ("Read Amy L. Scarpignato in The Conversation",
  "Watch Andrej Karpathy on YouTube"), from `sourceAction` in `@fdf/shared/haul`, on the site and
  in the app.
- **More ideas for long recordings, in their order** (the editor's call): about one per fifteen
  minutes, three to twelve (`ideaCount`), at least a quarter from each third of the piece, stored and
  printed in the order the piece makes them, so a long podcast item reads as a map of it. The
  editor ticks the few worth printing; proposals cost nothing.
- **The editor's take on an idea**: one line in their own words (typed or dictated), printed beside
  the idea in their serif and signed. Never sent to a model; adding one ticks the idea. Chosen so a
  long item is a conversation between the editor and the piece, not a note followed by an appendix.
- **Start here** for long items: a time or page and a few of the editor's words, printed under the
  byline, linking to the moment on YouTube (`&t=`); other hosts have no deep link.
- **Rough transcripts print times, not words**: any speech transcript without punctuation (fetched
  auto-captions or an uploaded VTT of them) keeps its ideas' quotes on the Desk as evidence and
  prints only the time.
- **The Desk is phone-first** (the editor reads and writes there most): a bottom bar for sections,
  and on an item the work and the piece take turns full screen instead of a scroll box beside the
  steps. A wide screen keeps both columns.
- **Over-the-air updates are self-hosted, signed on the laptop** (2026-10-17): `expo-updates` with
  the open protocol served by the Desk Worker from MEDIA, rather than EAS Update, to keep the app on
  Cloudflare with no Expo account. Code signing is on, with the private key only on the laptop, so
  control of the Cloudflare account alone cannot ship code to readers' phones. Runtime version is
  the native fingerprint, not the app version, so a forgotten version bump cannot send JS to a build
  it does not fit.

## 2026-10-18 (sources that refuse Cloudflare)

- **Platform routes before the page, the Wayback Machine after a refusal.** Substack (post API,
  then feed), WordPress (REST API) and Medium (RSS) give the post alone with its real title,
  authors and date, and often answer when the page refuses Cloudflare's servers. When the site
  still refuses, the Internet Archive fetches the page from its own servers: its latest copy, else
  a Save Page Now capture. Manual paste and PDF upload stay as the last resort. Rejected: paid
  scraping APIs, residential proxies, solving or dodging bot checks, and disguised user agents for
  these routes (APIs, feeds and the archive are asked as the Desk).
- **Free content only.** A paid or members-only post, or a feed or archived copy that carries only
  the preview, fails the fetch with a plain "paid subscribers" message. Its preview is never stored
  as though it were the piece, and no other copy is sought.
- **Except the editor's own saved copy (2026-10-25).** Much of what the editor shares is paywalled,
  and the editor has usually saved the whole piece already in Readwise Reader or Instapaper. When a
  fetch fails as paid (or the editor asks, "From my library"), the Desk reads that saved copy
  through the editor's own API tokens (`packages/server/src/library.ts`) instead of making the
  editor paste it. It is the same text a paste would give; the rule against seeking copies still
  holds for everything else (no mirrors, no other people's copies, no scrapers). The text stays
  private like every source; readers get only verified excerpts within `excerptCap` and the link to
  the original. Instapaper's API terms allow parsed text only for display to the user who saved it,
  never republication, which is how the Desk uses it. A copy under 400 characters is treated as a
  preview and refused; an Instapaper copy it marks as possibly paywalled carries a note to check it.
- **The item keeps the original link.** The source records where the text came from (`meta.via`:
  route, label, API/feed/archive URL, capture time), and the Desk shows it under the source.
- **WordPress by slug only after a refusal.** Most sites are not WordPress, so a blind REST call on
  every link is waste; a page that answers says whether it is WordPress (`api.w.org`), and
  wordpress.com blogs are known from the host. A `/p/<slug>` path is tried as a Substack custom
  domain before the page, since those refuse the page as often as substack.com does.
- **Save Page Now anonymously**, polled for at most 90 s inside the fetch step. An archive.org
  account (SPN2 keys) would lift the anonymous rate limit but adds a secret; not needed so far.

- **Pages are read by Defuddle, Readability as the fallback.** A side-by-side on 19 real pages
  (Substack, essays, blogs, The Guardian, BBC, The Hindu, Scroll, Aeon, Quanta, Wikipedia,
  Wikisource): the same words within about 3 per cent on most, with Defuddle leaving out share
  bars, keeping paragraphs whole where Readability split footnote markers into their own lines,
  and finding author names where the page meta had a profile URL. Readability is used when
  Defuddle finds under 60 per cent of its text. Defuddle's async extractors stay off
  (`useAsync: false`), since they would fetch third-party APIs outside `guardedFetch`. Before
  either reader runs, dialogs, pop-ups, `[hidden]`/`v-cloak` boxes, print-hidden and "also read"
  boxes are removed, and exact furniture lines ("Share", "Subscribe", "No posts") are dropped
  from the stored text. Rejected for now: Scrapling (its value is bot-check evasion and browser
  fingerprints, which the fetch rules exclude, and it is Python with a browser, not a Worker).

## 2026-10-24 (launch day: editions, the eclectic magazine, rich media)

- **Every kind of artifact, each in its printed form.** The magazine carries quotations, letters,
  speeches, social posts (X, Bluesky, Substack Notes and the like), pictures (artworks, photographs,
  memes), books and tools, as well as essays, talks, papers, poems, passages and rabbit holes. New
  forms: epigraph, the letter, clipping, mounted print, jacket, specimen label; a speech is set as a
  transcript. Two swatches join (lilac, aqua) rather than one per type: types that share a family share
  a colour.
- **Posts are set as clippings, never the platform's embed.** Embeds load third-party script (the CSP
  forbids it) and break when a post is deleted; the text is matched against the fetched post like any
  excerpt.
- **Each Haul has an edition ink and a fingerprint** so a reader knows which Haul they are in at a
  glance. The huge pastel ghost number is gone from the cover: the editor found the home page tame and
  the numeral a stock magazine gesture. The fingerprint is information (what the Haul holds and how
  far back it reaches), not decoration. Square-root scale of years ago, chosen over linear (recent
  things crushed together) and log (too much empty line for a Haul of old things).
- **The masthead is an editor's correction**: a hand-drawn ember strike and a proofreader's caret,
  because one editor approves every line. Masks, so the marks follow the theme.
- **Rich media are blocks on an item**, not new item types: pull quotes and code are excerpts (verified
  word for word against the source); video and podcast players come only from YouTube (nocookie),
  Vimeo (dnt), Spotify and Apple, whose embed addresses code builds from the editor's link
  (`embedSrc`); the CSP's frame-src names exactly those. Code is highlighted once at publish
  (highlight.js, folded into ten roles), so neither the site nor the app ships a highlighter.
- **Code is set in DM Mono** (OFL, about 15 KB a cut): quieter than the usual developer monospaces and
  close in colour to Schibsted. The app uses the system monospace to avoid a native change.
- **Share cards are drawn in the editor's browser at publish** (canvas), because the Workers free plan's
  10 ms CPU rules out rendering images on the server.
- **Credit is a house rule, enforced in code** (the editor: "Full credit, always name the people…
  the entire driving philosophy … is to highlight the work of other people"). Every picture names who
  made it ("Unknown" only when nobody can say) and, for an upload, where it was found; a credit line
  (maker, holder, licence, a link back) prints under every picture on the site and in the app. It is
  the first of the About page's house rules. Memes and other copyrighted pictures are shown for
  commentary with that line.
- **The mark is the internet on fire**: one ember flame with the globe cut out of it (the editor's
  pick, G4, from comps of the caret, the struck word, the name alone and the globe).

## 2026-10-25 (the chart kit, built overnight; the editor to review)

- **Charts are drawn by us from data, not embedded.** A chart is an item block carrying its rows, and a
  chart-led find is a Chart item printed as the figure. Our World in Data and World Bank charts are
  redrawn from their data (both CC BY 4.0, with each producer's own licence credited); someone else's
  chart as it stands comes in as a picture under the credit rule. Rejected: embedding their
  interactive charts (third-party script, breaks with them, the CSP forbids it).
- **Honesty is code.** `validateChart` gates the Desk, publish and `validateHaul` alike: sources and
  licences, zero baselines for bars and areas, no dual axes, 3D or pies, stated bases and
  denominators, real or nominal money, the window against the source's span, uncertainty and sample
  sizes shown when the data has them, missing values drawn as missing, and figures in machine text
  traced to the rows. No model touches a chart.
- **No pies.** The waffle does parts of a whole; the validator refuses a pie by name. (The brief allowed
  a pie of a few slices; angles compare badly and a waffle of the same parts is as quick to read.)
- **One loud colour per chart is the Haul's edition ink**, so a Haul's charts belong to it; categorical
  colour (six validated hues, never machine blue or ember) only when every series matters.
- **The website draws SVG on the server; the app shows pictures drawn at publish on the editor's side.**
  The app stays without an SVG runtime, and the Workers free plan rules out rasterising on the server
  (as for share cards), so the Desk (browser) and the terminal draw the light and dark PNGs with resvg
  WebAssembly and the app's own fonts, and publish accepts them only under the chart's key. The Desk's
  CSP allows `'wasm-unsafe-eval'` for this, and only this. Rejected: drawing with Views in the app
  (areas and ridges need polygons Views cannot draw well; two renderers would drift).


## 2026-10-26 (the chart kit, refined)

- **Chart pictures are drawn on the server at publish** (supersedes the 2026-10-25 decision to draw
  them on the editor's side). The editor moved to Workers Paid, which removes the CPU reason. Measured:
  each chart's two app pictures take 0.1 to 0.7 s of CPU with resvg's WebAssembly, the Desk Worker
  bundles to 1.85 MB gzipped, and a publish with a chart took 1.2 s on a local workerd; the paid plan
  allows 30 s of CPU per request and 10 MB per Worker. So the Desk Worker draws the app's pictures and
  each chart's share picture from the chart itself: the Desk drops `'wasm-unsafe-eval'` from its CSP
  and the 2.4 MB download, the terminal stops drawing, and publish no longer has to trust pictures a
  client sent. Picture files carry the chart's key in their names, since `hauls/` files are cached as
  immutable. Rejected: drawing in the pipeline Worker (a service hop for no gain; publish already runs
  in the Desk Worker).
- **Every chart gets a share picture** (1080 px wide): the Haul's ink, the flame and the struck
  masthead drawn from the website's own marks, the title, note, head line, the phone figure, glosses,
  credit and address. Downloadable on the Desk before publishing, from `chart-draw`, under each chart on
  the site (and the og:image of a Chart item), and shared from the app.
- **Colour is neutral first.** Greys and ink carry context, the edition ink marks the story, a second
  colour only when a comparison needs it. The default sequential ramp is one cool hue; warm colours are
  kept for heat and a heat ramp is allowed only for temperatures (a validator rule); a temperature's
  departure from normal is shown on the diverging ramp. Ramps are generated in OKLCH and validated; the
  lowest step of every ramp clears 2:1 against the ground (only the diverging middle sits near it), so
  no value reads as a gap. Rejected: the multi-hue butter-to-oxblood ramp (the weather page read as one
  muddy colour) and a diverging ramp with a near-white cool end.
- **Warming stripes take a continuous ramp** (41 steps interpolated in OKLab between the 11 validated
  ones), so every year is its own shade as in Ed Hawkins's original; diverging bins elsewhere are sized
  to the bulk of the values with open, pointed end bins in the key, so one outlier cannot flatten the
  rest.
- **Labels never collide, by construction and by test.** One placer for every form, leaders before
  dropping, halos over gridlines, brackets where slope values coincide, area names only where they fit
  inside their band at every point; a test renders every fixture at both widths and its share card.
- **The credit is one line**: each maker once, via the redistributor, each licence once ("both CC BY
  4.0"), the date.
- **Five forms added, chosen over others**: histogram, a tile map of India, a world map, price and
  drawdown, a table with sparklines; and values in a heatmap's cells (a calendar of returns). A
  timeline, a population pyramid, a treemap, a Sankey and a connected scatter were judged not to earn a
  place yet (no open events data for a real timeline; the other forms cover parts and change).
- **The world map follows India's official depiction** of its boundaries (Natural Earth's India point
  of view, public domain), in the Equal Earth projection; Indian states are shown as an equal-tile grid
  rather than a boundary map, which also keeps a small state as visible as a large one. Rejected: the
  default de facto Natural Earth lines, and a state boundary map (no openly licensed boundary file that
  matches India's depiction was found to record).
- **Money's diverging colour is mirrored (2026-10-26):** on a chart with `measure.money`, a fall is red and
  a rise is blue. Temperatures keep blue for cooler, red for warmer. Rejected: red and green (colour-blind
  readers cannot tell them apart) and one convention for every chart (a red gain reads as a loss).

## 2026-10-27 (Lives: a profile of one person per Haul)

- **A new recurring section, Lives**: one person per Haul, a profile written by a model from named,
  fetched sources, with the editor's note on top (the editor asked for it: "should we create a new
  category of style for, let's say, interesting people? … every Haul"). Sukumar Sen is the first. The
  name is the session's, after Plutarch's *Lives* and Aubrey's *Brief Lives*; it is one string
  (`typeLabel.life` in tokens.ts). It shares lilac with the letter and the book (a person's things).
- **A long piece of machine prose is new for the magazine, so every line carries its evidence.** The
  profile is stored as lines (sentences, the epithet, each date, each figure), each citing one or more
  stored sources with a quote. Code finds every quote word for word in the fetched text (no match, no
  ship); every number in a line must be in its quotes, rounded no finer than written, figures spelled
  as words included (fail-closed, as chart annotations are traced to rows); headings are labels with no
  figures in them; every line passes `checkStyle`. A draft that fails any of these is refused whole,
  so the writer fixes it rather than the Desk guessing which half to keep. The judge then reads each
  line against its quotes and the text around them; whatever it does not call "supported" (or an error,
  or no verdict) is set aside unseen. The editor keeps or cuts each line and approves the whole; any
  change clears the approval; publish checks it all again against the stored texts.
- **The label is generated, never typed**: "Written by Claude from Ramachandra Guha’s *India After
  Gandhi*, the Election Commission of India’s *Report…*" comes from the sources the printed lines cite
  (`lifeByline`), and a source that no printed line cites drops out of it. The bundle refuses a listed
  source nothing cites, a line without a citation, and a source that does not name its maker.
- **The quotes stay on the Desk.** The bundle carries each line's source and place (a page, "PDF
  p. 78"), not the passages: forty passages from one chapter would add up to more of Guha than the
  excerpt guide allows. Readers get the sources named in the margin and linked in "Written from".
- **Sources are fetched by the Desk, never supplied as text.** A Life names its sources (maker,
  title, kind, where it was read, the work itself); the Desk fetches each through the article fetch
  order and keeps the text privately. A source too large or slow to fetch (the 1955 report is a
  24 MB scan that took 102 s to download) can be uploaded by the editor and is read in place of the
  link, which stays the source readers see, as for any item's PDF.
- **Long machine prose takes a deeper blue** (`machineText`: `#2B3593` light, `#C3C8FA` dark, about
  10:1 and 12:1 on the ground against 6:1 and 9:1 for the margin blue). The editor found the margin
  blue hard to read at length. It stays blue and stays sans, so the rule that blue sans is the machine
  holds. Rejected for now: setting the profile in ink with a blue rule down its edge (the easiest to
  read, but the page would stop looking like machine text at a glance). Both were shown to the editor.
- **The portrait is the item's plate**, chosen through the existing picture route with its maker,
  holder and licence and copied to our files at publish. Sen's is the National Archives (UK)
  Colonial Office photograph of 1953 (CO 1069/14, Open Government Licence v1.0), shown as the file
  sheet it was found on. The page is complete without one.
- **Profiles are written in an editorial session for now** (`npm run editorial -- life`, `life-draft`),
  with the writer recorded, as session-written margin notes are. No pipeline drafter yet: one profile
  per Haul is a session's work, and the rules above hold whoever writes it.
- **Unknown makers are credited without "By"**: "Unknown photographer, 1953." (`creditLine`).

## 2026-10-31 (X posts inside an item; the licence)

- **A post inside an item is a clipping we draw, never X's embed.** The editor wanted the Chainalysis
  and Joe Weisenthal posts at the end of the Binance item "so that it shows the tweet preview". X's
  widget needs its script on the page (the CSP is `script-src 'self'`), tracks readers, and the app
  has no web views, so the `post` block takes the words, author and date from X's public oEmbed and
  the site and app set them as the clipping form, smaller. Rejected: X's embed; a screenshot of the
  post (a picture of words cannot be checked, searched or read aloud).
- **X's own record is the source, and it is sometimes short.** oEmbed ends long posts with "…" (the
  Chainalysis post stops at "From 2021…"). The block prints what X gives, says it is the start, and
  links to the rest. The editor's pasted copy of the full post is not used: a post's words come from
  a fetch, as every excerpt does.
- **Words written for the magazine are CC BY 4.0, commercial use included** (the editor's choice):
  a line in the website's footer and at the foot of the app's About, from `LICENCE` in
  `@fdf/shared/about`; `rel="license"` on the link. Quotations, excerpts, pictures and every other
  work shown stay with their makers under their own terms. No separate licence page (the editor: a
  footer mention is enough).

- **Cloudflare Web Analytics is allowed through the CSP (2026-11-01).** The edge injects its beacon into
  every HTML page for browsers, and `script-src 'self'` blocked it, so the dashboard saw nothing. The
  CSP now names `https://static.cloudflareinsights.com` (script) and `https://cloudflareinsights.com`
  (reports) and nothing else from outside; it is cookieless and we add no script of our own for it.
  Rejected for now: counting views in the Worker with Analytics Engine (no third-party script, but no
  dashboard and weaker bot filtering).

## 2026-11-08

- **Excerpts may run longer: up to 400 words and a fifth of the piece** (was 250 words and about a
  seventh; the editor: "can we use some bigger quotes … falls under free use"). `EXCERPT_MAX_WORDS` and
  `EXCERPT_MAX_SHARE` in `packages/shared/src/quoting.ts`; the pipeline now proposes passages of up to
  four consecutive paragraphs. Still proportional (a short post gives a fifth of itself, not most of
  it), still a guide beside the selection that warns and never blocks, still always beside the
  editor's note and a link to the original. Rejected: a quarter and 600 words (the quote starts to
  stand in for the original, the factor fair use and fair dealing weigh most) and no guide at all.

## 2026-11-09

- **A paper's passage comes after the editor's note, set as a quotation.** The offprint printed the
  excerpt first, as its "abstract", in the body serif, so readers took the paper's words for the
  editor's (the editor, on Haul 002's fertility and press-gang papers). It now sits under "From the
  paper" as an extract with its rule, opening mark and credit, the way the opening form sets one.
  Rejected: keeping it on top restyled (the editor allowed it, but every other form leads with the note).
- **Further reading names the piece's own subject first, and an ambiguous title is never guessed.**
  The "specific over general" rule had left Linux off a piece about Linux, and a bare "Dilettante"
  (a Wikipedia disambiguation page) fell through to search and became a record label. The prompt now
  puts the subject's own article first and asks for Wikipedia's bracketed titles; `resolveWikiTopic`
  drops a title Wikipedia lists as ambiguous (`exactOutcome`). Rejected: picking the first article
  on a disambiguation page (often the wrong sense) and a second model call to judge each card (cost
  for something the editor ticks anyway).
- **Every item says where it stands, and each published version records its items.** The editor added
  two items to Haul 002 and could not tell whether readers had them. Items now say *On the Desk*, *In
  Haul N, not yet published* or *Published in Haul N, version V*, worked out from a new
  `haul_versions.item_ids` (0011) written at publish; older versions are matched once from their
  bundle and the answer stored. Rejected: matching by bundle slug on every request (breaks when an item
  is retitled after publishing, and reads R2 for every tray load) and comparing timestamps (an item
  added after publishing and an item edited after publishing look the same).
- **A check before publishing that advises, never blocks.** `@fdf/shared/prepublish` looks for what
  publish allows but the editor would want to know: a platform credited as the maker ("Substack"), a
  missing date, a paywall teaser stored as the piece, a whole paragraph of the editor's note that is
  word for word from the piece but not on a `> ` line (it would print as the editor's words), Wikipedia
  cards that are disambiguation pages or not mentioned in the piece or the note, and unticked
  suggestions. Each is *Fix* or *Look* with a link to the step. Rejected: making them publish errors
  (an institution can be its own maker, a sentence can be shared by chance, and a card not named in the
  piece can still be the right rabbit hole).
- **Ticks show at once.** Ticking a note, idea or card, and reordering a Haul, update the screen before
  the Desk answers and go back with the reason if refused. Rejected: keeping the wait-and-reload (the
  editor's "janky" on a phone network is mostly this).
- **The Desk follows Salvage, adapted for a tool** (the editor approved the comps in
  `docs/design-comps/2026-11-09-desk/`). Lines and space instead of tinted rounded boxes; square
  buttons, and only the next step looks like one; the editor's part marked *B.* in ember and the
  machine's part MACHINE in blue, as the site's transcripts do; settled steps fold to one line.
  Rejected: a restyle of the old twelve-step page (the length, not the paint, was the problem).
- **The machine's offers are answered one at a time: Keep or Skip.** Keep prints the line; Skip
  sets it aside (`cut`), Back undoes. Only what the editor keeps prints, as before. Every line stays
  reachable on the item page to edit or tick. Rejected: printing offers unless skipped (it would
  turn the editor's tick into an opt-out).

- **The Play Store build is made on the editor's laptop, signed with an upload key kept outside the
  project, with Play App Signing holding the key readers' phones check.** The key is
  `~/.config/fdf/play/upload.keystore` with its passwords in `keystore.properties` beside it (both
  readable only by the editor's account); `apps/mobile/plugins/release-signing.js` adds it to the
  generated Gradle file, so Continuous Native Generation still owns `android/`.
  `npm run build:android:play` makes the `.aab` with the sample Hauls switched off. The first upload is
  by hand in Play Console (Google's API cannot create an app's first release). Rejected: EAS Build and
  EAS Submit (an Expo account and cloud builds for something this laptop already does, and the app
  already keeps its updates off Expo's servers); keeping the debug key (Play refuses it, and anyone
  holding the debug key could sign an "update").
- **Unused Android permissions are blocked** in `app.json`: drawing over other apps and shared
  storage, which libraries ask for and the reader app never uses. Play reviewers question both.
- **Turning notifications off deletes the phone's token on the server**, and the phone sends that
  refusal again at next launch if the server missed it. Rejected: keeping the row marked off (nothing
  should be kept for a reader who said no, and the privacy page can then say so plainly).
- **A privacy page at `/privacy`**, linked from the footer and given to Google Play as the app's
  policy. It describes what the code does; change it with the code.
- **Hauls by email go through Substack** (the editor's choice). Substack keeps the list and sends one
  email per Haul; the editor writes each email there. `/subscribe` shows Substack's own form in a
  frame from the one origin in `NEWSLETTER` (`apps/web/src/lib/newsletter.ts`, which accepts only a bare
  https origin), and the CSP's `frame-src` gains that origin and nothing else; no Substack script runs
  on our pages. Linked quietly from the footer, About, the foot of every Haul, the empty home page and
  the app's Menu (which opens the page in a browser tab). Rejected: running our own mail (deliverability
  and upkeep for a small list); Buttondown, which could send from the RSS feed by itself (the editor
  preferred Substack to start; both export the list, so moving later is easy); putting the reader's
  address in a link to Substack (personal data in a URL).

## 2026-11-09 (design: the proof sheet)

- **The editor chose "Proof sheet + slips" from `docs/DESIGN-REVIEW.md`** (three directions: proof
  sheet, scrapbook by source, auction catalogue). Salvage is tightened, not replaced. Built: reading
  size 18px on phones and 19px on desktop (was the reverse; 19px on a phone gave about 39 characters a
  line); checked extracts as **salvage slips** (plate grey, torn top edge, credit and the machine's
  check on a stub); quotations inside the editor's writing as **book quotations** (indented, hanging
  mark, no rule); a **salvage tag** (number, kind, where from, length) on the item heads.
- **"Matched word for word" is set in the machine's blue sans.** It is the machine's claim about the
  words, not the source's words or the editor's, so by the house rule it is blue.
- Rejected for now: the scrapbook (a form per source: tear sheets, letters, printouts), kept as a later
  step for the commonest kinds once the Desk records the kind of source; the auction catalogue (pulls
  the forms toward one template). Not yet built from the proof sheet: one modular type scale, and the
  date the editor picked an item up in the tag (needs the capture date in the bundle, a shared schema
  change for the Desk session).

## 2026-11-09 (design: signatures)

- **Seven signatures, all built at the editor's word ("All seven")**: the ledger, the date stamp, the
  page that burned, taped plates, an ornament per edition, the archive as a card drawer, the slug and
  the neighbours (DESIGN.md, Signatures). The aim, the editor's: some of the old internet's magic, when
  sites did not all look the same, "within our own language". Rule kept: each signature lives in one
  place and means one thing, and the weirdness comes from the magazine's own objects, not the old web's
  costume. Rejected: hit counters, marquees, cursor trails, animated GIFs (nostalgia, not character).
- **The ledger's counting rule lives in `@fdf/shared/ledger`** (a small new shared module, tested) so the
  website and the app count the same words. Code blocks are not counted (neither prose nor quotation).
- **Ornaments are drawn marks, not font glyphs**: the Newsreader subsets lack fleurons, and a fallback
  font drew the hedera as a red emoji in a test.

## 2026-11-09 (the field note continued)

- **A long field note sets its opening on the cover and continues on its own page.** The editor: his
  notes run long (Haul 002's past 4,000 words) and readers "might miss the other items that I've
  actually worked hard to curate". Measured: the contents began about 31 phone screens down. The cover
  now stops at a paragraph after about 450 words (`noteLead`) with a "Continued" line to
  `/haul/<n>/note`, a new website page at the address the app's deep link already used (the old
  redirect to `#field-note` is gone). Rejected: a "Read more" fold in place (a 5,000-word note unfolding
  on the cover buries the contents again, and folded text is easy to miss); contents before the note
  (the editor's letter is the front page of each issue); asking the editor to write shorter.
