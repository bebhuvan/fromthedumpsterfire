# From the Dumpster Fire

Irregular hauls of things worth salvaging from the internet and the archive, at
[fromthedumpsterfire.com](https://fromthedumpsterfire.com).

One editor chooses and annotates, mostly by voice. Language models read, cross-link, fact-check and
add what they know (the backstory, what happened next, the telling number), but only what they can
quote from a source the Desk has fetched itself; code checks every quotation word for word, a second
model checks every note against it, and nothing is published until the editor approves it. The serif
is the editor; the blue sans is the machine.

This is the whole of it: the website (`apps/web`), the editor's Desk (`apps/desk`, `workers/*`), the
reader app (`apps/mobile`) and the code they share (`packages/*`). It all runs on Cloudflare.

Start with `docs/BRIEF.md` for what it is and why, and `docs/ARCHITECTURE.md` for how it works.

A Haul is made either on the Desk in a browser or from an agent session (Claude Code, Codex, Gemini)
that runs the editorial command line while the editor dictates: `docs/PLAYBOOK.md` is that routine,
`docs/EDITORIAL.md` the reference, and `npm run editorial -- --help` the commands.

```bash
npm ci
npm run verify
```
