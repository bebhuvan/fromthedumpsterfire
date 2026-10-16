// A Rhyme: a recent piece set against its historical precedent. Each end is a captured item with a
// fetched source; its quote is selected in that source (or pasted and found there), so both quotes
// are the sources' own words. The bridge between them is set in the machine's voice in the app, so
// it passes the house style whoever writes it.

import { useState } from 'react';
import { checkStyle } from '@fdf/shared/style';
import { api, displayTitle, type RhymeDetail, type TrayItem } from '../api';
import { Link, navigate, safeHref, SaveNote, useAutosave, useLoad, usePoll, useToast } from '../lib/core';
import { ChecksPanel, Spinner, TextArea } from '../ui/parts';
import { Reader, type Selection } from './Reader';

const IN_FLIGHT = /queued|fetching|reading|drafting|checking/;

export function RhymeEditor({ id }: { id: string }) {
  const toast = useToast();
  const { data, error, reload, setData } = useLoad(() => api.get<RhymeDetail>(`/api/rhymes/${id}`), [id]);
  const tray = useLoad(() => api.get<{ items: TrayItem[] }>('/api/items?view=all'), [id]);
  const flight = Boolean(data && [data.then, data.now].some((e) => e && (IN_FLIGHT.test(e.item.status) || !e.source)));
  usePoll(reload, flight, 4000);

  if (error) return <p className="tray-empty">Could not open this rhyme: {error}</p>;
  if (!data) return <p className="tray-empty">Opening…</p>;
  const sources = (tray.data?.items ?? []).filter((i) => i.kind !== 'rhyme' && i.id !== id);

  async function call(fn: () => Promise<RhymeDetail>, done?: string) {
    try {
      setData(await fn());
      if (done) toast(done);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }} data-type="rhymes">
      <div className="row between">
        <div className="label">Rhymes · {data.item.status === 'ready' ? 'draft' : data.item.status}</div>
        <button className="btn quiet small" onClick={() => navigate('/')}>
          Back to the tray
        </button>
      </div>
      <RhymeHead detail={data} onSaved={reload} />
      <div className="rhyme-grid">
        <EndPanel end="then" detail={data} sources={sources} call={call} />
        <EndPanel end="now" detail={data} sources={sources} call={call} />
      </div>
      <Bridge detail={data} call={call} />
      <div className="section" style={{ marginTop: 26 }}>
        <ChecksPanel checks={data.checks} />
      </div>
    </div>
  );
}

function RhymeHead({ detail, onSaved }: { detail: RhymeDetail; onSaved: () => void }) {
  const { item } = detail;
  const current = item.title_choice ? (JSON.parse(item.title_choice) as { text: string; italic?: string }) : { text: item.title === 'A new rhyme' ? '' : item.title ?? '' };
  const [title, setTitle] = useState(current.text);
  const [italic, setItalic] = useState(current.italic ?? '');
  const why = useAutosave(`why:${item.id}`, item.why_text ?? '', (v) => api.patch(`/api/items/${item.id}`, { why_text: v }));
  const saveTitle = () =>
    void api
      .patch(`/api/items/${item.id}`, { title_choice: title.trim() ? { text: title.trim(), ...(italic.trim() ? { italic: italic.trim() } : {}) } : null, title: title.trim() || 'A new rhyme' })
      .then(onSaved);
  return (
    <section className="section">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '2 1 240px' }}>
          <span className="label">Title</span>
          <input className="input serif" style={{ fontSize: 26 }} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} placeholder="Cheaper power," />
        </label>
        <label className="field" style={{ flex: '1 1 160px' }}>
          <span className="label">In italic</span>
          <input className="input serif" style={{ fontSize: 26, fontStyle: 'italic' }} value={italic} onChange={(e) => setItalic(e.target.value)} onBlur={saveTitle} placeholder="more burning" />
        </label>
      </div>
      <label className="field">
        <span className="label">My two bits</span>
        <TextArea className="editor compact" value={why.value} onChange={(e) => why.onChange(e.target.value)} onBlur={() => void why.flush()} placeholder="In your own words: why these two belong together." />
        <SaveNote state={why.state} />
      </label>
    </section>
  );
}

function EndPanel({ end, detail, sources, call }: { end: 'then' | 'now'; detail: RhymeDetail; sources: TrayItem[]; call: (fn: () => Promise<RhymeDetail>, done?: string) => Promise<void> }) {
  const r = detail.rhyme;
  const e = detail[end];
  const [pick, setPick] = useState('');
  const [paste, setPaste] = useState('');
  const [year, setYear] = useState(r[`${end}_year`]);
  const [cite, setCite] = useState(r[`${end}_cite`]);
  const quote = r[`${end}_quote`];
  const label = end === 'then' ? 'Then' : 'Now';
  const chosen = quote && r[`${end}_start`] != null ? { id: `${end}-q`, item_id: e?.item.id ?? '', start: r[`${end}_start`]!, end: r[`${end}_end`]!, text: quote, highlight_start: null, highlight_end: null, locator: null, origin: 'editor' as const, chosen: 1, verified: 1 } : null;
  const rid = r.item_id;
  return (
    <section className={`era ${end}`}>
      <div className="row between">
        <span className="label ink">{label}</span>
        {e && <Link to={`/item/${e.item.id}`} className="small">{displayTitle(e.item)}</Link>}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '0 1 110px' }}>
          <span className="label">Year</span>
          <input className="input" value={year} onChange={(ev) => setYear(ev.target.value)} onBlur={() => year !== r[`${end}_year`] && call(() => api.patch<RhymeDetail>(`/api/rhymes/${rid}`, { [`${end}_year`]: year }))} placeholder={end === 'then' ? '1865' : '2025'} />
        </label>
        <label className="field" style={{ flex: '1 1 200px' }}>
          <span className="label">Cited as</span>
          <input className="input" value={cite} onChange={(ev) => setCite(ev.target.value)} onBlur={() => cite !== r[`${end}_cite`] && call(() => api.patch<RhymeDetail>(`/api/rhymes/${rid}`, { [`${end}_cite`]: cite }))} placeholder="Author, work, chapter" />
        </label>
      </div>
      {quote ? (
        <>
          <span className="yr num">{year || '—'}</span>
          <blockquote>“{quote}”</blockquote>
          <span className="small ok">Found word for word in the fetched source</span>
        </>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>{e ? 'Select the line in the source below and choose “Use as the quote”, or paste it.' : 'Choose a captured piece as the source. Capture the link first if it is not in the tray.'}</p>
      )}
      <div className="row">
        <select className="select" style={{ flex: '1 1 200px' }} value={pick} onChange={(ev) => setPick(ev.target.value)} aria-label={`${label} source`}>
          <option value="">{e ? 'Change the source…' : 'Choose the source…'}</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {displayTitle(s)}
              {s.source_date ? ` (${s.source_date})` : ''}
            </option>
          ))}
        </select>
        <button className="btn small" disabled={!pick} onClick={() => call(() => api.put<RhymeDetail>(`/api/rhymes/${rid}/${end}/source`, { itemId: pick }), 'Source set').then(() => setPick(''))}>
          Use
        </button>
      </div>
      {e && !e.source && <Spinner text={`The source is being fetched (${e.item.status})…`} />}
      {e?.source && (
        <>
          <Reader
            source={e.source}
            chosen={chosen}
            candidates={[]}
            actionLabel="Use as the quote"
            allowHighlight={false}
            sticky={false}
            onExcerpt={(s: Selection) => call(() => api.put<RhymeDetail>(`/api/rhymes/${rid}/${end}/quote`, s), 'Quote set. Found word for word.')}
            onHighlight={() => {}}
          />
          <form
            className="row"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (paste.trim()) void call(() => api.put<RhymeDetail>(`/api/rhymes/${rid}/${end}/quote`, { quote: paste.trim() }), 'Quote found in the source').then(() => setPaste(''));
            }}
          >
            <input className="input" style={{ flex: '1 1 200px' }} value={paste} onChange={(ev) => setPaste(ev.target.value)} placeholder="Or paste the quotation to find it" />
            <button className="btn small" type="submit" disabled={!paste.trim()}>
              Find
            </button>
          </form>
          {safeHref(e.item.url) && (
            <a className="small muted" href={safeHref(e.item.url)} target="_blank" rel="noreferrer noopener">
              Open the original ↗
            </a>
          )}
        </>
      )}
    </section>
  );
}

function Bridge({ detail, call }: { detail: RhymeDetail; call: (fn: () => Promise<RhymeDetail>, done?: string) => Promise<void> }) {
  const r = detail.rhyme;
  const [text, setText] = useState(r.bridge);
  const [seen, setSeen] = useState(r.bridge);
  const [busy, setBusy] = useState(false);
  if (seen !== r.bridge) {
    setSeen(r.bridge);
    setText(r.bridge);
  }
  const style = checkStyle(text);
  return (
    <section className="section" style={{ marginTop: 22 }}>
      <div className="row between">
        <h2 className="h2">The bridge</h2>
        <span className="small muted">Set in the machine's voice for readers, so it must pass the house style</span>
      </div>
      <div className="bridge">
        <TextArea className="machine-area compact" value={text} onChange={(e) => setText(e.target.value)} placeholder="Two or three plain sentences: what each passage was about, and what they share." aria-label="Bridge" />
      </div>
      {text.trim() && !style.ok && <span className="small warn">{style.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' ')}</span>}
      <div className="row">
        <button className="btn small primary" disabled={!style.ok || text === r.bridge} onClick={() => call(() => api.patch<RhymeDetail>(`/api/rhymes/${r.item_id}`, { bridge: text }), 'Bridge saved')}>
          Save bridge
        </button>
        <button
          className="btn small"
          disabled={busy || !r.then_quote || !r.now_quote}
          onClick={async () => {
            setBusy(true);
            await call(() => api.post<RhymeDetail>(`/api/rhymes/${r.item_id}/bridge`), 'Drafted; edit it as you like');
            setBusy(false);
          }}
        >
          {busy ? 'Drafting…' : 'Draft it from the two quotes'}
        </button>
      </div>
    </section>
  );
}
