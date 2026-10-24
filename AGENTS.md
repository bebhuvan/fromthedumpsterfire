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
- `docs/MODELS.md`: each model provider's capabilities, limits, prices and sources, and the chain
  per task with its reasoning and cost.
- `docs/VOICE.md`: the editor's measured writing voice and the AI patterns to keep out of machine
  drafts. Machine-usable form in `packages/shared/src/voice.ts`.

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
apps/web          public website: Astro on the fdf-web Worker, rendering published bundles from R2 per request
apps/desk         the Desk UI: Vite + React SPA, served by workers/api (private, behind Access)
apps/mobile       Expo reader app
workers/api       the Desk Worker: UI assets, capture, review, publish; public POST /v1/devices and
                  GET /v1/updates(/asset)
workers/pipeline  ItemWorkflow + ingest queue consumer (fetch, read, wiki, plate, embed, connect, draft,
                  judge, check, push)
packages/server   Worker-side code shared by both: D1, model router, extraction, plates, connections and
                  threads (connect.ts), rhymes, blocks, publish, FCM
packages/shared   schema types, design tokens, style check, voice profile, verbatim, cleanup, detect,
                  validator, quoting (excerpt length guide, when to draw out big ideas)
migrations/       D1 migrations
scripts/          verify-bundle.ts, local-dev-config.ts, probe-plates.ts, smoke-models.ts,
                  publish-app-update.ts (signed over-the-air app updates)
```

## The Desk (apps/desk, workers/*, packages/server)

- Every request runs the Worker first; the in-Worker Access check is fail-closed. Public routes are
  exact method + path (`POST /v1/devices`, `GET /v1/health`, `GET /v1/updates`, `GET /v1/updates/asset`). Never add a route that skips the lock
  without adding it to `isPublicRoute` and a test. UI writes send `x-desk: 1` and JSON.
- Every fetch of a URL that came from the editor or a source goes through `guardedFetch` (SSRF),
  and every untrusted body is read with a byte cap on what is actually streamed
  (`extract/stream.ts`), never trusting Content-Length. Browser Rendering is opt-in
  (`BROWSER_FALLBACK=on`) and vets every request the page makes.
- Model calls only through `generateJson` / `transcribeAudio` / `embedTexts` in
  `packages/server/src/models/router.ts` (chains, capabilities and prices in `routes.json`; native
  adapters in `models/providers/`; retries in `models/http.ts`; ledger and ceiling in `spend.ts`).
  Prompts and schemas in `prompts.ts`. Provider facts, dated, in `docs/MODELS.md`: re-check the
  provider's docs before changing a model id, price or parameter. Never send a provider key in a URL.
- Two R2 buckets: MEDIA is private Desk material; FILES is public and holds only `hauls/`. Only
  `publish.ts` writes to FILES; published plates and voice notes are copied there (never hotlinked),
  and `validateHaul(…, { filesBase })` enforces it.
- Articles are fetched in a fixed order (ARCHITECTURE "Article fetch order"): platform routes
  (Substack API and feed, WordPress REST, Medium RSS) before the page, the Wayback Machine (latest
  copy, else Save Page Now) after a refusal. Free content only: a paid preview fails the fetch and
  is never stored as the piece. The item keeps the original link; `sources.meta.via` says where the
  text came from. No paid scrapers, proxies, bot-check evasion or disguised user agents.
- Item blocks (pull quotes, code, video, audio, pictures; `packages/server/src/blocks.ts`) follow the
  same rules: quotes and code verified against the stored source (none on an item without source
  text), embeds parsed from the editor's link by code, posters and pictures fetched through
  `guardedFetch` with a byte cap and kept in MEDIA, pictures only with the editor's credit and
  licence. `publish.ts` copies them to FILES, with the share card the Desk draws in the browser.
- Machine-suggested connections, rhyme quotes and plate metadata follow the same rules as excerpts:
  quotes verified verbatim against stored source text at both ends, licences as the institution
  states them. A kept connection's published note is the editor's own words.
- Machine prose is audited with `checkStyle`; editor text is never sent to a model for rewriting.
- Machine notes and big ideas the judge cannot fully confirm are set aside (`rejected`) and never
  shown; only lines the editor ticks are published. Excerpt length follows `excerptCap` in
  `@fdf/shared/quoting`; links to originals name the person (`sourceAction`).
- Never render stored or model text as HTML in the UI (no `dangerouslySetInnerHTML`); links go
  through `safeHref`.
- Local: `workers/api/.dev.vars` with `ENVIRONMENT=local` and `DEV_AUTH_BYPASS=1`, then
  `scripts/local-dev-config.ts` (local Worker names, because Access refuses wrangler's remote session); see
  `docs/ARCHITECTURE.md` (Running the Desk). What is deployed and what the editor must set up:
  `docs/STATUS.md`.

## The website (apps/web)

- Astro server output on the `fdf-web` Worker. Pages render per request from the R2 binding `FILES`
  (`fdf-files` / `fdf-public-preview`, read only), so a Desk publish needs no deploy. The wrapper in
  `src/worker/index.ts` does redirects, the 405 rule, the edge cache (key: deploy version + index
  `updatedAt` + path) and all security headers; the data layer is `src/lib/store.ts`.
- Every bundle passes `validateHaul` before it renders; a failing bundle falls back to an earlier
  version or a 503, never a crash. URL shapes in `src/lib/site.ts` match the app's deep links
  (`/haul/<n>`, `/haul/<n>/<item>`, `/haul/<n>/thread/<id>`).
- Never `set:html`; bundle text is always escaped, italic title tails render as `<em>`, external
  links go through `safeHref` (http/https only). No inline scripts or styles: the CSP in
  `src/worker/lib.ts` is `script-src 'self'; style-src 'self'`.
- Colours come only from `/tokens.css`, generated from `packages/shared/src/tokens.ts`. `.machine` (blue
  sans) is for machine text only. Fonts are woff2 subsets built by `scripts/fonts.sh`.
- Design is Salvage (`docs/DESIGN.md`): each item renders in its printed form, chosen in
  `src/lib/forms.ts`; one loud thing per screen; no pills, chips or rounded cards. Comps and the
  screenshot script (`docs/design-comps/_shared/shoot.mjs`, takes a URL) are in `docs/design-comps/`.
- Client JS is only the theme toggle and search. `npm run web:dev` (put `FDF_USE_SEED=1` in
  `apps/web/.dev.vars` for sample data), `npm run deploy:web:preview`, `npm run deploy:web`.
  `npm run size -w @fdf/web` measures the Worker bundle.

## The reader app (apps/mobile)

- Expo 57 with Continuous Native Generation: never edit `android/` or `ios/`; configure in `app.json`.
- Lean by rule. Every new dependency needs a reason, and check what it links natively with
  `npx expo-modules-autolinking resolve -p android --json`. No Expo Router, Reanimated, SVG runtime,
  icon fonts or UI kits; icons are drawn with views.
- `src/App.tsx` (navigator + deep links in `src/nav.ts`), `src/routes.tsx` (params to data),
  `src/screens/*`, `src/ui/*` (type roles in `type.tsx`), `src/lib/data.ts` (offline-first bundles).
  The bar is the website's nav (Latest, Threads, Archive, Search, Menu; `ui/TabBar.tsx`); Menu
  (`screens/Menu.tsx`) reaches Saved, About and Settings. Forms in `lib/forms.ts` (the website's
  choice), blocks in `ui/Blocks.tsx`, the fingerprint in `ui/Fingerprint.tsx` + `lib/fpGeometry.ts`,
  edition ink via `useEdition(haul)` and `Screen edition=`. No SVG: marks are tinted PNGs in
  `assets/marks/`. Development builds carry sample Hauls 001 to 003 (`lib/seed*.ts`); launch builds
  (`EXPO_PUBLIC_USE_SEED=0`) carry none.
- Fonts are embedded static cuts; use the names in `src/theme.ts` and never set fontWeight/fontStyle.
- Build a release APK: `cd apps/mobile && npm run prebuild:android && npm run build:android`
  (ANDROID_HOME=~/android-sdk; `ARCH=x86_64` for the emulator). `build:android` forces the JS
  bundle to rebuild: Gradle's up-to-date check only watches apps/mobile, so edits in
  packages/shared would otherwise ship a stale bundle.
- JS-only changes ship over the air: `npm run app:update` (signed with the key in
  `~/.config/fdf/app-updates/`, served by `/v1/updates` on the Desk Worker; `-- --rollback` undoes).
  Native changes (new modules, `app.json` plugins, Firebase, even `apps/mobile/.gitignore`) change the
  fingerprint and need a new APK; the script prints the runtime it targets (`assets/fingerprint` in the APK).
- Plates and voice notes must be served from our files host. Archives such as Wikimedia refuse the
  app's image requests (403 even with a descriptive User-Agent), so never hotlink them.

## Conventions

- npm workspaces, TypeScript everywhere, Node >= 22. Scripts run with `node --experimental-strip-types`.
- `wrangler.jsonc` per worker with `preview` and `production` envs; spend ceilings as vars.
- Tests: vitest. Run `npm run verify` before calling anything done.
- highlight.js types load the DOM library; Worker tsconfigs map it to `packages/server/types/highlight.d.ts`.
- Keep `docs/STATUS.md` and this file current when the shape of the code changes.
