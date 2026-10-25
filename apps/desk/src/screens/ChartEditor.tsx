// Adding or editing a chart on an item. Data comes in three ways: a table pasted or uploaded (parsed
// here, in the browser), an Our World in Data chart or a World Bank indicator (fetched by the server,
// with each source's licence as stated). The editor then picks the form, says which column does what,
// writes the title and note in their own words (never sent to a model), and states what the numbers
// are. The preview is drawn by the shared renderer as the site and the app will draw it; the honesty
// checks (validateChart) run as the editor types, and Keep stays off until they pass. The server checks
// again before storing, and publish checks a third time.

import { useMemo, useState } from 'react';
import {
  BASES,
  chartGlosses,
  csvToData,
  describeChart,
  FORMS,
  formsFor,
  unitsLine,
  validateChart,
  type Annotation,
  type Basis,
  type Cell,
  type Chart,
  type ChartColour,
  type ChartData,
  type ChartRole,
  type ChartSource,
} from '@fdf/shared/charts';
import type { Edition } from '@fdf/shared/tokens';
import { api, type FetchedChartData } from '../api';
import { safeHref, useToast } from '../lib/core';
import { ChartPreview } from '../lib/charts';
import { assemble, autoEncode, clean, colIndex, draftFrom, draftOf, emptySource, namesOf, type Draft } from '../lib/chartDraft';
import { TextArea } from '../ui/parts';

const BASIS_LABEL: Record<Basis, string> = {
  absolute: 'Absolute amounts',
  'per-capita': 'Per person',
  share: 'A share of something',
  rate: 'A rate (per so many)',
  index: 'An index',
  anomaly: 'A difference from a baseline',
  change: 'A change from before',
};

const ROLE_LABEL: Record<ChartRole, string> = {
  x: 'Along the bottom (x)',
  y: 'The value (y)',
  series: 'One line or part per',
  label: 'Categories',
  facet: 'One panel per',
  lo: 'Lower bound',
  hi: 'Upper bound',
  n: 'Sample size',
  size: 'Dot size',
  from: 'First value',
  to: 'Second value',
  normalLo: 'Normal low',
  normalHi: 'Normal high',
  recordLo: 'Record low',
  recordHi: 'Record high',
};

const COLOUR_LABEL: Record<ChartColour, string> = {
  focus: 'One loud series in the Haul’s ink, the rest grey',
  categorical: 'A colour per series (at most six)',
  sequential: 'A ramp from low to high',
  diverging: 'Two ramps either side of a midpoint',
};

// ---------------------------------------------------------------- where the data comes from

type Way = 'table' | 'owid' | 'worldbank';

function DataPicker({ onData }: { onData: (data: ChartData, fetched?: FetchedChartData, ref?: { provider: 'owid'; chart: string; from?: number; to?: number }) => void }) {
  const toast = useToast();
  const [way, setWay] = useState<Way>('table');
  const [text, setText] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [owid, setOwid] = useState('');
  const [places, setPlaces] = useState('');
  const [indicator, setIndicator] = useState('');
  const [countries, setCountries] = useState('IND');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const years = { ...(from.trim() ? { from: Number(from) } : {}), ...(to.trim() ? { to: Number(to) } : {}) };

  function readTable(t: string) {
    const r = csvToData(t);
    setProblems(r.problems);
    if (r.data.columns.length && r.data.rows.length) onData(r.data);
  }
  async function fetchIt() {
    setBusy(true);
    try {
      if (way === 'owid') {
        const entities = places.split(',').map((s) => s.trim()).filter(Boolean);
        const f = await api.post<FetchedChartData>('/api/charts/fetch', { provider: 'owid', chart: owid.trim(), ...(entities.length ? { entities } : {}), ...years });
        onData(f.data, f, { provider: 'owid', chart: owid.trim(), ...years });
      } else {
        const codes = countries.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
        const f = await api.post<FetchedChartData>('/api/charts/fetch', { provider: 'worldbank', indicator: indicator.trim(), countries: codes, ...years });
        onData(f.data, f);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" role="group" aria-label="Where the numbers come from">
        {(
          [
            ['table', 'Paste or upload a table'],
            ['owid', 'Our World in Data'],
            ['worldbank', 'World Bank'],
          ] as Array<[Way, string]>
        ).map(([k, label]) => (
          <button key={k} type="button" className={`btn small${way === k ? ' primary' : ''}`} aria-pressed={way === k} onClick={() => setWay(k)}>
            {label}
          </button>
        ))}
      </div>
      {way === 'table' && (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            Paste a table with a header row (CSV, or copied from a spreadsheet), or upload a .csv file. Blank cells, “NA” and “..” are kept as missing; a cell is a number only if all of it is one.
          </p>
          <textarea className="area code-area" rows={6} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder={'year,rainfall_mm\n2020,2410\n2021,3110'} aria-label="The table" />
          <div className="row">
            <button type="button" className="btn primary small" disabled={!text.trim()} onClick={() => readTable(text)}>
              Read the table
            </button>
            <label className="btn small" style={{ cursor: 'pointer' }}>
              Upload a CSV
              <input
                type="file"
                hidden
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  if (f.size > 8 * 1024 * 1024) return toast('That file is over 8 MB; summarise it first.', true);
                  const t = await f.text();
                  setText(t);
                  readTable(t);
                }}
              />
            </label>
          </div>
          {problems.length > 0 && (
            <ul className="small warn" style={{ margin: 0 }}>
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {way === 'owid' && (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            Paste the chart’s link. The data behind it is fetched and redrawn in our style; each producer is credited with the licence they state, and Our World in Data with theirs. A source with no stated licence is refused.
          </p>
          <label className="field">
            <span className="label">Chart link</span>
            <input className="input" type="url" value={owid} onChange={(e) => setOwid(e.target.value)} placeholder="https://ourworldindata.org/grapher/life-expectancy" />
          </label>
          <label className="field">
            <span className="label">Places (as Our World in Data names them; leave empty for all, if the chart is small)</span>
            <input className="input" value={places} onChange={(e) => setPlaces(e.target.value)} placeholder="India, China, World" />
          </label>
        </>
      )}
      {way === 'worldbank' && (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            Give the indicator code (it is in the indicator page’s address, like NY.GDP.PCAP.KD) and country codes. Yearly series only. The licence is taken from the Bank’s own metadata.
          </p>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: '1 1 200px' }}>
              <span className="label">Indicator code</span>
              <input className="input" value={indicator} onChange={(e) => setIndicator(e.target.value)} placeholder="SP.DYN.LE00.IN" />
            </label>
            <label className="field" style={{ flex: '2 1 240px' }}>
              <span className="label">Countries (ISO codes)</span>
              <input className="input" value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="IND, BGD, PAK, LKA" />
            </label>
          </div>
        </>
      )}
      {way !== 'table' && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '0 1 110px' }}>
            <span className="label">From year</span>
            <input className="input num" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/[^\d-]/g, ''))} placeholder="all" />
          </label>
          <label className="field" style={{ flex: '0 1 110px' }}>
            <span className="label">To year</span>
            <input className="input num" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/[^\d-]/g, ''))} placeholder="all" />
          </label>
          <button type="button" className="btn primary small" disabled={busy || (way === 'owid' ? !owid.trim() : !indicator.trim() || !countries.trim())} onClick={() => void fetchIt()}>
            {busy ? 'Fetching…' : 'Fetch the data'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the editor

export function ChartEditor({
  itemId,
  blockId,
  initial,
  edition,
  onDone,
  onCancel,
}: {
  itemId: string;
  blockId?: string;
  initial?: Chart;
  edition: Edition;
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(() => (initial ? draftOf(initial) : null));
  const [fetched, setFetched] = useState<FetchedChartData | null>(null);
  const [owidRef, setOwidRef] = useState<{ provider: 'owid'; chart: string; from?: number; to?: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const chart = useMemo(() => (draft ? clean(assemble(draft)) : null), [draft]);
  const report = useMemo(() => (chart ? validateChart(chart) : null), [chart]);
  const glosses = useMemo(() => {
    if (!chart || !report?.ok) return [];
    try {
      return chartGlosses(chart);
    } catch {
      return [];
    }
  }, [chart, report]);

  if (!draft || !chart) {
    return (
      <div className="panel line stack" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label ink">A chart: where the numbers come from</span>
          <button type="button" className="btn quiet small" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <DataPicker
          onData={(data, f, ref) => {
            setFetched(f ?? null);
            setOwidRef(ref ?? null);
            setDraft(draftFrom(data, f));
          }}
        />
      </div>
    );
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const spec = FORMS[draft.form];
  const forms = formsFor({ data: draft.data });
  const names = namesOf(draft);
  const effectiveColour = (draft.colour && spec.colours.includes(draft.colour) ? draft.colour : spec.colours[0])!;
  const xCol = draft.data.columns[colIndex(draft, 'x')];
  const parseX = (v: string): Cell => (xCol && (xCol.type === 'year' || xCol.type === 'number') && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v);

  async function keep() {
    if (!chart || !report?.ok) return;
    setBusy(true);
    try {
      const r = blockId ? await api.put<{ warnings: string[] }>(`/api/blocks/${blockId}/chart`, { chart }) : await api.post<{ warnings: string[] }>(`/api/items/${itemId}/blocks`, { kind: 'chart', chart });
      toast(blockId ? 'Chart saved. It passed every check.' : 'Chart kept. It passed every check.');
      if (r.warnings?.length) toast(`Check these: ${r.warnings.join(' ')}`);
      await onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function refetchPlaces(entities: string[]) {
    if (!owidRef) return;
    setBusy(true);
    try {
      const f = await api.post<FetchedChartData>('/api/charts/fetch', { ...owidRef, entities });
      setFetched(f);
      setDraft({ ...draft!, data: f.data, sources: f.sources, sourceSpan: f.sourceSpan ?? draft!.sourceSpan, encode: autoEncode(draft!.form, f.data, draft!.encode), focus: draft!.focus.filter((n) => entities.includes(n)) });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  const setSource = (i: number, patch: Partial<ChartSource>) => set('sources', draft.sources.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setAnn = (i: number, a: Annotation) => set('annotations', draft.annotations.map((x, j) => (j === i ? a : x)));

  return (
    <div className="panel line stack chart-editor" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label ink">{blockId ? 'Edit the chart' : 'A chart'}</span>
        <span className="row" style={{ gap: 6 }}>
          {!blockId && (
            <button type="button" className="btn quiet small" onClick={() => setDraft(null)}>
              Other data
            </button>
          )}
          <button type="button" className="btn quiet small" onClick={onCancel}>
            Cancel
          </button>
        </span>
      </div>

      <p className="small muted" style={{ margin: 0 }}>
        {draft.data.rows.length.toLocaleString('en-IN')} rows · {draft.data.columns.map((c) => `${c.label} (${c.type})`).join(', ')}
      </p>

      {fetched?.notice && <p className="small warn" style={{ margin: 0 }}>{fetched.notice}</p>}

      {fetched && (fetched.reference.title || fetched.reference.subtitle || fetched.reference.note) && (
        <div className="small muted stack" style={{ gap: 2, borderLeft: '2px solid var(--rule)', paddingLeft: 10 }}>
          <span className="label">The source’s own words, for reference (not printed)</span>
          {fetched.reference.title && <span>{fetched.reference.title}</span>}
          {fetched.reference.subtitle && <span>{fetched.reference.subtitle}</span>}
          {fetched.reference.note && <span>{fetched.reference.note}</span>}
        </div>
      )}

      {owidRef && fetched && (fetched.entities.length > 1 || fetched.notice) && <PlacePicker all={fetched.entities} data={draft.data} busy={busy} onPick={(e) => void refetchPlaces(e)} />}

      <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Form</legend>
        <div className="row" style={{ gap: 6 }}>
          {forms.map((f) => (
            <button
              key={f}
              type="button"
              className={`btn small${draft.form === f ? ' primary' : ''}`}
              aria-pressed={draft.form === f}
              title={FORMS[f].use}
              onClick={() => setDraft({ ...draft, form: f, encode: autoEncode(f, draft.data, draft.encode) })}
            >
              {FORMS[f].name}
            </button>
          ))}
        </div>
        <span className="small muted">{spec.use}</span>
      </fieldset>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        {[...spec.required, ...spec.optional].map((role) => {
          const allowed = spec.types[role] ?? [];
          const cols = draft.data.columns.filter((c) => allowed.includes(c.type));
          const required = spec.required.includes(role);
          return (
            <label key={role} className="field" style={{ flex: '1 1 150px' }}>
              <span className="label">
                {ROLE_LABEL[role]}
                {required ? '' : ' (optional)'}
              </span>
              <select className="select" value={draft.encode[role] ?? ''} onChange={(e) => set('encode', { ...draft.encode, [role]: e.target.value || undefined })}>
                <option value="">{required ? 'Choose a column' : 'None'}</option>
                {cols.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      <label className="field">
        <span className="label">Title (your words)</span>
        <input className="input serif" value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="Delhi’s summers start earlier now" />
      </label>
      <label className="field">
        <span className="label">Note (your words, optional)</span>
        <TextArea className="compact" value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder="What to look at, and why it matters." />
      </label>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 160px' }}>
          <span className="label">Units</span>
          <input className="input" value={draft.units} onChange={(e) => set('units', e.target.value)} placeholder="°C, ₹ crore, people, years" />
        </label>
        <label className="field" style={{ flex: '2 1 200px' }}>
          <span className="label">Where the data is about</span>
          <input className="input" value={draft.geography} disabled={draft.noPlace} onChange={(e) => set('geography', e.target.value)} placeholder="India, World, Delhi (Safdarjung)" />
        </label>
        <label className="row small" style={{ flex: '0 0 auto' }}>
          <input type="checkbox" checked={draft.noPlace} onChange={(e) => set('noPlace', e.target.checked)} /> About no place
        </label>
      </div>

      <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
        <legend className="label">What the numbers are</legend>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 200px' }}>
            <span className="label">Kind</span>
            <select className="select" value={draft.basis} onChange={(e) => set('basis', e.target.value as Basis)}>
              {BASES.map((b) => (
                <option key={b} value={b}>
                  {BASIS_LABEL[b]}
                </option>
              ))}
            </select>
          </label>
          {(draft.basis === 'share' || draft.basis === 'rate') && (
            <label className="field" style={{ flex: '2 1 200px' }}>
              <span className="label">{draft.basis === 'share' ? 'Of what' : 'Per how many'}</span>
              <input className="input" value={draft.denominator} onChange={(e) => set('denominator', e.target.value)} placeholder={draft.basis === 'share' ? 'of GDP' : 'per 100,000 people'} />
            </label>
          )}
          {(draft.basis === 'index' || draft.basis === 'anomaly' || draft.basis === 'change') && (
            <label className="field" style={{ flex: '2 1 200px' }}>
              <span className="label">{draft.basis === 'index' ? 'Base' : draft.basis === 'anomaly' ? 'Difference from' : 'Change from'}</span>
              <input className="input" value={draft.base} onChange={(e) => set('base', e.target.value)} placeholder={draft.basis === 'index' ? '2010 = 100' : draft.basis === 'anomaly' ? 'the 1961–1990 average' : 'the year before'} />
            </label>
          )}
        </div>
        <label className="row small">
          <input type="checkbox" checked={draft.money} onChange={(e) => set('money', e.target.checked)} /> These are amounts of money
        </label>
        {draft.money && (
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: '1 1 120px' }}>
              <span className="label">Currency</span>
              <input className="input" value={draft.currency} onChange={(e) => set('currency', e.target.value)} placeholder="INR, USD" />
            </label>
            <label className="field" style={{ flex: '1 1 200px' }}>
              <span className="label">Prices</span>
              <select className="select" value={draft.prices} onChange={(e) => set('prices', e.target.value as 'nominal' | 'real')}>
                <option value="nominal">Nominal (not adjusted for inflation)</option>
                <option value="real">Real (adjusted for inflation)</option>
              </select>
            </label>
            {draft.prices === 'real' && (
              <label className="field" style={{ flex: '0 1 120px' }}>
                <span className="label">At prices of</span>
                <input className="input num" inputMode="numeric" value={draft.baseYear} onChange={(e) => set('baseYear', e.target.value.replace(/\D/g, ''))} placeholder="2011" />
              </label>
            )}
          </div>
        )}
        {unitsLine(chart) && <span className="small muted">Printed over the chart: {unitsLine(chart)}</span>}
      </fieldset>

      {!spec.time && !draft.encode.x && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <span className="small muted" style={{ flex: '1 1 200px' }}>
            When the data is for (optional; a year, or the years compared):
          </span>
          <label className="field" style={{ flex: '0 1 130px' }}>
            <span className="label">From</span>
            <input className="input num" value={draft.span.from} onChange={(e) => set('span', { ...draft.span, from: e.target.value })} placeholder="2024" />
          </label>
          <label className="field" style={{ flex: '0 1 130px' }}>
            <span className="label">To</span>
            <input className="input num" value={draft.span.to} onChange={(e) => set('span', { ...draft.span, to: e.target.value })} placeholder="2024" />
          </label>
        </div>
      )}
      {(spec.time || chart.span) && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <span className="small muted" style={{ flex: '1 1 200px' }}>
            Shown: {chart.span ? `${chart.span.from} to ${chart.span.to}` : 'choose the x column'}{spec.time || draft.encode.x ? ' (from the rows)' : ''}. The source runs:
          </span>
          <label className="field" style={{ flex: '0 1 130px' }}>
            <span className="label">From</span>
            <input className="input num" value={draft.sourceSpan.from} onChange={(e) => set('sourceSpan', { ...draft.sourceSpan, from: e.target.value })} placeholder="1850" />
          </label>
          <label className="field" style={{ flex: '0 1 130px' }}>
            <span className="label">To</span>
            <input className="input num" value={draft.sourceSpan.to} onChange={(e) => set('sourceSpan', { ...draft.sourceSpan, to: e.target.value })} placeholder="2025" />
          </label>
        </div>
      )}

      <fieldset className="stack" style={{ gap: 10, border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Sources</legend>
        {draft.sources.map((s, i) => (
          <div key={i} className="stack" style={{ gap: 6, borderLeft: '2px solid var(--rule)', paddingLeft: 10 }}>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: '1 1 180px' }}>
                <span className="label">Who made the data</span>
                <input className="input" value={s.maker} onChange={(e) => setSource(i, { maker: e.target.value })} placeholder="India Meteorological Department" />
              </label>
              <label className="field" style={{ flex: '1 1 180px' }}>
                <span className="label">The dataset’s name</span>
                <input className="input" value={s.dataset} onChange={(e) => setSource(i, { dataset: e.target.value })} placeholder="Gridded rainfall, 1901–2024" />
              </label>
            </div>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: '2 1 220px' }}>
                <span className="label">Link to the dataset (https)</span>
                <input className="input" type="url" value={s.url} onChange={(e) => setSource(i, { url: e.target.value })} placeholder="https://…" />
              </label>
              <label className="field" style={{ flex: '1 1 160px' }}>
                <span className="label">Licence, as they state it</span>
                <input className="input" value={s.licence} onChange={(e) => setSource(i, { licence: e.target.value })} placeholder="CC BY 4.0" />
              </label>
              <label className="field" style={{ flex: '0 1 150px' }}>
                <span className="label">Fetched on</span>
                <input className="input num" type="date" value={s.retrieved} onChange={(e) => setSource(i, { retrieved: e.target.value })} />
              </label>
            </div>
            {s.via && (
              <span className="small muted">
                Via{' '}
                <a href={safeHref(s.via.url)} target="_blank" rel="noreferrer noopener">
                  {s.via.name}
                </a>{' '}
                ({s.via.licence})
              </span>
            )}
            {draft.sources.length > 1 && (
              <button type="button" className="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={() => set('sources', draft.sources.filter((_, j) => j !== i))}>
                Remove this source
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={() => set('sources', [...draft.sources, emptySource()])}>
          Add a source
        </button>
      </fieldset>

      <label className="field">
        <span className="label">How the rows were worked out, if you computed them (printed in the machine’s blue)</span>
        <input className="input" value={draft.method} onChange={(e) => set('method', e.target.value)} placeholder="Leave empty when the rows are the source’s own numbers." />
      </label>

      <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Colour and emphasis</legend>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '2 1 260px' }}>
            <span className="label">Colour</span>
            <select className="select" value={effectiveColour} onChange={(e) => set('colour', e.target.value as ChartColour)}>
              {spec.colours.map((c) => (
                <option key={c} value={c}>
                  {COLOUR_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          {['bar', 'dot', 'dumbbell', 'slope', 'waffle', 'heatmap'].includes(draft.form) && (
            <label className="field" style={{ flex: '1 1 150px' }}>
              <span className="label">Order</span>
              <select className="select" value={draft.sort} onChange={(e) => set('sort', e.target.value as 'value' | 'given')}>
                <option value="value">By value</option>
                <option value="given">As in the table</option>
              </select>
            </label>
          )}
          {draft.form === 'waffle' && (
            <label className="field" style={{ flex: '1 1 150px' }}>
              <span className="label">One square stands for (optional)</span>
              <input className="input num" inputMode="decimal" value={draft.per} onChange={(e) => set('per', e.target.value)} placeholder="1% of the total" />
            </label>
          )}
          {draft.form === 'bump' && (
            <label className="field" style={{ flex: '1 1 150px' }}>
              <span className="label">First place is</span>
              <select className="select" value={draft.rank} onChange={(e) => set('rank', e.target.value as 'desc' | 'asc')}>
                <option value="desc">The highest</option>
                <option value="asc">The lowest</option>
              </select>
            </label>
          )}
        </div>
        {effectiveColour === 'diverging' && (
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: '0 1 120px' }}>
              <span className="label">Midpoint</span>
              <input className="input num" inputMode="decimal" value={draft.midValue} onChange={(e) => set('midValue', e.target.value)} placeholder="0" />
            </label>
            <label className="field" style={{ flex: '2 1 240px' }}>
              <span className="label">What the midpoint is</span>
              <input className="input" value={draft.midLabel} onChange={(e) => set('midLabel', e.target.value)} placeholder="the 1961–1990 average" />
            </label>
          </div>
        )}
        {names.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="label">Set loud (the rest recede)</span>
            <div className="row" style={{ gap: 4 }}>
              {names.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`btn quiet small${draft.focus.includes(n) ? ' primary' : ''}`}
                  aria-pressed={draft.focus.includes(n)}
                  onClick={() => set('focus', draft.focus.includes(n) ? draft.focus.filter((x) => x !== n) : [...draft.focus, n])}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="row small">
          {['line', 'multiples', 'scatter', 'dot'].includes(draft.form) && (
            <label className="row">
              <input type="checkbox" checked={draft.logY} onChange={(e) => set('logY', e.target.checked)} /> Log scale (values grow by multiples)
            </label>
          )}
          {draft.form === 'scatter' && (
            <label className="row">
              <input type="checkbox" checked={draft.logX} onChange={(e) => set('logX', e.target.checked)} /> Log scale along the bottom
            </label>
          )}
          {!spec.zero && ['line', 'multiples', 'scatter', 'dot', 'dumbbell', 'slope'].includes(draft.form) && (
            <label className="row">
              <input type="checkbox" checked={draft.zero} onChange={(e) => set('zero', e.target.checked)} /> Start the scale at zero
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Annotations (your words, set in the serif)</legend>
        {draft.annotations.map((a, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
            <span className="small muted" style={{ flex: '0 0 auto' }}>
              {a.kind === 'point' ? 'Callout at' : a.kind === 'period' ? 'Period' : 'Line at'}
            </span>
            {a.kind === 'point' && (
              <>
                <input className="input num" style={{ flex: '0 1 110px' }} aria-label="At" value={String(a.x ?? '')} onChange={(e) => setAnn(i, { ...a, x: parseX(e.target.value) })} placeholder="1998" />
                {names.length > 0 && (
                  <select className="select" style={{ flex: '0 1 160px' }} aria-label="On" value={a.series ?? ''} onChange={(e) => setAnn(i, { ...a, series: e.target.value || undefined })}>
                    <option value="">{colIndex(draft, 'series') >= 0 || colIndex(draft, 'facet') >= 0 ? 'First series' : 'Any'}</option>
                    {names.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            {a.kind === 'period' && (
              <>
                <input className="input num" style={{ flex: '0 1 100px' }} aria-label="From" value={String(a.from ?? '')} onChange={(e) => setAnn(i, { ...a, from: parseX(e.target.value) })} placeholder="1914" />
                <input className="input num" style={{ flex: '0 1 100px' }} aria-label="To" value={String(a.to ?? '')} onChange={(e) => setAnn(i, { ...a, to: parseX(e.target.value) })} placeholder="1918" />
              </>
            )}
            {a.kind === 'rule' && (
              <>
                <select className="select" style={{ flex: '0 1 120px' }} aria-label="Axis" value={a.axis} onChange={(e) => setAnn(i, { ...a, axis: e.target.value as 'x' | 'y' })}>
                  <option value="y">a value</option>
                  <option value="x">a point in time</option>
                </select>
                <input
                  className="input num"
                  style={{ flex: '0 1 100px' }}
                  aria-label="Value"
                  value={String(a.value)}
                  onChange={(e) => setAnn(i, { ...a, value: e.target.value })}
                  placeholder="1.5"
                />
              </>
            )}
            <input className="input serif" style={{ flex: '2 1 220px' }} aria-label="Text" value={a.text} onChange={(e) => setAnn(i, { ...a, text: e.target.value })} placeholder="First World War" />
            <button type="button" className="btn quiet small" aria-label="Remove this annotation" onClick={() => set('annotations', draft.annotations.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn quiet small" onClick={() => set('annotations', [...draft.annotations, { kind: 'point', x: '', text: '', by: 'editor' }])}>
            Add a callout
          </button>
          {xCol && (xCol.type === 'year' || xCol.type === 'date' || xCol.type === 'number') && (
            <button type="button" className="btn quiet small" onClick={() => set('annotations', [...draft.annotations, { kind: 'period', from: '', to: '', text: '', by: 'editor' }])}>
              Add a period
            </button>
          )}
          <button type="button" className="btn quiet small" onClick={() => set('annotations', [...draft.annotations, { kind: 'rule', axis: 'y', value: 0, text: '', by: 'editor' }])}>
            Add a line
          </button>
        </div>
      </fieldset>

      <section className="stack" style={{ gap: 8 }} aria-label="Preview">
        <span className="label">As readers will see it (website; the phone figure is also the app’s picture)</span>
        {chart.title && <div className="serif" style={{ fontSize: 22 }}>{chart.title}</div>}
        {chart.note && <div className="serif" style={{ fontStyle: 'italic' }}>{chart.note}</div>}
        {unitsLine(chart) && <div className="small muted">{unitsLine(chart)}</div>}
        <ChartPreview chart={chart} layout="wide" edition={edition} width="100%" />
        <details>
          <summary className="small" style={{ cursor: 'pointer' }}>
            The phone figure
          </summary>
          <div style={{ maxWidth: 375 }}>
            <ChartPreview chart={chart} layout="narrow" edition={edition} width="100%" />
          </div>
        </details>
        {glosses.map((g, i) => (
          <div key={i} className="small" style={{ color: 'var(--machine)' }}>
            {g}
          </div>
        ))}
        {report?.ok && <div className="small muted">Read aloud to screen readers: {describeChart(chart)}</div>}
      </section>

      {report && report.errors.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="label bad">Before it can be kept</span>
          <ul className="small" style={{ margin: 0 }}>
            {report.errors.slice(0, 20).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}
      {report && report.warnings.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="label warn">Check these</span>
          <ul className="small" style={{ margin: 0 }}>
            {report.warnings.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="row">
        <button type="button" className="btn primary" disabled={busy || !report?.ok} onClick={() => void keep()}>
          {busy ? 'Checking…' : blockId ? 'Save the chart' : 'Keep the chart'}
        </button>
        {!report?.ok && <span className="small muted">Keep is off until every check passes.</span>}
      </div>
    </div>
  );
}

/** The places in an Our World in Data chart: tick the ones to draw, then fetch again with them. */
function PlacePicker({ all, data, busy, onPick }: { all: string[]; data: ChartData; busy: boolean; onPick: (entities: string[]) => void }) {
  const have = useMemo(() => {
    const i = data.columns.findIndex((c) => c.key === 'entity');
    return new Set(i < 0 ? [] : data.rows.map((r) => String(r[i])));
  }, [data]);
  const [chosen, setChosen] = useState<string[]>(() => all.filter((e) => have.has(e)));
  const [q, setQ] = useState('');
  const shown = all.filter((e) => !q.trim() || e.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60);
  return (
    <details className="stack">
      <summary className="small" style={{ cursor: 'pointer' }}>
        Places: {chosen.length ? chosen.slice(0, 6).join(', ') + (chosen.length > 6 ? ` and ${chosen.length - 6} more` : '') : 'all'} ({all.length} in the source)
      </summary>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a place" aria-label="Find a place" />
      <div className="row" style={{ gap: 4 }}>
        {shown.map((e) => (
          <button key={e} type="button" className={`btn quiet small${chosen.includes(e) ? ' primary' : ''}`} aria-pressed={chosen.includes(e)} onClick={() => setChosen(chosen.includes(e) ? chosen.filter((x) => x !== e) : [...chosen, e])}>
            {e}
          </button>
        ))}
      </div>
      <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} disabled={busy || !chosen.length || chosen.length > 60} onClick={() => onPick(chosen)}>
        {busy ? 'Fetching…' : `Fetch again with these ${chosen.length}`}
      </button>
    </details>
  );
}
