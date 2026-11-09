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
| Haul cover | the title, set huge, under HAUL and its number in the edition ink, with the fingerprint below (the ghost numeral was dropped 2026-10-24). On the home page the cover also carries the nameplate (the struck masthead across the page with a ruled strap line), as a magazine's front does; the header then drops its small masthead |
| App menu | the struck masthead, large, with its strap line; the menu below is a contents page |
| Quotation | the words, set large and alone |
| Letter, post, picture, book, tool | the sheet, the clipping, the mounted print, the jacket, the label |
| Essay, post | the title, set huge (a magazine opening) |
| Poem | the broadside sheet |
| Rhymes | the two years facing each other |
| Rabbit hole | the catalogue card |
| Paper, talk, passage | the marked line (abstract, the speaker's words, the page) |
| Life | the name, set large, with the years under it |

## Forms

| Type | Form | On the page |
|---|---|---|
| essay, post | magazine opening | huge title across margin and column; the why as an italic standfirst; the excerpt as a pull-in with the editor's highlight in the type colour; machine notes beside it in the margin |
| paper | journal offprint | a running citation line; centred title and authors; numbered sections (Why it's here, From the paper, Notes, then References after the figures, as a printed paper closes) with the numbers hanging in the margin. The editor's note comes first; the passage is set as a salvage slip, never in the body type where it could read as the editor's. Its cover specimen heads the passage with its locator or "From the paper", never "Abstract" |
| talk, video, podcast | transcript | speakers in the margin: the speaker's surname in caps with the dateline under it, **B.** in ember italic for the editor, MACHINE in blue once for all the machine's notes (one turn); a line or two of the speaker's words runs past the column at 30–46px; a longer passage is set as a salvage slip, never as a wall of display type in the editor's serif |
| poem | broadside | one sheet in the poem colour, the poem alone in Newsreader Text italic (28–44px, leading 1.38), poet and source at the foot |
| rhymes | facing pages | then (year in ink2) on the left, now on the right, the machine's bridge in blue sans in the gutter; stacked on phones with the bridge between rules |
| rabbit hole | catalogue card | a sheet in the type colour with a call number (`FDF 001.6`), the headword with its article moved to the end, the entry, the machine's note, a punch hole; the plate beside it |
| passage | page from the book | a plate-grey page with a running head (book, author), the passage justified, the locator as the folio |
| speech | transcript | as a talk: the speaker in the margin |
| quote | epigraph | the words alone in Display Medium at 40–88px, hanging quotation marks, the speaker in spaced caps over the occasion. Only a line or two is set that large: past 30 words the type steps down, and past 80 words it reads as a passage at 21–26px (`quoteLength` in `lib/forms.ts`), on the item page and in the Haul's list alike |
| letter | the letter | a sheet in lilac: place and date ranged right, "From … to …" in sans, the body in Newsreader Text keeping its line breaks, the name it was signed with in display italic at the foot, the holder under a hairline |
| social | clipping | a sheet in aqua headed by fields (From, with name and handle; On, the platform; Date) over a rule, the post in display at 25–36px, stepping down with its length as a quotation does (`quoteLength`: past 30 words 21–27px, past 80 words the reading serif). Never the platform's embed |

An X post inside another item (the `post` block, 2026-10-31) is the same clipping, smaller: aqua,
the From/On/Date fields over an ink rule, the words in display at 20–25px (21px in the app), then
"Read the post on X" under it in grey sans. When X gives only the start of a long post the line says
so. Never X's embed.
| image | mounted print | the picture in a plate-grey mount, a museum label beside it (from 1000px) or under it: title, maker and date, where it is from, credit and licence |
| book | jacket | the book set in type as a 2:3 jacket in lilac in the margin (or its cover, if the editor uploaded one), the title as a heading, a line from inside under a rule |
| tool | specimen label | a ruled box with a tint strip on its top edge: the name huge, then fields (Made by, What it is, Since, In its own words, Where). Its own words are a quotation set by length, with the opening mark and a credit (the site, matched word for word): a site's long blurb in display serif read as the editor's (Censusnama, Haul 002) |
| life | the life | the name set huge and stacked (display 500, to 168px) with the years under it in the display italic, the epithet in the blue sans; a portrait only if one cleared the credit rule (the item's plate, small, in the air); the editor's note as the standfirst; a 2pt ink rule and the label, generated from the sources ("Written by Claude from …", whole works in the serif italic); the profile in short sections, sans in the deeper reading blue (`machineText`), each paragraph's sources and pages in the margin; the person's own words as the pull quote in the display italic; numbers as a ledger (figure in display, what it counts in sans); a life in dates with the years hanging in the margin; further reading; what it was written from, and how it was checked |
| chart | the figure | a magazine opening whose loud thing is the chart: the title, the why as standfirst, then the first chart drawn large from its data. On the cover its specimen is its own chart, drawn small |

Shared by every item page: the running head (Haul and title, then the form's name), a thumb tab on
the right edge in the type colour at a height set by the item's number (7px on phones, a numbered tab
from 1100px), **See also** as guide cards in a catalogue drawer (no fill or box: a ruled edge with a tab standing
up from it in the colour of what it points to, staggered across the width as real guide-card tabs are;
grey for Wikipedia, ink for a thread; each names where it points, then the title in display serif,
then the gloss), *Next* as a ruled link, and a folio: the flame, then "Haul 001 · 9 of 23". The editor's letter opens on a drop capital three
lines deep in the Haul's ink.

The About page uses the same forms: the title as a magazine opening, the two voices as a transcript
(B. and MACHINE in the margin), the promises as numbered house rules each with the check that keeps
it, and a key to the forms (each type's swatch, its form and what that form looks like).

## Editions and the fingerprint

Every Haul has an **edition ink** (`EDITIONS`, `editionInk`, `editionOf` in tokens.ts): oxblood, teal, ochre,
plum, pine, umber, slate, olive, deep enough to read as text and kept clear of the pale type swatches,
machine blue and ember. A Haul without one takes them in turn by number, so neighbours always differ.
The ink marks every page of that Haul: a 6px band on the top edge, the Haul's number on its cover, the
running head's link back, the fingerprint's line, text selection. A reader knows which Haul they are in
before reading a word.

The **fingerprint** (`@fdf/shared/fingerprint`) places each object on one line by the year it was made,
from a round year before the oldest to the day the Haul came out. The scale is the square root of
years ago (recent things spread apart, old ones still sit where they belong; the year labels show the
scale). On the website (2026-10-25 facelift) each mark is a small dot in its type's colour, ringed in ink,
on a hairline stem, numbered in small grey figures that turn ember on hover; marks whose labels would
touch rise into higher lanes. The axis is a hairline with a tick under each year, the last year in the
edition ink. On a phone the numbers drop and the lanes sit lower. (The app still draws squares.) On the cover it is full size;
in every item's running head it is a row of ticks with the current item tall; in the archive each back
issue carries its own. No two Hauls draw the same one.

## The masthead

*From the* ~~Internet~~ **Dumpster Fire**, set as an editor's correction on a proof: "Internet" in ink2
struck through by a hand-drawn ember stroke, a proofreader's caret in ember where "Dumpster Fire" goes
in. The marks are masks (`apps/web/public/marks/strike.svg`, `caret.svg`), so they take the theme's ember.

## Rich media (blocks)

An item may carry blocks after the note and excerpt, in every form: a **pull quote** (display type
between two ink rules, the opening mark hanging, "matched word for word" under it); **code** (DM Mono
on the plate with a numbered gutter, a ruled caption with the language in spaced caps and the editor's
caption in italic serif; colours by role from `palette.code`, never machine blue or ember; comments
italic; wide code scrolls inside its box); **video** (the platform's own player at 16:9, youtube-nocookie
or Vimeo with dnt, title and "Watch on YouTube" under it); **podcast or audio** (Spotify's or Apple's
player, or the browser's for an audio file, under a ruled title line); **pictures** (with caption,
credit and licence). Players and code may run past the column into the air on wide screens. The app
has no web view: it shows a video's poster and opens YouTube or Vimeo, opens Spotify and Apple episodes
in their apps, plays audio files in its voice-note player, and sets code in the system monospace.
It turns fingerprint columns into points in `apps/mobile/src/lib/fpGeometry.ts`.

**Charts** (2026-10-25, refined 2026-10-26, `docs/CHARTS.md`): "Figure n" in quiet sans with the
number in ember, the editor's title in display and note in the italic serif, one head line in quiet
sans (what the numbers are, where and when), the plot, the machine's glosses in the blue sans, one
credit line, a link to the chart as a picture, and the numbers as a table. In the plot: hairline
gridlines, ink2 tick labels in the margin, an ink zero line, square-ended marks with 2px ground gaps,
labels on the lines instead of legends (placed so none ever touches another, with leaders and halos),
text never in a data colour. Colour is neutral first: greys and ink for context, the Haul's edition
ink for the one loud thing, a second hue only when a comparison needs it; warm colours mean heat, and
a departure from normal is blue for cooler and red for warmer. Chart colours (`chartInk`) are
validated ramps that avoid machine blue and ember. The wide figure runs 720px into the air from
1000px; the phone figure is 375px and is also the app's picture. Each chart's share picture (1080px)
carries the flame and the struck masthead, the editor's words, the credit and the address.

## The cover

The edition number and title over the fingerprint; the field note in the reading column, ending on the ember **B.** as its end mark, with the route in the margin (days in sans, the machine's step in blue, and each step citing the item it led to by its number in small raised ember, as a page cites a figure); **In this Haul** as *specimens*: each item shown as a small
specimen of its own form (a cropped opening, a two-page spread, a transcript strip, an offprint with
its abstract, a coral broadside, a 3×5 card with its punch hole, a book page), with the number in
ember and the type above it and the first sentence of the why under it. Across the full width under a ruled
**In this Haul** head they go two to a row of twelve columns in item order (`coverSpans` in
`lib/forms.ts`): a big form beside a small one 8 and 4, two of a kind 6 and 6, big beside middling 7 and 5,
three small ones 4, 4, 4; the second of a row sits a little lower, so the table stays uneven but every row
is full and nothing jumps the queue (the card carries its plate like a clipped print). On phones they
stack in order on one left edge. Then the thread as a list of years, and the colophon.
At the foot of an item, **the original** is a ticket: a wash of the item's type colour under an ink rule;
above a dashed tear with notches cut at both ends, the host and the action that names the person set large
(the name in italic, the break kept before "in", never inside the name); on the stub below, the date and
length and the arrow out. It is built from the bundle alone; no picture or preview is fetched from the other site.
**Next** gives the next item's title and the first sentence of the editor's note on it. Each item's
share card is the Haul card's frame with the item's number in a block of its type colour, its title and
maker, and the fingerprint with its mark picked out.

The archive lists back issues as a run of editions, each with its number in its edition ink, a band down its edge and its mini fingerprint, under a search line that hands its words to the search page (a plain GET form, so it works without JavaScript). Search stays a word in the navigation, never an icon.

## The app's navigation

The bar at the thumb is the website's navigation, same words and order, with Menu in About's place:
Latest, Threads, Archive, Search, Menu, in small sans, the current word in ink with a short ember
rule under it. No icons. Reading pages (cover from the archive, item, field note, thread, saved,
settings, about, shelf, book) open full screen above it with a back bar that names where back goes (an item's
bar names its Haul). Top-level pages carry the small struck masthead, as the website's header does.

Menu is the magazine's contents page: the masthead large with its strap, then **Reading** (the
latest Haul, its number in edition ink with a band at the edge; every Haul; threads; the shelf; search; saved)
and **The house** (how it's made, settings, a note to the editor), each a line in the display serif
with a serif line of what it holds and a quiet figure on the right.

The shelf (Menu, Reading, after Threads, always listed (empty until the first books are published); deep links `/shelf` and
`/shelf/<id>`) is the editor's books, not reviews. Its page: "The shelf" with the deck *Books I am
reading, and what I made of them. Not reviews.*, then Reading now, Read and Put down, each under a
quiet sans label with its count. A group's books stand as cloth spines on a 2pt ink shelf rule: the
cloth and its type from `spineColours(spineOf(book), scheme)`, a hairline band at head and foot, the
title running down the spine in Newsreader Display (two lines on a wider spine when it is long) with
the surnames in small spaced sans at the foot. Heights vary a little with the title (`spineSize` in
`apps/mobile/src/lib/shelf.ts`) and a book being read stands 10pt proud; the spines wrap onto more
shelves on a narrow phone (`packShelves`), and their type is fixed in size, so nothing clips at any
text size. The spines are the loud thing and are hidden from screen readers; under them each book is
a text row (its cloth at the edge, the title, author and year, the date and first words of the
latest note in the editor's italic) that follows the reader's text size. The bottom bar does not
gain a Shelf: it stays the website's navigation, the shelf changes over weeks, not days, and a sixth
word would crowd the bar on a 360pt phone.

A book's page: the book form's jacket (its spine edge in the book's cloth, or the editor's cover
photograph with its credit), a status line ("Reading since 2 October", "Read from 20 September to
12 October", "Put down at page 212" from a note's place), the title, author, publisher and year;
**Notes** as a dated journal (the date and place in quiet sans, the note in the editor's italic, the
ember **B.** after the newest, a voice note's player beside its date); **Lines from the book** as
quoted passages under an ink rule with their locators; "In Haul 002" rows in the Haul's edition ink
opening the find; and "The book, at openlibrary.org" as the page's one action. A Haul's book item
that names its shelf entry (`Item.shelf`) carries "All my notes on this book" under its note.

Settings is set as a page: groups under quiet sans labels and ink rules, each setting named in sans
with what it does in the serif, controls drawn with views in the house style (square switches,
appearance as three little pages drawn in their own schemes, text size as "Aa" at each size, the
chosen one framed or underlined in ink), and a proof at the chosen size.

## Ember

Ember (`#FF4F1F` light, `#FF6A3D` dark) is the brand's fire, used small and on purpose: the flame,
the strike through "Internet" and the proofreader's caret, the editor's **B.**, the editor's hand-drawn
underline under a marked phrase (the same stroke as the strike, `public/marks/underline*.svg`; it replaced
the tinted highlighter on the site, 2026-10-31), the flame between the letter and the contents and at each
item's foot, the
current-page underline in the navigation (the rule under the app's current tab), the cover route's
item numbers, the fingerprint's numbers, and the numbers on the About page's promises. Never body
text, never machine text, never a fill.

## Type

| Role | Face | Notes |
|---|---|---|
| Display, headings | Newsreader Display 500; italics at 400 for the second phrase | Bodoni was tried and rejected: hairlines vanish on phones |
| Body, excerpts, editor notes | Newsreader Text; editor notes in italic | default numerals throughout |
| Labels, UI, machine voice | Schibsted Grotesk 400–600 | margin labels in sentence case, 13–14px; speaker names uppercase with 0.1em tracking |
| Code | DM Mono 400, italic for comments | code blocks only; the app uses the system monospace |

React Native cannot drive the optical-size axis, so the app ships static cuts (text and display).

**Reading size** (2026-11-09, the proof sheet): body and long notes at 19px on wide screens and 18px on
phones (the app 18pt); 19px on a phone left about 35–39 characters to a line.

**Two quotation settings, one meaning each** (2026-11-09, the proof sheet):

- **The salvage slip** is a passage the machine matched word for word against the stored source (an
  item's excerpt as an extract, a transcript's long passage, a tool's own words when long): a slip of
  plate grey with a torn top edge (a CSS mask on the web; a row of small triangles drawn with views in
  the app), one opening mark in the Haul's ink, the words a step smaller than the editor's (17px app),
  and a stub below a dashed tear with the credit on the left and **Matched word for word** on the
  right in the machine's blue sans, because that line is the machine's claim. Shorter checked quotations
  (pull quotes, epigraphs) keep their display setting and carry the same blue check under the credit.
- **The book quotation** is a quotation inside the editor's own writing (a `> ` line in an item note
  or the field note), which he quotes and the machine has not checked: indented on both sides, a step
  smaller (0.9375em; `QUOTE_STEP` in the app), no rule, one opening mark in the Haul's ink hanging in
  the indent.

**The salvage tag** (2026-11-09): on the opening, offprint, transcript, facing pages, broadside and
epigraph, the meta line becomes a tag: the item's number in the Haul's ink (display, two digits) over an
ink rule, then the kind, "Salvaged from" the source and date (the opening), and the length. In the
margin from 1000px, over the title on phones.

Headlines wrap plainly (`text-wrap: wrap`): each line fills the measure, and a single word on the last
line is accepted. `balance` (even line lengths) and `pretty` (which pulls a word down to avoid a lone
last word) both left boxed, left-aligned titles looking squeezed with a gap on the right (the editor,
2026-11-09: "Pollution as / Growth Killer"). `balance` stays only where text is centred (a paper's
title and its cover specimen) and on large pull quotes.

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
| lilac (letter, book) | #ECE4FA | #33284A |
| aqua (post, picture) | #D3EFF0 | #123B3D |

Charts share sky with Rhymes (a figure is cool-headed); their own colours are `chartInk`. Lives share
lilac with the letter and the book.

Long machine prose (a Life's profile) is set in `machineText` (#2B3593 light, #C3C8FA dark), the
machine's blue deepened to about 10:1 so a page of it reads as easily as body text; margin notes,
labels and provenance keep `machine`.

Code colours (`palette.code`) and the eight edition inks (`editionInk`) are in tokens.ts. Talk, video,
podcast and speech share butter; paper and tool share mint; poem, passage and quotation share coral.

## Brand

The mark is **one ember flame with the globe cut out of it**: the internet, on fire (chosen by the
editor 2026-10-24 from a dozen comps; it replaced the plain teardrop). App icon: the mark on ink.
Favicon (the editor's choice, 2026-10-31): the mark cut out in white from an ember rounded square, the one
place ember is a field, because a tab icon must read at 16 px on light and dark tabs; the apple-touch icon
is the same, square. The app icon stays the mark on ink until a new APK. On the site the small mark in the header and footer is a
mask (`apps/web/public/marks/flame.svg`) painted ember; in the app it is a white PNG
(`apps/mobile/assets/marks/flame.png`) tinted ember. Sources and every size are generated from one
drawing (see STATUS for the files). The masthead is *From the* ~~Internet~~ Dumpster Fire, the strike
and caret drawn in ember.
