# Design: Salvage

The visual system for the web edition and the reader app, chosen 2026-10-16 from three comp
directions (Margin, Sheets, Index) as the best of all three. Comps, generators and screenshots:
`docs/design-comps/` (`salvage/` is the chosen one; published privately at
https://claude.ai/artifact/7q5AydF5JcmMSx38d3nEiT). The brief it answers: `docs/DESIGN-BRIEF.md`.
Tokens live in `packages/shared/src/tokens.ts`.

Older reference canvas (pre-Salvage, lilac palette): https://claude.ai/artifact/Ekw9KxVrRjzG3XGUu6fqqw.

## Principles

- **White ground, full dark mode, soft bright colour per content type.** Typography carries it.
- **Type roles encode authorship.** Serif (Newsreader) is the editor and the source. A sans in machine
  blue (Schibsted Grotesk) is always and only the machine: marginalia, the machine's route step, the
  rhyme bridge, thread edges and provenance.
- **Every content type gets the printed form that thing has always had** (below). A reader should
  know what they are holding before reading a word.
- **One loud thing per screen**; everything around it is quiet.
- **Asymmetry with rules**: a wide working margin on the left, an off-centre reading column, air on
  the right. Objects sit where they mean something.
- **Content first.** Chrome recedes: small sans navigation, no buttons that look like buttons unless
  they are controls.
- Finite issues; no feeds. No gradients, glows, shadows, sparkle icons, emoji, AI imagery, "AI
  summary" boxes, pills, chips, badges or rounded tinted cards.

## The loud thing, per screen

| Screen | The one bold moment |
|---|---|
| Waiting page (before Haul 001) | the struck masthead: *From the* ~~Internet~~ **Dumpster Fire**, the strike in ember |
| Haul cover | the ghost Haul number, huge, in the Haul's colour, bleeding off the right edge. On the home page the cover also carries the nameplate (the struck masthead across the page with a ruled strap line), as a magazine's front does; the header then drops its small masthead |
| Essay, post | the title, set huge (a magazine opening) |
| Poem | the broadside sheet |
| Rhymes | the two years facing each other |
| Rabbit hole | the catalogue card |
| Paper, talk, passage | the marked line (abstract, the speaker's words, the page) |

## Forms

| Type | Form | On the page |
|---|---|---|
| essay, post | magazine opening | huge title across margin and column; the why as an italic standfirst; the excerpt as a pull-in with the editor's highlight in the type colour; machine notes beside it in the margin |
| paper | journal offprint | a running citation line; centred title and authors; the abstract block; numbered sections (Why it's here, Notes, References) with the numbers hanging in the margin |
| talk, video, podcast | transcript | speakers in the margin: the speaker's surname in caps with the dateline under it, **B.** in ember italic for the editor, MACHINE in blue once for all the machine's notes (one turn); the speaker's words run past the column at 30–46px |
| poem | broadside | one sheet in the poem colour, the poem alone in Newsreader Text italic (28–44px, leading 1.38), poet and source at the foot |
| rhymes | facing pages | then (year in ink2) on the left, now on the right, the machine's bridge in blue sans in the gutter; stacked on phones with the bridge between rules |
| rabbit hole | catalogue card | a sheet in the type colour with a call number (`FDF 001.6`), the headword with its article moved to the end, the entry, the machine's note, a punch hole; the plate beside it |
| passage | page from the book | a plate-grey page with a running head (book, author), the passage justified, the locator as the folio |

Shared by every item page: the running head (Haul and title, then the form's name), a thumb tab on
the right edge in the type colour at a height set by the item's number (7px on phones, a numbered tab
from 1100px), **See also** as reference slips (square, plate-grey, joined by hairlines like a
catalogue drawer; each names where it points, then the title in display serif, then the gloss), *Next* as a ruled link, and an ember folio with the item's number.

## The cover

The ghost number and title; the field note in the reading column, ending on the ember **B.** as its end mark, with the route in the margin (days in sans, the machine's step in blue, and each step citing the item it led to by its number in small raised ember, as a page cites a figure); **In this Haul** as *specimens*: each item shown as a small
specimen of its own form (a cropped opening, a two-page spread, a transcript strip, an offprint with
its abstract, a coral broadside, a 3×5 card with its punch hole, a book page), with the number in
ember, the type and the first sentence of the why under it. Wide forms take seven of twelve columns,
narrow ones four, cards six (the card carries its plate like a clipped print), across the full width under a ruled **In this Haul** head, packed densely so the table stays uneven but full; on phones they stack
in order, each keeping its own width and side. Then the thread as a list of years, and the colophon.
The archive lists back issues, each with its ghost number in the Haul's colour, under a search line that hands its words to the search page (a plain GET form, so it works without JavaScript). Search stays a word in the navigation, never an icon.

## Ember

Ember (`#FF4F1F` light, `#FF6A3D` dark) is the brand's fire, used small and on purpose: the flame,
the strike through "Internet", the editor's **B.**, the folio number, the current-page underline in
the navigation, and the numbers on the About page's promises. Never body text, never machine text,
never a fill.

## Type

| Role | Face | Notes |
|---|---|---|
| Display, headings | Newsreader Display 500; italics at 400 for the second phrase | Bodoni was tried and rejected: hairlines vanish on phones |
| Body, excerpts, editor notes | Newsreader Text; editor notes in italic | default numerals throughout |
| Labels, UI, machine voice | Schibsted Grotesk 400–600 | margin labels in sentence case, 13–14px; speaker names uppercase with 0.1em tracking |

React Native cannot drive the optical-size axis, so the app ships static cuts (text and display).

## Layout (web)

- Gutter 16px phone, 28px from 640px, 48px from 1000px. From 1000px the grid is margin (17rem),
  column (38rem), air (the rest), with a 40–72px gap. `.m`, `.c`, `.mc` place things.
- Phone: one column; margin content moves under the thing it annotates.

## Tokens

Defined in `packages/shared/src/tokens.ts`.

| Token | Light | Dark |
|---|---|---|
| bg | #FFFFFF | #0F0F12 |
| ink | #141416 | #F3F3F1 |
| ink2 | #55555C | #A2A2AA |
| rule | #E6E6EA | #2A2A31 |
| plate | #F4F4F6 | #1B1B20 |
| machine | #4651D2 | #A3ACFF |
| ember | #FF4F1F | #FF6A3D |
| apricot (essay, post) | #FFE0C2 | #4D2E14 |
| coral (poem, passage) | #FFD8D0 | #4E2320 |
| butter (talk, video, podcast; the field-note highlighter) | #FFF0A6 | #433B12 |
| sky (rhymes) | #DCEBFF | #15304B |
| mint (paper) | #D2F3E2 | #163D2D |
| pistachio (rabbit hole) | #E6F2C8 | #2E3915 |

## Brand

The mark is an ember flame on ink (app icon), drawn as a teardrop. The masthead is
*From the* ~~Internet~~ Dumpster Fire, the strike drawn in ember.
