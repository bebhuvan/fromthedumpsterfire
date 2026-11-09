# Review: the proof sheet (web, app, Wikipedia sentences)

Reviewed up to: 71f1a23 (base 310342b)
Reviewer model: Claude Opus 5.5 (fresh-eyes subagent, did not write the code)
Gates: `npm run verify` passes: typecheck clean in all workspaces (astro check 0 errors, 0 warnings),
vitest 63 files and 792 tests passed. `verify` runs no format check, lint or dependency audit.

## In plain words

The change is in good shape: no CSP or security rule is broken (no inline styles or scripts, colours
come from tokens, links still go through `safeHref`), the paper page's section numbers and reference
order are correct on both web and app, and every caller of the quotation's new `checked` flag passes it
where it should. The one thing to fix before deploying is in the Wikipedia sentence splitter: it fixed
"Lyndon B." but now cuts card summaries at "c." (circa) followed by a year, the same kind of truncated
card it was meant to stop. The rest is small: the salvage tag sits on different forms on the web and
in the app, the docs describe two things the code doesn't do, and the new hanging quotation mark in
notes is read aloud by screen readers on the web.

## Findings

### 1. [medium] Card summaries now stop at "c." before a year
- Where: `packages/server/src/wiki.ts:119` (`NOT_AN_END`) and `:124` (the sentence-end lookahead)
- Failure: "Thomas Tallis was an English composer of sacred music, born c. 1505 in Kent. He died in
  1585." now gives "Thomas Tallis was an English composer of sacred music, born c." The old
  `firstSentence` only split before a capital letter, so it kept the whole sentence. Circa dates are
  common in Wikipedia leads. The new code also no longer stops at a real sentence end after a single
  capital letter or "Inc." ("... during World War I. It produced ..." runs into the next sentence),
  which gives a longer summary but not wrong text.
- Rule: the commit's own goal (b864071); tests cover only the initial and "Jr." cases.
- Fix: add lowercase abbreviations (`c`, `ca`, `p`, `pp`, `vol`, `al`, `approx`) to `NOT_AN_END`, or
  only split before a digit when the full stop isn't an abbreviation. Add tests for "c. 1505" and
  "World War I.".
- Resolution:

### 2. [medium] The salvage tag is on different forms on the web, in the app and in DESIGN
- Where: `apps/mobile/src/screens/ItemScreen.tsx:446` (Poem: no tag), `:308` (Figure) and `:558` (Page):
  plain `MetaLine`; `apps/web/src/components/ItemPage.astro:142` (opening, page and figure share the tagged
  header, with "Salvaged from"); `docs/DESIGN.md:235`
- Failure: DESIGN lists opening, offprint, transcript, facing, broadside and epigraph. The app leaves
  the broadside out. The web adds page and figure, which DESIGN does not list. A poem has a number
  tag on the website and none in the app; a book page or figure has one on the web only.
- Rule: web and app set the same forms (CLAUDE.md, `lib/forms.ts` "the website's choice").
- Fix: pick one list. Probably add `tag` to Poem, Page and Figure in the app (with "Salvaged from"
  for page and figure, as the web does), then update DESIGN.md to match.
- Resolution:

### 3. [low] The hanging quotation mark in notes is read aloud on the web
- Where: `apps/web/src/styles/global.css:195` (`.fn-q::before, .ed-note .note-q::before { content: '\201C' }`)
- Failure: browsers put CSS generated text in the accessibility tree, so screen readers say "left
  double quotation mark" before every quotation in a note. Everywhere else the mark is `aria-hidden`.
- Fix: `content: '\201C' / '';` (alt text for generated content), keeping the old value as a fallback
  line before it.
- Resolution:

### 4. [low] DESIGN says things the code doesn't do
- Where: `docs/DESIGN.md:228` and around it; `apps/mobile/src/ui/Quote.tsx:151`; the epigraph in
  `ItemPage.astro:224` and `ItemScreen.tsx:585`
- Failure: DESIGN says shorter checked quotations "(pull quotes, epigraphs)" carry the blue check.
  Neither the epigraph nor the pull quote passes `checked` on either platform. DESIGN also puts the
  check on the right of the stub, but the app stacks it under the credit (on purpose, per the code
  comment).
- Fix: change the DESIGN text (no check on epigraphs or pull quotes; the app's stub is stacked), or
  pass `checked` to the epigraph's caption.
- Resolution:

### 5. [low] The item number tag reads as "Item zero one"
- Where: `apps/web/src/components/ItemPage.astro:142` and the four other `tag-n` spans
- Failure: the screen-reader text is "Item " followed by the visible "01". Some readers say "zero
  one". The app's `accessibilityLabel` says "Item 1".
- Fix: `<span class="sr">Item {n}</span><span aria-hidden="true">{pad2(n)}</span>`.
- Resolution:

### 6. [low] The app's decorative marks may still be read by TalkBack
- Where: `apps/mobile/src/ui/NoteBody.tsx:57`, `apps/mobile/src/ui/type.tsx:95`, and the slip's mark and
  teeth in `apps/mobile/src/ui/Quote.tsx`
- Failure: `accessible={false}` on a `Text` doesn't reliably hide it from Android screen readers.
- Fix: add `importantForAccessibility="no"` (or `aria-hidden`) next to `accessible={false}`.
- Resolution:

### 7. [low] Nothing tests the new rendering, and the gate is thin
- Where: `apps/web/test/web.test.ts`; root `package.json` `verify`
- Failure: no test checks the offprint's reference number, the tag, or that `checked` shows
  "Matched word for word" in `.machine`. If any of these broke, the 792 tests would still pass.
  `verify` has no lint, format check or `npm audit`, which the global standard asks for (this gap was
  there before this branch).
- Fix: add a render test for an offprint with an excerpt, notes and wiki entries (References is section
  4), and one for the checked caption. Add lint, format and audit steps to `verify`.
- Resolution:
