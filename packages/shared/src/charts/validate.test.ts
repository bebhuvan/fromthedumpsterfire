import { describe, expect, it } from 'vitest';
import type { Chart } from './types';
import { validateChart } from './validate';
import { checkFigures, figuresIn } from './figures';
import { chartGlosses, describeChart, unitsLine } from './glosses';
import { checkStyle } from '../style';

/** A small honest line chart; each test breaks one thing. */
function line(over: Partial<Chart> = {}): Chart {
  return {
    form: 'line',
    title: 'Rainfall in Mumbai',
    units: 'mm',
    geography: 'Mumbai',
    span: { from: '2001', to: '2005' },
    sourceSpan: { from: '2001', to: '2005' },
    sources: [{ maker: 'India Meteorological Department', dataset: 'Monsoon rainfall', url: 'https://mausam.imd.gov.in/', licence: 'GODL-India', retrieved: '2026-10-25' }],
    measure: { basis: 'absolute' },
    data: {
      columns: [
        { key: 'year', label: 'Year', type: 'year' },
        { key: 'mm', label: 'Rainfall', type: 'number' },
      ],
      rows: [
        [2001, 2100.5],
        [2002, 1950],
        [2003, 2400],
        [2004, 2650.25],
        [2005, 3270],
      ],
    },
    encode: { x: 'year', y: 'mm' },
    ...over,
  };
}

const rules = (c: Chart) => validateChart(c).errors.map((e) => e.rule);
const warns = (c: Chart) => validateChart(c).warnings.map((e) => e.rule);

describe('validateChart', () => {
  it('passes an honest chart', () => {
    expect(validateChart(line()).errors).toEqual([]);
  });

  it('needs a title, units and a stated geography', () => {
    expect(rules(line({ title: ' ' }))).toContain('title');
    expect(rules(line({ units: '' }))).toContain('units');
    const noGeo = line();
    delete (noGeo as Partial<Chart>).geography;
    expect(rules(noGeo)).toContain('geography');
    expect(rules(line({ geography: null }))).not.toContain('geography');
  });

  it('needs a source with maker, dataset, https link, retrieved date and a stated licence', () => {
    expect(rules(line({ sources: [] }))).toContain('source');
    const s = line().sources[0]!;
    expect(rules(line({ sources: [{ ...s, maker: '' }] }))).toContain('source');
    expect(rules(line({ sources: [{ ...s, url: 'http://example.com' }] }))).toContain('source');
    expect(rules(line({ sources: [{ ...s, retrieved: 'yesterday' }] }))).toContain('source');
    expect(rules(line({ sources: [{ ...s, licence: '' }] }))).toContain('licence');
    expect(rules(line({ sources: [{ ...s, licence: 'unknown' }] }))).toContain('licence');
    expect(rules(line({ sources: [{ ...s, via: { name: 'Our World in Data', url: 'https://ourworldindata.org', licence: '' } }] }))).toContain('licence');
  });

  it('starts bars and areas at zero, and never puts them on a log scale', () => {
    const bar = line({ form: 'bar', scale: { y: { zero: false } } });
    expect(rules(bar)).toContain('zero-baseline');
    expect(rules(line({ form: 'bar', scale: { y: { log: true } } }))).toContain('log');
    // A line may leave zero out; the chart then says so.
    expect(rules(line({ scale: { y: { zero: false } } }))).toEqual([]);
    expect(chartGlosses(line())).toContain('The vertical scale does not start at zero.');
  });

  it('refuses dual axes, 3D, pies and home-made colours', () => {
    expect(rules({ ...line(), y2: 'other' } as unknown as Chart)).toContain('dual-axis');
    expect(rules(line({ encode: { x: 'year', y: 'mm', y2: 'mm' } as never }))).toContain('dual-axis');
    expect(rules({ ...line(), depth: 20 } as unknown as Chart)).toContain('3d');
    expect(rules(line({ form: 'pie' as never }))).toContain('pie');
    expect(rules({ ...line(), palette: ['red', 'orange', 'yellow'] } as unknown as Chart)).toContain('colour');
    expect(rules(line({ options: { colour: 'rainbow' as never } }))).toContain('colour');
  });

  it('keeps ordered data off separate hues, and caps categorical series at six', () => {
    const c = line({
      data: { columns: [{ key: 'year', label: 'Year', type: 'year' }, { key: 'mm', label: 'Rainfall', type: 'number' }, { key: 'decade', label: 'Decade', type: 'year' }], rows: [[2001, 1, 2000], [2002, 2, 2000]] },
      span: { from: '2001', to: '2002' },
      sourceSpan: { from: '2001', to: '2002' },
      encode: { x: 'year', y: 'mm', series: 'decade' },
      options: { colour: 'categorical' },
    });
    expect(rules(c)).toContain('encode'); // a year column cannot be a series
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].flatMap((s) => [[s, 2001, 1], [s, 2002, 2]]);
    const many = line({ data: { columns: [{ key: 's', label: 'Place', type: 'text' }, { key: 'year', label: 'Year', type: 'year' }, { key: 'mm', label: 'Rainfall', type: 'number' }], rows }, span: { from: '2001', to: '2002' }, sourceSpan: { from: '2001', to: '2002' }, encode: { x: 'year', y: 'mm', series: 's' }, options: { colour: 'categorical' } });
    expect(rules(many)).toContain('too-many-series');
    expect(rules({ ...many, options: { colour: 'focus', focus: ['a'] } })).toEqual([]);
  });

  it('uses diverging colour only around a stated midpoint', () => {
    const stripes = line({ form: 'stripes', options: { colour: 'diverging' } });
    expect(rules(stripes)).toContain('midpoint');
    expect(rules({ ...stripes, options: { colour: 'diverging', midpoint: { value: 2500, label: 'the 2001–2005 average' } } })).toEqual([]);
    expect(rules(line({ options: { colour: 'focus', midpoint: { value: 0, label: 'zero' } } }))).toContain('midpoint');
  });

  it('labels log scales, which need positive values', () => {
    const log = line({ scale: { y: { log: true } } });
    expect(rules(log)).toEqual([]);
    expect(chartGlosses(log).join(' ')).toMatch(/logarithmic/);
    const neg = line({ scale: { y: { log: true } }, data: { ...line().data, rows: [[2001, -1], [2002, 2], [2003, 3], [2004, 4], [2005, 5]] } });
    expect(rules(neg)).toContain('log');
  });

  it('states per-capita or absolute, the denominator of a rate or share, and the base of an index or anomaly', () => {
    expect(rules(line({ measure: { basis: 'nonsense' as never } }))).toContain('basis');
    expect(rules(line({ measure: { basis: 'rate' } }))).toContain('denominator');
    expect(rules(line({ measure: { basis: 'share' } }))).toContain('denominator');
    expect(rules(line({ measure: { basis: 'rate', denominator: 'per 1,000 people' } }))).toEqual([]);
    expect(rules(line({ measure: { basis: 'index' } }))).toContain('base');
    expect(rules(line({ measure: { basis: 'anomaly' } }))).toContain('base');
    expect(unitsLine(line({ measure: { basis: 'per-capita' } }))).toBe('mm, per person');
  });

  it('checks that an index reads its base', () => {
    const c = line({ measure: { basis: 'index', base: '2003 = 100' } });
    expect(rules(c)).toContain('index-base');
    const ok = line({ measure: { basis: 'index', base: '2003 = 100' }, data: { ...line().data, rows: [[2001, 90], [2002, 95], [2003, 100], [2004, 104], [2005, 111]] } });
    expect(rules(ok)).toEqual([]);
  });

  it('says whether money is nominal or real, and the base year of real money', () => {
    const rupees = line({ units: '₹ crore' });
    expect(rules(rupees)).toContain('money');
    expect(rules(line({ units: '₹ crore', measure: { basis: 'absolute', money: { currency: 'INR', prices: 'real' } } }))).toContain('money');
    expect(rules(line({ units: '₹ crore', measure: { basis: 'absolute', money: { currency: 'INR', prices: 'real', baseYear: 2011 } } }))).toEqual([]);
    expect(unitsLine(line({ units: '₹ crore', measure: { basis: 'absolute', money: { currency: 'INR', prices: 'real', baseYear: 2011 } } }))).toBe('₹ crore, at 2011 prices');
    const longNominal = line({ units: 'US$', span: { from: '1990', to: '2005' }, sourceSpan: { from: '1990', to: '2005' }, measure: { basis: 'absolute', money: { currency: 'USD', prices: 'nominal' } }, data: { ...line().data, rows: [[1990, 1], [2005, 2]] } });
    expect(warns(longNominal)).toContain('money');
  });

  it('shows uncertainty and sample sizes the data carries', () => {
    const withCi = line({ data: { columns: [...line().data.columns, { key: 'lower', label: 'Lower bound (95% CI)', type: 'number' }], rows: line().data.rows.map((r) => [...r, 1]) } });
    expect(rules(withCi)).toContain('uncertainty');
    const withN = line({ data: { columns: [...line().data.columns, { key: 'n', label: 'Sample size', type: 'number' }], rows: line().data.rows.map((r) => [...r, 12]) } });
    expect(rules(withN)).toContain('sample-size');
    const half = line({ data: { columns: [...line().data.columns, { key: 'lo', label: 'Low', type: 'number' }], rows: line().data.rows.map((r) => [...r, 1]) }, encode: { x: 'year', y: 'mm', lo: 'lo' } });
    expect(rules(half)).toContain('uncertainty');
    const outside = line({
      data: { columns: [...line().data.columns, { key: 'lo', label: 'Low', type: 'number' }, { key: 'hi', label: 'High', type: 'number' }], rows: line().data.rows.map((r) => [...r, 0, 10]) },
      encode: { x: 'year', y: 'mm', lo: 'lo', hi: 'hi' },
    });
    expect(rules(outside)).toContain('uncertainty');
    const dot: Chart = {
      ...line(),
      form: 'dot',
      span: undefined,
      sourceSpan: undefined,
      data: { columns: [{ key: 'state', label: 'State', type: 'text' }, { key: 'v', label: 'Value', type: 'number' }, { key: 'n', label: 'Sample size', type: 'number' }], rows: [['Goa', 3, 12], ['Kerala', 4, 400]] },
      encode: { label: 'state', y: 'v', n: 'n' },
    };
    expect(rules(dot)).toEqual([]);
    expect(chartGlosses(dot)).toContain('Hollow marks rest on fewer than 30 observations.');
  });

  it('keeps missing data missing, and refuses a stacked area with holes', () => {
    const gap = line({ data: { ...line().data, rows: [[2001, 1], [2002, null], [2003, 3], [2004, 4], [2005, 5]] } });
    expect(rules(gap)).toEqual([]);
    expect(chartGlosses(gap)).toContain('Gaps are missing values in the source; nothing is filled in.');
    const absent = line({ data: { ...line().data, rows: [[2001, 1], [2002, 2], [2005, 5]] } });
    expect(chartGlosses(absent)).toContain('Gaps are missing values in the source; nothing is filled in.');
    expect(rules(line({ data: { ...line().data, rows: [[2001, 'n/a'], [2005, 5]] } }))).toContain('data');
    const area: Chart = {
      ...line(),
      form: 'area',
      data: { columns: [{ key: 's', label: 'Source', type: 'text' }, { key: 'year', label: 'Year', type: 'year' }, { key: 'v', label: 'TWh', type: 'number' }], rows: [['Coal', 2001, 1], ['Coal', 2005, null], ['Hydro', 2001, 2], ['Hydro', 2005, 3]] },
      encode: { x: 'year', y: 'v', series: 's' },
    };
    expect(rules(area)).toContain('missing');
  });

  it('records the full span and labels a narrower window', () => {
    expect(rules(line({ sourceSpan: undefined }))).toContain('span');
    expect(rules(line({ span: undefined }))).toContain('span');
    expect(rules(line({ span: { from: '2000', to: '2005' } }))).toContain('span');
    expect(rules(line({ sourceSpan: { from: '2002', to: '2005' } }))).toContain('span');
    const window = line({ sourceSpan: { from: '1871', to: '2025' } });
    expect(rules(window)).toEqual([]);
    expect(chartGlosses(window)[0]).toBe('Shown from 2001 to 2005; the source runs from 1871 to 2025.');
  });

  it('checks every cell against its column type and the size limits', () => {
    expect(rules(line({ data: { ...line().data, rows: [[2001, NaN]] } }))).toContain('data');
    expect(rules(line({ data: { ...line().data, rows: [[2001]] } }))).toContain('data');
    expect(rules(line({ data: { columns: line().data.columns, rows: Array.from({ length: 20_001 }, (_, i) => [i, 1]) } }))).toContain('size');
    expect(rules(line({ encode: { x: 'year', y: 'nope' } }))).toContain('encode');
    expect(rules(line({ encode: { x: 'year' } }))).toContain('encode');
    expect(rules(line({ data: { ...line().data, rows: [[2001, 1], [2001, 2]] }, span: { from: '2001', to: '2001' } }))).toContain('duplicate');
  });

  it('checks every figure in machine annotations against the rows, fail-closed', () => {
    const ok = line({ annotations: [{ kind: 'point', x: 2005, text: 'The wettest year here, at 3,270 mm', by: 'machine' }] });
    expect(rules(ok)).toEqual([]);
    const invented = line({ annotations: [{ kind: 'point', x: 2005, text: 'Rainfall rose 56 per cent in four years', by: 'machine' }] });
    expect(rules(invented)).toContain('figures');
    const styled = line({ annotations: [{ kind: 'point', x: 2005, text: 'A pivotal year for the monsoon', by: 'machine' }] });
    expect(rules(styled).some((r) => r.startsWith('style:'))).toBe(true);
    // The editor's own figures are theirs; the Desk only asks them to check.
    const editor = line({ annotations: [{ kind: 'point', x: 2005, text: 'Up 56 per cent in four years', by: 'editor' }] });
    expect(rules(editor)).toEqual([]);
    expect(warns(editor)).toContain('figures');
    expect(rules(line({ annotations: [{ kind: 'point', x: 1999, text: 'Before', by: 'editor' }] }))).toContain('annotation');
    expect(rules(line({ annotations: [{ kind: 'rule', axis: 'y', value: 2222, text: 'A line', by: 'machine' }] }))).toContain('figures');
  });

  it('refuses unknown fields, so nothing unchecked reaches a bundle', () => {
    expect(rules({ ...line(), extra: 1 } as unknown as Chart)).toContain('unknown-field');
    expect(rules(line({ options: { glow: true } as never }))).toContain('unknown-field');
  });
});

describe('figures', () => {
  it('reads numbers as written, with ranges, signs and scale words', () => {
    expect(figuresIn('From 1997–98 it fell to –0.3, then 1.5 million and 12 lakh').map((f) => f.value)).toEqual([1997, 1998, -0.3, 1.5e6, 12e5]);
    expect(figuresIn('3,270 mm').map((f) => f.value)).toEqual([3270]);
  });
  it('matches figures rounded no finer than written', () => {
    const c = line();
    expect(checkFigures('About 2,650 mm in 2004', c).ok).toBe(true);
    expect(checkFigures('2,650.4 mm', c).ok).toBe(false);
    expect(checkFigures('2.7 thousand mm', c).ok).toBe(true);
    expect(checkFigures('in 2009', c).ok).toBe(false);
  });
});

describe('machine lines', () => {
  it('pass the style check and cite only the data', () => {
    const c = line({ sourceSpan: { from: '1871', to: '2025' }, data: { ...line().data, rows: [[2001, 1], [2002, null], [2003, 3], [2004, 4], [2005, 5]] } });
    for (const g of [...chartGlosses(c), describeChart(c)]) {
      expect(checkStyle(g).issues.filter((i) => i.severity === 'error')).toEqual([]);
      expect(checkFigures(g, c)).toEqual({ ok: true, unmatched: [] });
    }
  });
});

// The comps page's real-data charts must pass the validator too.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const fs: Any = await import('node:fs' as string);
const path: Any = await import('node:path' as string);
const url: Any = await import('node:url' as string);
describe('the comps fixtures', () => {
  const dir = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '../../../../docs/design-comps/charts/data');
  const files: string[] = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f: string) => f.endsWith('.json')) : [];
  it.each(files)('%s is a valid chart', (f) => {
    const chart = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Chart;
    expect(validateChart(chart).errors).toEqual([]);
  });
});

import haul001 from '../../fixtures/haul-001.json';
import { validateHaul } from '../validate';
import type { Haul } from '../haul';

describe('validateHaul with chart blocks', () => {
  const base = haul001 as unknown as Haul;
  const withBlock = (b: unknown): Haul => ({ ...base, items: base.items.map((it, i) => (i === 0 ? { ...it, blocks: [b as never] } : it)) });
  it('accepts an honest chart and bundles without charts alike', () => {
    expect(validateHaul(base).errors).toEqual([]);
    expect(validateHaul(withBlock({ kind: 'chart', chart: line() })).errors).toEqual([]);
  });
  it('refuses a dishonest chart in a bundle', () => {
    const r = validateHaul(withBlock({ kind: 'chart', chart: line({ form: 'bar', scale: { y: { zero: false } } }) }));
    expect(r.errors.map((e) => e.rule)).toContain('zero-baseline');
    expect(r.errors[0]!.path).toMatch(/^items\[0\]\.blocks\[0\]\.chart/);
  });
  it('requires the app pictures to be published next to the bundle', () => {
    const img = { url: 'https://upload.wikimedia.org/x.png', width: 1125, height: 900 };
    const r = validateHaul(withBlock({ kind: 'chart', chart: line(), images: { light: img, dark: img } }), undefined, { filesBase: 'https://files.fromthedumpsterfire.com' });
    expect(r.errors.map((e) => e.rule)).toContain('hosted');
  });
});

describe('malformed and oversized charts are refused, never thrown on', () => {
  it('refuses null columns and rows with a message', () => {
    expect(() => validateChart(line({ data: { columns: [null as never], rows: [] } }))).not.toThrow();
    expect(rules(line({ data: { columns: [null as never], rows: [] } }))).toContain('shape');
    const nullRow = line({ data: { ...line().data, rows: [null as never] }, annotations: [{ kind: 'point', x: 2001, text: 'Here, 3', by: 'machine' }] });
    expect(() => validateChart(nullRow)).not.toThrow();
    expect(rules(nullRow)).toContain('data');
  });
  it('caps a chart at 1.5 MB and long text cells and labels', () => {
    const long = 'x'.repeat(201);
    const text = line({ data: { columns: [...line().data.columns, { key: 'note', label: 'Note', type: 'text' }], rows: line().data.rows.map((r) => [...r, long]) } });
    expect(rules(text)).toContain('data');
    const place = 'Sub-Saharan Africa (excluding high income), a long region name';
    const big = line({ data: { columns: [...line().data.columns, { key: 'place', label: 'Place', type: 'text' }], rows: Array.from({ length: 19_000 }, (_, k) => [2001, 1234.5678912345 + k, `${place} ${k}`]) } });
    expect(rules(big)).toContain('size');
  });
  it('wants a clean https link for a redistributor', () => {
    const s = line().sources[0]!;
    expect(rules(line({ sources: [{ ...s, via: { name: 'OWID', url: 'https://x.org/a b)', licence: 'CC BY 4.0' } }] }))).toContain('source');
  });
});
