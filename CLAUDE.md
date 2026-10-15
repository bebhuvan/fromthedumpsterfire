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
apps/web          Astro site + the Desk (private, behind Cloudflare Access)
apps/mobile       Expo reader app
workers/api       public read API, capture, publish
workers/pipeline  Workflows + queue consumers (ingest, read, link, check)
packages/shared   schema types, design tokens, style check, Haul bundle format
migrations/       D1 migrations
```

## Conventions

- npm workspaces, TypeScript everywhere, Node >= 22. Scripts run with `node --experimental-strip-types`.
- `wrangler.jsonc` per worker with `preview` and `production` envs; spend ceilings as vars.
- Tests: vitest. Run `npm run verify` before calling anything done.
- Keep `docs/STATUS.md` and this file current when the shape of the code changes.
