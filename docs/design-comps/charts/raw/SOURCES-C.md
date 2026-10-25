# Sources for the multiples, area, scatter, bump and beeswarm comps

All retrieved 2026-10-25. The fixtures in `../data/` are built from these files by `build-C.py`
(`python3 -I docs/design-comps/charts/raw/build-C.py`).

| File | Fetched from | Licence, as the institution states it |
|---|---|---|
| `wb-life-expectancy-south-asia.json` | https://api.worldbank.org/v2/country/AFG;BGD;BTN;IND;MDV;NPL;PAK;LKA/indicator/SP.DYN.LE00.IN?format=json&per_page=20000 | CC BY-4.0 (World Bank series metadata `License_Type`, https://api.worldbank.org/v2/sources/2/series/SP.DYN.LE00.IN/metadata?format=json; licence page https://datacatalog.worldbank.org/public-licenses#cc-by) |
| `wb-2024-gdp-ppp-life-expectancy-population.csv` | A compact extract (country, region, indicator, year, value; aggregates dropped using https://api.worldbank.org/v2/country?format=json&per_page=400) of https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.PP.KD?format=json&per_page=20000&date=2024, the same for SP.DYN.LE00.IN (2024), and SP.POP.TOTL for 1960:2025 (years divisible by 5, and 2024) | CC BY-4.0 for each of the three series (series metadata `License_Type`) |
| `owid-electricity-production-by-source-india.csv` | The India rows of https://ourworldindata.org/grapher/electricity-production-by-source.csv?v=1&csvType=full&useColumnShortNames=true | Our World in Data: CC BY 4.0. Origins (from https://api.ourworldindata.org/v1/indicators/1295503.metadata.json and siblings): Ember, Yearly Electricity Data, CC BY 4.0; Energy Institute, Statistical Review of World Energy, "© Energy Institute 2026"; Pinto et al. (2023), CC BY 4.0. India's rows from 2000 come from Ember; the comp shows 2000–2025 only and records the source's span (1965–2025). |
| `owid-electricity-production-by-source.metadata.json` | https://ourworldindata.org/grapher/electricity-production-by-source.metadata.json | as above |

Notes for the editor:
- The World Bank now places Afghanistan and Pakistan in "Middle East, North Africa, Afghanistan &
  Pakistan", not South Asia; the beeswarm keeps the Bank's regions as stated.
- The bump chart ranks the countries that were among the eight most populous in any of the years
  shown, among themselves (its note says so).
- Life expectancy is rounded to one decimal place in the fixtures (the Bank publishes more digits than
  the estimate supports).
