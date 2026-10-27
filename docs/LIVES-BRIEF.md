# Brief: Lives, a profile of one remarkable person per Haul (2026-10-27)

You are a fresh Claude Code session in the worktree `.claude/worktrees/fdf-lives`, branch `lives`
(cut from `launch-2026-10-24`, which is what is deployed). The editor can see this session remotely
and may reply; when they don't, decide, write the reason down, and keep going.

## What the editor wants, in their words

> "I wanted to add a profile of Sukumar Sen, India's first election commissioner. … the context here
> is considering the debates about the special intensive revision, SIR, and all the debates about
> disenfranchisement, etc. I think it's important to know how far we have come. It's important to
> know that how radical and revolutionary our past elections were, and how monumentally challenging
> were, and yet how far we have come, how we started at a place where, you know, we protected the
> sacred right of people to vote and express their democratic choice at all costs. There's that
> anecdote in Guha's book that 4 months before that, in the glacier somewhere, there were election
> booths, and the general election happened much later across the country. How Sukumar Sen was
> radical, how he included the women's names in the rolls, and how he struck them off. … explicitly
> label written by Claude based on Guha's book, etc., and also link Ramachandra Guha's book … should
> we create a new category of style for, let's say, interesting people? … every Haul."
>
> "Let's do profile only, it's an important issue. Also, let's design a beautiful page or style for
> this, a template for people."

So: a new recurring section, **Lives**: one person per Haul, a machine-written profile built from
named sources, clearly labelled, every fact checked. Sukumar Sen is the first, for Haul 001.
(The name is the session's recommendation, after Plutarch's *Lives* and Aubrey's *Brief Lives*; the
label is one string in `tokens.ts`, so it is cheap to change if the editor picks another.)

## Read first

`CLAUDE.md`, `docs/BRIEF.md`, `docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`,
`docs/STATUS.md`, `docs/VOICE.md`, `docs/EDITORIAL.md`. Then the code an item passes through:
`packages/shared/src/haul.ts` (Item, Block, ContentType), `tokens.ts` (`typeSwatch`, `typeLabel`),
`validate.ts`, `verbatim`, `style` (checkStyle), `apps/web/src/lib/forms.ts`, `ItemPage.astro`,
`Notes.astro`, `Blocks.astro`, `Credit.astro`, `apps/mobile/src/lib/forms.ts` and `src/screens/*`,
`packages/server/src/publish.ts`, `blocks.ts`, and the Desk item editor in `apps/desk`.
Load `frontend-design` before designing, `writing-voice` for anything in the editor's voice, and
`dataviz` if you put a figure or a number strip on the page.

## The rules this section must keep (they are the magazine's, not new)

1. **Human vs machine is visible.** The editor's note ("why it's here") is serif and on top. The
   profile is machine prose: the blue sans, under a plain label such as
   "Written by Claude from Ramachandra Guha's *India After Gandhi* and the Election Commission's
   records". The byline names the sources it was written from, generated from the item's sources,
   never typed free.
2. **Every factual sentence is traced.** The profile is stored as paragraphs of sentences; each
   sentence carries one or more citations, each a verbatim quote from a stored, fetched source with
   offsets. Code checks every quote verbatim against the stored text (no match, no ship), and every
   number in a sentence must appear in its cited quote (fail-closed, the same idea as the chart
   annotations rule). A judge pass through `generateJson` may confirm support; whatever it cannot
   confirm is set aside, never shown. The editor approves the whole profile on the Desk before it
   can publish. No uncited sentence ships, including transitions: write them so they need no fact.
3. **Machine prose passes `checkStyle`** and `docs/VOICE.md`'s banned patterns. Plain, warm,
   precise English, Indian context; no em-dash chains, no "not X but Y", no hype.
4. **Models never emit URLs.** Sources are fetched by code through `guardedFetch` with byte caps and
   kept as sources like any item's; links to them name the person (`sourceAction`).
5. **Pictures:** a portrait only if it is public domain or openly licensed with the licence as the
   holder states it, maker named, copied to FILES at publish (`creditLine`). If no portrait clears
   the bar, the design must look complete without one. No AI images.
6. **Rights:** quotations inside the profile are short (the `quoting.ts` guide). The profile is
   written in our own words from the sources; it is not a paraphrase-by-paragraph of Guha.

Write the reasoning for this section into `docs/DECISIONS.md`: a machine-written long piece is new
for the magazine, and the rules above are how it stays honest.

## The design: a template for people

A Life is its own printed form in Salvage (`DESIGN.md`), web and app, light and dark, 390 px first.
The reference is the best biographical writing in print: the *Oxford Dictionary of National
Biography* entry, The Economist's obituary page, the NYT's "Overlooked" series, Aubrey's
*Brief Lives*, a museum wall label. Typography first, one loud thing per screen. Suggested anatomy
(judge it, don't copy it):

- the name, set large; the years ("1899–1963") and places; a one-line epithet ("India's first Chief
  Election Commissioner");
- the editor's note, serif, with their voice note if there is one;
- the profile, blue sans, in short titled sections;
- one line of the person's own words where a source records them, set as the page's pull quote
  (for Sen: "a curious senseless relic of the past", verbatim from Guha);
- a quiet margin or strip: a life in dates, and for Sen a few numbers of the 1951-52 election
  (each traced to its source; if drawn as a chart it goes through the chart kit and its validator);
- "Further reading": the books and documents, each naming its author, with Guha's book first;
- the machine label and the sources it was written from, plainly.

Make comps in `docs/design-comps/lives/` with the real Sen content, screenshot them with
`docs/design-comps/_shared/shoot.mjs` at both widths and both themes, look at them critically and
iterate. Then build it for real: a `life` content type (swatch and label in `tokens.ts`), the
schema for the profile (sentences + citations), `validateHaul` rules and tests, the web form, the
app form, Desk support for reviewing and approving the profile sentence by sentence, the editorial
CLI support to submit one from the terminal (`npm run editorial`), and publish. Old bundles must
still validate.

## Sukumar Sen, the first Life

Sources (fetch by code, store, cite):

- Ramachandra Guha, *India After Gandhi* (2007), chapter "The Biggest Gamble in History". Its
  opening is reproduced with Guha's permission at The Caravan:
  https://caravanmagazine.in/vantage/ramachandra-guha-indias-first-election-commissioner
  (free; it covers Sen's appointment, Nehru's haste, his background, the numbers, the women's
  names, the symbols, the ink, the films and radio). Link the book itself as the editor's note does:
  https://amzn.in/d/07BIgTop (the editor's link, from their own post).
- The anecdote the editor remembers (Chini in Himachal voting in October 1951, months before the
  rest of the country, and Shyam Saran Negi of Kalpa) is later in Guha's chapter, beyond the extract.
  Source it from the Election Commission: *Leap of Faith* (https://www.eci.gov.in/EBooks/Leap-of-Faith/)
  and the *Report on the First General Elections in India 1951-52*, if fetchable; else another
  stated, fetchable source. Never cite Guha for a sentence the stored Guha text does not hold.
- Later life (Sudan's 1953 election, Padma Bhushan 1954, the 1957 election, death 1963): find a
  fetchable source for each, or leave the fact out.
- Further reading: Ornit Shani, *How India Became Democratic* (2017).

The editor's earlier note, written by an older Claude without checking
(https://bebhuvan.com/notes/2026-10-02-sukumar-sen-and-indias-first-election/), is a sketch of the
story, not a source. Things it got soft or wrong against Guha: he says Sen called the women's names
practice "a curious senseless relic of the past", and that Sen thought the uproar over the 2.8
million struck-off women a "good thing", because the prejudice might vanish before the next
election, when they could be reinstated under their own names. That turn is the point the editor
cares about; tell it exactly. Guha gives Sen's birth as 1899 and "London University".

The frame is the editor's: today's arguments over the SIR and disenfranchisement, and how the
republic began by going to extraordinary lengths to put every adult on the roll. The editor makes
that argument in their note; the profile tells Sen's story and the facts plainly and does not
editorialise about the SIR.

**The editor's note** for this item is their dictation above. Keep the raw transcript; prepare a
cleaned version with minimal garble and punctuation repairs only (deletion-only plus obvious garble
fixes, per `docs/EDITORIAL.md`), and show the editor both for approval. Never add opinions to it.

## What you may and may not do

- Work only in this worktree; commit as you go, small honest commits. `npm run verify` must pass.
- Local `wrangler dev`, local builds, the Android emulator (`ARCH=x86_64`) are fine and expected:
  check the page in the real app and the built web Worker, and screenshot both.
- You may **not**: deploy, push or merge; touch the production Desk or its data; read or print
  secrets. Model calls for the judge: develop against local/mocked routes; do not spend production
  credit.
- When it is ready: update `docs/STATUS.md`, `CLAUDE.md` (layout), `docs/DESIGN.md`, write
  `docs/LIVES-REPORT.md` (what is done, screenshots, judgement calls, what the editor must decide),
  put the Sen profile payload ready to submit in `.editorial/lives-sen/` (private), and tell the
  editor in this session. The deploy and adding Sen to Haul 001 happen after they say yes.
