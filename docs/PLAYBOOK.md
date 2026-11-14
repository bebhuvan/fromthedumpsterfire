# Running a Haul from a session

The routine for a Claude Code, Codex or Gemini session that builds a Haul with the editor: the editor
dictates takes and links in chat, the session does the Desk's work through `npm run editorial` and makes
the choices a good co-editor would, and the editor approves before anything is published. The Desk
in the browser stays the visual proof. Credentials, payload shapes and the rules for each route are in
`docs/EDITORIAL.md`; this file is the order of work and the bar each item must clear.

Use `npm run --silent editorial -- <command>` when reading the JSON yourself. Keep raw dictation and
working files in `.editorial/` (gitignored).

## The bar: every item, full treatment

A Haul is the editor's taste and the machine's reading together on one page, and each item should
show both at their best. Before an item is done it has:

1. **The editor's take**, in their words (dictation cleaned only as `docs/EDITORIAL.md` allows). Never
   reworded, never expanded. If a take is thin, ask the editor a specific question; do not write it.
2. **The passage with force**: the excerpt a reader could read alone and want the rest of
   (`excerpt`). Read the piece; the pipeline's three candidates are a start, not the answer.
3. **A title** that tells the truth and makes someone want to read: pick from the drafted options or
   suggest better ones to the editor. The editor's choice wins.
4. **A picture** that is specific and of its period (`plates`, `plate`, `plate-search`): a named
   person, place, object or page, public domain, with maker, holder and licence.
5. **Three to six machine notes in at least three angles** (backstory, aftermath, anecdote, number,
   counterpoint, echo, person, term). Each should make a reader say "I didn't know that, and it
   matters here". This is where the machine earns its place: see "The machine's notes" below.
6. **One to three Wikipedia cards** a curious reader would actually open next. The piece's own subject
   first; cut generic ones (a country, a species, a website).
7. **Big ideas** for a long talk, podcast or paper (the pipeline drafts them; keep the best, in order).
8. **A thread to the rest**: at least one connection to another item in this Haul or the archive, or a
   Rhyme with an old text, when there is a real one. None is better than a forced one.

## The order of work

1. **Check in.** `status` (identity and environment), `hauls`, then `new-haul` only if there is no
   draft for this edition.
2. **Capture as the editor talks.** Save the raw dictation to `.editorial/` first. Then
   `capture --data entries.json` with each link and the editor's cleaned take (`why`). Add each
   item to the Haul (`request POST /api/hauls/HAUL/items/ITEM`).
3. **Let the pipeline read.** `wait ITEM --seconds 300` for each. It fetches, reads, finds plates,
   cards and connections, drafts titles, excerpts and notes, runs the research desk, and judges.
   A failed fetch: read `status_detail`; try `library ITEM` for a paywalled piece the editor saved.
4. **Give each item the full treatment** (the bar above), one item at a time:
   - `item ITEM` to read the source, drafts, cards, plates and checks.
   - `excerpt ITEM --data {"text":"exact words"}`.
   - `plates ITEM`, then `plate PLATE`, or `plate-search ITEM --data {"query":"…"}` with concrete nouns.
   - Machine notes: keep the best of the pipeline's, cut the rest, then add your own (below).
   - Cards: `keep wk_…`, `cut wk_…`, `wiki ITEM --data {"query":"Exact Title"}` for a missing one.
   - Titles: `keep dr_…` on the title option you recommend, or note better options for the editor.
5. **Read across the Haul.** Once all items are in: `connect ITEM` for each, so every pair is judged
   with every other item present. While that runs, read the items side by side yourself and look for
   what the editor may not have seen: two pieces that answer each other, an old precedent, a
   counterpoint. Put it to the editor in one line each. A kept connection prints with a note in the
   editor's words, so ask them for that line; the machine's own link goes in as a judged note or
   through `connect`, never typed into the connection's note.
6. **Suggest what is missing.** The machine curates too: if the Haul would be better with an old
   passage, a public-domain text, a Wikipedia oddity or a forgotten essay that rhymes with the
   editor's picks, say what and why in a sentence each. Capture only what the editor says yes to,
   with their own line as the take.
7. **Review.** `todo HAUL` lists what is still open per item (issues, and offers waiting for keep
   or cut, with ids). `request GET /api/hauls/HAUL/review` explains each issue. `preview HAUL`
   until `problems` and `bundleErrors` are empty.
8. **Show the editor what you chose.** Before asking for approval, give the editor a reading copy in
   chat, item by item: the title, the excerpt's opening, the plate, every machine note you kept (with
   its source), the cards, and anything you cut that they might want back. Lines you kept on the
   editor's behalf print only because the editor approves the Haul after seeing them.
9. **Publish only on the editor's word.** "Approved" (or plainly "publish it") for this edition, in
   this session. Then `publish HAUL --confirm-publish`, with the share card as `docs/EDITORIAL.md`
   describes. Never publish because a check passed or a draft looks finished.

## The machine's notes

The pipeline's research desk already proposes notes from what the model knows, each checked against a
whole Wikipedia article and judged. A session can go further, because it can search the web and read
the whole Haul and the editor's takes at once.

For each item, ask: what would a well-read friend lean over and say? The story behind it, what happened
next, the number that changes the claim, who disagreed, where else in history or in India the same
thing happened. Then make it checkable:

1. Find the best source for the fact: Wikipedia, an institution's own page, a university or library,
   the Internet Archive, a reputable newspaper or journal. Free to read only (no paywalls).
2. `evidence-add ITEM --data {"url":"https://…","writer":"claude-opus-5-5"}` (or
   `{"wikipedia":"Exact Title"}`). The Desk fetches it itself and answers with the stored text.
3. Write the note in one to three sentences (at most 70 words), concrete and plain, in the house style
   (`docs/VOICE.md`, `packages/shared/src/style.ts`). Lead with the interesting fact.
4. `margin ITEM --data note.json`:
   `{"text":"…","cite":{"kind":"evidence","evidenceId":"ev_…","quote":"one to three exact sentences from that text"},"angle":"aftermath","writer":"claude-opus-5-5"}`.
   Every fact in the note must be in its quotes: when the facts sit in different paragraphs, add up to
   two more passages of the same text as `"more":["…","…"]` in the cite. The Desk refuses a quote that
   is not in the text word for word, then the judge reads every passage; anything not fully supported is
   set aside and never shown.
5. `research ITEM` runs the pipeline's research desk again on demand (after the editor's take
   changes, say; two minutes apart at least). Its report (`item ITEM`, the `research` check) lists every
   lead the model had and what became of it. A lead Wikipedia did not confirm is the best place to look
   for another source and write the note yourself; it is never a fact to print as it stands.

Rules that do not bend: the machine never writes a URL into a note (the link is the fetched page's,
added by code); never quotes what it has not fetched; never reports an opinion as the editor's; never
rewrites the editor's words. Machine notes are always set in the machine's blue type.

## When something goes wrong

- A capture or source fetch fails: read the error; do not paste text from memory. For a paywalled
  piece, the editor's own saved copy (`library`) or text they paste.
- A note is refused: the quote is not in the text (copy it exactly), or the style check failed (the
  answer lists the issues). A note the judge sets aside is gone; write a better-supported one.
- Never retry a write blindly: read the item or Haul first (`docs/EDITORIAL.md`, idempotency).
