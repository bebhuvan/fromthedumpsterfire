# Lives: report (2026-10-27)

Branch `lives` in `.claude/worktrees/fdf-lives`. Nothing deployed, pushed or merged; the production
Desk and its data were not touched. The brief is `docs/LIVES-BRIEF.md`.

## What is built

A new recurring section, **Lives**: one person per Haul, a profile written by a model from named
sources, every line checked, the editor's note on top. Sukumar Sen is the first.

| Part | Where | State |
|---|---|---|
| Type `life`, label "Lives", lilac | `packages/shared/src/tokens.ts` | done |
| Schema: `Life`, lines, citations, sources, further reading | `packages/shared/src/haul.ts` | done |
| Rules: quotes word for word, figures in quotes (words too), style, labels without figures, assembly, the generated label | `packages/shared/src/life.ts` | done, 10 tests |
| Bundle rules in `validateHaul` (cited lines, every listed source cited and named, style, a portrait names its maker); old bundles pass | `packages/shared/src/validate.ts` | done |
| Desk storage: `life_sources`, `lives` | `migrations/0009_lives.sql` | done (not applied anywhere but tests) |
| Fetching sources, the editor's PDF for a slow source, refusing a failing draft whole, the judge (fail-closed), keep/cut, approval, recheck at publish | `packages/server/src/lives.ts`, `publish.ts`, `steps.ts` | done |
| Routes | `workers/api/src/lives.ts` | done, 7 route tests on the real Worker |
| Desk review screen, line by line, with the portrait (the credited picture form) | `apps/desk/src/screens/Life.tsx` | done |
| Terminal: `life`, `life-draft`, `life-show` | `scripts/editorial.mjs` | done, 1 test through the real Worker |
| Website form, cover specimen, Markdown, search | `apps/web/src/components/Life.astro` and friends | done, screenshots below |
| App form, cover specimen, search | `apps/mobile/src/ui/Life.tsx` | done, emulator screenshots below |
| `machineText`: the machine's blue, deepened for long prose | tokens, `--machine-text` | done |

`npm run verify`: 749 tests pass. The website Worker is 380 KiB gzipped (`npm run size -w @fdf/web`).

The whole Sen draft also went through the real submit route on a test store with the stored texts:
every line passed the server's checks (the judge there was mocked).

## Sukumar Sen

The profile is 54 lines in five sections ("The man who had to make it happen", "Every adult, by
name", "Boxes, symbols and ink", "The first votes", "Afterwards"), his words as the pull quote
("curious senseless relic of the past"), six figures of the 1951-52 election, a life in dates, and
further reading with Guha's book first. It is written from four sources:

1. **Ramachandra Guha, *India After Gandhi*** (2007): the extract at The Caravan (2014, reproduced
   with the author's permission). The book links to the editor's own link.
2. **Election Commission of India, *Report on the First General Elections in India 1951-52*, Vol. I**
   (1955). Sen signed its preface. It carries the Chini and Pangi poll (25 October 1951, "before
   snow-fall which is usual there in early November"), the women's names (the Commission's rule, the
   2.8 million of nearly 80 million, the states, and by press time "no difficulty … in any State"),
   the Lahaul and Spiti failure ("virtual denial of the exercise of the right to vote", 6,348
   voters) and the Sudan. The ECI does not host it as a fetchable file; the copy is Down To Earth's
   library scan (government work of 1955, public domain in India). It is 24 MB and took 102 s to
   download here, so it goes in as the editor's upload (the link stays the source).
3. **Press Trust of India, "India's first voter fulfils his duty again"** (The Morung Express,
   2014): Shyam Saran Negi of Kalpa, the first voter, 25 October 1951, still voting at ninety-seven.
4. **Wikipedia, "Sukumar Sen (civil servant)"**: only for the Padma Bhushan, the 1957 election, the
   end of his term (December 1958) and his death (1963). Wikipedia's own article gives two birth
   years (1898 and 1899); the profile follows Guha's 1899 and cites Guha for it.

Every quote and figure was checked against the text the Desk's own fetch code stored for each source
(run in Node with the real fetch and extraction, no model): **0 problems**. The check refused my first
draft four times before that, rightly: "almost three decades" (not in the source), the pronoun "one"
read as a figure (a checker fix), a rounding bug in my checker ("173 million" against 17,32,13,635),
and the preface signature, which the PDF extractor lays out differently from `pdftotext`.

The editor remembered "four months before, in the glacier somewhere". The sources say Chini and Pangi
voted from 25 October 1951, before the snow, and most states in January 1952: about three months.
The profile tells it as the report does. The editor's note keeps their words.

**Not used**: *Leap of Faith* (the ECI's flipbook) as a source. Its text layer interleaves its two
columns line by line and drops "ti" ligatures, so no sentence can be quoted from it word for word.
It is in Further reading. The editor's earlier note (bebhuvan.com) was not used, as the brief says.

### The judge

Not run. The judge is a model call, and the brief rules out spending production credit. It runs when
the draft is submitted to the production Desk: three calls of the judge chain (DeepSeek Flash with
thinking), about a cent. Whatever it does not confirm is set aside before the editor sees the draft.
The route tests run the judge mocked, including a judge that errors (everything is set aside).

## The editor's note

Raw (kept in `.editorial/lives-sen/why-raw.txt`):

> I wanted to add a profile of Sukumar Sen, India's first election commissioner. … the context here
> is considering the debates about the special intensive revision, SIR, and all the debates about
> disenfranchisement, etc. I think it's important to know how far we have come. It's important to
> know that how radical and revolutionary our past elections were, and how monumentally challenging
> were, and yet how far we have come, how we started at a place where, you know, we protected the
> sacred right of people to vote and express their democratic choice at all costs. There's that
> anecdote in Guha's book that 4 months before that, in the glacier somewhere, there were election
> booths, and the general election happened much later across the country. How Sukumar Sen was
> radical, how he included the women's names in the rolls, and how he struck them off.

Cleaned (`why-clean.txt`): fillers cut ("…", "considering", "etc.", "that" before "how radical",
"you know"), one word added where the sentence had lost it ("how monumentally challenging **they**
were"), "4" set as "four", a colon for a comma before "how we started". Nothing else changed.

For the editor to decide:

- The note opens "I wanted to add a profile…", addressed to the session rather than to readers. You
  may want to dictate a fresh note for the page.
- "four months before … in the glacier somewhere": your memory; the sources give about three months,
  in the Himalayan snow. Your words, so untouched; the profile has the facts.
- "how he struck them off": Sen's rule struck off women who would not give their names, so it is
  fair; you may want to say it more exactly.

## Judgement calls

- **The name "Lives"** (after Plutarch and Aubrey), one string to change.
- **Lilac**, shared with the letter and the book, rather than a ninth swatch.
- **Quotes stay private.** The bundle names each paragraph's sources and pages in the margin, not the
  passages: forty passages from one chapter would be more of Guha than the excerpt guide allows.
- **A draft is refused whole** on any failed check, with every problem listed, rather than the Desk
  dropping the failing lines. The writer fixes; the editor never sees a half-checked profile.
- **The judge's rejections are never shown**, only counted, as for margin notes.
- **The editor cannot edit a machine line**, only keep or cut it. An edited line would be neither the
  machine's checked sentence nor the editor's own words; a fix goes back through `life-draft`.
- **The deeper blue** for long machine prose (`machineText`), after the editor found the margin blue
  hard to read at length. Shown to the editor against "ink with a blue rule".
- **The portrait** is the item's plate (the existing picture route), so the credit rule and the copy
  to our files are the ones every picture already uses.
- **No pipeline drafter.** A Life is written in a session, which records the writer. A drafter in the
  pipeline is a later step if the editor wants Lives without a session.

## What the editor must decide

1. Approve the design (screenshots below) and the deeper blue, or choose ink with a blue rule.
2. Keep or change the name "Lives".
3. Read the Sen profile (`.editorial/lives-sen/profile.json`, or on the Desk once submitted).
4. The note: keep the cleaned dictation, or dictate a fresh one for the page.
5. The portrait: use the National Archives sheet (credit: "Unknown photographer, 1953. The National
   Archives UK, CO 1069/14. Open Government Licence v1.0."), the cropped print, or none.
6. Then: merge, migrate (0009), deploy the Desk and the site, publish an over-the-air app update,
   submit Sen (`.editorial/lives-sen/README.md`), read and approve on the Desk, add to Haul 001.

## Screenshots

All in `docs/design-comps/lives/shots/`.

- **Comps** (`life-a`, `life-b`, `life-deep`, `life-ink`, each at 390 and 1280, light and dark): A
  (the stacked name) was chosen over B (a run-in dictionary entry, whose large blue epithet was the
  loudest thing on the page). `life-deep` and `life-ink` are the two readings of long machine prose.
- **The built website** (`web/`): the Sen page and the Haul 002 cover with its specimen, from the
  built Worker (`astro build`, `wrangler dev`). Chrome on this laptop cannot load `http://` pages (it
  hangs, as Firefox does), so each page was fetched from the Worker with its CSS and fonts and shot
  from disk: the same HTML the Worker served.
- **The Desk** (`desk/`): the Life review screen from the built Desk, given the real API answers for
  the Sen draft from the Worker's own routes on a test store (the judge mocked to "supported"; the
  real judge has not run). Keep, Cut and Where under each line; the portrait; the sources.
- **The app** (`app/`): the release APK (x86_64) on the Android emulator, deep-linked to the Sen item
  in development Haul 002: `sen-light-strip.png` and `sen-dark-strip.png` (twelve screens each, top
  to bottom) and the cover specimen (`cover-light-spec.png`). The portrait does not load in the
  development build because it is hotlinked from Wikimedia, which refuses the app's image requests;
  its caption and credit show. Published plates are copied to our files host, as every plate is.
  Fixed on the emulator: the type label printed twice and the credit printed twice.
