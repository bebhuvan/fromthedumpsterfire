# From the Dumpster Fire

An irregular, eclectic magazine of things worth salvaging from the internet and the archive.
One editor (Bhuvanesh) chooses and annotates, mostly by voice. Language models read, cross-link,
fact-check and draft; the editor approves everything. Published as **Hauls** to an Expo app
(Android + iOS) and a website at fromthedumpsterfire.com. Everything runs on Cloudflare.

Read these before working:

- `docs/BRIEF.md`: what the publication is and why. The editorial rules matter.
- `docs/ARCHITECTURE.md`: system design, Cloudflare bindings, pipeline, publish flow.
- `docs/DESIGN.md`: the visual system. Tokens live in `packages/shared/src/tokens.ts`.
- `docs/DECISIONS.md`: settled decisions and what was rejected. Don't relitigate them.
- `docs/STATUS.md`: what's built and what's next. Update it as you go.

## Non-negotiables

- **The editor's words are never reworded.** Voice-note cleanup may only delete fillers and fix
  punctuation; code enforces deletion-only.
- **Models never emit URLs.** They emit queries; code resolves them against real sources and fetches
  each link before it can ship.
- **Every excerpt is matched verbatim** against the fetched source text. No match, no ship.
- **Every machine margin note cites a source** and passes a check against it.
- **Human vs machine is always visible:** serif is the editor, the blue sans is the machine.
- **No AI-generated images.** Plates are public domain, with licence recorded.
- **Model prose passes the style check** in `packages/shared` (no em-dash chains, no "not X but Y",
  banned-word list) before the editor sees it.
- Secrets live in `.dev.vars` / `wrangler secret`, never in code, config or commands.

## Layout

```
apps/web          Astro site (not built yet)
apps/desk         the Desk UI: Vite + React SPA, served by workers/api (private, behind Access)
apps/mobile       Expo reader app
workers/api       the Desk Worker: UI assets, capture, review, publish; public POST /v1/devices
workers/pipeline  ItemWorkflow + ingest queue consumer (fetch, read, wiki, draft, judge, check, push)
packages/server   Worker-side code shared by both: D1, model router, extraction, publish, FCM
packages/shared   schema types, design tokens, style check, verbatim, cleanup, detect, validator
migrations/       D1 migrations
scripts/          verify-bundle.ts
```

## The Desk (apps/desk, workers/*, packages/server)

- Every request runs the Worker first; the in-Worker Access check is fail-closed. Public routes are
  exact method + path (`POST /v1/devices`, `GET /v1/health`). Never add a route that skips the lock
  without adding it to `isPublicRoute` and a test. UI writes send `x-desk: 1` and JSON.
- Every fetch of a URL that came from the editor or a source goes through `guardedFetch` (SSRF).
- Model calls only through `generateJson` / `transcribeAudio` in `packages/server/src/models/router.ts`
  (routes in `routes.json`, ledger and ceiling in `spend.ts`). Prompts and schemas in `prompts.ts`.
- Machine prose is audited with `checkStyle`; editor text is never sent to a model for rewriting.
- Never render stored or model text as HTML in the UI (no `dangerouslySetInnerHTML`); links go
  through `safeHref`.
- Local: `workers/api/.dev.vars` with `ENVIRONMENT=local` and `DEV_AUTH_BYPASS=1`; see
  `docs/ARCHITECTURE.md` (Running the Desk). What is deployed and what the editor must set up:
  `docs/STATUS.md`.

## The reader app (apps/mobile)

- Expo 57 with Continuous Native Generation: never edit `android/` or `ios/`; configure in `app.json`.
- Lean by rule. Every new dependency needs a reason, and check what it links natively with
  `npx expo-modules-autolinking resolve -p android --json`. No Expo Router, Reanimated, SVG runtime,
  icon fonts or UI kits; icons are drawn with views.
- `src/App.tsx` (navigator + deep links in `src/nav.ts`), `src/routes.tsx` (params to data),
  `src/screens/*`, `src/ui/*` (type roles in `type.tsx`), `src/lib/data.ts` (offline-first bundles).
- Fonts are embedded static cuts; use the names in `src/theme.ts` and never set fontWeight/fontStyle.
- Build a release APK: `cd apps/mobile && npx expo prebuild -p android --clean && cd android &&
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` (ANDROID_HOME=~/android-sdk).

## Conventions

- npm workspaces, TypeScript everywhere, Node >= 22. Scripts run with `node --experimental-strip-types`.
- `wrangler.jsonc` per worker with `preview` and `production` envs; spend ceilings as vars.
- Tests: vitest. Run `npm run verify` before calling anything done.
- Keep `docs/STATUS.md` and this file current when the shape of the code changes.
