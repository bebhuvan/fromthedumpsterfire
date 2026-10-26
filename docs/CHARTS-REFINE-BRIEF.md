# Charts brief, part two: refine to world class (2026-10-26)

You are a fresh Claude Code session on branch `charts-kit` in `.claude/worktrees/fdf-charts`.
Last night another session built the chart kit from `docs/CHARTS-BRIEF.md`; read that, then
`docs/CHARTS.md` and `docs/CHARTS-REPORT.md` (what is done, what is not, the rough edges it found).
Then read `CLAUDE.md`, `docs/DESIGN.md` and `docs/DECISIONS.md`. Load the `dataviz` and
`frontend-design` skills before touching chart code or colour.

The editor can see this session remotely and may reply; when they don't, decide and write it down.

## What the editor wants now

> "Refine the charts, make them more beautiful, more elegant, truly world-class. See if there are any
> obvious chart types missing, and then we can push it."

The bar is the best static editorial graphics: the FT's visual journalism, the NYT's Upshot and
weather charts, The Economist's daily chart, Bloomberg Businessweek, Reuters Graphics, The Pudding,
John Burn-Murdoch's work. Study what makes them good (hierarchy, restraint, labels doing the work of
legends, annotation that tells the story, precise type at small sizes) and get there.

## These are static charts

The editor confirms most charts will not be interactive: they are printed figures, like the charts
in a tip sheet or a newspaper, read at a glance on a phone and shared as pictures. So:

- Every chart must carry its whole story without hover: direct labels, the key values written on
  the chart, annotations where the story is.
- Design for 390 px first, then 1280. Text on a phone chart must be readable without zooming.
- Add a share picture per chart (a PNG or a card sized for social and Substack, credit included), if
  the kit does not already make one.

## Hosting has changed

The editor is already on the **Workers Paid** plan. The report's CPU worry (item 1) is gone, and the
reason app pictures are drawn in the editor's browser at publish (with a `'wasm-unsafe-eval'` CSP
change on the Desk) may be gone too. Reconsider: drawing the PNGs on the server at publish (the Desk
Worker or the pipeline) would drop the CSP change and the 2.4 MB WebAssembly download in the Desk.
Measure, choose, and write the reason down in `docs/CHARTS.md` and `docs/DECISIONS.md`.

## What we saw in the screenshots (fix these, then find the rest yourself)

Screenshots are in `docs/design-comps/charts/shots/`. Look at every one, at both widths, in both themes.

1. **Too much orange and brown.** The weather page is four warm charts in a row: brown temperature
   band, red stripes, orange calendar, orange heatmap. It reads as one muddy colour. Rework the colour
   system:
   - Neutral first: greys and ink carry context; one accent (the edition ink) marks the story; a
     second colour only when the comparison needs it.
   - Sequential ramps that are perceptually even and not all warm. Keep warm hues only where heat is
     the meaning. Even then, consider showing the departure from normal on a diverging scale instead
     of the absolute value.
   - Diverging scales with real weight at both ends. In the current stripes the cool end is so pale
     that most years read as white.
   - Run every ramp through the dataviz palette validator in both themes and for colour-blind
     readers, and record the results.
2. **Warming stripes look broken.** Most of the band is near-white, and runs of one colour merge into
   wide blocks with gaps between them. Every year must be its own stripe, with no gaps and a scale
   strong enough to show the change. Ed Hawkins's original is the reference.
3. **Temperature band.** The 2024 low-to-high fill is a heavy brown mass that hides the normal and
   record bands behind it. Make it more like the NYT and Tufte weather chart: quiet bands, a fine bar
   for each day, and record days marked.
4. **Stacked area.** "Hydro" collides with its neighbour. Labels must never overlap anywhere: build
   collision avoidance in, and test it.
5. **The report's own list.** Scatter and beeswarm drop labels; slope leaders bunch; gridlines run
   behind value labels; point callouts sit too close to marks; the heatmap's 4 °C bins mostly show the
   seasons, not the years. For the heatmap, consider each month's departure from that month's normal.
6. **Typography.** Tighten the hierarchy: the figure number, title, note, units line, glosses, source
   and "The numbers" link. The source block reads long and repetitive ("CC BY 4.0; CC BY 4.0 (…)").
   Make the credit one clean line where possible.
7. **Never verified:**
   - The app on a device: use the Android emulator (`ARCH=x86_64`, see `CLAUDE.md`).
   - The Desk chart editor against a running local Desk.
   Do both, and screenshot them.

## Missing chart types (judge which earn a place)

The editor writes about finance, India, economics, technology, history and books, and runs data
visualization sites. Likely gaps:

- **Maps**: a choropleth of India's states and the world's countries, and a tile-grid map of Indian
  states (often better than a geographic map). Boundaries from a public-domain or open source with the
  licence recorded; India's official boundary depiction matters here, so read up and note what you
  chose.
- **Distributions**: a histogram, and a population pyramid.
- **Finance**: a log-scale price chart with drawdowns shaded, a drawdown (underwater) chart, a
  calendar-returns grid, and a range or fan chart for forecasts.
- **Change**: a connected scatter, and arrows from before to after.
- **Parts and flows**: a treemap, and a simple Sankey if it can be done cleanly.
- **Tables**: an annotated table with sparklines.
- **Time**: a timeline of events.

Fewer, superbly made, beats many, adequately made. For each new form: a real-data comp, the
validator's rules for it, and tests.

## Rules that still hold

Everything in `CLAUDE.md` and `docs/CHARTS-BRIEF.md`: statistical honesty in code, data from real
sources fetched by code, licences as stated, colours only from tokens, no inline styles on the site,
no SVG runtime in the app.

You may **not**:
- deploy, push or merge;
- touch production data;
- read secrets.

When the work is ready, tell the editor in this session. The deploy happens after they say yes.

Commit as you go. `npm run verify` must pass. Rerun the comps and screenshots, look at them
critically, and iterate until they are really good. Then update `docs/CHARTS.md`, `docs/STATUS.md`
and `docs/CHARTS-REPORT.md` (add a "Refinement, 2026-10-26" section with before and after
screenshots, the colour decisions and the reasons for them).
