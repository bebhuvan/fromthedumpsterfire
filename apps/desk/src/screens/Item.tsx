// One item under review: the source on one side, the apparatus on the other. The editor's words
// in serif, the machine's in blue sans, and the checks that gate publishing at the end.

import { useMemo, useState } from 'react';
import { checkStyle } from '@fdf/shared/style';
import { typeLabel, type ContentType } from '@fdf/shared/tokens';
import { api, displayTitle, type Draft, type Excerpt, type ItemDetail, type MarginalBody, type Note, type Title, type TrayItem, type WikiCard } from '../api';
import { Link, navigate, safeHref, SaveNote, useAutosave, useKeys, useLoad, usePoll, useToast } from '../lib/core';
import { ChecksPanel, NoteCompare, Spinner, TextArea, TypeSelect, VoiceNote } from '../ui/parts';
import { Reader, type Selection } from './Reader';
import { TrayList } from './Tray';
import { PlatesSection } from './Plates';
import { ItemSuggestions } from './Links';
import { RhymeEditor } from './Rhyme';

const IN_FLIGHT = /queued|fetching|reading|drafting|checking/;

export function ItemReview({ id }: { id: string }) {
  const { data } = useLoad(() => api.get<ItemDetail>(`/api/items/${id}`), [id]);
  if (data?.item.kind === 'rhyme') return <RhymeEditor id={id} />;
  return <ItemReviewInner id={id} />;
}

function ItemReviewInner({ id }: { id: string }) {
  const toast = useToast();
  const { data, error, reload, setData } = useLoad(() => api.get<ItemDetail>(`/api/items/${id}`), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  usePoll(reload, Boolean(data && IN_FLIGHT.test(data.item.status)), 3500);
  useKeys({ Escape: () => navigate('/') }, []);

  async function act<T>(label: string, fn: () => Promise<T>, done?: string) {
    setBusy(label);
    try {
      const r = await fn();
      if (done) toast(done);
      await reload();
      return r;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="tray-empty">Could not open this item: {error}</p>;
  if (!data) return <p className="tray-empty">Opening…</p>;
  const { item, source } = data;
  const flight = IN_FLIGHT.test(item.status);
  const chosen = data.excerpts.find((e) => e.chosen) ?? null;
  const patch = (b: Record<string, unknown>) => api.patch<{ item: ItemDetail['item'] }>(`/api/items/${id}`, b).then((r) => setData({ ...data, item: r.item }));

  return (
    <div className="review" data-type={item.type}>
      <aside className="rail" aria-label="Tray">
        <TrayList selected={id} />
      </aside>
      <div>
        <header className="item-head">
          <div className="row" style={{ gap: 10 }}>
            <span className="label">
              {[typeLabel[item.type], item.source_name, item.source_date, item.minutes ? `${item.minutes} min` : null].filter(Boolean).join(' · ')}
            </span>
          </div>
          <h1 className="display">{displayTitle(item)}</h1>
          {item.creator && <div className="serif" style={{ fontSize: 19, fontStyle: 'italic', marginTop: 6 }}>{item.creator}</div>}
          <div className="status-line">
            {flight ? (
              <Spinner text={`${item.status_detail ?? item.status}${data.run?.step ? ` · ${data.run.step}` : ''}`} />
            ) : item.status === 'failed' ? (
              <span className="bad">Failed: {item.status_detail}</span>
            ) : item.status === 'paused' ? (
              <span className="warn">{item.status_detail}</span>
            ) : (
              <span>Read and drafted · captured {new Date(item.captured_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            )}
            <span className="top-spacer" />
            {safeHref(item.canonical_url || item.url) && (
              <a className="btn quiet small" href={safeHref(item.canonical_url || item.url)} target="_blank" rel="noreferrer noopener">
                Open original ↗
              </a>
            )}
            {item.file_key && (
              <a className="btn quiet small" href={`/api/items/${id}/file`} target="_blank" rel="noreferrer">
                Uploaded file ↗
              </a>
            )}
            <button className="btn quiet small" disabled={!!busy || flight || !source} onClick={() => act('redraft', () => api.post(`/api/items/${id}/redraft`), 'Redrafting')}>
              Redraft
            </button>
            <button className="btn quiet small" disabled={!!busy || flight} onClick={() => act('refetch', () => api.post(`/api/items/${id}/refetch`), 'Fetching again')}>
              Fetch again
            </button>
            <button className="btn quiet small" disabled={!!busy} onClick={() => act('archive', () => patch({ archived: !item.archived }), item.archived ? 'Back in the tray' : 'Archived')}>
              {item.archived ? 'Unarchive' : 'Archive'}
            </button>
          </div>
        </header>

        <WhySection key={`why-${id}`} detail={data} onSaved={reload} />

        <div className="cols">
          <div>
            {source ? (
              <Reader
                source={source}
                chosen={chosen}
                candidates={data.excerpts}
                busy={busy === 'excerpt'}
                onExcerpt={(s: Selection) => act('excerpt', () => api.post(`/api/items/${id}/excerpts`, s), 'Excerpt set. Found word for word.')}
                onHighlight={(s: Selection) =>
                  chosen && act('excerpt', () => api.patch(`/api/excerpts/${chosen.id}`, { highlight: { start: s.start - chosen.start, end: s.end - chosen.start } }), 'Highlight marked')
                }
              />
            ) : (
              <div className="panel line">
                <p className="serif muted" style={{ fontSize: 17, margin: 0 }}>{flight ? 'The source text appears here once it has been fetched.' : 'No source text yet.'}</p>
              </div>
            )}
            {source && (source.extractor === 'ocr' || source.extractor === 'pasted') && <SourceFix id={id} text={source.text} imageUrl={item.file_key ? `/api/items/${id}/file` : null} onSaved={reload} />}
          </div>

          <div>
            <TitleSection detail={data} onPatch={patch} />
            <ExcerptSection detail={data} chosen={chosen} act={act} />
            <MarginaliaSection drafts={data.drafts.filter((d) => d.kind === 'marginal') as Draft<MarginalBody>[]} act={act} />
            <WikiSection itemId={id} cards={data.wiki} act={act} />
            <PlatesSection target={{ kind: 'item', id }} plates={data.plates} decision={data.item.plate} onChange={reload} />
            <ItemSuggestions itemId={id} suggestions={data.suggestions} onChange={reload} />
            <DetailsSection detail={data} onPatch={patch} />
            <ConnectionsSection detail={data} act={act} />
            <div className="section">
              <ChecksPanel checks={data.checks} busy={busy === 'check'} onRecheck={() => act('check', () => api.post(`/api/items/${id}/check`), 'Checked')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- why it's here

function WhySection({ detail, onSaved }: { detail: ItemDetail; onSaved: () => void }) {
  const { item } = detail;
  const why = useAutosave(`why:${item.id}`, item.why_text ?? '', (v) => api.patch(`/api/items/${item.id}`, { why_text: v }));
  const [note, setNote] = useState<Note | null>(detail.notes.find((n) => n.target === 'why') ?? null);
  return (
    <section className="section" style={{ marginTop: 28 }}>
      <div className="row between">
        <h2 className="h2">Why it's here</h2>
        <div className="row">
          <VoiceNote
            target="why"
            itemId={item.id}
            onNote={(n) => {
              setNote(n);
              void api.patch(`/api/items/${item.id}`, { why_note_id: n.id });
            }}
          />
        </div>
      </div>
      <TextArea
        className="editor"
        value={why.value}
        onChange={(e) => why.onChange(e.target.value)}
        onSubmit={() => void why.flush().then(onSaved)}
        onBlur={() => void why.flush()}
        placeholder="In your own words. Dictate straight into this box; nothing here is ever reworded."
        aria-label="Why it's here"
      />
      <div className="row between">
        <SaveNote state={why.state} />
        {item.why_note_id && (
          <label className="row small muted">
            <input type="checkbox" checked={!!item.why_audio} onChange={(e) => void api.patch(`/api/items/${item.id}`, { why_audio: e.target.checked }).then(onSaved)} /> Publish the voice note with it
          </label>
        )}
      </div>
      {note && <NoteCompare note={note} onUse={(t) => why.onChange(why.value.trim() ? `${why.value.trim()}\n\n${t}` : t)} />}
    </section>
  );
}

// ---------------------------------------------------------------- source corrections (OCR, pasted)

function SourceFix({ id, text, imageUrl, onSaved }: { id: string; text: string; imageUrl: string | null; onSaved: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(text);
  if (!open)
    return (
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn quiet small" onClick={() => setOpen(true)}>
          Correct the transcription
        </button>
      </div>
    );
  return (
    <div className="section panel line" style={{ marginTop: 14 }}>
      <div className="label">Correct the text against the original. Excerpts that no longer match are removed.</div>
      {imageUrl && <img src={imageUrl} alt="The page you photographed" style={{ maxWidth: '100%', borderRadius: 12 }} />}
      <TextArea value={v} onChange={(e) => setV(e.target.value)} />
      <div className="row">
        <button
          className="btn primary small"
          onClick={async () => {
            try {
              await api.put(`/api/items/${id}/source`, { text: v });
              toast('Source corrected');
              setOpen(false);
              onSaved();
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e), true);
            }
          }}
        >
          Save text
        </button>
        <button className="btn quiet small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- title

function TitleSection({ detail, onPatch }: { detail: ItemDetail; onPatch: (b: Record<string, unknown>) => Promise<void> }) {
  const { item } = detail;
  const norm = (t: Title): Title => {
    const it = t.italic?.trim();
    if (!it || it.toLowerCase() === t.text.trim().toLowerCase()) return { text: t.text.trim() };
    const text = t.text.trim().toLowerCase().endsWith(it.toLowerCase()) ? t.text.trim().slice(0, -it.length).trim() : t.text.trim();
    return text ? { text, italic: it } : { text: it };
  };
  const seenTitles = new Set([(item.title ?? '').trim().toLowerCase()]);
  const options = (detail.drafts.filter((d) => d.kind === 'title' && d.status !== 'cut') as Draft<Title>[])
    .map((d) => ({ ...d, body: norm(d.body) }))
    .filter((d) => {
      const k = [d.body.text, d.body.italic].filter(Boolean).join(' ').toLowerCase();
      if (seenTitles.has(k)) return false;
      seenTitles.add(k);
      return true;
    });
  const current: Title | null = item.title_choice ? JSON.parse(item.title_choice) : null;
  const [custom, setCustom] = useState<Title>(current ?? { text: item.title ?? '' });
  const isSame = (a: Title | null, b: Title | null) => !!a && !!b && a.text === b.text && (a.italic ?? '') === (b.italic ?? '');
  const original: Title | null = item.title ? { text: item.title } : null;
  const choose = (t: Title) => void onPatch({ title_choice: t.italic ? { text: t.text, italic: t.italic } : { text: t.text } });
  const customStyle = useMemo(() => checkStyle([custom.text, custom.italic].filter(Boolean).join(' '), { strict: false }), [custom]);
  return (
    <fieldset className="section" style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="h2" style={{ padding: 0, marginBottom: 10 }}>Title</legend>
      {original && (
        <label className="opt">
          <input type="radio" name="title" checked={isSame(current, original) || (!current && true)} onChange={() => choose(original)} />
          <span>
            <span className="serif">{original.text}</span>
            <span className="small muted" style={{ display: 'block' }}>The original title</span>
          </span>
        </label>
      )}
      {options.map((o) => (
        <label key={o.id} className="opt">
          <input type="radio" name="title" checked={isSame(current, o.body)} onChange={() => choose(o.body)} />
          <span>
            <span className="serif">
              {o.body.text} {o.body.italic && <i>{o.body.italic}</i>}
            </span>
            <span className="small machine" style={{ display: 'block' }}>Suggested by the machine</span>
          </span>
        </label>
      ))}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '2 1 180px' }}>
          <span className="label">Your own</span>
          <input className="input serif" value={custom.text} onChange={(e) => setCustom({ ...custom, text: e.target.value })} placeholder="Title" />
        </label>
        <label className="field" style={{ flex: '1 1 120px' }}>
          <span className="label">Last phrase in italic</span>
          <input className="input serif" style={{ fontStyle: 'italic' }} value={custom.italic ?? ''} onChange={(e) => setCustom({ ...custom, italic: e.target.value || undefined })} placeholder="optional" />
        </label>
        <button className="btn small" disabled={!custom.text.trim()} onClick={() => choose({ text: custom.text.trim(), italic: custom.italic?.trim() || undefined })}>
          Use
        </button>
      </div>
      {!customStyle.ok && <div className="small warn">{customStyle.issues[0]?.message}</div>}
    </fieldset>
  );
}

// ---------------------------------------------------------------- excerpt

type Act = <T>(label: string, fn: () => Promise<T>, done?: string) => Promise<T | undefined>;

function ExcerptSection({ detail, chosen, act }: { detail: ItemDetail; chosen: Excerpt | null; act: Act }) {
  const candidates = detail.excerpts.filter((e) => !e.chosen);
  const [locator, setLocator] = useState(chosen?.locator ?? '');
  const hl = chosen && chosen.highlight_start != null && chosen.highlight_end != null ? [chosen.highlight_start, chosen.highlight_end] : null;
  return (
    <section className="section">
      <h2 className="h2">Excerpt</h2>
      {chosen ? (
        <>
          <blockquote className="excerpt">
            {hl ? (
              <>
                {chosen.text.slice(0, hl[0])}
                <mark>{chosen.text.slice(hl[0], hl[1])}</mark>
                {chosen.text.slice(hl[1])}
              </>
            ) : (
              chosen.text
            )}
          </blockquote>
          <div className="row between small">
            <span className={chosen.verified ? 'ok' : 'bad'}>{chosen.verified ? 'Found word for word in the source' : 'Not found in the source; select it again'}</span>
            <span className="row">
              {hl && (
                <button className="btn quiet small" onClick={() => act('excerpt', () => api.patch(`/api/excerpts/${chosen.id}`, { highlight: null }))}>
                  Clear highlight
                </button>
              )}
              <button className="btn quiet small" onClick={() => act('excerpt', () => api.del(`/api/excerpts/${chosen.id}`))}>
                Remove
              </button>
            </span>
          </div>
          <label className="field">
            <span className="label">Locator</span>
            <input
              className="input"
              value={locator}
              onChange={(e) => setLocator(e.target.value)}
              onBlur={() => locator !== (chosen.locator ?? '') && act('excerpt', () => api.patch(`/api/excerpts/${chosen.id}`, { locator }))}
              placeholder="p. 12, Section 1, at 23:10"
            />
          </label>
          {!hl && <p className="small muted">Select the line you would underline, inside the tinted excerpt in the source, and choose Mark highlight.</p>}
        </>
      ) : (
        <p className="small muted">Select a passage in the source and choose Make excerpt. Short is better: one to three sentences.</p>
      )}
      {candidates.length > 0 && (
        <div className="stack">
          <div className="label machine">The machine's candidates, matched word for word</div>
          {candidates.map((c) => (
            <div key={c.id} className="opt" style={{ cursor: 'default' }}>
              <span style={{ flex: 1 }}>
                <span className="serif" style={{ display: 'block' }}>“{c.text}”</span>
                <span className="small muted">{c.locator}</span>
              </span>
              <button className="btn small" onClick={() => act('excerpt', () => api.patch(`/api/excerpts/${c.id}`, { chosen: true }), 'Excerpt set')}>
                Use
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- marginalia

function verdictText(b: MarginalBody): { text: string; cls: string } {
  switch (b.verdict) {
    case 'supported':
      return { text: b.cite.kind === 'wiki' ? `Checked against Wikipedia: ${b.cite.title}` : 'Checked against the source', cls: 'ok' };
    case 'partly':
      return { text: `Checker: partly right. ${b.reason ?? ''}`, cls: 'warn' };
    case 'unsupported':
      return { text: `Checker: not supported. ${b.reason ?? ''}`, cls: 'bad' };
    default:
      return { text: 'Not checked yet', cls: 'muted' };
  }
}

function MarginaliaSection({ drafts, act }: { drafts: Draft<MarginalBody>[]; act: Act }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  if (!drafts.length) return null;
  const live = drafts.filter((d) => d.status !== 'cut');
  const cut = drafts.filter((d) => d.status === 'cut');
  return (
    <section className="section">
      <div className="row between">
        <h2 className="h2">Marginalia</h2>
        <span className="small muted">Machine-written; you keep, cut or edit</span>
      </div>
      {[...live, ...cut].map((d) => {
        const b = d.body;
        const v = verdictText(b);
        const flagged = b.verdict === 'partly' || b.verdict === 'unsupported';
        const style = checkStyle(editing === d.id ? text : b.text);
        return (
          <div key={d.id} className={`note${d.status === 'cut' ? ' cut' : ''}${flagged && d.status !== 'cut' ? ' flag' : ''}`}>
            {editing === d.id ? (
              <>
                <TextArea className="machine-area compact" value={text} onChange={(e) => setText(e.target.value)} onSubmit={() => void save(d.id)} />
                {!style.ok && <div className="small warn">{style.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' ')}</div>}
              </>
            ) : (
              <p className="note-text">{b.text}</p>
            )}
            <div className="note-cite">
              {b.cite.kind === 'source' ? <>Source: “{b.cite.quote.slice(0, 140)}{b.cite.quote.length > 140 ? '…' : ''}”</> : <>Source: Wikipedia, {b.cite.title}</>}
              {' · '}
              <span className={`verdict ${v.cls}`}>{v.text}</span>
            </div>
            {b.corrected && d.status !== 'cut' && (
              <p className="note-text" style={{ fontSize: 14 }}>
                Corrected: {b.corrected}
              </p>
            )}
            <div className="row">
              {editing === d.id ? (
                <>
                  <button className="btn small primary" disabled={!style.ok} onClick={() => void save(d.id)}>
                    Save and recheck
                  </button>
                  <button className="btn quiet small" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {b.corrected && d.status !== 'cut' && (
                    <button className="btn small primary" onClick={() => act('note', () => api.patch(`/api/drafts/${d.id}`, { useCorrected: true, status: 'kept' }), 'Using the corrected note')}>
                      Use corrected
                    </button>
                  )}
                  {d.status !== 'kept' && d.status !== 'edited' && !flagged && (
                    <button className="btn small primary" onClick={() => act('note', () => api.patch(`/api/drafts/${d.id}`, { status: 'kept' }))}>
                      Keep
                    </button>
                  )}
                  {(d.status === 'kept' || d.status === 'edited') && <span className="small ok">Kept</span>}
                  {d.status !== 'cut' ? (
                    <button className="btn small" onClick={() => act('note', () => api.patch(`/api/drafts/${d.id}`, { status: 'cut' }))}>
                      Cut
                    </button>
                  ) : (
                    <button className="btn quiet small" onClick={() => act('note', () => api.patch(`/api/drafts/${d.id}`, { status: 'proposed' }))}>
                      Restore
                    </button>
                  )}
                  {d.status !== 'cut' && (
                    <button
                      className="btn quiet small"
                      onClick={() => {
                        setEditing(d.id);
                        setText(b.text);
                      }}
                    >
                      Edit
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );

  async function save(draftId: string) {
    await act('note', () => api.patch(`/api/drafts/${draftId}`, { text, status: 'kept' }), 'Saved; checked again against its source');
    setEditing(null);
  }
}

// ---------------------------------------------------------------- wikipedia

function WikiSection({ itemId, cards, act }: { itemId: string; cards: WikiCard[]; act: Act }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  return (
    <section className="section">
      <div className="row between">
        <h2 className="h2">Further, via Wikipedia</h2>
        <span className="small muted">Code finds and fetches every link</span>
      </div>
      <div>
        {cards.map((c) => (
          <div key={c.id} className={`wiki-row${c.status === 'cut' ? ' cut' : ''}`}>
            <div>
              <a className="serif" style={{ fontSize: 17 }} href={safeHref(c.url)} target="_blank" rel="noreferrer noopener">
                {c.title} ↗
              </a>
              {editing === c.id ? (
                <div className="stack" style={{ marginTop: 6 }}>
                  <TextArea className="compact" value={summary} onChange={(e) => setSummary(e.target.value)} />
                  <div className="row">
                    <button className="btn small primary" onClick={() => act('wiki', () => api.patch(`/api/wiki/${c.id}`, { summary }).then(() => setEditing(null)))}>
                      Save
                    </button>
                    <button className="btn quiet small" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="serif muted" style={{ fontSize: 15, marginTop: 2 }}>
                  {c.summary}
                </div>
              )}
              <div className="small muted">
                {c.http_status === 200 ? 'Link resolves' : c.http_status ? `Link returned ${c.http_status}` : 'Not checked yet'} · found for “{c.query}”
              </div>
            </div>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              {c.status !== 'kept' && (
                <button className="btn small primary" onClick={() => act('wiki', () => api.patch(`/api/wiki/${c.id}`, { status: 'kept' }))}>
                  Keep
                </button>
              )}
              {c.status === 'kept' && <span className="small ok">Kept</span>}
              {c.status !== 'cut' ? (
                <button className="btn small" onClick={() => act('wiki', () => api.patch(`/api/wiki/${c.id}`, { status: 'cut' }))}>
                  Cut
                </button>
              ) : (
                <button className="btn quiet small" onClick={() => act('wiki', () => api.patch(`/api/wiki/${c.id}`, { status: 'proposed' }))}>
                  Restore
                </button>
              )}
              <button
                className="btn quiet small"
                onClick={() => {
                  setEditing(c.id);
                  setSummary(c.summary);
                }}
              >
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) void act('wiki', () => api.post(`/api/items/${itemId}/wiki`, { query: q.trim() }).then(() => setQ('')), 'Added from Wikipedia');
        }}
      >
        <input className="input" style={{ flex: '1 1 200px' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a Wikipedia article by name" />
        <button className="btn small" type="submit" disabled={!q.trim()}>
          Find
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- details

function DetailsSection({ detail, onPatch }: { detail: ItemDetail; onPatch: (b: Record<string, unknown>) => Promise<void> }) {
  const { item } = detail;
  const toast = useToast();
  const field = (k: keyof typeof item, label: string, ph = '', type = 'text') => (
    <label className="field" style={{ flex: '1 1 200px' }}>
      <span className="label">{label}</span>
      <input
        className="input"
        type={type}
        defaultValue={(item[k] as string | number | null) ?? ''}
        placeholder={ph}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v === String(item[k] ?? '')) return;
          onPatch({ [k]: k === 'minutes' ? (v ? Number(v) : null) : v }).catch((err) => toast(err instanceof Error ? err.message : String(err), true));
        }}
      />
    </label>
  );
  return (
    <details className="section panel line">
      <summary className="h2" style={{ cursor: 'pointer', fontSize: 19 }}>
        Details
      </summary>
      <div className="row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
        <label className="field" style={{ flex: '1 1 160px' }}>
          <span className="label">Type</span>
          <TypeSelect value={item.type} onChange={(t: ContentType) => void onPatch({ type: t })} />
        </label>
        {field('creator', 'By', 'Author, speaker or show')}
        {field('source_name', 'Source', 'Publication, venue, book')}
        {field('source_date', 'Date', '1945, or 7 March 1986')}
        {field('url', 'Link to the original (https)', 'https://', 'url')}
        {field('minutes', 'Minutes', '', 'number')}
        {field('locator', 'Default locator', 'Transcript, Chapter VII')}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- connections

const EDGE_TYPES = ['Answers', 'Extends', 'Contradicts', 'Precedent of', 'Same mechanism', 'Rhymes with', 'Cites'];

function ConnectionsSection({ detail, act }: { detail: ItemDetail; act: Act }) {
  const { data } = useLoad(() => api.get<{ items: TrayItem[] }>('/api/items?view=tray'), []);
  const [to, setTo] = useState('');
  const [type, setType] = useState(EDGE_TYPES[0]!);
  const [note, setNote] = useState('');
  const others = (data?.items ?? []).filter((i) => i.id !== detail.item.id);
  return (
    <details className="section panel line">
      <summary className="h2" style={{ cursor: 'pointer', fontSize: 19 }}>
        Connections {detail.connections.length ? `· ${detail.connections.length}` : ''}
      </summary>
      <div className="stack" style={{ marginTop: 12 }}>
        {detail.connections.map((c) => (
          <div key={c.id} className="row between">
            <span>
              <span className="label ink">{c.type}</span> <span className="serif">→ {c.to_title}</span>
              <span className="serif muted" style={{ display: 'block' }}>{c.note}</span>
            </span>
            <button className="btn quiet small" onClick={() => act('conn', () => api.del(`/api/connections/${c.id}`))}>
              Remove
            </button>
          </div>
        ))}
        <div className="row">
          <select className="select" style={{ flex: '1 1 140px' }} value={type} onChange={(e) => setType(e.target.value)}>
            {EDGE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select className="select" style={{ flex: '2 1 200px' }} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Another item…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {displayTitle(o)}
              </option>
            ))}
          </select>
        </div>
        <TextArea className="compact" value={note} onChange={(e) => setNote(e.target.value)} placeholder="One sentence, in your words: how they connect." />
        <div className="row">
          <button
            className="btn small"
            disabled={!to || note.trim().length < 2}
            onClick={() => act('conn', () => api.post(`/api/items/${detail.item.id}/connections`, { toItemId: to, type, note: note.trim() }).then(() => setNote('')), 'Connected')}
          >
            Add connection
          </button>
        </div>
        <p className="small muted">Connections publish only between items in the same Haul.</p>
      </div>
    </details>
  );
}

