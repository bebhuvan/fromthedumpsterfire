# The chart kit: the night's report (2026-10-25)

Branch `charts-kit` in `.claude/worktrees/fdf-charts`. Nothing is deployed, pushed or merged.
`npm run verify` passes (typecheck and 617 tests). The system is described in `docs/CHARTS.md`.

## What is done

- **Sixteen chart forms**, drawn by one renderer for the website and the app: line, small multiples,
  stacked area, bars and columns, dot, dumbbell, slope, scatter, bump, warming stripes, a
  temperature band after the New York Times weather chart, calendar, heatmap, ridgeline, beeswarm and
  waffle. Each has a real-data fixture and tests. Annotations (callouts, named periods, reference
  lines) are a layer of the chart. Labels sit on the lines instead of legends.
- **The honesty validator** (`validateChart`): sources and licences, zero baselines, no dual axes, no
  3D, no pies, no rainbows, stated bases and denominators, real or nominal money, the window shown
  against the source's span, uncertainty and sample sizes shown when the data has them, missing values
  drawn as missing, every figure in machine text traced to the rows. Each rule has a test. It runs on
  the Desk before a chart is kept, at publish, and in `validateHaul` before a bundle renders.
- **Data in**: CSV or TSV (pasted, uploaded or from the terminal), Our World in Data (a chart link)
  and the World Bank (an indicator and country codes), each with the licence as the institution states
  it, or refused. Someone else's chart as it stands goes in as a picture under the credit rule.
- **The Desk**: a chart editor with a live preview at both widths, the glosses and the validator's
  errors as you edit; Keep, Edit; charts in the Haul preview; app pictures drawn at publish.
- **The terminal**: `chart`, `chart-edit`, `chart-fetch`, `chart-csv`, `chart-check`, `chart-draw`,
  and `publish` draws the app pictures. An end-to-end test keeps a chart and publishes it through the
  real Worker code, and finds the PNGs next to the bundle.
- **The website**: charts drawn as SVG on the server from the rows, a wide and a phone figure chosen by
  the column's width, "Figure n", the editor's title and note, the units line, the machine's glosses in
  blue, the credit, and the numbers as a table. A Chart item is printed as **the figure**, and its
  cover specimen is its own chart drawn small. Charts are in the site's Markdown for LLMs too.
- **The app**: the chart as published pictures (light and dark) kept offline with the bundle, native
  title, note, glosses, credit and table; the figure form and specimen. JavaScript only; no native
  change.
- **Comps**: `docs/design-comps/charts/` (four pages, every form, real data), screenshots in `shots/`
  at 390 and 1280, light and dark. The dev sample Hauls carry charts (Haul 003, "A year of Delhi's
  heat"; Haul 002, a bar chart).

## Checked, with evidence

- The Desk's own drawing code, run in headless Chrome under the Desk's exact CSP: draws both sample
  charts (1125 × 1293 px) in 1.3 s. Without `'wasm-unsafe-eval'` the browser refuses it, so the CSP
  change is needed.
- The website, built and run on the local Worker with the samples: the chart page and the cover render
  in light and dark at phone and desktop widths (screenshots looked at).
- Chart colours run through the dataviz palette validator in both themes (results in CHARTS.md).
- Website CPU: one fix took the heatmap from 827 ms to 5 ms. The heaviest chart is now about 15 ms cold
  for both widths, and a chart is drawn once per isolate.
- An independent review of the branch (security and correctness) found five small issues, all fixed
  with tests: no byte cap on a chart before it goes into D1, malformed tables crashing the validator
  instead of being refused, colliding OWID column keys, OWID's fetch limit ignoring the cells limit,
  and unescaped source links in the site's Markdown. It found no SSRF, publish-path or escaping
  problems.
- Provider endpoints and licence fields fetched live on 2026-10-25 (OWID chart API and indicator
  metadata, World Bank API v2 and series metadata, both licence pages).

## Not done, or not verified

- **The app has not been seen on a device or emulator.** It typechecks and its tests pass. Layout,
  image sizing, `File.downloadFileAsync` and the table widths need a look in a dev build.
- **The Desk editor has not been used against a running Desk.** Its draft logic is tested (every comps
  fixture opens and saves back unchanged and valid), and the drawing was tested in a browser.
- The figure check reads digits, not numbers written as words ("doubled", "five"); machine text with
  such words would pass it. No model writes chart text yet, so this matters only when one does.
- Not built: horizon charts and marimekko (neither earned its place tonight), daily or monthly World
  Bank series, model-drafted annotations (the gates for them exist: `by: 'machine'` text must pass the
  style check and cite only figures in the rows).
- Known rough edges, from looking at the comps:
  - Scatter and beeswarm drop a label when there is no free place (Sri Lanka on the phone scatter).
  - Slope leaders bunch when many values cluster.
  - Gridlines run behind value labels.
  - Point callouts sit close to wide marks.
  - The heatmap's 4 °C bins mostly show the seasons, not the years.
  - The Desk preview uses the Haul number's default edition ink, not a chosen one.

## Judgement calls (and why)

- **The app shows pictures, not native drawing.** Areas, ridges and bands need polygons that Views draw
  badly, and two renderers would drift. The free plan's CPU rules out drawing them on the server, so
  the editor's side draws them at publish, with the app's own fonts, and publish takes them only
  under the chart's key. The cost is a 2.4 MB WebAssembly file the Desk loads only when publishing
  charts, and one CSP word.
- **No pies at all**: a waffle is as quick to read and honest about parts. The brief allowed pies of a
  few slices; say if you want them back.
- **The loud colour is the Haul's edition ink**, so a Haul's charts look like that Haul's. Categorical
  colour (six hues) only when every series matters.
- **A Chart content type**, coloured sky (shared with Rhymes), printed as the figure. "Figure n" has
  its number in ember, as the cover's route cites items.
- **Minus signs are en dashes**: none of the chart fonts has U+2212. Rupee charts use Indian digit
  grouping (12,34,567).
- **Strict on uncertainty**: a column that looks like a bound or a sample size must be shown or
  removed. This can refuse an innocent column named "Lower house"; rename it.
- **Code-written lines are style-checked but not figure-checked**: their numbers are computed from the
  rows by code, not drafted.
- **Fixtures trimmed honestly**: OWID's temperature series runs to a partial 2026; the comps stop at
  2025 and the chart says the source runs to 2026.

## For you to decide

1. **The website's CPU on the free plan.** Most chart pages are fine; a page with a heavy chart (a
   ridgeline of thousands of values, a big beeswarm) can take 10 to 20 ms of CPU the first time an
   isolate draws it, over the free plan's 10 ms. Either keep charts modest (summarise first), or move
   the site to Workers Paid ($5 a month), which also lifts the reason share cards and chart pictures
   are drawn in your browser.
2. **Open-Meteo** (used in the comps for Delhi's weather) says its free API is for non-commercial use.
   Fine for a non-commercial magazine; confirm, or use IMD or NOAA station data for published charts.
3. **The Desk CSP change** (`'wasm-unsafe-eval'`).
4. **Pies** (none) and **sky** for the Chart type.
5. **When to ship**: merge `charts-kit`, then `npm run deploy:production` (Desk: routes, editor, CSP),
   `npm run deploy:web`, and `npm run app:update` for the app (JavaScript only). No migration.

## Taking tomorrow's charts in

The kit is on this branch only. To use it on the production Desk tomorrow, merge and deploy first
(item 5 above). Without deploying, the terminal commands `chart-csv`, `chart-check` and `chart-draw`
work locally on this branch.

For each chart:

1. **Get the numbers, not the picture.**
   - From one of your own data sites: export the table behind the chart as CSV.
   - From Our World in Data: the chart's link is enough; choose the places.
   - From the World Bank: the indicator code (on the indicator's page, like `NY.GDP.PCAP.KD`) and ISO
     country codes.
   - Anything else: a CSV, plus the maker, the dataset's name and link, the licence as they state it,
     and the full span of the source.
2. **On the Desk**: make (or open) the item. For a chart that stands alone, set the type to **Chart**.
   Add, Chart; bring the numbers in; pick the form.
3. **Write the title and the note** in your words. Say what the numbers are (absolute, per person, a
   share of what, a rate per how many, an index or anomaly from what base, money nominal or real at
   which prices) and where they are about.
4. **Make one thing loud** (focus) if the chart has many series; add a callout or a named period if
   the story needs one.
5. Read the preview and the blue glosses; **Keep** when the errors are gone.
6. **Publish** the Haul from the Desk. It draws the app's pictures first.

From the terminal, the same in four steps:

```sh
npm run editorial -- chart-fetch --data source.json --out data.json   # or chart-csv table.csv
# write chart.json around the rows: form, title, note, units, geography, measure, sources, span, encode
npm run editorial -- chart-check --data chart.json                     # fix what it says
npm run editorial -- chart it_ITEM --data chart.json
```

The fixtures in `docs/design-comps/charts/data/` are complete, valid examples of every form to copy
from.

## Refinement, 2026-10-26

From `docs/CHARTS-REFINE-BRIEF.md`. Nothing is deployed, pushed or merged. `npm run verify` passes
(typecheck and 729 tests). The system as it now stands is in `docs/CHARTS.md`; the decisions and
their reasons in `docs/DECISIONS.md` (2026-10-26).

### Before and after

Last night's screenshots are in `docs/design-comps/charts/shots/before/`; today's are in `shots/`
(six pages and the share pictures, 390 and 1280, light and dark). Compare, for instance:

- `before/weather-1280-light.png` with `weather-1280-light.png`: four warm charts that read as one
  muddy colour became a quiet grey band with a fine bar per day, stripes where every year is its own
  shade with weight at both ends, and a calendar and a heatmap that show each day's and each month's
  departure from its normal in blue and red.
- `before/time-1280-light.png` with `time-1280-light.png`: the stacked area no longer has "Hydro"
  sitting on its neighbour; solar is the one loud part, the rest are greys.
- `before/compare-390-light.png` with `compare-390-light.png`: Sri Lanka is labelled on the phone
  scatter (on a leader), slope labels no longer fan into a knot, the callout keeps clear of its dot.

### What changed

1. **Colour.** Neutral first; the brief's rule is now code. New ramps generated in OKLCH and run
   through the dataviz palette validator in both themes, with the results in `docs/CHARTS.md`: a cool
   one-hue sequential default, a heat ramp the validator allows only for temperatures, a diverging
   ramp whose first tint on each arm clears 2:1 against the ground and whose arms stay apart for
   colour-blind readers (worst ΔE 12.3) and for everyone (16.6). Diverging bins are sized to the
   bulk of the values, with open, pointed end bins in the key. The weather fixtures now show
   departures from normal.
2. **Warming stripes** take a 41-step continuous ramp and the Met Office's own HadCRUT5 series
   against 1961–1990 (as Ed Hawkins draws them); no seams, no near-white years.
3. **Temperature band**: grey record and normal ranges, a day's bar half a day wide.
4. **Labels never collide**: one placer for every form (`charts/labels.ts`), with leaders before
   anything is dropped, halos over gridlines, area names that follow their bands, brackets where
   slope values coincide, beeswarm group names in a column, callouts held clear of marks. A test
   renders every fixture at both widths, and each share picture, and fails on any overlap, any label
   off the figure, or any loud name left unwritten.
5. **Typography**: one head line (units, place, span; a whole year reads as the year); one credit line
   ("Source: Ember, Yearly Electricity Data, via Our World in Data (both CC BY 4.0). Retrieved …");
   tighter figure type.
6. **Pictures on the server** (the hosting question): see below.
7. **Share pictures**, including your request in this session: every chart gets a 1080 px card with the
   ember flame and the struck masthead, your title and note, what the numbers are, the chart, the
   machine's glosses, the credit and the address. **Download the picture** in the Desk's chart editor
   (before or without publishing), `chart-draw` writes `chart-share.png`, each chart on the site links
   its card (and a Chart item uses it as its link preview), and the app has "Share the chart as a
   picture". All of them are on `docs/design-comps/charts/cards.html`.
8. **New forms** (fewer, made well): histogram; tile map of India; world map; price and drawdown;
   table with sparklines; and values in a heatmap's cells, which makes it a calendar of monthly
   returns. Real-data comps on `places.html` and `money.html`.

### The hosting decision

The chart pictures are now drawn **on the server, at publish, by the Desk Worker**. Measured: the
resvg wasm is 0.96 MB gzipped; each chart's two app pictures take 0.1 to 0.7 s of CPU (all nineteen
first comps: 4.6 s); the Desk Worker bundles to 1.85 MB gzipped (Workers Paid allows 10 MB); a publish
with a chart took 1.2 s on a local workerd, and a share picture 0.6 s. So the Desk drops
`'wasm-unsafe-eval'` (its CSP is `script-src 'self'` again) and its 2.4 MB download, the terminal stops
drawing, and publish no longer trusts pictures a client sends. Picture names carry the chart's key, so
a changed chart never overwrites an immutable file.

### India's boundaries

The world map uses Natural Earth's **India point of view** (public domain): Jammu and Kashmir
(Gilgit-Baltistan and Aksai Chin included) and Arunachal Pradesh within India, as India depicts its
boundaries. A test checks points in Gilgit, Aksai Chin and Tawang fall inside India. Indian states are
drawn as an equal-tile grid, which draws no boundaries at all, so the question does not arise there.

### Checked, with evidence

- **The Desk, running locally** (a local-only copy of the Desk Worker on workerd, local D1 and R2, no
  remote bindings): captured a Chart item, kept a chart through the API, opened the chart editor in
  headless Chrome (screenshots in `shots/desk/`, both widths and themes), published a Haul (the Worker
  drew the app pictures and the share picture; 1.2 s), and downloaded a share picture from
  `POST /api/charts/share` (0.6 s, a 1080 px PNG named after the chart).
- **The website, built and run on the local Worker** with the sample Hauls: the chart page under the
  strict CSP (screenshots in `shots/site/`).
- **The app on the Android emulator**: see the next section.
- Every claim in the comps' notes was checked against the rows (listed in `raw/SOURCES-D.md`); two
  that did not hold were rewritten before keeping.
- An automated security review flagged that the histogram's 30-bar cap could be defeated by an extreme
  spread of values; fixed and tested.

### Not done

- Timeline, population pyramid, treemap, Sankey, connected scatter and fan chart: judged not to earn a
  place yet (reasons in `docs/CHARTS.md`). A boundary map of Indian states: no openly licensed boundary
  file matching India's depiction was found to record, and the tile grid serves the purpose.
- The figure check still reads digits, not numbers written as words.
- Indian state data more recent than 2011 needs a source whose licence is stated (data.gov.in's API
  needs a key; the RBI's tables are not openly licensed).

### For you to decide

1. **Deploy**: merge `charts-kit`, `npm run deploy:production` (Desk: routes, CSP, server drawing), `npm
   run deploy:web`, `npm run app:update` (JavaScript only). No migration. On the first publish every
   chart's pictures are drawn afresh (`CHART_RENDER_VERSION` 2).
2. The colour decisions (neutral first; red and blue for departures; heat kept for temperatures).
3. The five new forms, and the ones left out.
4. Open-Meteo's non-commercial terms (unchanged from last night's list).
