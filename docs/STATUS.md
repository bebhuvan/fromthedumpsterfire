# Status

## Done

- 2026-10-15: brief, architecture, design system and decisions written. Design canvas published.

## Milestones

1. **Foundation**: npm workspaces, `packages/shared` (tokens, types, Haul bundle schema, style
   check), D1 schema, `workers/api` skeleton with capture routes. ← in progress
2. **Pipeline v1**: item Workflow: fetch, transcribe, clean (deletion-only), reading card, draft, checks.
3. **Desk v1**: tray, item review, voice capture, Android share target, behind Access.
4. **Publish + web**: bundle writer, Astro issue page in the canvas design, light and dark.
5. **Connections**: Vectorize, entity linking, edge judging, Threads.
6. **Backfill**: import old site archive and reading history.
7. **Reader app**: Expo, offline Hauls, push.

## Open questions for the editor

- Model choice and budget ceiling for the judge model.
- Where the old site's archive and reading history live, for backfill.
