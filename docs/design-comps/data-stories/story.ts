// Writes the fertility story as a Story (packages/shared/src/stories/spec.ts) from data/fertility.json:
// the plates' rows, the facts code works out from them, and the machine's words, every figure in
// which is read from a fact or a row here, never typed. The editor's title is a placeholder; his
// standfirst and margin notes are his note on the paper, unchanged.
// Output: packages/shared/fixtures/stories/fertility.json (the comps and the tests read it).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Fact, Plate, Range, Series, Source, Story } from '../../../packages/shared/src/stories/spec';
import { validateStory } from '../../../packages/shared/src/stories/spec';

type Pt = [number, number];
const here = dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(join(here, 'data/fertility.json'), 'utf8'));
const editorText = readFileSync(join(here, 'data/editor-note.txt'), 'utf8');
const EST = 2023;
const at = (s: Pt[], y: number) => s.find((p) => p[0] === y)![1];
const f2 = (v: number) => v.toFixed(2);
const peakOf = (s: Pt[]) => s.reduce((a, b) => (b[1] > a[1] ? b : a));

const UN: Source = { maker: 'United Nations, Population Division', dataset: 'World Population Prospects 2024', url: 'https://population.un.org/wpp/', licence: 'CC BY 3.0 IGO', retrieved: '2026-11-09' };
const viaOwid = (slug: string): Source => ({ ...UN, via: { name: 'Our World in Data', url: `https://ourworldindata.org/grapher/${slug}`, licence: 'CC BY 4.0' } });
const UN_PPP: Source = { ...UN, dataset: 'World Population Prospects 2024, probabilistic projections', url: 'https://population.un.org/wpp/downloads' };
const UN_AGE: Source = { ...UN, dataset: 'World Population Prospects 2024, population by age and sex', url: 'https://population.un.org/wpp/downloads' };

const range = (b: Record<string, Pt[]>): Range => ({ lo95: b.lo95!, lo80: b.lo80!, hi80: b.hi80!, hi95: b.hi95! });

// ---- Facts: every derived number the words cite, with how it was worked out ----
const facts: Fact[] = [];
const fact = (key: string, value: number, method: string) => (facts.push({ key, value, method }), value);
const wt: Pt[] = D.world.tfr;
const peak = peakOf(wt.filter((p) => p[0] <= EST));
const now = at(wt, EST);
const worldCross = wt.find((p) => p[0] > EST && p[1] < 2.1)![0];
const share23 = fact('share2023', Math.round(at(D.share, EST)), 'Share of the world’s people in countries below 2.1 in 2023, weighted by population, rounded.');
const crossed = fact('crossedBy2023', D.crossing.filter((c: any) => c.kind === 'estimate' || c.kind === 'before').length, 'Countries of a million people or more below 2.1 by 2023.');
const never = fact('notBy2100', D.crossing.filter((c: any) => c.kind === 'never').length, 'Countries still at or above 2.1 in 2100 in the UN medium projection.');
const field = Object.values(D.field) as number[][];
const fell = fact('fell', field.filter((v) => v[v.length - 1]! < v[0]!).length, 'Countries whose 2023 rate is below their 1950 rate.');
const nField = fact('countries', field.length, 'Countries of a million people or more in 2023.');
const ends = (Object.values(D.fieldProj) as number[][]).map((v) => v[v.length - 1]!).sort((a, b) => a - b);
const q25 = fact('q25', +ends[Math.floor(0.25 * (ends.length - 1))]!.toFixed(2), 'Lower quartile of the UN’s 2100 projections across countries.');
const q75 = fact('q75', +ends[Math.floor(0.75 * (ends.length - 1))]!.toFixed(2), 'Upper quartile of the UN’s 2100 projections across countries.');
const floorN = fact('below15', D.floor.length, 'Countries of a million people or more that fell below 1.5 by 2023.');
const back = D.floor.reduce((a: any, b: any) => (b.max_after > a.max_after ? b : a));
const ko = at(D.named['South Korea'].tfr, EST);
const kids = fact('kids', Math.round((100 * ko) / 2.1), 'Children of 100 adults at a constant rate of 0.72, against replacement at 2.1.');
const grand = fact('grandkids', Math.round(100 * (ko / 2.1) ** 2), 'Grandchildren of 100 adults at a constant rate of 0.72.');
fact('adults', 100, 'The illustration’s first generation.');
fact('peakTfr', peak[1], 'The world’s total fertility rate in its peak year.');
fact('worldNow', now, 'The world’s total fertility rate in 2023.');
fact('southKorea', ko, 'South Korea’s total fertility rate in 2023.');
fact('cameBack', D.floor.filter((f: any) => f.max_after >= 2.1).length, 'Countries that fell below 1.5 and later reached 2.1 again: counted from the rows.');
fact('range80', 80, 'The UN’s 80 per cent prediction interval (a definition).');
fact('range95', 95, 'The UN’s 95 per cent prediction interval (a definition).');
fact('floorScale', 0.5, 'Where the floor plate’s scale starts.');
fact('india1950', at(D.named.India.tfr, 1950), 'India’s total fertility rate in 1950.');
fact('india2023', at(D.named.India.tfr, EST), 'India’s total fertility rate in 2023.');
fact('replacement', 2.1, 'Replacement fertility: the rate at which each generation replaces the one before (a definition, not a row).');
fact('below', 1.5, 'The threshold the floor plate follows countries from (a definition).');
const B: Pt[] = D.world.births.map(([y, v]: Pt) => [y, v / 1e6]);
const De: Pt[] = D.world.deaths.map(([y, v]: Pt) => [y, v / 1e6]);
const bPk = peakOf(B.filter((p) => p[0] <= EST));
const dCross = B.find((p) => p[0] > EST && at(De, p[0]) > p[1])![0];
const pPk = peakOf(D.world.pop);
fact('popPeak', pPk[1], 'The world’s population at its peak in the UN medium projection.');
const ib = D.intervals.births.World;
const lo95 = Math.round(fact('births2100lo', at(ib.lo95, 2100), 'Lower bound of the UN 95% range for births in 2100.') / 1e6);
const hi95 = Math.round(fact('births2100hi', at(ib.hi95, 2100), 'Upper bound of the UN 95% range for births in 2100.') / 1e6);
fact('births2012', bPk[1] * 1e6, 'Births in the peak year.');
const af = (y: number) => Math.round(at(D.birthShare['Africa (UN)'], y)), as = (y: number) => Math.round(at(D.birthShare['Asia (UN)'], y));
for (const y of [1950, 2023, 2100]) { fact(`africa${y}`, af(y), `Of every 100 births, in Africa, ${y}.`); fact(`asia${y}`, as(y), `Of every 100 births, in Asia, ${y}.`); }
const I = D.named.India;
const cy = (c: string) => D.crossing.find((x: any) => x.country === c).year as number;
const inCross = cy('India'), inPk = peakOf(I.pop);
fact('indiaAfterChina', inCross - cy('China'), 'Years between China and India falling below 2.1.');
fact('indiaPeak', inPk[1], 'India’s population at its peak.');
const pyr23 = D.pyramid.India['2023'], pyr61 = D.pyramid.India['2061'];
const tot = (r: any[]) => r[2] + r[3];
const under5 = Math.round(fact('under5', tot(pyr23[0]), 'Indians aged 0 to 4 in 2023.') / 1e6);
const teens = Math.round(fact('teens', tot(pyr23[3]), 'Indians aged 15 to 19 in 2023.') / 1e6);
const big61 = pyr61.reduce((a: any, b: any) => (tot(b) > tot(a) ? b : a));
const span = (r: any) => [r[1], r[1] + 4] as const;
for (const [k, r] of [['teens', pyr23[3]], ['largest61', big61]] as const) { const [a, b] = span(r); fact(`${k}From`, a, `First age in the group (five-year groups).`); fact(`${k}To`, b, `Last age in the group.`); }
fact('years', inPk[0] - EST, 'Years from 2023 to India’s peak.');
// Lowest first, by the 2023 value, so the panels read as a ranking.
const twelve = ['South Korea', 'China', 'Japan', 'Italy', 'Thailand', 'Brazil', 'United States', 'France', 'Iran', 'Bangladesh', 'India', 'Nigeria'].sort((a, b) => at(D.named[a].tfr, EST) - at(D.named[b].tfr, EST));
const t2100 = twelve.map((c) => at(D.named[c].tfr, 2100));
const up = fact('driftUp', twelve.filter((c) => at(D.named[c].tfr, 2100) > at(D.named[c].tfr, EST)).length, 'Of the twelve, those the UN projects higher in 2100 than in 2023.');
fact('twelve', twelve.length, 'Countries on the plate.');
fact('min2100', +Math.min(...t2100).toFixed(2), 'Lowest 2100 projection of the twelve.');
fact('max2100', +Math.max(...t2100).toFixed(2), 'Highest 2100 projection of the twelve.');

// ---- Plates ----
const yrs = (n: number[]) => n.map((v, i) => [1950 + i, v] as Pt);
const tfrSeries = (key: string, s: Pt[], role: Series['role'], label?: string, r?: Record<string, Pt[]>): Series => ({ key, role, label, points: s, projectedFrom: EST, ...(r ? { range: range(r) } : {}) });
const plates: Plate[] = [];

plates.push({
  key: 'fall', name: 'The fall', editorNote: 'Today, most of the world outside sub-Saharan Africa has fallen below that line.',
  headline: `The world went from ${f2(peak[1])} children per woman to ${f2(now)} in sixty years`,
  body: `In ${peak[0]} the average woman could expect ${f2(peak[1])} children; by ${EST}, ${f2(now)}, just above the 2.1 at which each generation replaces the last. ${fell} of ${nField} countries ended lower than they began. In the UN's projection for 2100, half the countries end between ${q25.toFixed(2)} and ${q75.toFixed(2)}, and the world goes below 2.1 in ${worldCross}.`,
  caption: 'Total fertility rate: every country of a million people or more, and the world with the UN’s 80 and 95 per cent ranges.',
  sources: [viaOwid('fertility-rate-with-projections'), UN_PPP],
  figure: {
    form: 'lines', seam: EST, contextLabel: 'Every other country', x: { domain: [1950, 2100], ticks: [1950, 1975, 2000, 2023, 2050, 2075, 2100], phoneTicks: [1950, 2000, 2050, 2100] },
    panels: [{
      y: { unit: 'Children per woman', domain: [0, 8], ticks: [0, 2, 4, 6, 8] },
      rules: [{ y: 2.1, label: 'Replacement 2.1' }],
      series: [
        ...Object.keys(D.field).map((c) => ({ key: c, role: 'context' as const, points: [...yrs(D.field[c]), ...(D.fieldProj[c] as number[]).slice(1).map((v, i) => [EST + 1 + i, v] as Pt)], projectedFrom: EST })),
        tfrSeries('South Korea', D.named['South Korea'].tfr.filter((p: Pt) => p[0] <= EST), 'named', `South Korea ${f2(ko)}`),
        tfrSeries('Niger', D.named['Niger'].tfr.filter((p: Pt) => p[0] <= EST), 'named', `Niger ${f2(at(D.named['Niger'].tfr, EST))}`),
        tfrSeries('World', wt, 'focus', `World ${f2(at(wt, 2100))}`, D.intervals.tfr.World),
      ],
      notes: [
        { x: peak[0], y: peak[1], lines: [`The world’s peak, ${peak[0]}:`, `${f2(peak[1])} children per woman`], phone: [`Peak, ${peak[0]}:`, f2(peak[1])] },
        { x: EST, y: now, lines: [`${EST}: ${f2(now)}`] },
      ],
    }],
  },
});

const items = D.crossing.map((c: any) => ({
  label: c.country === 'Democratic Republic of Congo' ? 'DR Congo' : c.country,
  at: c.kind === 'before' ? 'before' : c.kind === 'never' ? 'after' : c.year,
  weight: c.pop2023,
  state: c.kind === 'projected' || c.kind === 'never' ? 'projected' : 'estimated',
  focus: c.country === 'India' || undefined,
  named: ['India', 'China', 'United States', 'Japan', 'Brazil', 'Russia', 'Nigeria', 'Pakistan', 'Indonesia', 'Bangladesh', 'Ethiopia', 'Egypt', 'Mexico', 'Iran', 'South Korea', 'Philippines', 'Democratic Republic of Congo', 'Germany', 'Vietnam', 'Turkey'].includes(c.country) || undefined,
}));
plates.push({
  key: 'crossing', name: 'The crossing', fold: true,
  headline: 'Two in three people now live where fertility is below replacement',
  body: `Japan crossed 2.1 in ${cy('Japan')}, the United States in ${cy('United States')}, China in ${cy('China')}, India in ${inCross}. Each circle is a country, sized by its people: ${crossed} had crossed by ${EST}, home to ${share23} per cent of the world. The hollow ones cross in the UN's projection; ${never} do not before 2100.`,
  caption: 'Each country of a million people or more at the first year its rate is below 2.1; area is its population in 2023. Above, the share of the world’s people in such countries.',
  sources: [viaOwid('fertility-rate-with-projections'), viaOwid('population-with-un-projections')],
  figure: {
    form: 'swarm', seam: EST, x: { domain: [1950, 2100], ticks: [1950, 1975, 2000, 2023, 2050, 2075, 2100], phoneTicks: [1950, 1970, 1990, 2010] },
    before: 'Before 1950', after: 'Not by 2100', items,
    step: { unit: '% of the world’s people', points: D.share, endLabel: `${share23}% in ${EST}`, phoneEndLabel: `${share23}%`, notes: [{ x: 1991, y: at(D.share, 1991), lines: ['China, 1991'] }, { x: 2020, y: at(D.share, 2020), lines: ['India, 2020'] }] },
  },
});

plates.push({
  key: 'twelve', name: 'Twelve countries',
  headline: 'Twelve countries, one scale',
  body: `Each panel is one country against the world in grey, on one scale. The UN projects ${up} of these ${twelve.length} to drift up from where they are now and the rest to keep falling; by 2100 all ${twelve.length} are between ${Math.min(...t2100).toFixed(2)} and ${Math.max(...t2100).toFixed(2)}.`,
  caption: 'Total fertility rate, estimated to 2023 and projected to 2100.',
  sources: [viaOwid('fertility-rate-with-projections')],
  figure: {
    form: 'multiples', seam: EST, x: { domain: [1950, 2100], ticks: [] }, y: { unit: 'Children per woman', domain: [0, 8], ticks: [2, 6] },
    rule: { y: 2.1, label: 'Replacement 2.1' }, context: { label: 'World', points: wt },
    scaleLine: 'Children per woman on one scale, 1950 to 2100; the world in grey; the value is 2023', phoneScaleLine: 'Children per woman; the value is 2023',
    panels: twelve.map((c) => ({ label: c, points: D.named[c].tfr, projectedFrom: EST, value: f2(at(D.named[c].tfr, EST)) })),
  },
});

const floorMax = Math.max(...D.floor.map((f: any) => f.max_after));
const koPath = D.floor.find((f: any) => f.country === 'South Korea');
plates.push({
  key: 'floor', name: 'The floor', editorNote: 'There have been spikes, the Baby Boom being the famous one, but they were blips around a long-term decline.',
  quote: { text: 'To put it bluntly, history offers no examples of societies recognizing very low birth rates as a social priority and then responding with effective changes that restore, and sustain, replacement-level fertility.', credit: 'Michael Geruso and Dean Spears, “The Likelihood of Persistently Low Global Fertility”, Journal of Economic Perspectives, 2026' },
  headline: `Of ${floorN} countries that fell below 1.5, none has come back`,
  body: `${floorN} countries of a million people or more have gone below 1.5 children per woman. None has returned to replacement; the highest any has climbed back to is ${f2(back.max_after)}, in ${back.country}. South Korea, at ${f2(ko)} in ${EST}, is the lowest of them.`,
  caption: 'Total fertility rate of each country of a million people or more that fell below 1.5, from the year it first did. The scale starts at 0.5, not zero.',
  sources: [viaOwid('fertility-rate-with-projections')],
  coda: { label: 'At South Korea’s rate', figures: [{ value: '100', text: 'adults' }, { value: String(kids), text: 'children' }, { value: String(grand), text: 'grandchildren' }], text: `Arithmetic on one number, not a forecast: each generation is the last multiplied by ${f2(ko)} over 2.1.` },
  figure: {
    form: 'lines', contextLabel: 'Every other country', x: { domain: [0, 50], ticks: [0, 10, 20, 30, 40, 50], title: 'Years after first falling below 1.5' },
    panels: [{
      y: { unit: 'Children per woman', domain: [0.5, 2.5], ticks: [0.5, 1, 1.5, 2, 2.5], format: 'one' },
      rules: [{ y: 2.1, label: 'Replacement 2.1' }],
      zones: [{ from: floorMax, to: 2.1, label: 'No country of a million people has come back up through here', phone: 'None has come back up through here' }],
      series: [
        ...D.floor.filter((f: any) => f.country !== 'South Korea' && f.country !== back.country).map((f: any) => ({ key: f.country, role: 'context' as const, points: f.path.map((v: number, i: number) => [i, v] as Pt) })),
        { key: back.country, role: 'named', points: back.path.map((v: number, i: number) => [i, v] as Pt) },
        { key: 'South Korea', role: 'focus', label: `South Korea ${f2(ko)}`, points: koPath.path.map((v: number, i: number) => [i, v] as Pt) },
      ],
      notes: [{ x: back.path.indexOf(back.max_after), y: back.max_after, lines: [`The highest return: ${back.country}, ${f2(back.max_after)}`], phone: ['Highest return:', `${back.country}, ${f2(back.max_after)}`] }],
    }],
  },
});

plates.push({
  key: 'peak', name: 'The peak',
  headline: `The world’s births peaked in ${bPk[0]}, in the UN’s central projection`,
  body: `${Math.round(bPk[1])} million babies were born in ${bPk[0]}. Deaths rise as the world ages, and in ${dCross} they overtake births, the year the world’s population peaks at ${(pPk[1] / 1e9).toFixed(1)} billion. The range is wide: by 2100 the UN puts births between ${lo95} million and ${hi95} million a year.`,
  caption: 'Births and deaths in the world each year, with the UN’s 80 and 95 per cent ranges for births.',
  sources: [viaOwid('births-and-deaths-projected-to-2100'), UN_PPP],
  figure: {
    form: 'lines', seam: EST, x: { domain: [1950, 2100], ticks: [1950, 1975, 2000, 2023, 2050, 2075, 2100], phoneTicks: [1950, 2000, 2050, 2100] },
    panels: [{
      y: { unit: 'Million a year', domain: [0, 160], ticks: [0, 50, 100, 150] },
      series: [
        { key: 'Deaths', role: 'named', label: 'Deaths', points: De, projectedFrom: EST },
        { key: 'Births', role: 'focus', label: 'Births', points: B, projectedFrom: EST, range: range(Object.fromEntries(Object.entries(ib).map(([k, v]) => [k, (v as Pt[]).map(([y, x]) => [y, x / 1e6] as Pt)]))) },
      ],
      notes: [
        { x: bPk[0], y: bPk[1], lines: [`Births peak in ${bPk[0]}:`, `${Math.round(bPk[1])} million babies`], phone: [`Births peak, ${bPk[0]}:`, `${Math.round(bPk[1])} million`] },
        { x: dCross, y: at(B, dCross), lines: [`${dCross}: deaths overtake births`], phone: [`${dCross}: deaths`, 'overtake births'] },
      ],
    }],
  },
});

const share = (k: string) => D.birthShare[k] as Pt[];
const rest = share('Africa (UN)').map(([y], i) => [y, +(100 - share('Africa (UN)')[i]![1] - share('Asia (UN)')[i]![1]).toFixed(2)] as Pt);
plates.push({
  key: 'regions', name: 'Where babies are born',
  headline: 'By 2100, almost one baby in two is born in Africa',
  body: `In 1950, ${af(1950)} of every 100 babies were born in Africa and ${as(1950)} in Asia. In ${EST}, ${af(EST)} and ${as(EST)}. In the UN's projection for 2100, ${af(2100)} and ${as(2100)}.`,
  caption: 'Share of the world’s births by region, estimated to 2023 and projected to 2100.',
  sources: [viaOwid('number-of-births-per-year')],
  figure: {
    form: 'stack', seam: EST, unit: 'of every 100 babies', x: { domain: [1950, 2100], ticks: [1950, 1975, 2000, 2023, 2050, 2075, 2100], phoneTicks: [1950, 2000, 2050, 2100] },
    layers: [{ label: 'Africa', role: 'focus', points: share('Africa (UN)') }, { label: 'Asia', role: 'second', points: share('Asia (UN)') }, { label: 'Rest of the world', short: 'Rest', role: 'rest', points: rest }],
    labelAt: [1950, EST, 2100], phoneLabelAt: [1950, 2100],
  },
});

const pop = (s: Pt[]): Pt[] => s.map(([y, v]) => [y, v / 1e9]);
const ip = D.intervals.pop.India;
plates.push({
  key: 'india', name: 'India', editorNote: 'And yes, India as a whole is now below replacement, though, like any country, with vast regional variation.',
  headline: `India went below replacement in ${inCross}; its people keep growing until ${inPk[0]}`,
  body: `India's fertility fell from ${f2(at(I.tfr, 1950))} in 1950 to ${f2(at(I.tfr, EST))} in ${EST}, crossing 2.1 ${inCross - cy('China')} years after China. The population goes on rising because so many Indians are young: in the UN's central projection it peaks in ${inPk[0]} at ${(inPk[1] / 1e9).toFixed(2)} billion.`,
  caption: 'India’s total fertility rate against the world’s, and its population, with the UN’s 80 and 95 per cent ranges.',
  sources: [viaOwid('fertility-rate-with-projections'), viaOwid('population-with-un-projections'), UN_PPP],
  figure: {
    form: 'lines', seam: EST, x: { domain: [1950, 2100], ticks: [1950, 1975, 2000, 2023, 2050, 2075, 2100], phoneTicks: [1950, 2000, 2050, 2100] },
    panels: [
      {
        y: { unit: 'Children per woman', domain: [0, 6.5], ticks: [0, 2, 4, 6] }, weight: 1.15, rules: [{ y: 2.1, label: 'Replacement' }],
        series: [tfrSeries('World', wt, 'named', 'World'), tfrSeries('India', I.tfr, 'focus', 'India', D.intervals.tfr.India)],
        notes: [{ x: inCross, y: at(I.tfr, inCross), lines: [`${inCross}: below replacement`], phone: [`${inCross}: below`, 'replacement'] }],
      },
      {
        y: { unit: 'Billion people', domain: [0, 2.4], ticks: [0, 1, 2], format: 'int' }, weight: 0.85,
        series: [{ key: 'India population', role: 'focus', label: 'India', points: pop(I.pop), projectedFrom: EST, range: range(Object.fromEntries(Object.entries(ip).map(([k, v]) => [k, pop(v as Pt[])]))) }],
        notes: [{ x: inPk[0], y: inPk[1] / 1e9, lines: [`${inPk[0]}: peaks at ${(inPk[1] / 1e9).toFixed(2)} billion`], phone: [`Peak ${inPk[0]}:`, `${(inPk[1] / 1e9).toFixed(2)} billion`] }],
      },
    ],
  },
});

const groups = pyr23.filter((r: any) => r[1] <= 95);
plates.push({
  key: 'pyramid', name: 'Why India keeps growing',
  headline: 'Fewer babies, more parents',
  body: `In ${EST} India had ${under5} million children under five and ${teens} million aged ${span(pyr23[3])[0]} to ${span(pyr23[3])[1]}: the base of its pyramid has already narrowed. The bulge of young adults carries the population up for another ${inPk[0] - EST} years. By ${inPk[0]} the largest age group is ${span(big61)[0]} to ${span(big61)[1]}.`,
  caption: 'India’s population by five-year age group and sex, 2023 and the UN projection for 2061.',
  sources: [UN_AGE],
  figure: {
    form: 'pyramid', left: 'Men', right: 'Women', ticks: [0, 25e6, 50e6, 75e6], tickFormat: 'million',
    groups: groups.map((r: any) => ({ label: r[1] === 95 ? '95+' : String(r[1]), start: r[1] })),
    solid: { label: '2023', left: groups.map((r: any) => r[2]), right: groups.map((r: any) => r[3]) },
    outline: { label: '2061, projected', left: pyr61.filter((r: any) => r[1] <= 95).map((r: any) => r[2]), right: pyr61.filter((r: any) => r[1] <= 95).map((r: any) => r[3]) },
  },
});

const story: Story = {
  title: 'Fewer children, almost everywhere',
  standfirst: 'An interesting paper by Michael Geruso and Dean Spears on falling fertility rates around the world. According to their data, 67% of the world’s population now lives in a country where fertility is below replacement.',
  edition: 'teal',
  ledger: [
    { value: f2(peak[1]), text: `children per woman in the world in ${peak[0]}, the peak` },
    { value: f2(now), text: `in ${EST}, just above replacement at 2.1`, loud: true },
    { value: `${share23}%`, text: 'of the world’s people live where fertility is below 2.1' },
    { value: String(bPk[0]), text: `the year the world’s births peaked, at ${Math.round(bPk[1])} million, in the UN’s central projection` },
    { value: String(facts.find((f) => f.key === 'cameBack')!.value), text: `of ${floorN} countries that fell below 1.5 have come back to replacement` },
  ],
  movements: [
    { numeral: 'I', name: 'It happened everywhere', plates: ['fall', 'crossing', 'twelve'] },
    { numeral: 'II', name: 'It does not come back', plates: ['floor'] },
    { numeral: 'III', name: 'What it adds up to', plates: ['peak', 'regions', 'india', 'pyramid'] },
  ],
  plates,
  facts,
};
void big61;
const errs = validateStory(story, editorText);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
const out = join(here, '../../../packages/shared/fixtures/stories/fertility.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(story));
writeFileSync(join(dirname(out), 'fertility-editor-note.txt'), editorText);
console.log('story valid;', plates.length, 'plates,', facts.length, 'facts');
