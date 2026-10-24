// The Haul composer: order the items, write the field note (with the machine's questions and a
// drafted route), preview the bundle as readers will get it, and publish.

import { useMemo, useState } from 'react';
import { haulSlug, type Haul, type RouteStep } from '@fdf/shared/haul';
import { checkStyle } from '@fdf/shared/style';
import { EDITIONS, editionOf, SWATCHES, typeLabel } from '@fdf/shared/tokens';
import { api, displayTitle, parseChecks, type HaulDetail, type HaulRecord, type Note, type PreviewResult, type PublishResult, type TrayItem } from '../api';
import { Link, safeHref, SaveNote, useAutosave, useLoad, useToast } from '../lib/core';
import { NoteCompare, Spinner, TextArea, VoiceNote } from '../ui/parts';
import { Preview } from './Preview';
import { PlatesSection } from './Plates';
import { FormatBadge } from '../ui/parts';
import { drawCard } from '../lib/card';


export function Composer({ id }: { id: string }) {
  const toast = useToast();
  const { data, reload, setData } = useLoad(() => api.get<HaulDetail>(`/api/hauls/${id}`), [id]);
  const tray = useLoad(() => api.get<{ items: TrayItem[] }>('/api/items?view=tray'), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  if (!data) return <p className="tray-empty">Opening…</p>;
  const h = data.haul;
  const save = (b: Partial<HaulRecord>) => api.patch<HaulDetail>(`/api/hauls/${id}`, b).then(setData);
  const ids = data.items.map((i) => i.id);
  const setItems = async (next: string[]) => {
    try {
      setData(await api.put<HaulDetail>(`/api/hauls/${id}/items`, { itemIds: next }));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  };
  const available = (tray.data?.items ?? []).filter((i) => !i.haul_number && !ids.includes(i.id) && i.status === 'ready');

  async function machine(what: 'questions' | 'route') {
    setBusy(what);
    try {
      setData(await api.post<HaulDetail>(`/api/hauls/${id}/${what}`));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="composer" style={{ ['--type' as string]: `var(--${h.swatch})` }}>
      <aside className="col-items sticky stack" style={{ gap: 14 }}>
        <div>
          <div className="label">Haul {haulSlug(h.number)} · {h.status === 'published' ? `published v${h.version}` : 'draft'}</div>
          <h2 className="h2" style={{ marginTop: 6 }}>
            In this Haul · {data.items.length}
          </h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>A Haul is 6 to 20 objects.</p>
        </div>
        <ol className="order">
          {data.items.map((it, i) => {
            const checks = parseChecks(it.checks);
            const failing = Object.entries(checks).filter(([k, v]) => v === 'fail' && k !== 'drafting').map(([k]) => k);
            return (
              <li key={it.id} data-type={it.type}>
                <span className="n num">{i + 1}</span>
                <span>
                  <Link to={`/item/${it.id}`} className="t" style={{ textDecoration: 'none' }}>
                    {displayTitle(it)}
                  </Link>
                  <span className="small" style={{ display: 'block' }}>
                    <span className="muted">{typeLabel[it.type]}</span>
                    {failing.length ? <span className="bad"> · fix {failing.join(', ')}</span> : <span className="ok"> · checks pass</span>}
                  </span>
                </span>
                <span className="row" style={{ gap: 2 }}>
                  <button className="btn quiet small" aria-label="Move up" disabled={i === 0} onClick={() => setItems(move(ids, i, -1))}>
                    ↑
                  </button>
                  <button className="btn quiet small" aria-label="Move down" disabled={i === ids.length - 1} onClick={() => setItems(move(ids, i, 1))}>
                    ↓
                  </button>
                  <button className="btn quiet small" aria-label="Remove from Haul" onClick={() => setItems(ids.filter((x) => x !== it.id))}>
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Ready in the tray · {available.length}</div>
          <ul className="tray">
            {available.map((it) => (
              <li key={it.id}>
                <a
                  href={`/item/${it.id}`}
                  data-type={it.type}
                  onClick={(e) => {
                    e.preventDefault();
                    void setItems([...ids, it.id]);
                  }}
                >
                  <span className="tray-title">{displayTitle(it)}</span>
                  <span className="tray-meta">
                    <span className="dot">{typeLabel[it.type]}</span>
                    <span>Add to Haul</span>
                  </span>
                </a>
              </li>
            ))}
            {!available.length && <li className="small muted" style={{ padding: '6px 14px' }}>Nothing else is ready.</li>}
          </ul>
        </div>
      </aside>

      <div className="stack" style={{ gap: 30 }}>
        <Masthead haul={h} save={save} />
        <PlatesSection target={{ kind: 'haul', id }} plates={data.plates} decision={h.cover_plate} onChange={reload} title="Cover plate" />
        {data.fieldNoteAudio && (
          <div className="row small muted">
            Field-note recording to publish <FormatBadge format={data.fieldNoteAudio.format} />
          </div>
        )}
        <FieldNote haul={h} save={save} items={data.items} busy={busy} onMachine={machine} />
      </div>

      <aside className="sticky stack" style={{ gap: 16 }}>
        <PublishPanel haulId={id} haul={h} versions={data.versions} onPublished={reload} onPreview={() => setShowPreview((s) => !s)} showing={showPreview} />
        {showPreview && <PreviewLoader haulId={id} />}
      </aside>
    </div>
  );
}

function move<T>(a: T[], i: number, d: number): T[] {
  const b = [...a];
  const [x] = b.splice(i, 1);
  b.splice(i + d, 0, x!);
  return b;
}

// ---------------------------------------------------------------- masthead

function Masthead({ haul, save }: { haul: HaulRecord; save: (b: Partial<HaulRecord>) => Promise<void> }) {
  const deck = useAutosave(`deck:${haul.id}`, haul.deck, (v) => save({ deck: v }));
  return (
    <section className="section">
      <div className="label">The cover</div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '2 1 240px' }}>
          <span className="label">Title</span>
          <input className="input serif" style={{ fontSize: 24 }} defaultValue={haul.title_text} placeholder="What cheap things" onBlur={(e) => e.target.value !== haul.title_text && void save({ title_text: e.target.value })} />
        </label>
        <label className="field" style={{ flex: '1 1 140px' }}>
          <span className="label">In italic</span>
          <input className="input serif" style={{ fontSize: 24, fontStyle: 'italic' }} defaultValue={haul.title_italic ?? ''} placeholder="cost" onBlur={(e) => e.target.value !== (haul.title_italic ?? '') && void save({ title_italic: e.target.value || null })} />
        </label>
      </div>
      <label className="field">
        <span className="label">Deck</span>
        <TextArea className="compact" value={deck.value} onChange={(e) => deck.onChange(e.target.value)} onBlur={() => void deck.flush()} placeholder="One sentence that says what is inside." />
        <SaveNote state={deck.state} />
      </label>
      <div className="row">
        <span className="label">Colour</span>
        <div className="swatches" role="group" aria-label="Cover colour">
          {SWATCHES.map((s) => (
            <button key={s} type="button" aria-label={s} aria-pressed={haul.swatch === s} style={{ background: `var(--${s})` }} onClick={() => void save({ swatch: s })} />
          ))}
        </div>
      </div>
      <EditionPicker haul={haul} save={save} />
    </section>
  );
}

/**
 * The Haul's edition: a deep ink on every page of it (the band on the top edge, its number, its
 * fingerprint's rule). Left alone, it is the default for the Haul's number, so neighbours differ.
 */
function EditionPicker({ haul, save }: { haul: HaulRecord; save: (b: Partial<HaulRecord>) => Promise<void> }) {
  const current = editionOf(haul.number, haul.edition ?? undefined);
  const fallback = editionOf(haul.number);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <span className="label">Edition ink</span>
        <div className="swatches editions" role="radiogroup" aria-label="Edition ink">
          {EDITIONS.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={current === e}
              aria-pressed={current === e}
              aria-label={`${e}${e === fallback ? ' (the default for this number)' : ''}`}
              title={e}
              style={{ background: `var(--ed-${e})` }}
              onClick={() => void save({ edition: e === fallback ? null : e })}
            />
          ))}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        <span style={{ color: `var(--ed-${current})`, fontWeight: 600 }}>{current[0]!.toUpperCase() + current.slice(1)}</span>
        {haul.edition ? '.' : `, the default for Haul ${haul.number}.`} Marks every page of this Haul: the band on the top edge, its number, the rule of its fingerprint.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- field note

function sentences(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .flatMap((p) => p.replace(/\s*\n\s*/g, ' ').match(/[^.!?]+[.!?]+["”’)]*|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

function FieldNote({ haul, save, items, busy, onMachine }: { haul: HaulRecord; save: (b: Partial<HaulRecord>) => Promise<void>; items: HaulDetail['items']; busy: string | null; onMachine: (w: 'questions' | 'route') => void }) {
  const body = useAutosave(`fn:${haul.id}`, haul.fn_body, (v) => save({ fn_body: v }));
  const [note, setNote] = useState<Note | null>(null);
  const lines = useMemo(() => sentences(body.value), [body.value]);
  return (
    <section className="stack" style={{ gap: 26 }}>
      <div className="section">
        <div className="row between">
          <h2 className="h2">The field note</h2>
          <VoiceNote
            target="fieldnote"
            haulId={haul.id}
            label="Record the field note"
            onNote={(n) => {
              setNote(n);
              void save({ fn_note_id: n.id });
            }}
          />
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '2 1 220px' }}>
            <span className="label">Its title</span>
            <input className="input serif" defaultValue={haul.fn_title_text} placeholder="Words got cheap" onBlur={(e) => e.target.value !== haul.fn_title_text && void save({ fn_title_text: e.target.value })} />
          </label>
          <label className="field" style={{ flex: '1 1 140px' }}>
            <span className="label">In italic</span>
            <input className="input serif" style={{ fontStyle: 'italic' }} defaultValue={haul.fn_title_italic ?? ''} placeholder="this year" onBlur={(e) => e.target.value !== (haul.fn_title_italic ?? '') && void save({ fn_title_italic: e.target.value || null })} />
          </label>
        </div>
        <TextArea
          className="editor"
          style={{ minHeight: 260 }}
          value={body.value}
          onChange={(e) => body.onChange(e.target.value)}
          onBlur={() => void body.flush()}
          onSubmit={() => void body.flush()}
          placeholder="Your introduction, in your own voice. Leave a blank line between paragraphs."
          aria-label="Field note"
        />
        <SaveNote state={body.state} />
        {note && <NoteCompare note={note} onUse={(t) => body.onChange(body.value.trim() ? `${body.value.trim()}\n\n${t}` : t)} />}
        {lines.length > 0 && (
          <label className="field">
            <span className="label">The line to highlight</span>
            <select className="select serif" value={haul.fn_highlight ?? ''} onChange={(e) => void save({ fn_highlight: e.target.value || null })}>
              <option value="">None</option>
              {lines.map((l) => (
                <option key={l} value={l}>
                  {l.length > 110 ? `${l.slice(0, 110)}…` : l}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <Questions haul={haul} save={save} busy={busy === 'questions'} onAsk={() => onMachine('questions')} onUse={(t) => body.onChange(body.value.trim() ? `${body.value.trim()}\n\n${t}` : t)} />
      <Route haul={haul} save={save} items={items} busy={busy === 'route'} onDraft={() => onMachine('route')} />
      <Colophon haul={haul} save={save} />
    </section>
  );
}

function Questions({ haul, save, busy, onAsk, onUse }: { haul: HaulRecord; save: (b: Partial<HaulRecord>) => Promise<void>; busy: boolean; onAsk: () => void; onUse: (t: string) => void }) {
  return (
    <div className="section">
      <div className="row between">
        <h2 className="h2">Questions for you</h2>
        {busy ? <Spinner text="Reading the week…" /> : (
          <button className="btn small" onClick={onAsk}>
            {haul.questions.length ? 'Ask again' : 'Ask me two or three questions'}
          </button>
        )}
      </div>
      {haul.questions.length === 0 && <p className="small muted">The machine reads this Haul's items and your notes, then asks what tied them together. Answer by voice or by typing; your answers stay yours.</p>}
      {haul.questions.map((q, i) => (
        <Answer key={`${haul.id}-${i}-${q.q.slice(0, 20)}`} q={q} onSave={(answer) => save({ questions: haul.questions.map((x, j) => (j === i ? { ...x, answer } : x)) })} haulId={haul.id} onUse={onUse} />
      ))}
    </div>
  );
}

function Answer({ q, onSave, haulId, onUse }: { q: { q: string; answer: string }; onSave: (a: string) => Promise<void>; haulId: string; onUse: (t: string) => void }) {
  const a = useAutosave(`answer:${haulId}:${q.q.slice(0, 40)}`, q.answer, onSave);
  const [note, setNote] = useState<Note | null>(null);
  return (
    <div className="q">
      <p className="machine" style={{ margin: 0, fontSize: 15.5 }}>{q.q}</p>
      <TextArea className="editor compact" value={a.value} onChange={(e) => a.onChange(e.target.value)} onBlur={() => void a.flush()} placeholder="Your answer" />
      {note && <NoteCompare note={note} onUse={(t) => a.onChange(a.value.trim() ? `${a.value.trim()} ${t}` : t)} />}
      <div className="row between">
        <SaveNote state={a.state} />
        <span className="row">
          <VoiceNote target="answer" haulId={haulId} onNote={setNote} label="Answer by voice" />
          <button className="btn quiet small" disabled={!a.value.trim()} onClick={() => onUse(a.value.trim())}>
            Add to the field note
          </button>
        </span>
      </div>
    </div>
  );
}

function Route({ haul, save, items, busy, onDraft }: { haul: HaulRecord; save: (b: Partial<HaulRecord>) => Promise<void>; items: HaulDetail['items']; busy: boolean; onDraft: () => void }) {
  const [steps, setSteps] = useState<RouteStep[]>(haul.route);
  const [dirty, setDirty] = useState(false);
  const key = JSON.stringify(haul.route);
  const [seen, setSeen] = useState(key);
  if (seen !== key && !dirty) {
    setSeen(key);
    setSteps(haul.route);
  }
  const update = (i: number, s: Partial<RouteStep>) => {
    setSteps((all) => all.map((x, j) => (j === i ? { ...x, ...s } : x)));
    setDirty(true);
  };
  const commit = async () => {
    await save({ route: steps });
    setDirty(false);
  };
  return (
    <div className="section">
      <div className="row between">
        <h2 className="h2">The route</h2>
        {busy ? <Spinner text="Drafting from your capture times…" /> : (
          <button className="btn small" onClick={onDraft}>
            {steps.length ? 'Draft again' : 'Draft the route'}
          </button>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>How one find led to the next. Machine lines are blue; make a line yours by rewriting it, or mark it yours if you vouch for it.</p>
      {steps.map((s, i) => {
        const style = s.by === 'machine' ? checkStyle(s.text) : null;
        return (
          <div key={i} className="route-step">
            <input className="input" value={s.day} onChange={(e) => update(i, { day: e.target.value })} onBlur={commit} aria-label="Day" />
            <div className="stack" style={{ gap: 6 }}>
              <TextArea
                className={`compact${s.by === 'machine' ? ' machine-area' : ''}`}
                value={s.text}
                onChange={(e) => update(i, { text: e.target.value, by: 'editor' })}
                onBlur={commit}
              />
              {style && !style.ok && <span className="small warn">{style.issues[0]?.message}</span>}
              <div className="row small">
                <select className="select" style={{ width: 'auto', minHeight: 30 }} value={s.itemId ?? ''} onChange={(e) => (update(i, { itemId: e.target.value || undefined }), setTimeout(commit))}>
                  <option value="">No item</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {displayTitle(it)}
                    </option>
                  ))}
                </select>
                <button className="btn quiet small" onClick={() => (update(i, { by: s.by === 'machine' ? 'editor' : 'machine' }), setTimeout(commit))}>
                  {s.by === 'machine' ? 'Mark as mine' : 'Mine · undo'}
                </button>
                <button className="btn quiet small" onClick={() => (setSteps(steps.filter((_, j) => j !== i)), setDirty(true), setTimeout(() => void save({ route: steps.filter((_, j) => j !== i) }).then(() => setDirty(false))))}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <div className="row">
        <button className="btn quiet small" onClick={() => (setSteps([...steps, { day: '', text: '', by: 'editor' }]), setDirty(true))}>
          Add a line
        </button>
        {dirty && (
          <button className="btn small primary" onClick={commit}>
            Save route
          </button>
        )}
      </div>
    </div>
  );
}

function Colophon({ haul, save }: { haul: HaulRecord; save: (b: Partial<HaulRecord>) => Promise<void> }) {
  const c = useAutosave(`colophon:${haul.id}`, haul.colophon, (v) => save({ colophon: v }));
  return (
    <details className="section panel line">
      <summary className="h2" style={{ cursor: 'pointer', fontSize: 19 }}>Colophon</summary>
      <TextArea className="compact" value={c.value} onChange={(e) => c.onChange(e.target.value)} onBlur={() => void c.flush()} />
      <SaveNote state={c.state} />
    </details>
  );
}

// ---------------------------------------------------------------- publish

function PublishPanel({ haulId, haul, versions, onPublished, onPreview, showing }: { haulId: string; haul: HaulRecord; versions: HaulDetail['versions']; onPublished: () => void; onPreview: () => void; showing: boolean }) {
  const toast = useToast();
  const [check, setCheck] = useState<PreviewResult | PublishResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [correction, setCorrection] = useState('');
  const published = haul.status === 'published';

  async function run(dry: boolean) {
    setBusy(true);
    try {
      if (dry) setCheck(await api.get<PreviewResult>(`/api/hauls/${haulId}/preview${published && correction ? `?correction=${encodeURIComponent(correction)}` : ''}`));
      else {
        if (!confirm(published ? `Publish version ${haul.version + 1} with this correction?` : `Publish Haul ${haulSlug(haul.number)} to the app and the web? Readers with notifications on will get one.`)) return;
        // The share card is drawn here, from the bundle as it will be published; without it the Haul
        // still publishes (link previews fall back to a plate or the default image).
        const pv = await api.get<PreviewResult>(`/api/hauls/${haulId}/preview${published && correction ? `?correction=${encodeURIComponent(correction)}` : ''}`).catch(() => null);
        const card = pv ? await drawCard(pv.haul as Haul) : null;
        if (!card) toast('The share card could not be drawn; publishing without it', true);
        const r = await api.post<PublishResult>(`/api/hauls/${haulId}/publish`, { confirm: true, ...(published ? { correction } : {}), ...(card ? { card: card.base64 } : {}) }).catch((e) => (e as { body?: PublishResult }).body ?? Promise.reject(e));
        setCheck(r);
        if (r.ok) {
          toast(`Published v${r.version}`);
          setCorrection('');
          onPublished();
        } else toast('Not published: fix the problems listed', true);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  const problems = check ? [...check.problems.map((p) => `${p.itemTitle ? `${p.itemTitle}: ` : ''}${p.message}`), ...check.bundleErrors.map((e) => `${e.path}: ${e.message}`)] : [];
  return (
    <section className="panel plate stack">
      <div className="label ink">{published ? `Published · v${haul.version}` : 'Publish'}</div>
      {published && (
        <label className="field">
          <span className="label">What this correction changes (readers see it)</span>
          <TextArea className="compact" value={correction} onChange={(e) => setCorrection(e.target.value)} placeholder="Corrected the date of Hamming's talk." />
        </label>
      )}
      <div className="row">
        <button className="btn small" onClick={() => run(true)} disabled={busy}>
          Check
        </button>
        <button className="btn small" onClick={onPreview}>
          {showing ? 'Hide preview' : 'Preview'}
        </button>
        <button className="btn primary" onClick={() => run(false)} disabled={busy || (published && !correction.trim())}>
          {published ? 'Publish correction' : 'Publish to app and web'}
        </button>
      </div>
      {busy && <Spinner text="Checking every item and the bundle…" />}
      {check && (
        <>
          {problems.length ? (
            <div>
              <div className="small bad" style={{ fontWeight: 600 }}>{problems.length} thing{problems.length === 1 ? '' : 's'} to fix before publishing</div>
              <ul className="problems">
                {problems.slice(0, 30).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="small ok" style={{ fontWeight: 600 }}>{'ok' in check && check.ok && check.url ? 'Published.' : 'Ready to publish. Every check passes.'}</div>
          )}
          {check.warnings.length > 0 && (
            <ul className="problems warnings">
              {check.warnings.slice(0, 10).map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {versions.length > 0 && (
        <div className="stack small" style={{ gap: 4 }}>
          <div className="label">Versions</div>
          {versions.map((v) => (
            <div key={v.version}>
              v{v.version} · {new Date(v.published_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              {v.correction ? ` · ${v.correction}` : ''} · <a href={safeHref(new URL(`/files/${v.path}`, location.origin).toString())} target="_blank" rel="noreferrer">bundle</a>
              {v.version === 1 && <span className="muted"> · {v.notified ? 'notified' : 'no push sent'}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PreviewLoader({ haulId }: { haulId: string }) {
  const { data, error } = useLoad(() => api.get<PreviewResult>(`/api/hauls/${haulId}/preview`), [haulId]);
  if (error) return <p className="small bad">{error}</p>;
  if (!data) return <Spinner text="Assembling the bundle…" />;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <CardPreview haul={data.haul as Haul} />
      <Preview haul={data.haul as Haul} />
    </div>
  );
}

/** The share card as it will be published (drawn in this browser), for link previews. */
function CardPreview({ haul }: { haul: Haul }) {
  // Wrapped so "not drawn yet" (null) and "could not be drawn" ({ card: null }) differ.
  const { data: drawn, error } = useLoad(() => drawCard(haul).then((card) => ({ card })), [haul]);
  const data = drawn?.card;
  return (
    <figure className="card-preview" style={{ margin: 0 }}>
      <div className="label" style={{ marginBottom: 6 }}>Share card · link previews</div>
      {data ? <img src={data.dataUrl} width={1200} height={630} alt={`The share card for Haul ${haulSlug(haul.number)}`} /> : error || drawn ? <p className="small warn">The card could not be drawn here; the Haul publishes without one.</p> : <Spinner text="Drawing the card…" />}
    </figure>
  );
}
