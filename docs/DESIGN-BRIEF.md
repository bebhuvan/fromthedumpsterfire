# Design brief: give it a point of view (web and app)

For a dedicated design session. Read `docs/DESIGN.md`, `docs/DECISIONS.md` and `docs/VOICE.md` first;
this brief changes how the system *feels*, not the rules underneath it.

## The problem, in the editor's words

> "The new site looks very simple and bare … The old design was a little creative. It had a little
> opinion. It was not like the traditional simple blog website. It had a bit of asymmetry to make it
> stand out … even the current design, I think it's just too bare."

The current web edition (`apps/web`) and app (`apps/mobile`) are competent and polite: an editorial
template with good type. They do not yet look like *this* magazine.

## References

| File | What it is | Take | Leave |
|---|---|---|---|
| `design-ref/old-issue-017.jpg` | the hand-built 2025–26 site (source: `~/Ideas/Dumpster main site`) | the struck-through masthead ("~~The Internet~~ Dumpster Fire"), the giant ghost issue number bleeding off the edge, the handwritten "THIS." in the margin, the stamped issue label, the sense of a person's hand | beige ground, emoji icons, scroll prompts, model-written blurbs |
| `design-ref/old-astro-cards.jpg` | the 2025 Astro version (source: `~/AA/A main projects/newer dumpster`, mockups in `~/AA/A main projects/fromthedumpsterfire/mockup-*.html`) | slightly rotated cards with stamped labels, an asymmetric grid, colour per card | rotating *everything* (then nothing stands out), the big pull-quote box, beige |
| `design-ref/new-haul-cover-v1.jpg` | the current Haul page | the palette, Newsreader + Schibsted, the two-voice system, the route | the evenness: every block on the same grid, same weight, same calm |
| `design-ref/new-prelaunch-v1.jpg` | the live waiting page | nothing much; it should become a real front door | |

## Direction: the old nerve, pushed past

The editor, on the old designs: keep "its creativeness, its boldness, its nerve, but don't take it
outright … the old design is a little dated … push past the design and come with something truly
unique … I don't want loudness … crass designs … gimmicks … pointless effects … garish designs. It has
to be minimal and unique with all the focus on the curated content", using design "as a distinction
to distinguish different types of content" and "standing out in a sea of sameness".

So: minimal, quiet, and unmistakable. The old sites are a philosophical starting point, not a source.

### 1. Every content type gets its own form (the main idea)

Distinction comes from form, not decoration. Each type borrows the printed form that thing has always
had, inside one shared palette and two typefaces:

| Type | Form | What that means on the page |
|---|---|---|
| poem | broadside | a single sheet, generous white, the poem set alone, no chrome around it |
| paper | journal offprint | abstract block, figure with caption, a running citation line, numbered sections |
| talk / video / podcast | transcript | timestamps in the margin, speaker attribution, the excerpt as a moment in time |
| rabbit hole | catalogue card / encyclopedia entry | headword, dates, cross-references set like an index |
| rhymes | facing pages | then on the left, now on the right, the bridge in the gutter |
| essay / post | magazine opening | the one big type moment, a measured column, the excerpt as a pull-in |
| passage (book) | page from the book | folio, chapter, the passage as a page |

A reader should know what they are holding before reading a word. No model defaults to this.

### 2. One bold moment per screen, everything else quiet

The old nerve survives as restraint broken once: the struck-through masthead ("~~The Internet~~
Dumpster Fire" or a better line), or the Haul number huge and bleeding off the edge. Never two at once.

### 3. Asymmetry with rules

An off-centre reading column, wide gutters used on purpose, objects that sit where they mean
something (a plate beside the passage it illustrates). No rotation-for-character, no collage.

### 4. Content first

Chrome is nearly invisible: navigation, labels and buttons recede. The editor's note, the source and
the excerpt carry the page. The machine stays clean blue sans, small and exact.

### Banned: the model's default design tells

Treat these like the writing tells in `docs/VOICE.md`; a comp that uses them is not done.

- An even grid of rounded pastel cards (the current "In this Haul" grid is one).
- A small all-caps label above a big serif headline on every block.
- Pill buttons with arrows; badges and chips everywhere.
- Centred hero, then a three-column feature row.
- Beige or cream grounds, soft drop shadows, gradients, glassmorphism.
- Emoji or stock icons; decorative quote marks; tilted stickers and stamps as decoration.
- Hover lifts, scroll reveals, parallax, any motion that isn't feedback.
- Inter, or any default system sans as the identity face.

## Constraints (unchanged)

- White ground and a contrasting dark mode; soft, bright swatches per content type (tokens in
  `packages/shared/src/tokens.ts`). No beige, no Swiss red, no Bodoni, no generic AI look, no
  gratuitous animation. Ember `#FF4F1F` stays brand-only (flame, icon, splash).
- Serif is the editor and the source; blue sans is the machine only. Every Haul has a colophon.
- No AI-generated images. Plates are public domain, served from files.fromthedumpsterfire.com.
- Web: zero client JS beyond theme, search and audio; strict CSP (no inline script or style); works
  at 360px with 16px gutters and no horizontal scroll; accessible.
- App: lean. No SVG runtime, Reanimated, icon fonts or UI kits; draw with views (hand marks can be
  pre-rendered PNG/WebP assets if needed, keep them tiny). Never set fontWeight/fontStyle.
- Web and app move together. Shared decisions go in `docs/DESIGN.md` and tokens; update the design
  canvas (https://claude.ai/artifact/Ekw9KxVrRjzG3XGUu6fqqw, still on the older lilac palette) too.

## How to work

- Start with 2–3 directions as static comps: the Haul cover, the waiting page, and one item page per
  form above (390px and 1280px). Let the editor pick before building.
- Screenshot every page in light and dark at 360/390/1280 and look before calling anything done.
- Record what is settled in `docs/DECISIONS.md`.
