# Design review, 2026-11-09

A reading of the website and the reader app after Haul 002, against `docs/DESIGN.md` (Salvage), with
the small faults fixed and three directions for a stronger visual grammar for the editor to choose
from. Pictures are in `docs/design-comps/2026-11-09-review/` (`shots/`, and the two comp pages
`quotes.html` and `directions.html`, which open in a browser with the real fonts).

What was looked at: production Haul 002 (all 16 items), Haul 001 and the shelf at 375 and 1280 px,
light and dark (76 screenshots); the same pages on the local build with Haul 002's published bundle
loaded in place of the sample data, before and after the fixes; the app in the Android emulator (see
"What I could not check").

## The principle

Human, machine and source must never be confused. The editor's words are the serif (italic when
short); the machine is the blue sans; **a source's words are set off as a quotation with a credit**.
Every fault below is a place where that grammar slipped, a size that turns into a wall, or a
leftover from an older layout.

## What is working

- **The forms.** A poem as a coral broadside, a tool as a specimen label, a post as an aqua clipping,
  a paper as an offprint: each reads as its object before a word is read. This is the strongest idea
  in the system and the one to build on.
- **The masthead and ember.** The struck "Internet" with the proofreader's caret is distinctive, and
  ember is used small and on purpose.
- **Edition inks.** Teal for 002 and oxblood for 001 make the two issues feel like two printings.
- **The machine's voice.** Margin notes and big ideas in blue sans are unmistakable, light and dark.
- **The ticket** ("The original") and **See also** as guide cards: quiet, specific, ours.
- **Dark mode** holds up everywhere I looked; the poem's coral sheet is lovely in it.

## The 2026-11-09 fixes, checked on web and app

| Fix | Web | App |
|---|---|---|
| Paper: the editor's note first, the paper's passage under "From the paper" as an extract | done | done |
| Podcast/talk: a long passage as an extract at reading size (`speechSetting`, shared) | done | done |
| Headlines wrap plainly; `balance` only on centred titles and pull quotes | done | plain by default (React Native has no balance or pretty) |
| Quotations in the editor's notes look like quotations | rule only: weak in long notes, **fixed today** (below) | same, **fixed today** |

## What was off, ranked

Fixed on this branch (each its own commit; web and app together):

1. **A tool's "In its own words" was 190 words of 21 px display serif with no marks or credit**
   (Censusnama). It read as the editor's prose. It is now a quotation set by length (opening mark, a
   rule when long, the site and "matched word for word" under it).
   `shots/01-tool-label-before-after.png`
2. **Quotations inside a long note read as more of the note.** A long note is upright, and so is the
   quotation, at the same size: only a 2 px rule told them apart (the field note's Martin Luther King
   passage, Caro's maxim). Quotations are now a step smaller than the editor's words (0.9375 em, as a
   book sets a block quotation), on web and app. `shots/03-note-quotation-before-after.png`
3. **Clippings did not step down with length.** A 36-word post was set at 36 px display. Posts now
   step down like every other quotation (`quoteLength`): past 30 words 21–27 px, past 80 the reading
   serif. `shots/02-clipping-before-after.png`
4. **Wikipedia cards stopped at a middle initial:** "Robert Moses and Lyndon B.", "incumbent W."
   The pipeline's sentence splitter (`packages/server/src/wiki.ts`) now skips initials and short
   titles, with tests. **Haul 002's published cards still carry the cut text**: it is fixed for new
   items only, unless the editor edits those cards on the Desk and republishes.
   `shots/04-wiki-initial-before.png`
5. **A paper's passage was still called "Abstract"** on its cover specimen, and the About page's key
   said "abstract first". Both left over from before the note came first. Now "From the paper" (or
   the passage's locator).
6. **A paper's References printed before its figures and plate.** Now last, as a printed paper ends.
7. **Straight quote marks on the web** in clippings, letters, jacket lines, transcript lines and book
   pages, where the app already set them curly.

Still open, for the editor (not fixed, because they are choices):

8. **The reading size on phones is too large for the measure.** 19 px fits about **39 characters**
   to a line at 375 px (web and app alike); comfortable reading is 45–60. Haul 002's notes run to
   1,000 words, so this is felt. On desktop it is 18 px at 67 characters, a good measure with type a
   touch small for long reading, and the source's extract runs *wider* (74 characters) than the
   editor's note beside it, which is backwards. Proposal: 18 px on phones (about 45 characters), 19 px
   on desktop with the note at about 34 rem, and extracts indented so they are always narrower than
   the note. One token change each side; shown in `directions.html`.
9. **Nine of Haul 002's sixteen items are essays or blog posts, and they all get the same opening.**
   The forms are the system's best idea, but the commonest type has only one, so an issue reads as
   one template repeated. This is the main argument for a direction below.
10. **A chatbot's answer set as a quotation in display serif** (Haul 001, item 17, "Google Gemini").
    By the house rule serif is the editor and the source, and blue is *our* machine. A model's output
    that the editor salvaged is a source, and its credit already says "Google Gemini, answering the
    editor", so the serif is defensible. Worth a deliberate rule either way, since it will recur.
    Suggest: keep the serif and that credit. The editor's call.
11. **The tool label's "What it is" shows the publisher** (Censusnama: "FLAME Centre for Legislative
    Education and Research"), because the field prints `source.name`. Either the label reads "Published
    by", or the Desk asks for a one-line description. A data question for the Desk, so not touched here.
12. **The cover's field note leaves the margin empty for a very long scroll on desktop** when a Haul
    has no route (Haul 002). Its section headings could stand in the margin as a contents list (CSS
    only, no script).

## Quotations: a house style

The editor asked whether quotations could look more beautiful and more our own. Today they are
correct but plain: the editor's prose with a line beside it. `quotes.html` sets the same Caro passage
three ways (`shots/quotes-1640-light.png`). In all three, "matched word for word" moves to the blue
sans, because it is the machine's check, not the source's words or the editor's.

- **A. The book's block quotation.** Indented both sides, a size down, no rule, one large opening
  mark in the Haul's ink hanging in the indent. Quiet and classical.
- **B. The salvage slip.** The words as a cutting from the source: a slip of plate grey with a torn
  top edge, pasted into the page, the credit on its stub. The most ours: used wherever we quote, it
  becomes the magazine's signature.
- **C. The speaker's line.** The transcript's grammar everywhere: whose words come first in spaced
  capitals in the Haul's ink over a rule, then the words, then the check.

**Recommendation:** B for every passage the machine has matched against the source (excerpts, pull
quotes, a tool's own words, a podcast's big ideas), because a slip *is* salvaged material and its
stub carries the proof; A for quotations inside the editor's own writing (his notes and the field
note), which he quotes and the machine has not checked. Two settings, one meaning each: a reader learns
in one issue that a slip is the source, checked. The torn edge is a CSS mask, so it costs nothing
under the CSP; the app draws it with a row of small triangles in views (no SVG).

## Three directions

`directions.html` shows the same essay ("In Praise of the Dilettante") as it is now and in each
direction, at phone width (`shots/directions-1640-light.png`).

### 1. Proof sheet (recommended)

Salvage tightened, not replaced. The masthead is already an editor's correction on a proof; carry that
through:

- **Type scale and rhythm:** 18 px reading on phones, 19 px on desktop; one modular scale
  (18 / 22 / 28 / 36 / 48 / 72) so headings, standfirsts and display quotes stop drifting between
  nearby sizes; extracts narrower than notes.
- **A salvage tag** under every item's running head: its number in the Haul's ink, where it was found,
  its length, and when the editor picked it up (needs the capture date in the bundle: a small schema
  addition in `packages/shared`, for the Desk session to agree).
- **Quotations as slips** (above).
- **The editor's marks:** ember proof marks (the caret, the hand-drawn underline he already has) used
  as his signature in the page, a few per issue, never decoration.
- **Motion:** none. Print does not move; the site's calm is part of its character.

Cost: mostly CSS and the matching app styles; no new dependencies.

### 2. Scrapbook by source

Each piece pasted in as what it came from: a magazine essay as a torn tear sheet in the type colour
with the publication's name across its head, a Substack post as a letter that came in the post, a blog
post as a printout with its address and date, a video as a contact sheet of three frames with
timecodes (frames from the poster only, never generated), a newspaper piece as a column cutting. This
answers "a template per kind of media" most directly and is the weirdest in a good way. The risk is a
craft-kit look if every item shouts; it needs the "one loud thing" rule enforced hard, and it needs a
reliable "kind of source" field (Substack, blog, newspaper, magazine), which the Desk would have to
capture.

### 3. Auction catalogue

Every item a numbered lot with its provenance as a ruled field list, titles quieter, the lot number
loud in the Haul's ink. Calm and museum-like, very consistent. The least playful, and it pulls the
forms toward one template, the opposite of what Haul 002 needs.

**Recommendation:** 1, and then borrow 2's source variants for the two commonest kinds once 1 is in
(newsletter posts as letters, magazine essays as tear sheets), so essays stop sharing one opening
without the whole issue becoming a scrapbook.

## What I could not check

- iOS: not built here.
- The app was checked in the Android emulator on a release build carrying Haul 002's published bundle
  as sample data; see STATUS for what was looked at. Text-size settings above 100 % were not tried.
- Production still shows the old faults until the editor deploys the web and ships an app update.
- Search, the archive page and the threads pages were not reviewed in depth.
