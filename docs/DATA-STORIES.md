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

| Form | For | The fertility story's plate |
|---|---|---|
| `lines` | change over time, with context, projection, ranges, references, zones; one or more panels on one time axis | I The fall, IV The floor, V The peak, VII India |
| `swarm` | every member of a group placed at the moment something happened to it, sized by weight; a step panel above | II The crossing |
| `multiples` | the same measure for a few named members, one scale | III Twelve countries |
| `stack` | shares of a whole over time, to 100 | VI Where babies are born |
| `pyramid` | a population by age and sex, now against a later year | VIII Why India keeps growing |

## Honesty (validated, fail-closed)

`validateStory` refuses a story whose plates break any of these:

- Every plate names its sources, each with an https link, a licence and a retrieval date.
- Projected points come after the seam; ranges are ordered (lower 95 ≤ lower 80 ≤ upper 80 ≤ upper 95).
- Shares in a stack sum to 100 (within rounding) at every point; pyramids and stacks are never negative.
- A line plate whose scale does not start at zero says so in its caption.
- Every figure in the machine's words (headlines, paragraphs, notes, captions, the ledger's lines)
  matches a number in the rows or a fact, rounded no finer than written.
- Machine prose passes `checkStyle`.
- The editor's margin notes and standfirst are his words, unchanged: they must be found in his stored
  text.

## Not yet

The grammar is codified and drawn; it is not yet published. Still to build: a `story` item (or a
Haul's data story) in the bundle and `validateHaul`; the website's pages for it; the app's pictures of
each phone plate drawn at publish; authoring on the Desk and from the terminal.
