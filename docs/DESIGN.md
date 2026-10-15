# Design

Reference canvas (private): https://claude.ai/artifact/Ekw9KxVrRjzG3XGUu6fqqw
Screens: cover, field note, glossed item, Rhymes, Thread, dark cover and item, web issue page, Desk.

## Principles

- Clean and simple. A white ground with a full dark mode. Soft but bright colour. Typography carries it.
- **Type roles encode authorship.** Serif (Newsreader) is the editor and the source. A sans in machine
  blue (Schibsted Grotesk) is always and only the machine.
- **Colour encodes content type**, the same everywhere (app, web, archive, Desk).
- **The highlighter** marks the exact line the editor underlined in an excerpt.
- Finite issues; no feeds. No gradients, glows, sparkle icons, emoji, AI imagery, or "AI summary" boxes.

## Type

| Role | Face | Notes |
|---|---|---|
| Display, headings | Newsreader, display optical size, 500; italics at 400 for the second phrase | Bodoni was tried and rejected: hairlines vanish on phones |
| Body, excerpts, editor notes | Newsreader text cut; editor notes in italic | Newsreader has no old-style figures; its default numerals are used throughout |
| Labels, UI, machine voice | Schibsted Grotesk 400–700 | labels uppercase, 11px, 0.12em tracking, 600 |

React Native cannot drive the optical-size axis, so ship static cuts (text and display) of Newsreader.

## Brand

The mark is an ember flame on ink (app icon), drawn as a teardrop with an inner cut. Ember is used only
for the brand: icon, splash, and the small flame beside the masthead. Never for text, never for UI
state, never mixed up with the machine blue. Options considered: ember on white, white on ember (read
as a water drop), the italic f with a lit tip (too small at icon size).

## Tokens

Defined in `packages/shared/src/tokens.ts`; summarised here.

| Token | Light | Dark |
|---|---|---|
| bg | #FFFFFF | #0F0F12 |
| ink | #141416 | #F3F3F1 |
| ink2 | #55555C | #A2A2AA |
| rule | #E6E6EA | #2A2A31 |
| plate | #F4F4F6 | #1B1B20 |
| machine | #4651D2 | #A3ACFF |
| ember (brand only) | #FF4F1F | #FF6A3D |
| essay (lilac) | #E9E5FF | #2C2752 |
| rhymes (sky) | #DDEEFF | #16324D |
| talk (butter) | #FFF2AE | #433B12 |
| paper (mint) | #D4F5E5 | #173F2F |
| poem (pink) | #FFE1EA | #4C2333 |
| rabbit hole (peach) | #FFE4CF | #4B2F19 |

Primary actions are inverted pills (ink on bg swapped). Cards are rounded (12–20px), filled with a
type colour or `plate`, never bordered on one side.
