"""Builds the fertility story's rows for the data-story comps from Our World in Data's CSVs of
UN World Population Prospects 2024. Usage: python3 -I prep.py <dir with the OWID csvs> <out.json>.
Every number the comps draw comes from this file; derived rows say how they were derived."""
import csv, json, re, sys, collections

RAW, OUT = sys.argv[1], sys.argv[2]
REPL, LOW = 2.1, 1.5

def load(slug):
    d, codes = collections.defaultdict(dict), {}
    with open(f"{RAW}/{slug}.csv") as f:
        r = csv.reader(f); next(r)
        for row in r:
            e, c, y = row[0], row[1], int(row[2]); codes[e] = c
            v = row[3] or (row[4] if len(row) > 4 else '')
            if v: d[e][y] = float(v)
    return d, codes

def load2(slug, est, proj):
    d = collections.defaultdict(dict)
    with open(f"{RAW}/{slug}.csv") as f:
        r = csv.reader(f); h = next(r); i, j = h.index(est), h.index(proj)
        for row in r:
            v = row[i] or row[j]
            if v: d[row[0]][int(row[2])] = float(v)
    return d

tfr, codes = load("fertility-rate-with-projections")
pop, _ = load("population-with-un-projections")
births = load2("births-and-deaths-projected-to-2100", "births__sex_all__age_all__variant_estimates", "births__sex_all__age_all__variant_medium__projected")
deaths = load2("births-and-deaths-projected-to-2100", "deaths__sex_all__age_all__variant_estimates", "deaths__sex_all__age_all__variant_medium__projected")
# Countries and territories only: ISO alpha-3 codes, plus Kosovo (OWID_KOS). Regions and income groups
# carry UN_ or OWID_ codes or none, and must never be counted as countries.
countries = sorted(e for e, c in codes.items() if (re.fullmatch(r"[A-Z]{3}", c or "") or c == "OWID_KOS") and e in tfr and e in pop)
r2 = lambda x: round(x, 3)

big = [e for e in countries if pop[e].get(2023, 0) >= 1e6]
field = {e: [r2(tfr[e][y]) for y in range(1950, 2024)] for e in big}
field_proj = {e: [round(tfr[e][y], 2) for y in range(2023, 2101, 1)] for e in big}

crossing = []
for e in big:
    v = tfr[e]
    if v[1950] < REPL: when, kind = 1950, "before"
    else:
        y = next((y for y in range(1951, 2101) if v[y] < REPL), None)
        when, kind = (y, "estimate" if y and y <= 2023 else ("projected" if y else "never"))
    crossing.append({"country": e, "code": codes[e], "year": when, "kind": kind, "pop2023": round(pop[e][2023]), "tfr2023": r2(v[2023])})

share = []
for y in range(1950, 2024):
    tot = sum(pop[e][y] for e in countries if y in pop[e] and y in tfr[e])
    below = sum(pop[e][y] for e in countries if y in pop[e] and y in tfr[e] and tfr[e][y] < REPL)
    share.append([y, round(100 * below / tot, 2)])

floor = []
for e in big:
    v = tfr[e]
    first = next((y for y in range(1950, 2024) if v[y] < LOW), None)
    if first is None: continue
    after = [r2(v[y]) for y in range(first, 2024)]
    floor.append({"country": e, "first": first, "min": min(after), "max_after": max(after), "tfr2023": r2(v[2023]), "path": after})

world = {"tfr": [[y, r2(tfr["World"][y])] for y in range(1950, 2101)],
         "births": [[y, round(births["World"][y])] for y in range(1950, 2101)],
         "deaths": [[y, round(deaths["World"][y])] for y in range(1950, 2101)],
         "pop": [[y, round(pop["World"][y])] for y in range(1950, 2101)]}
regions = ["Africa (UN)", "Asia (UN)", "Europe (UN)", "Latin America and the Caribbean (UN)", "Northern America (UN)", "Oceania (UN)"]
birth_share = {reg: [[y, round(100 * births[reg][y] / births["World"][y], 2)] for y in range(1950, 2101)] for reg in regions}
named = {e: {"tfr": [[y, r2(tfr[e][y])] for y in range(1950, 2101)], "pop": [[y, round(pop[e][y])] for y in range(1950, 2101)]}
         for e in ["India", "China", "South Korea", "Japan", "Italy", "United States", "Nigeria", "Niger", "Iran", "Bangladesh", "Hungary", "France", "Thailand", "Brazil", "Pakistan"]}

src = {"maker": "United Nations, Department of Economic and Social Affairs, Population Division",
       "dataset": "World Population Prospects 2024", "url": "https://population.un.org/wpp/",
       "licence": "CC BY 3.0 IGO", "via": {"name": "Our World in Data", "licence": "CC BY 4.0",
       "urls": ["https://ourworldindata.org/grapher/fertility-rate-with-projections", "https://ourworldindata.org/grapher/population-with-un-projections", "https://ourworldindata.org/grapher/births-and-deaths-projected-to-2100"]},
       "retrieved": "2026-11-09", "variant": "estimates to 2023, medium projection 2024 to 2100"}
methods = {"crossing": "The first year a country's total fertility rate is below 2.1 in the UN's estimates (to 2023) or its medium projection (2024 to 2100). Countries of a million people or more in 2023.",
           "share": "The share of the world's people living in a country whose total fertility rate that year is below 2.1, weighting each country by its population.",
           "floor": "Countries of a million people or more whose fertility fell below 1.5 by 2023, and their path from that year on."}
json.dump({"source": src, "methods": methods, "world": world, "crossing": crossing, "share": share, "floor": floor,
           "birthShare": birth_share, "named": named, "field": field, "fieldProj": field_proj}, open(OUT, "w"), separators=(",", ":"))
print("countries", len(big), "floor", len(floor), "never", sum(c["kind"] == "never" for c in crossing), "projected", sum(c["kind"] == "projected" for c in crossing), "before", sum(c["kind"] == "before" for c in crossing))
