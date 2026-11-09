# Data stories: comps

Mock-ups for a weekly data story, a visual grammar for telling one story in a sequence of figures.
The first story is the fertility story behind Haul 002's Geruso and Spears paper.

- `prep.py` turns Our World in Data's CSVs of UN World Population Prospects 2024 into
  `data/fertility.json`, the only numbers the comps draw. Derived rows (the crossing year, the share of
  people below replacement, the countries below 1.5) carry their method in the file.
- `kit.ts` (scales, measured text, a beeswarm packer, a label placer), `charts.ts` (the figures, each
  drawn again for the phone rather than scaled), `build.ts` (the pages).
- `atlas.ts` draws the recommended direction's plates; `prep_un.py` adds the UN's own 80 and 95 per
  cent ranges and India's population by age (run with `uv run --with openpyxl`).
- `shoot.sh` builds the pages and screenshots them into `shots/` (phone and desktop, light and dark,
  with reduced motion so the scroll-drawn lines are still).
- `check.mjs` opens each page in Chromium at 390 and 1440 px and fails on any two labels that overlap
  or any label off its figure, measured as drawn with the real fonts.

## The directions

- `atlas.html`: **recommended**, the hybrid an adversarial review asked for (plates, hatching for
  the UN's projections and its ranges, the editor's margin, three movements, a fold-out plate). It
  passes `check.mjs` at both widths.
- `plates.html`, `desk.html`, `specimen.html`: the first three directions, kept for comparison. They
  are superseded and still fail `check.mjs` in places.

The story's words in the comps are a machine draft written for the comps; every figure in them is read
from `data/fertility.json` by `build.ts`. The standfirst is the editor's note on the paper, unchanged.
The paper's quotation is from its stored text in Haul 002 and matches it word for word.

Data: United Nations, World Population Prospects 2024 (CC BY 3.0 IGO), via Our World in Data
(CC BY 4.0), fetched 2026-11-09: `fertility-rate-with-projections`, `population-with-un-projections`,
`births-and-deaths-projected-to-2100`, `number-of-births-per-year`.
