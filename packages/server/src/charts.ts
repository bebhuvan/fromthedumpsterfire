// Charts on the Desk: fetching the data behind a chart from Our World in Data or the World Bank (by
// code, through guardedFetch, with a byte cap on what is streamed), and storing the editor's chart
// as an item block. Licences are recorded as each institution states them; a source that states none
// is refused. Nothing here writes a number: rows are the source's own values, filtered, never cleaned.
// Provider facts, with the dates they were checked: docs/CHARTS.md.

import type { Cell, ChartColumn, ChartData, ChartSource, ChartMeasure } from '@fdf/shared/charts';
import { guardedFetch } from './extract/guard';
import { USER_AGENT } from './extract/http';
import { readCapped, readJsonCapped } from './extract/stream';
import { dateIst, nowIso } from './util';
import { BlockRefused } from './blocks';

const CSV_BYTES = 12 * 1024 * 1024;
const META_BYTES = 1024 * 1024;
const WB_BYTES = 8 * 1024 * 1024;
/** A chart fetched from a provider keeps at most this many rows (filter by entity first). */
const MAX_ROWS = 20_000;

const refuse = (m: string, status = 422): never => {
  throw new BlockRefused(m, status);
};

/** What a provider fetch hands the Desk: the rows and what is known about them. The editor writes the title. */
export interface FetchedChartData {
  data: ChartData;
  sources: ChartSource[];
  units: string;
  measure?: Partial<ChartMeasure>;
  /** The full span of the source (all entities). */
  sourceSpan?: { from: string; to: string };
  /** Every entity (country, region) in the source, to choose from. */
  entities: string[];
  /** Said to the editor when the rows were held back (too many until places are chosen). */
  notice?: string;
  /** The provider's own title and notes, shown to the editor for reference (never printed as theirs). */
  reference: { title?: string; subtitle?: string; note?: string; citation?: string };
}

async function getJson<T>(url: string, cap: number, what: string): Promise<T> {
  const res = await guardedFetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, timeoutMs: 25_000 }).catch((e: unknown) => refuse(`${what} could not be fetched: ${e instanceof Error ? e.message : e}`, 502));
  if (!res.ok) {
    await res.body?.cancel();
    return refuse(`${what} answered ${res.status}.`, res.status === 404 ? 404 : 502);
  }
  return readJsonCapped<T>(res.body, cap, what).catch((e: unknown) => refuse(e instanceof Error ? e.message : `${what} was too large`));
}

async function getText(url: string, cap: number, what: string): Promise<string> {
  const res = await guardedFetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/csv,text/plain' }, timeoutMs: 30_000 }).catch((e: unknown) => refuse(`${what} could not be fetched: ${e instanceof Error ? e.message : e}`, 502));
  if (!res.ok) {
    await res.body?.cancel();
    return refuse(`${what} answered ${res.status}.`, res.status === 404 ? 404 : 502);
  }
  const bytes = await readCapped(res.body, cap, what).catch((e: unknown) => refuse(e instanceof Error ? e.message : `${what} was too large`));
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------- Our World in Data

/** The chart's slug from "https://ourworldindata.org/grapher/<slug>?…" or a bare slug. */
export function owidSlug(input: string): string {
  const s = input.trim();
  const m = /^(?:https?:\/\/(?:www\.)?ourworldindata\.org\/grapher\/)?([a-z0-9][a-z0-9-]{0,120})(?:[?#/].*)?$/i.exec(s);
  if (!m) return refuse('That is not an Our World in Data chart. Paste a link like https://ourworldindata.org/grapher/life-expectancy.', 400);
  return m[1]!.toLowerCase();
}

interface OwidColumn {
  titleShort?: string;
  titleLong?: string;
  shortUnit?: string;
  unit?: string;
  timespan?: string;
  shortName?: string;
  fullMetadata?: string;
  citationShort?: string;
}
interface OwidMeta {
  chart?: { title?: string; subtitle?: string; note?: string; citation?: string; originalChartUrl?: string };
  columns?: Record<string, OwidColumn>;
}
interface OwidOrigin {
  producer?: string;
  title?: string;
  versionProducer?: string;
  urlMain?: string;
  license?: { name?: string; url?: string };
}

/** Split one CSV line (OWID quotes entity names that contain commas). */
function csvLine(line: string): string[] {
  const out: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') ((f += '"'), i++);
      else if (ch === '"') q = false;
      else f += ch;
    } else if (ch === '"' && f === '') q = true;
    else if (ch === ',') ((out.push(f), (f = '')));
    else f += ch;
  }
  out.push(f);
  return out;
}

/**
 * The data behind an Our World in Data chart: the grapher CSV (full, short column names), its
 * metadata, and each indicator's origins with their licences. OWID's own work is CC BY 4.0; the data
 * it republishes keeps its producer's licence, so each producer is credited with its own.
 */
export async function fetchOwid(input: string, opts: { entities?: string[]; from?: number; to?: number } = {}): Promise<FetchedChartData> {
  const slug = owidSlug(input);
  const page = `https://ourworldindata.org/grapher/${slug}`;
  const meta = await getJson<OwidMeta>(`${page}.metadata.json`, META_BYTES, 'The chart’s metadata');
  const csv = await getText(`${page}.csv?v=1&csvType=full&useColumnShortNames=true`, CSV_BYTES, 'The chart’s data');
  const lines = csv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const header = csvLine(lines[0] ?? '');
  const timeKey = header[2];
  if (header[0] !== 'entity' || header[1] !== 'code' || (timeKey !== 'year' && timeKey !== 'day')) refuse('This chart’s data is not in the shape Our World in Data’s charts usually have (entity, code, year).');
  const valueKeys = header.slice(3);
  if (!valueKeys.length) refuse('This chart has no data columns.');
  if (valueKeys.length > 8) refuse('This chart has more than eight data columns; pick a simpler chart.');
  const cols = Object.values(meta.columns ?? {});
  const colFor = (key: string) => cols.find((c) => c.shortName === key);

  // Licences, per indicator, from each origin. Refuse any origin without a stated licence.
  const sources = new Map<string, ChartSource>();
  const retrieved = dateIst(nowIso());
  for (const key of valueKeys) {
    const c = colFor(key);
    if (!c?.fullMetadata || !/^https:\/\/api\.ourworldindata\.org\/v1\/indicators\/\d+\.metadata\.json$/.test(c.fullMetadata)) refuse(`Our World in Data does not say where "${key}" comes from, so its licence cannot be checked.`);
    const full = await getJson<{ origins?: OwidOrigin[] }>(c!.fullMetadata!, META_BYTES, 'The indicator’s metadata');
    const origins = full.origins ?? [];
    if (!origins.length) {
      sources.set('Our World in Data', { maker: 'Our World in Data', dataset: c!.titleShort ?? key, url: page, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', retrieved });
      continue;
    }
    for (const o of origins) {
      const licence = o.license?.name?.trim();
      if (!licence) refuse(`Our World in Data does not state the licence of ${o.producer ?? 'one of this chart’s sources'}; it cannot be used.`);
      const maker = o.producer?.trim() || 'Unknown producer';
      const dataset = (o.title || o.versionProducer || c!.titleShort || key).trim();
      const k = `${maker}|${dataset}|${licence}`;
      if (sources.has(k)) continue;
      sources.set(k, {
        maker,
        dataset,
        url: o.urlMain && /^https:\/\//.test(o.urlMain) ? o.urlMain : page,
        licence: licence!,
        ...(o.license?.url && /^https:\/\//.test(o.license.url) ? { licenceUrl: o.license.url } : {}),
        retrieved,
        via: { name: 'Our World in Data', url: page, licence: 'CC BY 4.0' },
      });
    }
  }

  const columns: ChartColumn[] = [
    { key: 'entity', label: 'Entity', type: 'text' },
    { key: timeKey === 'day' ? 'day' : 'year', label: timeKey === 'day' ? 'Date' : 'Year', type: timeKey === 'day' ? 'date' : 'year' },
    ...valueKeys.map((k) => {
      const c = colFor(k);
      const unit = c?.shortUnit || c?.unit;
      return { key: k.slice(0, 40).replace(/[^a-z0-9_-]/g, '_').replace(/^([^a-z])/, 'c$1'), label: c?.titleShort ?? k, type: 'number' as const, ...(unit ? { unit } : {}) };
    }),
  ];
  const want = opts.entities?.length ? new Set(opts.entities) : null;
  const entities = new Set<string>();
  const rows: Cell[][] = [];
  let tmin = Infinity;
  let tmax = -Infinity;
  const timeNum = (t: string) => (timeKey === 'day' ? Number(t.replace(/-/g, '')) : Number(t));
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const f = csvLine(line);
    const entity = f[0] ?? '';
    entities.add(entity);
    const t = f[2] ?? '';
    const tn = timeNum(t);
    if (!Number.isFinite(tn)) continue;
    tmin = Math.min(tmin, tn);
    tmax = Math.max(tmax, tn);
    if (want && !want.has(entity)) continue;
    const year = timeKey === 'day' ? Number(t.slice(0, 4)) : Number(t);
    if ((opts.from !== undefined && year < opts.from) || (opts.to !== undefined && year > opts.to)) continue;
    rows.push([entity, timeKey === 'day' ? t : Number(t), ...valueKeys.map((_, j) => {
      const raw = (f[3 + j] ?? '').trim();
      if (raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })]);
  }
  // Too many rows to keep: with places already chosen that is a refusal; before, the editor still
  // gets the list of places to choose from, with no rows yet.
  let notice: string | undefined;
  if (rows.length > MAX_ROWS) {
    if (want) refuse(`That is ${rows.length} rows; choose fewer places or a shorter span (at most ${MAX_ROWS}).`);
    notice = `This chart has ${rows.length.toLocaleString('en-IN')} rows for all its places, more than a chart can carry (${MAX_ROWS.toLocaleString('en-IN')}). Choose the places to show.`;
    rows.length = 0;
  }
  const first = cols[0];
  const fmt = (n: number) => (timeKey === 'day' ? `${String(n).slice(0, 4)}-${String(n).slice(4, 6)}-${String(n).slice(6, 8)}` : String(n));
  return {
    data: { columns, rows },
    sources: [...sources.values()],
    units: first?.shortUnit || first?.unit || '',
    sourceSpan: Number.isFinite(tmin) ? { from: fmt(tmin), to: fmt(tmax) } : undefined,
    entities: [...entities].sort(),
    ...(notice ? { notice } : {}),
    reference: { title: meta.chart?.title, subtitle: meta.chart?.subtitle, note: meta.chart?.note, citation: meta.chart?.citation },
  };
}

// ---------------------------------------------------------------- World Bank

interface WbIndicator {
  id: string;
  name: string;
  unit?: string;
  source?: { id: string; value: string };
  sourceOrganization?: string;
}
interface WbPoint {
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
}

/** The licence the World Bank states for a series (Data Catalog metadata: License_Type, License_URL). */
async function wbLicence(sourceId: string, id: string): Promise<{ licence: string; url?: string }> {
  const meta = await getJson<{ source?: Array<{ concept?: Array<{ variable?: Array<{ metatype?: Array<{ id: string; value: string }> }> }> }> }>(
    `https://api.worldbank.org/v2/sources/${encodeURIComponent(sourceId)}/series/${encodeURIComponent(id)}/metadata?format=json`,
    META_BYTES,
    'The World Bank’s series metadata',
  );
  const types = meta.source?.flatMap((s) => s.concept ?? []).flatMap((c) => c.variable ?? []).flatMap((v) => v.metatype ?? []) ?? [];
  const licence = types.find((t) => t.id === 'License_Type')?.value?.trim();
  const url = types.find((t) => t.id === 'License_URL')?.value?.trim();
  if (!licence) return refuse(`The World Bank does not state a licence for ${id}; it cannot be used.`);
  return { licence, ...(url && /^https:\/\//.test(url) ? { url } : {}) };
}

/** Units and money from an indicator name: "GDP per capita (constant 2015 US$)". */
export function wbUnits(name: string): { units: string; measure: Partial<ChartMeasure> } {
  const paren = /\(([^()]+)\)\s*$/.exec(name)?.[1]?.trim() ?? '';
  const measure: Partial<ChartMeasure> = {};
  const constant = /constant (\d{4}) (US\$|LCU|international \$)/i.exec(paren);
  const current = /current (US\$|LCU|international \$)/i.exec(paren);
  if (constant) measure.money = { currency: constant[2] === 'US$' ? 'USD' : constant[2] === 'LCU' ? 'local currency' : 'international $', prices: 'real', baseYear: Number(constant[1]) };
  else if (current) measure.money = { currency: current[1] === 'US$' ? 'USD' : current[1] === 'LCU' ? 'local currency' : 'international $', prices: 'nominal' };
  if (/per capita/i.test(name)) measure.basis = 'per-capita';
  else if (/^%|% of/i.test(paren)) measure.basis = 'share';
  else if (/per 1,?000|per 100,?000/i.test(paren)) measure.basis = 'rate';
  if (measure.basis === 'share' || measure.basis === 'rate') measure.denominator = paren.replace(/^%\s*/, '');
  return { units: paren || name, measure };
}

/** A World Bank indicator (API v2) for some countries, yearly. */
export async function fetchWorldBank(indicator: string, countries: string[], opts: { from?: number; to?: number } = {}): Promise<FetchedChartData> {
  const id = indicator.trim();
  if (!/^[A-Za-z0-9._]{2,60}$/.test(id)) refuse('That is not a World Bank indicator code (like NY.GDP.PCAP.KD).', 400);
  const codes = countries.map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (!codes.length || codes.length > 30 || !codes.every((c) => /^[A-Z0-9]{2,3}$/.test(c))) refuse('Give between one and thirty country codes (ISO, like IND or BGD).', 400);
  const head = await getJson<[unknown, WbIndicator[]?]>(`https://api.worldbank.org/v2/indicator/${encodeURIComponent(id)}?format=json`, META_BYTES, 'The World Bank’s indicator');
  const ind = Array.isArray(head) ? head[1]?.[0] : undefined;
  if (!ind?.name || !ind.source?.id) return refuse(`The World Bank has no indicator ${id}.`, 404);
  const lic = await wbLicence(ind.source.id, id);
  const res = await getJson<[{ pages?: number; message?: unknown }, WbPoint[]?]>(
    `https://api.worldbank.org/v2/country/${codes.join(';')}/indicator/${encodeURIComponent(id)}?format=json&per_page=20000`,
    WB_BYTES,
    'The World Bank’s data',
  );
  const points = Array.isArray(res) ? (res[1] ?? []) : [];
  if (!points.length) refuse('The World Bank returned no data for those countries.', 404);
  if ((res[0]?.pages ?? 1) > 1) refuse('That is more data than one request returns; choose fewer countries.');
  if (points.some((p) => !/^\d{4}$/.test(p.date))) refuse('Only yearly series can be charted from the World Bank for now.');
  const withValues = points.filter((p) => p.value !== null).map((p) => Number(p.date));
  const rows: Cell[][] = points
    .filter((p) => (opts.from === undefined || Number(p.date) >= opts.from) && (opts.to === undefined || Number(p.date) <= opts.to))
    .map((p) => [p.country.value, Number(p.date), typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null] as Cell[])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || (a[1] as number) - (b[1] as number));
  const { units, measure } = wbUnits(ind.name);
  return {
    data: {
      columns: [
        { key: 'country', label: 'Country', type: 'text' },
        { key: 'year', label: 'Year', type: 'year' },
        { key: 'value', label: ind.name, type: 'number' },
      ],
      rows,
    },
    sources: [
      {
        maker: 'World Bank',
        dataset: `${ind.source.value}: ${ind.name} (${id})`,
        url: `https://data.worldbank.org/indicator/${encodeURIComponent(id)}`,
        licence: lic.licence,
        ...(lic.url ? { licenceUrl: lic.url } : {}),
        retrieved: dateIst(nowIso()),
      },
    ],
    units,
    measure,
    sourceSpan: withValues.length ? { from: String(Math.min(...withValues)), to: String(Math.max(...withValues)) } : undefined,
    entities: [...new Set(points.map((p) => p.country.value))].sort(),
    reference: { title: ind.name, note: ind.sourceOrganization ? `Source organisation: ${ind.sourceOrganization.replace(/\s+/g, ' ').trim()}` : undefined },
  };
}
