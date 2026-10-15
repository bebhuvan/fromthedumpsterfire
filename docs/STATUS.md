# Status

## Done

- 2026-10-15: brief, architecture, design system and decisions written. Design canvas published.
- 2026-10-15: `packages/shared`: design tokens, Haul bundle types, sample Haul 001 fixture with
  invariant tests (highlights exist in text, links resolve within the bundle, citations present).
- 2026-10-15: `apps/mobile` reader app (Expo 57, React Navigation native stack):
  cover, field note with route, glossed item (standard, Rhymes and poem layouts), thread timeline,
  archive, how-it's-made. Light and dark. Offline-first bundle cache. Voice notes stream on tap.
  Articles open in an in-app browser tab; video and podcast links open in their own apps. Deep links
  for fromthedumpsterfire.com/haul/… Release builds use R8 and resource shrinking.

## Milestones

1. **Reader app**: built; next is on-device polish and a real first Haul. ← in progress
2. **Publish path**: R2 bucket `files.fromthedumpsterfire.com`, bundle writer with the invariant checks.
3. **Pipeline v1**: item Workflow: fetch, transcribe, clean (deletion-only), reading card, draft, checks.
4. **Desk v1**: tray, item review, voice capture, Android share target, quote extraction, behind Access.
5. **Web**: Astro issue page in the canvas design, light and dark.
6. **Connections**: Vectorize, entity linking, edge judging, Threads.
7. **Backfill**: import old site archive and reading history.
8. **Push**: Expo notifications when a Haul ships (adds one native module; deliberate).

## Known gaps

- The sample Haul ships inside the app until the first real Haul is published. Build launch binaries
  with `EXPO_PUBLIC_USE_SEED=0`.
- No plates in the sample Haul yet; the layout supports them.
- No drop caps in the app (React Native text can't wrap around a float); the web edition keeps them.

## Open questions for the editor

- Model choice and budget ceiling for the judge model.
- Where the old site's archive and reading history live, for backfill.
- Final pick of the app icon (current: ember flame on ink).
