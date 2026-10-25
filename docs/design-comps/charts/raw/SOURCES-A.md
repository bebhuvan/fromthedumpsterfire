# Raw data for the bar, dot, dumbbell, slope and waffle comps

All retrieved 2026-10-25. Licences as each institution states them.

| File | From | URL | Licence |
|---|---|---|---|
| `wb-NY.GDP.PCAP.KD.json` (+ `.meta.json`) | World Bank, World Development Indicators: GDP per capita (constant 2015 US$) | https://api.worldbank.org/v2/country/AFG;BGD;BTN;IND;MDV;NPL;PAK;LKA/indicator/NY.GDP.PCAP.KD?format=json&per_page=20000&date=1990:2025 | CC BY-4.0 (`License_Type` in https://api.worldbank.org/v2/sources/2/series/NY.GDP.PCAP.KD/metadata?format=json) |
| `wb-NY.GDP.MKTP.KD.ZG.json` (+ `.meta.json`) | World Bank, WDI: GDP growth (annual %) | same pattern, indicator NY.GDP.MKTP.KD.ZG | CC BY-4.0 |
| `wb-SP.DYN.LE00.IN.json` (+ `.meta.json`) | World Bank, WDI: Life expectancy at birth, total (years) | same pattern, indicator SP.DYN.LE00.IN | CC BY-4.0 |
| `wb-SP.DYN.LE00.FE.IN.json` (+ `.meta.json`) | World Bank, WDI: Life expectancy at birth, female (years) | same pattern, indicator SP.DYN.LE00.FE.IN | CC BY-4.0 |
| `wb-SP.DYN.LE00.MA.IN.json` (+ `.meta.json`) | World Bank, WDI: Life expectancy at birth, male (years) | same pattern, indicator SP.DYN.LE00.MA.IN | CC BY-4.0 |
| `owid-share-elec-by-source-india.csv` | Ember, Yearly Electricity Data, via Our World in Data (grapher `share-elec-by-source`; India rows kept) | https://ourworldindata.org/grapher/share-elec-by-source.csv?v=1&csvType=full&useColumnShortNames=true | Ember: CC BY 4.0; OWID: CC BY 4.0. The series also draws on the Energy Institute's Statistical Review (© Energy Institute 2026) for early years; the 2025 figures charted are Ember's. Origins in https://api.ourworldindata.org/v1/indicators/1295506.metadata.json |
| `owid-share-elec-by-source.metadata.json` | Our World in Data chart metadata | https://ourworldindata.org/grapher/share-elec-by-source.metadata.json | CC BY 4.0 |
| `owid-temperature-anomaly.csv` (shared, fetched earlier) | Met Office Hadley Centre, HadCRUT5, via Our World in Data | https://ourworldindata.org/grapher/temperature-anomaly.csv?v=1&csvType=full&useColumnShortNames=true | Open Government Licence v3 (Met Office); CC BY 4.0 (OWID) |

Fixtures built from these (`docs/design-comps/charts/data/`): `south-asia-gdp-bar` (2025; Afghanistan
has no 2025 figure and is shown as missing), `india-growth-columns` (2000–2025), `south-asia-life-dot`,
`south-asia-life-dumbbell` and `south-asia-life-slope` (2000 and 2024, the latest year with every
country), `hemispheres-dot` (2000 and 2025 with the 95% range), `india-electricity-waffle` (2025).
Values are rounded only for display width in the fixture (GDP per capita to whole dollars, life
expectancy to 0.1 year, growth and shares to 0.01); no other change.
