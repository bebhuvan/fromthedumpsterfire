# The chart kit: the night's report (2026-10-25)

Branch `charts-kit` in `.claude/worktrees/fdf-charts`. Nothing is deployed, pushed or merged.
`npm run verify` passes (typecheck and 613 tests). The system is described in `docs/CHARTS.md`.

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
- Provider endpoints and licence fields fetched live on 2026-10-25 (OWID chart API and indicator
  metadata, World Bank API v2 and series metadata, both licence pages).

## Not done, or not verified

- **The app has not been seen on a device or emulator.** It typechecks and its tests pass. Layout,
  image sizing, `File.downloadFileAsync` and the table widths need a look in a dev build.
- **The Desk editor has not been used against a running Desk.** Its draft logic is tested (every comps
  fixture opens and saves back unchanged and valid), and the drawing was tested in a browser.
- Not built: horizon charts and marimekko (neither earned its place tonight), daily or monthly World
  Bank series, model-drafted annotations (the gates for them exist: `by: 'machine'` text must pass the
  style check and cite only figures in the rows).
- Known rough edges, from looking at the comps:
  - Scatter and beeswarm drop a label when there is no free place (Sri Lanka on the phone scatter).
  - Slope leaders bunch when many values cluster.
  - Labels inside light area layers are low contrast.
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
