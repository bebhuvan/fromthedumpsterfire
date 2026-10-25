# Sources for the value-form comps (stripes, band, calendar, heatmap, ridgeline)

All retrieved 2026-10-25.

## open-meteo-delhi-daily-1940-2025.csv.gz

Daily 2 m temperature maximum and minimum (°C), 1 January 1940 to 31 December 2025, for New Delhi
(requested 28.61° N, 77.21° E; the API answered with grid point 28.576° N, 77.187° E, elevation 217 m),
timezone Asia/Kolkata. 31,412 days, none missing. Converted from the API's JSON to CSV (date, tmax,
tmin) without changing any value.

- URL: https://archive-api.open-meteo.com/v1/archive?latitude=28.61&longitude=77.21&start_date=1940-01-01&end_date=2025-12-31&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FKolkata
- Data: ERA5 reanalysis (ECMWF, Copernicus Climate Change Service), from 1940; Open-Meteo also
  blends ERA5-Land and ECMWF IFS in its historical API (https://open-meteo.com/en/docs/historical-weather-api).
  Reanalysis is a weather model fitted to observations, not a station record; extremes are smoothed.
- Licence, as stated at https://open-meteo.com/en/licence: "API data are offered under Attribution
  4.0 International (CC BY 4.0)". Attribution required: "You must give appropriate credit, provide a
  link to the licence, and indicate if changes were made … You must include a link next to any
  location Open-Meteo data are displayed, for example: Weather data by Open-Meteo.com". The free
  API is for non-commercial use (the docs page offers Non-Commercial / Commercial usage licences).
- Citation suggested by Open-Meteo: Zippenfenig, P. (2023). Open-Meteo.com Weather API. Zenodo.
  https://doi.org/10.5281/ZENODO.7970649 ; Hersbach, H. et al. (2023). ERA5 hourly data on single
  levels from 1940 to present. ECMWF. https://doi.org/10.24381/cds.adbb2d47

Fixtures built from it by `docs/design-comps/charts/build-b.ts` (all derived numbers computed by code;
each chart's `method` says how): `delhi-band-2024.json` (bandSummary, normals 1991–2020, records
1940–2024), `delhi-calendar-2024.json` (each day's high, as recorded), `delhi-heatmap-months.json`
(average of each month's daily highs, 1950–2025, rounded to 0.1), `delhi-ridgeline-may.json` (every
May day's high, grouped by decade; the 2020s group holds 2020–2025 only and is labelled so).

## owid-temperature-anomaly.csv (already in raw/)

Used for `temperature-stripes.json` (World rows, 1850–2025; 2026 is left out as a partial year).
HadCRUT5 (Met Office Hadley Centre, Open Government Licence v3) via Our World in Data (CC BY 4.0),
anomaly relative to the 1861–1890 average; the stripes' midpoint is that average.
