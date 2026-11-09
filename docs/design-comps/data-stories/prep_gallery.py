"""Rows for the chart gallery, from the same Our World in Data CSVs of UN World Population Prospects
2024 as prep.py: fertility, median age and population for every country of a million people or more,
1950 to 2100. Usage: python3 -I prep_gallery.py <dir with the OWID csvs> ../../../packages/shared/fixtures/stories/gallery.json"""
import csv, json, re, sys, collections

RAW, OUT = sys.argv[1], sys.argv[2]

def load(slug):
    d, codes = collections.defaultdict(dict), {}
    with open(f"{RAW}/{slug}.csv") as f:
        r = csv.reader(f); next(r)
        for row in r:
            e, c, y = row[0], row[1], int(row[2])
            codes[e] = c
            v = row[3] or (row[4] if len(row) > 4 else "")
            if v: d[e][y] = float(v)
    return d, codes

tfr, codes = load("fertility-rate-with-projections")
age, _ = load("median-age")
pop, _ = load("population-with-un-projections")
# Countries and territories only (ISO alpha-3, plus Kosovo), of a million people or more in 2023.
countries = sorted(e for e, c in codes.items() if (re.fullmatch(r"[A-Z]{3}", c or "") or c == "OWID_KOS") and e in tfr and e in age and e in pop and pop[e].get(2023, 0) >= 1e6)
yrs = lambda d, a, b: [[y, round(d[y], 3)] for y in range(a, b + 1) if y in d]
out = {
    "source": {"maker": "United Nations, Population Division", "dataset": "World Population Prospects 2024", "licence": "CC BY 3.0 IGO",
               "via": "Our World in Data (CC BY 4.0)", "retrieved": "2026-11-09",
               "slugs": ["fertility-rate-with-projections", "median-age", "population-with-un-projections"]},
    "countries": [{"name": e, "code": codes[e], "tfr": yrs(tfr[e], 1950, 2100), "medianAge": yrs(age[e], 1950, 2100),
                   "pop": [[y, round(pop[e][y])] for y in range(1950, 2101) if y in pop[e]]} for e in countries],
    "world": {"tfr": yrs(tfr["World"], 1950, 2100), "medianAge": yrs(age["World"], 1950, 2100)},
}
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print(len(countries), "countries")
