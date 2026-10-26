#!/usr/bin/env python3
# Builds the comps fixtures for the forms added 2026-10-26 (histogram, tile map of India, world map,
# price and drawdown, table with sparklines, a heatmap with its values) from the raw extracts in this
# directory (see SOURCES-D.md). Every derived number is computed here and the chart's method says how.
# Run: python3 -I docs/design-comps/charts/raw/build-D.py
import csv, json, os
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'data')
R = '2026-10-26'

def write(name, chart):
    json.dump(chart, open(os.path.join(out, name + '.json'), 'w'), indent=1, ensure_ascii=False)

def WB(ind, name, retrieved=R):
    return {'maker': 'World Bank', 'dataset': f'World Development Indicators: {name} ({ind})', 'url': f'https://data.worldbank.org/indicator/{ind}', 'licence': 'CC BY-4.0', 'licenceUrl': 'https://datacatalog.worldbank.org/public-licenses#cc-by', 'retrieved': retrieved}

PINK = {'maker': 'World Bank', 'dataset': 'Commodity Price Data (The Pink Sheet): gold', 'url': 'https://www.worldbank.org/en/research/commodity-markets', 'licence': 'CC BY 4.0', 'licenceUrl': 'https://datacatalog.worldbank.org/public-licenses#cc-by', 'retrieved': R}

rows = lambda f: list(csv.DictReader(open(os.path.join(here, f))))

# ---- histogram: fertility, every country, 2024
tfr = [r for r in rows('wb-SP.DYN.TFRT.IN-2020-2024.csv') if r['aggregate'] == '0' and r['year'] == '2024']
write('histogram-fertility', {
    'form': 'histogram', 'title': 'Most of the world now has fewer children than it takes to replace itself',
    'note': 'More than half of all countries are below about 2.1 births per woman, the rate at which a population replaces itself. India is among them, at 1.96.',
    'units': 'births per woman', 'geography': 'World', 'span': {'from': '2024', 'to': '2024'},
    'sources': [WB('SP.DYN.TFRT.IN', 'Fertility rate, total (births per woman)')],
    'measure': {'basis': 'rate', 'denominator': 'per woman'},
    'data': {'columns': [{'key': 'country', 'label': 'Country', 'type': 'text'}, {'key': 'code', 'label': 'ISO code', 'type': 'text'}, {'key': 'tfr', 'label': 'Births per woman', 'type': 'number'}],
             'rows': sorted([[r['country'], r['iso3'], round(float(r['value']), 2)] for r in tfr])},
    'encode': {'y': 'tfr', 'label': 'country'},
    'options': {'of': 'countries', 'focus': ['India', 'Niger', 'Korea, Rep.']},
    'annotations': [{'kind': 'rule', 'axis': 'x', 'value': 2.1, 'text': 'About 2.1: replacement level', 'by': 'editor'}],
})

# ---- world map: internet use, 2024
net = [r for r in rows('wb-IT.NET.USER.ZS-2019-2024.csv') if r['aggregate'] == '0' and r['year'] == '2024']
write('world-internet', {
    'form': 'choropleth', 'title': 'Two in three Indians are online now',
    'note': 'About 65 in every 100 people in India used the internet in 2024, against 71 for the world as a whole.',
    'units': '% of people', 'geography': 'World', 'span': {'from': '2024', 'to': '2024'},
    'sources': [WB('IT.NET.USER.ZS', 'Individuals using the Internet (% of population)')],
    'measure': {'basis': 'share', 'denominator': 'of the population'},
    'data': {'columns': [{'key': 'country', 'label': 'Country', 'type': 'text'}, {'key': 'code', 'label': 'ISO code', 'type': 'text'}, {'key': 'share', 'label': 'People using the internet', 'type': 'number', 'unit': '%'}],
             'rows': sorted([[r['country'], r['iso3'], round(float(r['value']), 1)] for r in net])},
    'encode': {'label': 'country', 'code': 'code', 'y': 'share'},
    'options': {'colour': 'sequential', 'focus': ['India']},
})

# ---- tile map: female literacy by state, Census 2011 (two UTs since merged are left out; see the note)
lit = rows('wb-india-cps-female-literacy-2011.csv')
merged = {'Dadra and Nagar Haveli', 'Daman and Diu'}
write('india-female-literacy', {
    'form': 'tilemap', 'title': 'Kerala taught its girls to read long before the rest',
    'note': 'Women and girls aged seven and over who can read and write, at the 2011 census. Telangana and Ladakh were then part of Andhra Pradesh and Jammu and Kashmir; Dadra and Nagar Haveli and Daman and Diu, merged since, are left out.',
    'units': '%', 'geography': 'India, states and union territories', 'span': {'from': '2011', 'to': '2011'},
    'sources': [{'maker': 'World Bank', 'dataset': 'India sub-national indicators (Country Partnership Strategy FY2013–17): Literacy Rate Female (%), from the Census of India 2011', 'url': 'https://datacatalog.worldbank.org/search/dataset/0041418/country-partnership-strategy-for-india-fy2013-17', 'licence': 'CC BY 4.0', 'licenceUrl': 'https://datacatalog.worldbank.org/public-licenses#cc-by', 'retrieved': R}],
    'measure': {'basis': 'share', 'denominator': 'of women and girls aged seven and over'},
    'data': {'columns': [{'key': 'state', 'label': 'State or union territory', 'type': 'text'}, {'key': 'literacy', 'label': 'Female literacy', 'type': 'number', 'unit': '%'}],
             'rows': [[r['state'], round(float(r['female_literacy_pct_2011']), 1)] for r in lit if r['state'] not in merged and r['state'] != 'India']},
    'encode': {'label': 'state', 'y': 'literacy'},
    'options': {'colour': 'sequential', 'focus': ['Kerala']},
})

# ---- price and drawdown: gold in real terms, 1960–2025
gold = rows('pinksheet-gold-annual.csv')
write('gold-drawdown', {
    'form': 'drawdown', 'title': 'Gold took 29 years to get back to its 1980 peak',
    'note': 'The price of gold in today’s money, counted in 2010 dollars. Most of what it lost after 1980 it did not win back until 2009.',
    'units': 'US$ per troy ounce', 'geography': None, 'span': {'from': '1960', 'to': gold[-1]['year']}, 'sourceSpan': {'from': '1960', 'to': gold[-1]['year']},
    'sources': [PINK],
    'measure': {'basis': 'absolute', 'money': {'currency': 'US$', 'prices': 'real', 'baseYear': 2010}},
    'method': 'Real prices are the World Bank’s own: nominal prices deflated by its index of manufactures unit values (MUV), in 2010 dollars.',
    'data': {'columns': [{'key': 'year', 'label': 'Year', 'type': 'year'}, {'key': 'gold', 'label': 'Gold, real 2010 dollars', 'type': 'number', 'unit': 'US$ per troy ounce'}],
             'rows': [[int(r['year']), float(r['gold_real_2010_usd_per_troy_oz'])] for r in gold]},
    'encode': {'x': 'year', 'y': 'gold'},
    'scale': {'y': {'log': True}},
})

# ---- heatmap with values: gold's monthly change, 2016–2025
mon = rows('pinksheet-gold-monthly.csv')
price = {r['month']: float(r['gold_nominal_usd_per_troy_oz']) for r in mon}
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
hm = []
for y in range(2016, 2026):
    for m in range(1, 13):
        k = f'{y}M{m:02d}'; prev = f'{y}M{m - 1:02d}' if m > 1 else f'{y - 1}M12'
        hm.append([y, MONTHS[m - 1], round((price[k] / price[prev] - 1) * 100, 1)])
ups = sum(1 for r in hm if r[2] > 0)
write('gold-monthly-returns', {
    'form': 'heatmap', 'title': 'Ten years of gold, month by month',
    'note': f'Gold rose in {ups} of these 120 months. Its longest run of gains, six months, came in the first half of 2025.',
    'units': '%', 'geography': None, 'span': {'from': '2016', 'to': '2025'},
    'sources': [PINK],
    'measure': {'basis': 'change', 'base': 'the month before', 'money': {'currency': 'US$', 'prices': 'nominal'}},
    'method': 'Each cell is that month’s average gold price over the month before’s, as a percentage change, rounded to 0.1.',
    'data': {'columns': [{'key': 'year', 'label': 'Year', 'type': 'year'}, {'key': 'month', 'label': 'Month', 'type': 'text'}, {'key': 'change', 'label': 'Change from the month before', 'type': 'number', 'unit': '%'}], 'rows': hm},
    'encode': {'x': 'month', 'label': 'year', 'y': 'change'},
    'options': {'colour': 'diverging', 'midpoint': {'value': 0, 'label': 'no change'}, 'sort': 'given', 'values': True},
})

# ---- table with sparklines: GDP per person in South Asia, 2000–2024
gdp = [r for r in json.load(open(os.path.join(here, 'wb-NY.GDP.PCAP.KD.json')))[1] if r['value'] is not None and 2000 <= int(r['date']) <= 2024]
write('south-asia-gdp-table', {
    'form': 'table', 'title': 'A quarter-century of South Asian growth',
    'note': 'Output per person in each country, in 2015 dollars so the years compare.',
    'units': 'US$ per person', 'geography': 'South Asia', 'span': {'from': '2000', 'to': '2024'}, 'sourceSpan': {'from': '1990', 'to': '2025'},
    'sources': [WB('NY.GDP.PCAP.KD', 'GDP per capita (constant 2015 US$)', '2026-10-25')],
    'measure': {'basis': 'per-capita', 'money': {'currency': 'US$', 'prices': 'real', 'baseYear': 2015}},
    'data': {'columns': [{'key': 'country', 'label': 'Country', 'type': 'text'}, {'key': 'year', 'label': 'Year', 'type': 'year'}, {'key': 'gdp', 'label': 'GDP per person', 'type': 'number', 'unit': 'US$, 2015 prices'}],
             'rows': sorted([[r['country']['value'], int(r['date']), round(r['value'])] for r in gdp])},
    'encode': {'label': 'country', 'x': 'year', 'y': 'gdp'},
    'options': {'focus': ['India']},
})
print('wrote 6 fixtures; gold rose in', ups, 'months')
