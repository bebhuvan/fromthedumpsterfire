# The Desk on a phone: review, 2026-11-09

A walk through every Desk screen at phone width (375 and 412) and on a laptop (1280), run locally
(`wrangler dev` on a copy of the local state, test items plus a draft Haul), looking for what makes
the Desk feel slow, jumpy or confusing to an editor who does most of the work on a phone.
Screenshots are in `docs/desk-review/` (`before-*` from the walk, `after-*` once fixed).

How it was checked: full-page captures with headless Chromium at each width, a scripted count of
every control shorter than 36px, and reading the code behind each screen for what waits on the
server. Charts, Lives, Rhymes and the shelf's book pages were read in code but not driven with
real data (the local state has no books, charts or Lives).

## Ranked list

Ranked by how often the editor meets it times how much it costs them. Status: **Fixed** means fixed
on this branch (not deployed); **Open** means not yet done.

| # | Rough edge | Where | Status |
|---|---|---|---|
| 1 | **No word on where an item stands.** After adding or editing an item there was no way to tell if it was on the Desk, in a Haul, or already published (Haul 002: "are these already published?"). The item page said "Read and drafted"; the tray said "In Haul 2" whether or not readers had it. | item page, tray | **Fixed**: one plain line under every item's title: *On the Desk, not in a Haul* / *In Haul 002, not yet published* / *Published in Haul 002, version 3* (or *not yet published* for an item added after the Haul went out), with **Add to Haul N** (one tap, shown at once, undone with the reason if refused), **Open Haul N** and **Take out**. The tray groups *Published* apart. |
| 2 | **No pre-publish check worth the name.** Publish's problems came as bundle paths (`items[0].why.text: must not be empty`, `fieldNote.paragraphs`) at the very bottom of the Haul page (about 3,000px down on a phone), with no link to where each is fixed, and nothing about doubtful things that publish allows: a platform credited as the maker, a quotation set as the editor's words, a paywall teaser stored as the piece, a missing date, an off-topic Wikipedia card, unticked suggestions. | Haul page | **Fixed**: **Check before publishing** at the top of every Haul opens one list per item, *Fix* or *Look*, each line linking to the exact step on the item page. The checks are pure functions in `packages/shared/src/prepublish.ts` with tests. The publish panel also speaks plain words now. |
| 3 | **Ticking suggestions meant opening every item.** For a Haul of 15 items that is 15 long pages, each 5,000 to 9,000px tall on a phone. | item pages | **Fixed**: **Tick suggestions** on every Haul opens one page with every margin note, big idea and Wikipedia card, each with its source line, a 44px tick and *Leave out*. Lines ticked stay in view, so the list never jumps. |
| 4 | **Every tick waited for the server, then reloaded the whole item.** Tapping a box did nothing visible until a round trip and a 12-query reload finished, then the page redrew. On a phone network that is the "janky" feel. | item page | **Fixed for ticks** (notes, ideas, Wikipedia cards) and for reordering, adding and removing items on the Haul page: the change shows at once and goes back with a red message if refused. **Open** for the rest of the item page (choosing an excerpt or title, adding a Wikipedia article, connections), which still wait and reload. |
| 5 | **Checkboxes were 16px (22px on phones), the tap area the box alone.** Easy to miss with a thumb, easy to hit the wrong line. | item page | **Fixed**: the tick's tap area is the 44px square around it, on the item page and the tick page. |
| 6 | **What is left to do sat at the bottom of a very long page.** "Before it can go in a Haul" came after the plate grid, 5,000px or more down on a phone. | item page | **Fixed**: a *Still to do: your note · an excerpt* line under the title, each a jump to its step. |
| 7 | **Delete sat right next to Archive** in the item header (it asks first, but it is the one irreversible button). | item page | **Fixed**: Delete moved under More, with a line saying Archive keeps the item. |
| 8 | **No way to replace a teaser on an item that "worked".** Paste-the-text and library copy only appeared after a failed fetch; a paywall preview that fetched "successfully" had no way out but refetch. | item page | **Fixed**: *Use my library copy* and *Paste the text yourself* sit under the piece for every article. |
| 9 | **The item page is too long on a phone** (5,000 to 9,000px: twelve steps, plate grid, checks, More). Done steps stay full size. | item page | **Open**. Proposal: fold a done step to its one-line summary (tap to open), and put the plate grid behind "Choose a plate". |
| 10 | **The capture box fills the first phone screen**; the tray starts below the fold, so the editor scrolls past Voice note, Upload audio and PDF buttons to see what is waiting. | Tray | **Open**. Proposal: the tray first on a phone, capture as one paste line that opens when tapped (the closed state exists in CSS but the buttons still show). |
| 11 | **The Haul page on a phone is one long column**: the order list, then every ready tray item, then cover, plate, field note, questions, route, colophon, and Publish last. | Haul page | **Partly fixed**: Check and Tick are now at the top. **Open**: sections as tabs on a phone (Items, Cover, Field note, Publish). |
| 12 | **Reordering is ↑ and ↓ only**, one step per tap, each tap a round trip. | Haul page | **Partly fixed** (each tap is now instant). **Open**: "move to position…" for long moves. |
| 13 | **Labels in the machine's terms.** "fix why", "fix citations", "Read and drafted", "Auto" for the theme, "checks pass". | Haul page, item header | **Partly fixed**: the Haul list says "to fix: your note, notes". **Open**: the status line and theme button. |
| 14 | **Settings is a 7,000px engineer's page** on a phone (every model chain spelled out). | Settings | **Open**. Proposal: spend and keys first; model chains folded under "How the machine is set up". |
| 15 | **Small controls elsewhere**: the edit links on notes and Wikipedia cards, "All checks", the tray's Tray/Archived tabs (27px), the title radio rows are fine (whole row). | various | **Open**. |
| 16 | **Saved and failed states are uneven.** Text fields autosave with *Saving… / Saved / Kept on this device*; most buttons say nothing until a toast, and a failure toast vanishes after 7 seconds. | various | **Partly fixed**: ticks and the Add line show *saving…* and keep a failure on the row with *Try again*. **Open**: the same for the remaining buttons. |

## What changed for the editor (this branch)

- Every item says where it stands, in words, with one tap to add it to the newest draft Haul.
- Every Haul has **Check before publishing** and **Tick suggestions** at the top.
- Ticks and the Haul's order respond at once.
- What is left on an item sits under its title.
- Each published version now records which items it carries (`migrations/0011_version_items.sql`);
  older versions are worked out once from their published bundle.

## Not done here

- The curation itself (how the machine picks margin notes, Wikipedia cards, titles, plates and
  quotes) and the excerpt cap are a separate piece of work; see the hand-over note for the session
  that started this one.
- Nothing is deployed. The migration must be applied before the Desk is deployed
  (`npm run db:migrate:production`, or through `cf` as STATUS says).
