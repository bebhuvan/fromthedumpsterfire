# From the Dumpster Fire

Irregular hauls of things worth salvaging from the internet and the archive, at
[fromthedumpsterfire.com](https://fromthedumpsterfire.com).

One editor chooses and annotates, mostly by voice. Language models read, cross-link and fact-check;
code checks every quotation word for word against its source, and nothing is published until the
editor approves it. The serif is the editor; the blue sans is the machine.

This is the whole of it: the website (`apps/web`), the editor's Desk (`apps/desk`, `workers/*`), the
reader app (`apps/mobile`) and the code they share (`packages/*`). It all runs on Cloudflare.

Start with `docs/BRIEF.md` for what it is and why, and `docs/ARCHITECTURE.md` for how it works.

```bash
npm ci
npm run verify
```
