# Brief

## The idea

The internet is the dumpster fire; each issue is what got pulled out before it burned. A **Haul** is a
finite set of 6 to 20 objects recovered from the present and the past: essays, talks, podcasts, papers,
posts, poems, book passages, Wikipedia oddities, public-domain finds. Slow journalism, zine energy,
The Public Domain Review crossed with a very good newsletter. Irregular cadence, with a floor of about
two Hauls a month so the habit survives.

The draw is curation of unusually high quality, made possible by melding one editor's taste with what
models are good at: deep reading, noticing relationships across time, and doing tedious verification
at scale. AI use is explicit and designed into the page, never hidden.

## Why it died before, and the constraint now

The first version died of the editor's time. The whole system is designed so the editor spends under
90 minutes a week: capture with a share and a voice note during the week, then one review session
on the Desk.

## What a Haul contains

- **Field note.** The editor's intro, dictated. The machine asks two or three questions about the
  week's items; the editor answers by voice. Includes **the route**: how one find led to the next,
  drafted from capture timestamps, plus one link the machine noticed. Playable as audio.
- **Items.** Each has: title, type, source, the editor's "why it's here" (verbatim, with audio),
  a highlighted excerpt (verified), a public-domain plate, machine marginalia (cited, checked),
  Wikipedia cards, and typed connections to other pieces.
- **Recurring sections.** Rhymes (present piece paired with its historical precedent), Embers (a
  passage from an old book, Indian public-domain texts welcome), Threads (living timelines),
  Revisits ("a year ago we salvaged X"), Rabbit hole (one strange Wikipedia trail).
- **Colophon.** Who did what.

## Linking: what "deep connections" means

Not clustering into buckets. Typed, justified edges between ideas:

1. Each piece gets a structured **reading card**: claims, abstract mechanisms ("principal-agent
   problem", "feedback loop"), entities (Wikidata IDs), dated events, quotable passages with offsets.
2. Candidates come from three routes: embedding similarity, shared entities, shared abstract
   mechanisms. The third is what lets an 1865 book connect to a 2025 post.
3. A stronger model judges each candidate pair into a type (answers, extends, contradicts,
   precedent of, same mechanism, rhymes with, cites) with a one-sentence justification and a quote
   from both ends. No evidence, no edge. Precision over recall.
4. The editor keeps or rejects each edge. Rejections become negative examples.
5. Community detection over kept edges suggests Threads; the editor names them.

## Rights

Excerpts of a few paragraphs, never more than a fifth of the piece (400 words at most),
always beside the editor's note and linked to the original; long talks, podcasts and papers may also
carry their big ideas, each with a short verbatim passage and where it is said. Podcasts timestamped,
not clipped. Official embeds for posts. Never republish full text. Every link names the person who
made the work. The guide is in `packages/shared/src/quoting.ts`; it warns, it does not block, so a
public-domain text can be quoted at length.
