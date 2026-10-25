// Charts on the server, offline: the Our World in Data and World Bank adapters answered by a stubbed
// fetch shaped like their real responses (checked 2026-10-25), and the publish step's rule that a
// chart's app pictures must be drawn from exactly the chart being published.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOwid, fetchWorldBank, owidSlug, wbUnits } from '../src/charts';
import { blocksForBundle, BlockRefused, type BlockRow } from '../src/blocks';
import { chartKey, type Chart } from '@fdf/shared/charts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function serve(handler: (u: URL) => Response | null) {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const u = new URL(String(input));
    if (u.hostname === 'cloudflare-dns.com') return Response.json({ Answer: u.searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] });
    return handler(u) ?? new Response('not found', { status: 404 });
  });
}
afterEach(() => vi.unstubAllGlobals());

const OWID_META = {
  chart: { title: 'Temperature change relative to the pre-industrial period', citation: 'Met Office Hadley Centre – HadCRUT5 (2026)' },
  columns: {
    'Global average temperature anomaly relative to 1861-1890': { titleShort: 'Global average temperature anomaly relative to 1861-1890', shortUnit: '°C', unit: 'degrees Celsius', timespan: '1850-2026', shortName: 'near_surface_temperature_anomaly', fullMetadata: 'https://api.ourworldindata.org/v1/indicators/1325020.metadata.json' },
  },
};
const OWID_CSV = 'entity,code,year,near_surface_temperature_anomaly\nWorld,OWID_WRL,1850,-0.05\nWorld,OWID_WRL,1851,0.1\n"Korea, South",KOR,1850,\nIndia,IND,1852,0.2\n';
const ORIGINS = { origins: [{ producer: 'Met Office Hadley Centre', title: 'HadCRUT5', urlMain: 'https://www.metoffice.gov.uk/hadobs/hadcrut5/', license: { name: 'Open Government License v3', url: 'https://www.metoffice.gov.uk/hadobs/hadcrut5/terms_and_conditions.html' } }] };

function owid(origins: unknown = ORIGINS) {
  serve((u) => {
    if (u.toString() === 'https://ourworldindata.org/grapher/temperature-anomaly.metadata.json') return json(OWID_META);
    if (u.pathname === '/grapher/temperature-anomaly.csv') {
      expect(u.searchParams.get('csvType')).toBe('full');
      expect(u.searchParams.get('useColumnShortNames')).toBe('true');
      return new Response(OWID_CSV, { headers: { 'content-type': 'text/csv' } });
    }
    if (u.toString() === 'https://api.ourworldindata.org/v1/indicators/1325020.metadata.json') return json(origins);
    return null;
  });
}

describe('Our World in Data', () => {
  it('reads a grapher link or a slug', () => {
    expect(owidSlug('https://ourworldindata.org/grapher/temperature-anomaly?tab=chart&country=~IND')).toBe('temperature-anomaly');
    expect(owidSlug('life-expectancy')).toBe('life-expectancy');
    expect(() => owidSlug('https://example.com/grapher/x')).toThrow(BlockRefused);
  });

  it('fetches the data, filters places, keeps missing values missing, and credits each producer with its licence', async () => {
    owid();
    const r = await fetchOwid('https://ourworldindata.org/grapher/temperature-anomaly', { entities: ['World', 'Korea, South'] });
    expect(r.data.columns.map((c) => c.type)).toEqual(['text', 'year', 'number']);
    expect(r.data.rows).toEqual([
      ['World', 1850, -0.05],
      ['World', 1851, 0.1],
      ['Korea, South', 1850, null],
    ]);
    expect(r.entities).toEqual(['India', 'Korea, South', 'World']);
    expect(r.sourceSpan).toEqual({ from: '1850', to: '1852' });
    expect(r.units).toBe('°C');
    expect(r.sources).toEqual([
      expect.objectContaining({ maker: 'Met Office Hadley Centre', dataset: 'HadCRUT5', licence: 'Open Government License v3', via: { name: 'Our World in Data', url: 'https://ourworldindata.org/grapher/temperature-anomaly', licence: 'CC BY 4.0' } }),
    ]);
  });

  it('refuses a source whose licence is not stated', async () => {
    owid({ origins: [{ producer: 'Somebody', title: 'Something' }] });
    await expect(fetchOwid('temperature-anomaly')).rejects.toThrow(/does not state the licence/);
  });
});

const WB_IND = [{ page: 1, pages: 1, per_page: '50', total: 1 }, [{ id: 'NY.GDP.PCAP.KD', name: 'GDP per capita (constant 2015 US$)', unit: '', source: { id: '2', value: 'World Development Indicators' }, sourceOrganization: 'World Bank national accounts data' }]];
const WB_META = (licence?: string) => ({ source: [{ concept: [{ variable: [{ metatype: [{ id: 'IndicatorName', value: 'GDP per capita (constant 2015 US$)' }, ...(licence ? [{ id: 'License_Type', value: licence }, { id: 'License_URL', value: 'https://datacatalog.worldbank.org/public-licenses#cc-by' }] : [])] }] }] }] });
const WB_DATA = [
  { page: 1, pages: 1, per_page: 20000, total: 4 },
  [
    { country: { id: 'IN', value: 'India' }, countryiso3code: 'IND', date: '2024', value: 2366.83 },
    { country: { id: 'IN', value: 'India' }, countryiso3code: 'IND', date: '2023', value: 2229.71 },
    { country: { id: 'BD', value: 'Bangladesh' }, countryiso3code: 'BGD', date: '2024', value: null },
    { country: { id: 'BD', value: 'Bangladesh' }, countryiso3code: 'BGD', date: '2023', value: 1900.5 },
  ],
];

function worldBank(licence?: string) {
  serve((u) => {
    if (u.pathname === '/v2/indicator/NY.GDP.PCAP.KD') return json(WB_IND);
    if (u.pathname === '/v2/sources/2/series/NY.GDP.PCAP.KD/metadata') return json(WB_META(licence));
    if (u.pathname === '/v2/country/IND;BGD/indicator/NY.GDP.PCAP.KD') return json(WB_DATA);
    return null;
  });
}

describe('World Bank', () => {
  it('reads units and money from the indicator name', () => {
    expect(wbUnits('GDP per capita (constant 2015 US$)')).toEqual({ units: 'constant 2015 US$', measure: { money: { currency: 'USD', prices: 'real', baseYear: 2015 }, basis: 'per-capita' } });
    expect(wbUnits('GDP (current US$)').measure.money).toEqual({ currency: 'USD', prices: 'nominal' });
    expect(wbUnits('Military expenditure (% of GDP)').measure).toEqual({ basis: 'share', denominator: 'of GDP' });
  });

  it('fetches yearly values with the licence the Bank states', async () => {
    worldBank('CC BY-4.0');
    const r = await fetchWorldBank('NY.GDP.PCAP.KD', ['ind', 'bgd']);
    expect(r.data.rows).toEqual([
      ['Bangladesh', 2023, 1900.5],
      ['Bangladesh', 2024, null],
      ['India', 2023, 2229.71],
      ['India', 2024, 2366.83],
    ]);
    expect(r.sources[0]).toEqual(expect.objectContaining({ maker: 'World Bank', licence: 'CC BY-4.0', url: 'https://data.worldbank.org/indicator/NY.GDP.PCAP.KD' }));
    expect(r.sourceSpan).toEqual({ from: '2023', to: '2024' });
  });

  it('refuses a series without a stated licence, and bad codes', async () => {
    worldBank();
    await expect(fetchWorldBank('NY.GDP.PCAP.KD', ['IND', 'BGD'])).rejects.toThrow(/does not state a licence/);
    await expect(fetchWorldBank('NY GDP', ['IND'])).rejects.toThrow(BlockRefused);
    await expect(fetchWorldBank('NY.GDP.PCAP.KD', ['INDIA'])).rejects.toThrow(BlockRefused);
  });
});

// A 1125 x 900 PNG header (the publish step reads only the size).
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

const chart: Chart = {
  form: 'line',
  title: 'Rain',
  units: 'mm',
  geography: 'Mumbai',
  span: { from: '2001', to: '2002' },
  sourceSpan: { from: '2001', to: '2002' },
  sources: [{ maker: 'IMD', dataset: 'Rainfall', url: 'https://mausam.imd.gov.in/', licence: 'GODL-India', retrieved: '2026-10-25' }],
  measure: { basis: 'absolute' },
  data: { columns: [{ key: 'year', label: 'Year', type: 'year' }, { key: 'mm', label: 'Rain', type: 'number' }], rows: [[2001, 1], [2002, 2]] },
  encode: { x: 'year', y: 'mm' },
};
const row: BlockRow = { id: 'bk_1', item_id: 'it_1', kind: 'chart', body: JSON.stringify({ kind: 'chart', chart }), media_key: null, mime: null, status: 'kept', position: 0, created_at: '', updated_at: '' };

describe('publishing a chart', () => {
  it('attaches the app pictures drawn from this chart and this Haul’s ink', () => {
    const pictures = new Map([[chartKey(chart, 'teal'), { light: png(1125, 900), dark: png(1125, 900) }]]);
    const out = blocksForBundle([row], null, 'hauls/001/media/rain', 'https://files.example', { edition: 'teal', pictures });
    expect(out.problems).toEqual([]);
    expect(out.blocks[0]).toEqual({ kind: 'chart', chart, images: { light: { url: 'https://files.example/hauls/001/media/rain-1-chart-light.png', width: 1125, height: 900 }, dark: { url: 'https://files.example/hauls/001/media/rain-1-chart-dark.png', width: 1125, height: 900 } } });
    expect(out.pictures!.map(([k]) => k)).toEqual(['hauls/001/media/rain-1-chart-light.png', 'hauls/001/media/rain-1-chart-dark.png']);
  });

  it('refuses pictures drawn from another chart or another ink, or of the wrong size', () => {
    const other = new Map([[chartKey({ ...chart, title: 'Changed' }, 'teal'), { light: png(1125, 900), dark: png(1125, 900) }]]);
    expect(blocksForBundle([row], null, 'hauls/001/media/rain', 'https://files.example', { edition: 'teal', pictures: other }).problems[0]).toMatch(/no pictures for the app/);
    const ink = new Map([[chartKey(chart, 'oxblood'), { light: png(1125, 900), dark: png(1125, 900) }]]);
    expect(blocksForBundle([row], null, 'hauls/001/media/rain', 'https://files.example', { edition: 'teal', pictures: ink }).problems).toHaveLength(1);
    const small = new Map([[chartKey(chart, 'teal'), { light: png(375, 300), dark: png(1125, 900) }]]);
    expect(blocksForBundle([row], null, 'hauls/001/media/rain', 'https://files.example', { edition: 'teal', pictures: small }).problems[0]).toMatch(/1125 px wide PNG/);
  });

  it('only notes the missing pictures in a preview', () => {
    const warnings: string[] = [];
    const out = blocksForBundle([row], null, 'hauls/001/media/rain', 'https://files.example', { edition: 'teal', warnings });
    expect(out.problems).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('re-checks the chart at publish', () => {
    const bad = { ...row, body: JSON.stringify({ kind: 'chart', chart: { ...chart, sources: [] } }) };
    expect(blocksForBundle([bad], null, 'x', 'https://files.example', { edition: 'teal', pictures: new Map() }).problems[0]).toMatch(/fails its checks/);
  });
});

describe('a large Our World in Data chart', () => {
  it('returns the places to choose from instead of refusing', async () => {
    const big = 'entity,code,year,near_surface_temperature_anomaly\n' + Array.from({ length: 20_050 }, (_, i) => `Place ${i % 200},X,${1800 + Math.floor(i / 200)},0.1`).join('\n');
    serve((u) => {
      if (u.pathname === '/grapher/temperature-anomaly.metadata.json') return json(OWID_META);
      if (u.pathname === '/grapher/temperature-anomaly.csv') return new Response(big);
      if (u.hostname === 'api.ourworldindata.org') return json(ORIGINS);
      return null;
    });
    const r = await fetchOwid('temperature-anomaly');
    expect(r.data.rows).toEqual([]);
    expect(r.entities).toHaveLength(200);
    expect(r.notice).toMatch(/Choose the places/);
    await expect(fetchOwid('temperature-anomaly', { entities: Array.from({ length: 200 }, (_, i) => `Place ${i}`) })).rejects.toThrow(/choose fewer places/);
  });
});
