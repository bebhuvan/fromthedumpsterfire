# Builds the bar, dot, dumbbell, slope and waffle comps fixtures from the raw files here. Run from the repo root: python3 docs/design-comps/charts/raw/build-A.py
import json, csv
R='docs/design-comps/charts/raw/'; D='docs/design-comps/charts/data/'
def wb(ind):
    d=json.load(open(R+f'wb-{ind}.json'))[1]
    out={}
    for r in d: out.setdefault(r['country']['value'],{})[int(r['date'])]=r['value']
    return out
def wbsrc(ind,name):
    return {'maker':'World Bank','dataset':f'World Development Indicators: {name} ({ind})','url':f'https://data.worldbank.org/indicator/{ind}','licence':'CC BY-4.0','licenceUrl':'https://datacatalog.worldbank.org/public-licenses#cc-by','retrieved':'2026-10-25'}
names={'Afghanistan':'Afghanistan','Bangladesh':'Bangladesh','Bhutan':'Bhutan','India':'India','Maldives':'Maldives','Nepal':'Nepal','Pakistan':'Pakistan','Sri Lanka':'Sri Lanka'}
def dump(n,c): json.dump(c,open(D+n,'w'),indent=1,ensure_ascii=False)

g=wb('NY.GDP.PCAP.KD')
for y in (2025,2024,2023):
    print(y,{k:v.get(y) for k,v in g.items()})
Y=2025
rows=[[k,None if g[k].get(Y) is None else round(g[k][Y])] for k in sorted(g)]
dump('south-asia-gdp-bar.json',{'form':'bar','title':'India sits in the middle of its neighbourhood','note':'Output per person, in 2015 dollars so the years compare. The Maldives earns from tourism; Afghanistan has no figure for 2025 yet.',
 'units':'US$ per person','geography':'South Asia','span':{'from':str(Y),'to':str(Y)},'sources':[wbsrc('NY.GDP.PCAP.KD','GDP per capita (constant 2015 US$)')],
 'measure':{'basis':'per-capita','money':{'currency':'USD','prices':'real','baseYear':2015}},
 'data':{'columns':[{'key':'country','label':'Country','type':'text'},{'key':'gdp_pc','label':f'GDP per capita, {Y} (constant 2015 US$)','type':'number'}],'rows':rows},
 'encode':{'label':'country','y':'gdp_pc'},'options':{'focus':['India']}})

gr=wb('NY.GDP.MKTP.KD.ZG')['India']
yrs=[y for y in range(2000,2026) if y in gr]
rows=[[y,None if gr[y] is None else round(gr[y],2)] for y in yrs]
print('growth',rows[-3:])
dump('india-growth-columns.json',{'form':'bar','title':'Twenty-five years of Indian growth, and one fall','note':'Real GDP growth each year. The pandemic year is the only one below zero.',
 'units':'%','geography':'India','span':{'from':str(yrs[0]),'to':str(yrs[-1])},'sourceSpan':{'from':'1961','to':str(yrs[-1])},'sources':[wbsrc('NY.GDP.MKTP.KD.ZG','GDP growth (annual %)')],
 'measure':{'basis':'change','base':'the year before, at constant prices'},
 'data':{'columns':[{'key':'year','label':'Year','type':'year'},{'key':'growth','label':'GDP growth (annual %)','type':'number'}],'rows':rows},
 'encode':{'x':'year','y':'growth'},'options':{'colour':'focus'},
 'annotations':[{'kind':'point','x':2020,'text':'Lockdown: the economy shrank','by':'editor'}]})

le=wb('SP.DYN.LE00.IN'); fe=wb('SP.DYN.LE00.FE.IN'); ma=wb('SP.DYN.LE00.MA.IN')
Y=max(y for y in le['India'] if le['India'][y] is not None); print('LE year',Y)
rows=[[k,round(le[k][Y],1) if le[k].get(Y) else None] for k in sorted(le)]
dump('south-asia-life-dot.json',{'form':'dot','title':'How long a child born today can expect to live','units':'years','geography':'South Asia','span':{'from':str(Y),'to':str(Y)},
 'sources':[wbsrc('SP.DYN.LE00.IN','Life expectancy at birth, total (years)')],'measure':{'basis':'absolute'},
 'data':{'columns':[{'key':'country','label':'Country','type':'text'},{'key':'life','label':f'Life expectancy at birth, {Y}','type':'number'}],'rows':rows},
 'encode':{'label':'country','y':'life'},'options':{'focus':['India']}})
rows=[[k,round(ma[k][Y],1),round(fe[k][Y],1)] for k in sorted(le)]
dump('south-asia-life-dumbbell.json',{'form':'dumbbell','title':'Women outlive men everywhere in South Asia','note':'The gap is widest in Sri Lanka, more than six years, and narrowest in Nepal.','units':'years','geography':'South Asia','span':{'from':str(Y),'to':str(Y)},
 'sources':[wbsrc('SP.DYN.LE00.MA.IN','Life expectancy at birth, male (years)'),wbsrc('SP.DYN.LE00.FE.IN','Life expectancy at birth, female (years)')],'measure':{'basis':'absolute'},
 'data':{'columns':[{'key':'country','label':'Country','type':'text'},{'key':'men','label':'Men','type':'number'},{'key':'women','label':'Women','type':'number'}],'rows':rows},
 'encode':{'label':'country','from':'men','to':'women'},'options':{'focus':['India']}})
rows=[[k,round(le[k][2000],1),round(le[k][Y],1)] for k in sorted(le)]
dump('south-asia-life-slope.json',{'form':'slope','title':'Every country in the region added years of life','note':'Bangladesh gained the most since 2000, Pakistan the least.','units':'years','geography':'South Asia','span':{'from':'2000','to':str(Y)},'sourceSpan':{'from':'1960','to':str(Y)},
 'sources':[wbsrc('SP.DYN.LE00.IN','Life expectancy at birth, total (years)')],'measure':{'basis':'absolute'},
 'data':{'columns':[{'key':'country','label':'Country','type':'text'},{'key':'y2000','label':'2000','type':'number'},{'key':'ylast','label':str(Y),'type':'number'}],'rows':rows},
 'encode':{'label':'country','from':'y2000','to':'ylast'},'options':{'focus':['India']}})

# HadCRUT regions with CI, dot with series
t=list(csv.reader(open(R+'owid-temperature-anomaly.csv')))[1:]
rows=[]
for yr in (2000,2025):
    for r in t:
        if int(r[2])==yr: rows.append([r[0],str(yr),round(float(r[3]),2),round(float(r[4]),2),round(float(r[5]),2)])
dump('hemispheres-dot.json',{'form':'dot','title':'Twenty-five years of warming, north and south','note':'Each dot is a year’s average; the whisker is the 95 per cent range of the estimate.','units':'°C','geography':'World and hemispheres','span':{'from':'2000','to':'2025'},'sourceSpan':{'from':'1850','to':'2026'},
 'sources':[{'maker':'Met Office Hadley Centre','dataset':'HadCRUT5 (HadCRUT.5.1.0.0)','url':'https://www.metoffice.gov.uk/hadobs/hadcrut5/','licence':'Open Government Licence v3','licenceUrl':'https://www.metoffice.gov.uk/hadobs/hadcrut5/terms_and_conditions.html','retrieved':'2026-10-25','via':{'name':'Our World in Data','url':'https://ourworldindata.org/grapher/temperature-anomaly','licence':'CC BY 4.0'}}],
 'measure':{'basis':'anomaly','base':'the 1861–1890 average'},
 'data':{'columns':[{'key':'region','label':'Region','type':'text'},{'key':'year','label':'Year','type':'text'},{'key':'anomaly','label':'Temperature anomaly','type':'number'},{'key':'lower','label':'Lower bound (95% confidence)','type':'number'},{'key':'upper','label':'Upper bound (95% confidence)','type':'number'}],'rows':rows},
 'encode':{'label':'region','series':'year','y':'anomaly','lo':'lower','hi':'upper'},'options':{'focus':['2025']}})

e=list(csv.reader(open(R+'owid-share-elec-by-source-india.csv')))
h=e[0]; last=e[-1]; print(last)
lab={'coal':'Coal','gas':'Gas','hydro':'Hydro','solar':'Solar','wind':'Wind','oil':'Oil','nuclear':'Nuclear','other_renewables_excluding_bioenergy':'Other renewables','bioenergy':'Bioenergy'}
rows=[[lab[h[i].replace('_share_of_electricity__pct','')],round(float(last[i]),2)] for i in range(3,len(h))]
rows=[r for r in rows if r[1]>0]
dump('india-electricity-waffle.json',{'form':'waffle','title':'Coal still makes seven of every ten units of India’s electricity','note':'Solar has passed hydro for the first time.','units':'% of electricity generated','geography':'India','span':{'from':last[2],'to':last[2]},'sourceSpan':{'from':'1985','to':last[2]},
 'sources':[{'maker':'Ember','dataset':'Yearly Electricity Data','url':'https://ember-energy.org/data/yearly-electricity-data/','licence':'CC BY 4.0','retrieved':'2026-10-25','via':{'name':'Our World in Data','url':'https://ourworldindata.org/grapher/share-elec-by-source','licence':'CC BY 4.0'}}],
 'measure':{'basis':'share','denominator':'of all electricity generated in the year'},
 'data':{'columns':[{'key':'source','label':'Source','type':'text'},{'key':'share','label':f'Share of electricity, {last[2]}','type':'number','unit':'%'}],'rows':rows},
 'encode':{'label':'source','y':'share'},'options':{'colour':'categorical'}})
