# Data stories: the grammar

A data story is one argument told in a short run of **plates**, the way a statistical atlas tells
one: numbered, framed, each plate one claim, read in order. It is the magazine's weekly data piece.
The first is the fertility story behind Geruso and Spears in Haul 002. The editor picked the
direction ("Atlas") on 2026-11-09 from four comps (`docs/design-comps/data-stories/`).

The grammar is code: `packages/shared/src/stories/` draws every plate from stored rows, the same way
every week, in any edition ink, light or dark. This document says what the code enforces and why.

## Voices

The house rule holds without exception: you can always tell who is speaking.

| Voice | What it writes | How it is set |
|---|---|---|
| The editor | the story's title, its standfirst, notes in the margin | Newsreader; the notes in italic beside an ember caret, signed "B." |
| The source | a passage from the paper or book the story answers | a salvage slip: plate grey, the opening mark in the edition ink, "Matched word for word" |
| The machine | each plate's headline and paragraph, notes on the plates, captions | Schibsted Grotesk in the machine's blue: headlines and prose in the deep reading blue (`machineText`), notes on a plate in `machine` |
| The data | the numbers themselves: the ledger, labels, ticks | the display serif for a number set large (it is the source's), the sans in ink for labels |

Every figure the machine writes is checked against the story's rows and its **facts** (numbers code
worked out from the rows, each with its method) before the story can be kept. A figure that matches
nothing is refused, as on a chart.

## The shape of a story

1. **The opening**: kicker, the editor's title and standfirst, the byline ("Chosen and annotated by …;
   words and plates by the machine …"), then **the principal figures**: a ledger of four or five
   numbers, each set large with one line of what it counts.
2. **Movements**: two to four, each a roman numeral in the edition ink and a name, grouping the plates
   into the argument's turns (for fertility: it happened everywhere; it does not come back; what it adds
   up to). A story with fewer than five plates has none.
3. **Plates**: three to nine. Each has a number, a short name, a machine headline and paragraph, the
   plate itself, and a one-line caption. The editor's margin note, when there is one, sits beside it.
4. **The colophon**: every source with its licence, what the machine did, how it was checked.

At most one plate is a **fold-out**, the story's climax, drawn across the full width.

## The plate

- **The frame** is a proof: a hairline rule with **crop marks** standing off each corner, the plate's
  number in the display serif in the edition ink at the top left and its name in spaced capitals at the
  right. On a phone the frame drops its sides and keeps a rule above and below, so the figure gets the
  whole width.
- **The key** sits under the head, drawn with the plate's own marks, and names only what the plate
  uses: estimated (a solid line), projected (dashed), the UN's 80 and 95 per cent ranges (close and
  open hatching), a reference line, a zone.
- **The caption** is one line under the figure. The full source is in the colophon, not repeated.
- A figure is drawn twice, for the wide plate (880 px; 1,030 px for the fold-out) and for the phone
  (340 px), and laid out again for each, never scaled down. A container query picks one.

## Marks

| Mark | Meaning | Drawn as |
|---|---|---|
| The story line | what the plate is about | the edition ink, 2.5 px wide (2.25 on a phone), round joins |
| A named line | a comparison the words mention | `quiet3`, 1.2 px |
| Context lines | everything else, for shape | `quiet`, 0.55 px, lighter still in dark |
| Projected | what has not happened | the same line dashed (6 on, 3 off); context projections fainter |
| The ranges | the source's uncertainty | hatching in the edition ink at 45°: 80 per cent close (3.2 px), 95 per cent open (6 px) |
| The seam | where estimates end | a dotted hairline, "Estimated" left, "Projected" right |
| A reference | a threshold the story turns on (replacement, 2.1) | an ink hairline, dashed 4/3, labelled at its end |
| A zone | a band the story names ("no one has come back up through here") | grey hatching, its name inside |
| A point | a moment the words name | a 3.5 px dot in the ink, ringed in the ground |
| A note | the machine's comment on a point | the machine's blue sans, a hairline leader ending in a 2 px dot |

**Hatching means "not yet".** It is the one texture in the system and it is never decoration.

## Colour

One loud colour per plate: **the Haul's edition ink** (`editionInk`, eight of them). Everything else is
grey. Every role's colour comes from `storyInk(scheme, edition)`, which derives the wash, the hatching
and the colour of text set on a filled mark from the ink, and is tested for every edition in both
schemes: the story line at least 3:1 against the ground, text on the ink at least 4.5:1, hatching
visible against the ground and the wash. Ember is never data; machine blue is never data.

## Type and space

| Role | Face | Wide | Phone |
|---|---|---|---|
| Plate number (head) | Newsreader Display | 15 px, tracked | 15 px |
| Plate name, key, movement label | Schibsted 500, capitals, 0.16 em tracking | 11 px | 11 px |
| Tick | Schibsted 400, `ink2` | 11 px | 10.5 px |
| Unit | Schibsted 400, `ink2`, sentence case ("Children per woman") | 11 px | 10.5 px |
| Label | Schibsted 400 (`ink2`) or 500 (ink) | 13 px | 12 px |
| Note | Schibsted 400, machine blue | 13 px | 12 px |
| Number in a fill | Schibsted 500, ground or ink by contrast | 13 px | 12 px |

Plates sit on a 4 px rhythm. Margins inside the plot: 36 px left for ticks (30 on a phone), right
margin wide enough for end labels on the wide plate (104 to 150 px) and 16 px on a phone, where end
labels move inside the plot.

## Labels never collide

Every label and note is placed by the **placer** against what is already drawn: ticks, the axis
labels, every point, and the story line itself (sampled as small boxes along its path). A note tries
its preferred spots, then rings of growing distance around its mark, and gets a leader when it moves
away. Drawing fails loudly when nothing fits (a note too long for the plate); it never drops a label
in silence. `check.mjs` then measures every label in Chromium, as drawn with the real fonts, at 390
and 1440 px, and fails on any overlap or any label off its figure.

## The forms

Fourteen, each in `packages/shared/src/stories/forms/` with a fixture from real UN rows and a test
that it draws clean at both widths. The gallery (`docs/design-comps/data-stories/gallery.html`) shows
all of them.

| Form | For |
|---|---|
| `lines` | change over time, with context, projection, ranges, references, zones; one or more panels on one time axis |
| `swarm` | every member placed at the moment something happened to it, sized by weight; a step panel above (the fold-out form) |
| `heatmap` | a value for every member and every year, on the diverging ramp, grouped and ordered by when something happened |
| `map` | a value for every country on the same ramp; India's boundaries as India depicts them |
| `scatter` | two measures together, circles sized by weight, the named members labelled |
| `trail` | how a few members moved through two measures over time |
| `ridgeline` | how a distribution shifts, one density a moment, bounded to the possible range |
| `slope` | change between two moments for a dozen or so members |
| `dumbbell` | two values per member, then (a ring) and now (a dot) |
| `bars` | amounts ranked, from zero |
| `bump` | rankings over time, worked out by code |
| `multiples` | the same measure for a few members on one scale |
| `stack` | shares of a whole over time, to 100 |
| `pyramid` | a population by age and sex, now against a later year |

**The one exception to "everything else is grey"**: the heatmap and the map need a value for every
cell, so they use the chart kit's diverging ramp (`div0` to `div10`), cool below a meaningful edge and
warm above it, binned by `stories/ramp.ts`, tested for contrast against the ground in both schemes.

## Honesty (validated, fail-closed)

`validateStory` refuses a story whose plates break any of these:

- Every plate names its sources, each with an https link, a licence and a retrieval date.
- **The machine's prose cites facts.** Every figure in a headline, paragraph, caption, the ledger or a
  coda must be one of the story's facts (each with its method) or a year its rows hold. A story's rows
  hold thousands of numbers, so nearly any round number would match one by chance; facts close that.
- **Labels on a figure cite its rows or the facts.** Every string on a figure (notes, end labels,
  reference and zone labels, values) is checked. A figure's structure (scales, ticks, bins, the seam,
  reference lines and zones, label positions) is never evidence: replacement at 2.1 is a stated fact.
  Limit: a label may cite any number in the rows, so a typed value that happens to equal a row passes;
  labels are written by code from the rows, which is why this looser rule is enough for them.
- Projected points come after the seam; ranges are ordered (lower 95 ≤ lower 80 ≤ upper 80 ≤ upper 95).
- Stacked shares sum to 100 at every x, are never negative, and are labelled only at years they hold.
- Bars start at zero and are never negative; bump ranks are 1 to n in every year; ramps have a positive
  bin width and one to five bins a side.
- A line plate whose scale does not start at zero says so in its caption.
- Machine prose passes `checkStyle`.
- The editor's margin notes and standfirst are his words, unchanged: they must be found in his stored
  text.

## Publishing

A story is published apart from the Hauls, like the shelf. `npm run editorial -- story-check` (a dry
run) and `story-publish --confirm-publish` send it to the Desk (`/api/stories/check`, `/api/stories/publish`),
where `publishStory` (`packages/server/src/publish.ts`) runs every check again against the database's own
copies, never trusting what the request sends: the standfirst and every margin note must be found unchanged
in the linked item's stored note (`why_text`) as whole sentences, every quotation word for word in its
stored source text as one unbroken passage. The rows and facts travel with the story as it was prepared
(by `docs/design-comps/data-stories/prep*.py` and `story.ts` from the sources named): every figure in the
words is checked against them, and every fact is printed with its method in the colophon so a reader can
check it, but the Desk does not yet recompute the facts from the original sources itself. A damaged or
missing index (with stories in the bucket) stops a publish rather than starting a new one.
Then it writes `data/<slug>/v<N>/story.json` (a new version for every correction, never overwritten;
the story keeps its number in the series) and `data/index.json`. Nothing else is written; the Haul is not
republished.

The website reads only those two files, each validated before use (`apps/web/src/lib/store.ts`): the
Atlas at `/data`, the story at `/data/<slug>` (a title page framed as a proof, with its frontispiece, the
plates' contents with dotted leaders and a seal saying how many facts were checked; then the principal
figures, the plates, the colophon), a card "In the Atlas" after the Haul's contents, and "The data story"
on the item it answers. A story whose file fails validation falls back to its newest earlier version
that passes, else its page is a 404; a failing index is ignored and the last good one kept. Pages are
cached at the edge on the data index's `updatedAt`, so a publish shows without a deploy.

The reader app shows the same stories (`apps/mobile/src/lib/atlas.ts`, `screens/Atlas.tsx`,
`screens/Story.tsx`): the index and each story read from the files host, offline-first, validated with
the light validators in `@fdf/shared/stories/published`; native text for every word and, for each plate,
the picture the Desk drew at publish (`PublishedStory.pictures`: the plate's phone figure with its key,
light and dark, three times its size, in `data/<slug>/v<N>/plates/`).

## Not yet

- The app's Android link filters: `https://fromthedumpsterfire.com/data/…` opens the browser, not the app,
  until `app.json` adds `/data` to its intent filters (a native change: the next APK).
- Authoring on the Desk (stories are written as data and published from the terminal for now), and a
  record of versions in D1 (versions are read from `data/index.json`; two publishes at the same moment
  could race).
- The Desk recomputing each fact from the sources (through `packages/server/src/charts.ts`) rather than
  checking the words against the facts as sent.
- A table of each plate's numbers under it, as charts have.
- Page weight: the story page is about 250 KB compressed, most of it the fall plate's 161 country
  lines drawn twice (wide and phone); simplifying those paths would roughly halve it.
