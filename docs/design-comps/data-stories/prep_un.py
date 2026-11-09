"""Adds the UN's own uncertainty and age structure to data/fertility.json, straight from the UN
Population Division's files (WPP 2024, CC BY 3.0 IGO): the probabilistic projections' 80 and 95 per
cent prediction intervals for total fertility, births and population (UN_PPP2024_Input_TFR.xlsx,
UN_PPP2024_Output_Births.xlsx, UN_PPP2024_Output_PopTot.xlsx), and population by five-year age group
and sex, medium variant (WPP2024_PopulationByAge5GroupSex_Medium.csv.gz).
Usage: uv run --with openpyxl python -I prep_un.py <dir with the UN files> data/fertility.json"""
import csv, gzip, io, json, sys
import openpyxl

UN, OUT = sys.argv[1], sys.argv[2]
PLACES = {"World": "World", "India": "India", "Republic of Korea": "South Korea"}
SHEETS = {"Lower 95": "lo95", "Lower 80": "lo80", "Median": "median", "Upper 80": "hi80", "Upper 95": "hi95"}

def intervals(name, scale=1.0):
    wb = openpyxl.load_workbook(f"{UN}/{name}", read_only=True)
    out = {}
    for ws in wb.worksheets:
        key = SHEETS.get(ws.title)
        if not key: continue
        # These files state a sheet size smaller than their data; read every cell.
        ws.reset_dimensions()
        years = None
        for row in ws.iter_rows(values_only=True):
            if row and row[0] == "Index": years = [int(y) for y in row[10:] if y is not None]; continue
            if years and row and row[2] in PLACES:
                p = PLACES[row[2]]
                out.setdefault(p, {})[key] = [[y, round(float(v) * scale, 3)] for y, v in zip(years, row[10:]) if v is not None]
    return out

d = json.load(open(OUT))
# Births and population in these files are in thousands.
d["intervals"] = {"tfr": intervals("UN_PPP2024_Input_TFR.xlsx"), "births": intervals("UN_PPP2024_Output_Births.xlsx", 1000), "pop": intervals("UN_PPP2024_Output_PopTot.xlsx", 1000)}

pyr = {}
with gzip.open(f"{UN}/WPP2024_PopulationByAge5GroupSex_Medium.csv.gz", "rt", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        if r["ISO3_code"] == "IND" and r["Time"] in ("1990", "2023", "2061", "2100"):
            pyr.setdefault(r["Time"], []).append([r["AgeGrp"], int(r["AgeGrpStart"]), round(float(r["PopMale"]) * 1000), round(float(r["PopFemale"]) * 1000)])
for y in pyr: pyr[y].sort(key=lambda a: a[1])
d["pyramid"] = {"India": pyr}
d["source"]["un_files"] = ["https://population.un.org/wpp/assets/Excel%20Files/2_Indicators%20(Probabilistic)/EXCEL_FILES/3_Fertility/UN_PPP2024_Input_TFR.xlsx",
    "https://population.un.org/wpp/assets/Excel%20Files/2_Indicators%20(Probabilistic)/EXCEL_FILES/3_Fertility/UN_PPP2024_Output_Births.xlsx",
    "https://population.un.org/wpp/assets/Excel%20Files/2_Indicators%20(Probabilistic)/EXCEL_FILES/2_Population/UN_PPP2024_Output_PopTot.xlsx",
    "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_PopulationByAge5GroupSex_Medium.csv.gz"]
d["methods"]["intervals"] = "The UN's probabilistic projections: the range within which the UN puts 80 and 95 per cent of its simulated futures, 2024 to 2100."
json.dump(d, open(OUT, "w"), separators=(",", ":"))
for k, v in d["intervals"].items(): print(k, {p: {s: (x[0], x[-1]) for s, x in q.items()} for p, q in v.items()})
print({y: len(v) for y, v in pyr.items()})
