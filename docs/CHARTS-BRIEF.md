# Charts brief: a chart kit for From the Dumpster Fire

For a dedicated, unattended build session (written 2026-10-25, the night before the editor brings
the charts for Haul 001). You are working alone overnight in the worktree
`.claude/worktrees/fdf-charts` on branch `charts-kit`. The editor is asleep and cannot answer
questions; make the calls yourself, write them down, and leave a clean report.

## What the editor asked for, in their words

> "I was thinking of having a nice section for data visuals, data explanations, etc. I was thinking
> of sharing at least, let's say, three or four charts every week because I already run a bunch of
> data visualization sites. Given our own unique style, does it make sense to build a chart kit? …
> also have the ability to showcase external charts from sites like Our World in Data, World Bank,
> etc., and download their charts? Or if not we'll create our own charting style. … High-quality,
> rich, creative charts, not just the basic lines, bars, pies, slopes, etc., but unique charts so
> that we can accommodate more types of complicated charts (for example, temperature charts, etc.).
> … Beautiful, gorgeous, absolutely gorgeous minimalist charts that follow the best statistical
> principles. No bad statistics, no bad data, none of the mistakes."

Tomorrow morning the editor will share the charts for the first Haul. The kit has to be able to
take them: real data in, a finished chart on the website and in the app out.

## Read first

`CLAUDE.md` (the non-negotiables apply to charts exactly as they do to excerpts), `docs/BRIEF.md`,
`docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/STATUS.md`, `docs/VOICE.md`,
`packages/shared/src/haul.ts` (the `Block` union and `Plate`), `packages/shared/src/tokens.ts`,
`packages/server/src/blocks.ts`, `packages/server/src/publish.ts`, `apps/web/src/components/Blocks.astro`,
`apps/web/src/lib/forms.ts`, `apps/mobile/src/ui/Blocks.tsx`. Load the `dataviz` skill before you
write any chart code, and the `frontend-design` skill before you design the look.

## The answer to "does a kit make sense": yes, both halves

1. **Our own charts (the main thing).** A chart is a new item block (and, where it earns it, a
   printed form for a chart-led item: "the figure"). The editor supplies data (CSV/JSON pasted or
   uploaded, or fetched from a source by code) plus their title and note; code draws it in the
   house style. Same chart, same look, web and app, light and dark.
2. **External charts (the showcase).** Our World in Data and the World Bank publish their data under
   CC BY 4.0, so the better path is to fetch the *data* behind their chart by code (OWID's grapher
   CSV/metadata endpoints, the World Bank API v2) and redraw it in our style, crediting the maker
   and linking back. Where the editor wants their original chart as it stands (a picture of someone
   else's work), take it in as a picture block under the existing credit rule (`creditLine`: maker,
   holder, licence, link), downloaded through `guardedFetch` with a byte cap, stored in MEDIA,
   copied to FILES at publish. Never hotlink. Record the licence as the institution states it, and
   refuse a source whose licence is not stated. Check each provider's current docs and terms before
   you build against them, and note what you checked, with dates, in `docs/CHARTS.md`.

## Design: gorgeous, minimal, unmistakably ours

Typography-first, FT / NYT / Bloomberg Businessweek / The Pudding tier, inside Salvage (`DESIGN.md`).
Warm grounds, restraint, one loud thing per chart. Colours only from the tokens (add chart tokens in
`tokens.ts` if you need a sequential and a diverging ramp; validate contrast in both themes). The
house voice rule holds on a chart too: the editor's title and note are serif; any machine-written
annotation, axis gloss or caption is the blue sans and passes `checkStyle`.

Beyond the basics (line, bar, dot/Cleveland, slope, small multiples, stacked area, scatter with
labels), build a set of distinctive forms. Suggested, pick and add your own; do fewer and do them
superbly rather than many and do them adequately:

- **Warming stripes and temperature bands** (the editor named temperature charts): Hawkins stripes,
  a daily-temperature band chart (normal range, record highs/lows, this year's line, Tufte's New York
  weather chart is the reference).
- **Ridgeline / joy plot**, **beeswarm**, **dumbbell**, **waffle / unit chart**, **heatmap calendar**,
  **bump chart**, **ranged dot plot with uncertainty**, **horizon chart**, **marimekko** if it earns it.
- **Annotation as a first-class layer**: labelled lines instead of legends, callouts tied to data
  points, shaded periods (wars, recessions, lockdowns) with their names.

Make a comps page in `docs/design-comps/charts/` showing every form, light and dark, desktop and
phone width, with real public data, and screenshot it with `docs/design-comps/_shared/shoot.mjs`.
Look at your own screenshots critically and iterate before you call the design done.

## Statistical honesty is code, not good intentions

Write a chart validator in `packages/shared` (alongside `validate.ts`), run by the Desk before a
chart can be kept and by `validateHaul` before it can render. Each rule gets a test. At least:

- every chart has a title, a source (maker, dataset name, https link, licence, retrieved date), units,
  and, where it applies, the time span and geography;
- bars and areas start at zero; a non-zero line baseline is allowed but marked;
- no dual y-axes, no 3D, no pies beyond a small number of slices (prefer bars or waffles), no
  rainbow scales for ordered data, diverging scales only around a meaningful midpoint;
- log scales are labelled as log; per-capita vs absolute is stated; inflation-adjusted money says the
  base year; indexed series say the base;
- a chart of rates shows its denominator; small samples and uncertainty are shown when the data
  carries them; missing data is shown as missing, never interpolated silently;
- no truncated or cherry-picked windows without saying so: the full span of the source is recorded
  and a narrower window is labelled;
- every number on the chart traces to the stored data: the published bundle carries the data rows,
  and the renderer draws only from them. Models never invent or "clean" numbers. If a model drafts
  an annotation, every figure in it is checked against the rows, fail-closed.

## Engineering constraints you must respect

- **Website:** Astro on a Worker, no client JS beyond theme and search, CSP `script-src 'self';
  style-src 'self'`. Render charts server-side as SVG, with presentation attributes or classes, no
  inline `style`. Accessible: a text alternative and the data table behind every chart.
- **App:** Expo, lean by rule, **no SVG runtime**. Choose and justify: draw with Views where the form
  allows, or render a PNG at publish time (check what a Worker can do, e.g. resvg-wasm, and its size
  and CPU cost) and ship it with the bundle like a plate. Whatever you pick, the chart must look the
  same as the website's and work offline.
- Data and pictures fetched from outside go through `guardedFetch` and the byte-capped reader.
  Only `publish.ts` writes to FILES. No model writes a URL.
- Bundles stay backward compatible: older bundles without chart blocks must still validate.
- `npm run verify` must pass at the end. Commit as you go on `charts-kit`, small honest commits.

## What not to do

- Do not deploy anything (no `wrangler deploy`, no `npm run deploy*`, no `app:update`, no APK
  builds pushed anywhere), do not push, do not touch the Desk's production data, do not read or
  print secrets. Local builds and local `wrangler dev` are fine.
- Do not merge into `launch-2026-10-24` or `main`. The editor reviews in the morning.
- Do not rework the rest of the design or unrelated code. Do not relitigate `DECISIONS.md`.

## Deliverables (in the morning)

1. `docs/CHARTS.md`: the system: forms, data spec, the validator's rules, source adapters (OWID,
   World Bank, CSV), how the editor adds a chart on the Desk and from the terminal (extend
   `npm run editorial` if it needs a `chart` command), and what you checked about each provider.
2. Shared types, validator and tests; renderer(s); Desk support; web and app rendering.
3. The comps page and screenshots.
4. A short `docs/CHARTS-REPORT.md`: what is done, what is not, the judgement calls you made and
   why, anything the editor must decide, and exactly how to take tomorrow's charts in. Update
   `docs/STATUS.md` and `CLAUDE.md` for the new shape of the code.
