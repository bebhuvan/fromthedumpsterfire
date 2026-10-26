#!/usr/bin/env python3
# Builds the comps fixtures for multiples, area, scatter, bump and beeswarm from the raw extracts in
# this directory (see SOURCES-C.md). Run: python3 -I docs/design-comps/charts/raw/build-C.py
import csv, json, os
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'data')
R = '2026-10-25'
WB = lambda ind, name: {'maker': 'World Bank', 'dataset': f'World Development Indicators: {name} ({ind})', 'url': f'https://data.worldbank.org/indicator/{ind}', 'licence': 'CC BY-4.0', 'licenceUrl': 'https://datacatalog.worldbank.org/public-licenses#cc-by', 'retrieved': R}

def write(name, chart):
    json.dump(chart, open(os.path.join(out, name + '.json'), 'w'), indent=1, ensure_ascii=False)

# ---- multiples: life expectancy in South Asia
le = [r for r in json.load(open(os.path.join(here, 'wb-life-expectancy-south-asia.json')))[1] if r['value'] is not None]
rows = sorted([[r['country']['value'], int(r['date']), round(r['value'], 1)] for r in le], key=lambda r: (r[0], r[1]))
write('multiples-life-expectancy', {
    'form': 'multiples', 'title': 'Everyone in South Asia lives longer now, Afghanistan least of all',
    'units': 'years', 'geography': 'South Asia', 'span': {'from': '1960', 'to': '2024'}, 'sourceSpan': {'from': '1960', 'to': '2024'},
    'sources': [WB('SP.DYN.LE00.IN', 'Life expectancy at birth, total (years)')],
    'measure': {'basis': 'absolute'},
    'data': {'columns': [{'key': 'country', 'label': 'Country', 'type': 'text'}, {'key': 'year', 'label': 'Year', 'type': 'year'}, {'key': 'life', 'label': 'Life expectancy at birth', 'type': 'number', 'unit': 'years'}], 'rows': rows},
    'encode': {'x': 'year', 'y': 'life', 'facet': 'country'}, 'options': {'focus': ['India']},
})

# ---- 2024 extracts
ex = list(csv.DictReader(open(os.path.join(here, 'wb-2024-gdp-ppp-life-expectancy-population.csv'))))
def latest(ind, year='2024'):
    return {r['country']: (float(r['value']), r['region']) for r in ex if r['indicator'] == ind and r['year'] == year}
gdp, life, pop = latest('NY.GDP.PCAP.PP.KD'), latest('SP.DYN.LE00.IN'), latest('SP.POP.TOTL')
SA = ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Afghanistan', 'Bhutan', 'Maldives']
both = sorted(c for c in gdp if c in life and c in pop)
write('scatter-wealth-health', {
    'form': 'scatter', 'title': 'Richer countries live longer, but money buys less health at the top',
    'units': 'years', 'geography': 'World', 'span': {'from': '2024', 'to': '2024'},
    'sources': [WB('NY.GDP.PCAP.PP.KD', 'GDP per capita, PPP (constant 2021 international $)'), WB('SP.DYN.LE00.IN', 'Life expectancy at birth, total (years)'), WB('SP.POP.TOTL', 'Population, total')],
    'measure': {'basis': 'per-capita', 'money': {'currency': 'international $', 'prices': 'real', 'baseYear': 2021}},
    'data': {'columns': [{'key': 'country', 'label': 'Country', 'type': 'text'}, {'key': 'gdp', 'label': 'GDP per person, PPP', 'type': 'number', 'unit': 'international $ (2021 prices)'}, {'key': 'life', 'label': 'Life expectancy at birth', 'type': 'number', 'unit': 'years'}, {'key': 'pop', 'label': 'Population', 'type': 'number', 'unit': 'people'}],
             'rows': [[c, round(gdp[c][0]), round(life[c][0], 1), int(pop[c][0])] for c in both]},
    'encode': {'x': 'gdp', 'y': 'life', 'label': 'country', 'size': 'pop'}, 'scale': {'x': {'log': True}},
    'options': {'focus': ['India', 'China', 'United States', 'Nigeria', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Japan']},
    'annotations': [{'kind': 'point', 'x': 'India', 'text': 'India: longer lives than its income alone would predict?', 'by': 'editor'}],
})

# ---- beeswarm: life expectancy by region
regions = {}
for c, (v, reg) in life.items(): regions.setdefault(reg, []).append(c)
write('beeswarm-life-expectancy', {
    'form': 'beeswarm', 'title': 'How long people live, country by country',
    'note': 'Each dot is a country. South Asia sits in the middle of the world.',
    'units': 'years', 'geography': 'World', 'span': {'from': '2024', 'to': '2024'},
    'sources': [WB('SP.DYN.LE00.IN', 'Life expectancy at birth, total (years)')],
    'measure': {'basis': 'absolute'},
    'data': {'columns': [{'key': 'country', 'label': 'Country', 'type': 'text'}, {'key': 'region', 'label': 'Region', 'type': 'text'}, {'key': 'life', 'label': 'Life expectancy at birth', 'type': 'number', 'unit': 'years'}],
             'rows': sorted([[c, life[c][1].strip(), round(life[c][0], 1)] for c in life], key=lambda r: (r[1], r[0]))},
    'encode': {'y': 'life', 'series': 'region', 'label': 'country'}, 'options': {'focus': ['India', 'Japan', 'Nigeria', 'Chad', 'Hong Kong SAR, China']},
})

# ---- bump: the most populous countries
popy = {}
for r in ex:
    if r['indicator'] == 'SP.POP.TOTL': popy.setdefault(int(r['year']), {})[r['country']] = float(r['value'])
years = list(range(1960, 2021, 10)) + [2024]
ever = set()
for y in years: ever |= set(sorted(popy[y], key=lambda c: -popy[y][c])[:8])
write('bump-population', {
    'form': 'bump', 'title': 'India passes China',
    'note': 'The most populous countries, ranked among themselves each decade.',
    'units': 'people', 'geography': 'World', 'span': {'from': '1960', 'to': '2024'}, 'sourceSpan': {'from': '1960', 'to': '2025'},
    'sources': [WB('SP.POP.TOTL', 'Population, total')],
    'measure': {'basis': 'absolute'},
    'data': {'columns': [{'key': 'country', 'label': 'Country', 'type': 'text'}, {'key': 'year', 'label': 'Year', 'type': 'year'}, {'key': 'pop', 'label': 'Population', 'type': 'number', 'unit': 'people'}],
             'rows': [[c, y, int(popy[y][c])] for c in sorted(ever) for y in years]},
    'encode': {'x': 'year', 'y': 'pop', 'series': 'country'}, 'options': {'focus': ['India', 'China']},
})

# ---- area: India's electricity by source
el = list(csv.DictReader(open(os.path.join(here, 'owid-electricity-production-by-source-india.csv'))))
f = lambda r, k: float(r[k] or 0)
parts = [('Coal', ['coal_generation__twh']), ('Gas and oil', ['gas_generation__twh', 'oil_generation__twh']), ('Hydro', ['hydro_generation__twh']),
         ('Nuclear and bioenergy', ['nuclear_generation__twh', 'bioenergy_generation__twh', 'other_renewables_excluding_bioenergy_generation__twh']), ('Wind', ['wind_generation__twh']), ('Solar', ['solar_generation__twh'])]
rows = [[int(r['year']), name, round(sum(f(r, k) for k in ks), 2)] for r in el if int(r['year']) >= 2000 for name, ks in parts]
OWID = {'name': 'Our World in Data', 'url': 'https://ourworldindata.org/grapher/electricity-production-by-source', 'licence': 'CC BY 4.0'}
write('area-india-electricity', {
    'form': 'area', 'title': 'India still runs on coal, but the sun is catching up',
    'units': 'TWh', 'geography': 'India', 'span': {'from': '2000', 'to': '2025'}, 'sourceSpan': {'from': '1965', 'to': '2025'},
    'sources': [{'maker': 'Ember', 'dataset': 'Yearly Electricity Data', 'url': 'https://ember-energy.org/data/yearly-electricity-data/', 'licence': 'CC BY 4.0', 'retrieved': R, 'via': OWID}],
    'measure': {'basis': 'absolute'},
    'method': 'Gas and oil are added together; so are nuclear, bioenergy and other renewables.',
    'data': {'columns': [{'key': 'year', 'label': 'Year', 'type': 'year'}, {'key': 'source', 'label': 'Source', 'type': 'text'}, {'key': 'twh', 'label': 'Electricity generated', 'type': 'number', 'unit': 'TWh'}], 'rows': rows},
    'encode': {'x': 'year', 'y': 'twh', 'series': 'source'}, 'options': {'focus': ['Solar']},
    'annotations': [{'kind': 'rule', 'axis': 'x', 'value': 2020, 'text': 'Covid lockdown', 'by': 'editor'}],
})
print('ok')
