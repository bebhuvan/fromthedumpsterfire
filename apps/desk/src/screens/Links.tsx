// Links: the machine's suggested connections, each with a quote from both ends (matched word for
// word against the stored sources), and the Threads it proposes from the links the editor kept.
// The machine's words are blue; a kept link's note is the editor's own.

import { useState } from 'react';
import { EDGE_TYPES } from '@fdf/shared/haul';
import { checkStyle } from '@fdf/shared/style';
import { typeLabel } from '@fdf/shared/tokens';
import { api, displayTitle, type Suggestion, type ThreadUi } from '../api';
import { Link, useLoad, useToast } from '../lib/core';
import { Spinner, TextArea } from '../ui/parts';

const t = (title: string | null, choice: string | null) => displayTitle({ title, title_choice: choice });

export function SuggestionCard({ s, onChange, focusItemId }: { s: Suggestion; onChange: (s: Suggestion | null) => void; focusItemId?: string }) {
  const toast = useToast();
  const [note, setNote] = useState(s.editor_note ?? '');
  const [type, setType] = useState(s.type);
  const [busy, setBusy] = useState(false);
  const routes = typeof s.routes === 'string' ? {} : s.routes;
  const fromTitle = t(s.from_title, s.from_choice);
  const toTitle = t(s.to_title, s.to_choice);
  const why = [
    routes.vector ? `similar passages (${routes.vector.toFixed(2)})` : '',
    routes.entities?.length ? `both cite ${routes.entities.slice(0, 3).join(', ')}` : '',
    routes.mechanisms?.length ? `same mechanism: ${routes.mechanisms.slice(0, 2).join(', ')}` : '',
  ].filter(Boolean);

  async function act(path: string, b?: unknown, done?: string) {
    setBusy(true);
    try {
      const r = await api.post<{ suggestion: Suggestion }>(`/api/suggestions/${s.id}/${path}`, b);
      onChange({ ...s, ...r.suggestion });
      if (done) toast(done);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  const endTitle = (id: string, title: string) => (id === focusItemId ? <span>{title}</span> : <Link to={`/item/${id}`}>{title}</Link>);
  return (
    <article className={`sugg ${s.status}`}>
      <div className="sugg-head">
        <span className="serif" style={{ fontSize: 17 }}>
          {endTitle(s.from_item_id, fromTitle)} <span className="sugg-type">{s.type}</span> {endTitle(s.to_item_id, toTitle)}
        </span>
        <span className="top-spacer" />
        <span className="conf" title="The judge's confidence">
          <span className="conf-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(s.confidence * 100)}%` }} />
          </span>
          {Math.round(s.confidence * 100)}%
        </span>
      </div>
      <div className="ends">
        <div className="end" data-type={s.from_type}>
          <span className="who">{fromTitle}{s.from_date ? ` · ${s.from_date}` : ''}</span>
          <q>{s.from_quote}</q>
        </div>
        <div className="end" data-type={s.to_type}>
          <span className="who">{toTitle}{s.to_date ? ` · ${s.to_date}` : ''}</span>
          <q>{s.to_quote}</q>
        </div>
      </div>
      <p className="note-text" style={{ margin: 0 }}>{s.note}</p>
      <div className="small muted">Both quotes found word for word in their sources{why.length ? ` · candidate because of ${why.join('; ')}` : ''}</div>

      {s.status === 'approved' ? (
        <div className="row between">
          <span className="serif" style={{ fontStyle: 'italic', fontSize: 16 }}>
            “{s.editor_note}” <span className="small ok" style={{ fontStyle: 'normal', fontFamily: 'var(--sans)' }}>Kept as {s.type}</span>
          </span>
          <button className="btn quiet small" disabled={busy} onClick={() => act('reopen', undefined, 'Back to suggested')}>
            Undo
          </button>
        </div>
      ) : s.status === 'rejected' ? (
        <div className="row between">
          <span className="small muted">Rejected. The judge sees it as an example of what you do not want.</span>
          <button className="btn quiet small" disabled={busy} onClick={() => act('reopen')}>
            Reconsider
          </button>
        </div>
      ) : (
        <>
          <TextArea className="editor compact" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your note for readers: one sentence, in your words, on how they connect." aria-label="Your connection note" />
          <div className="row">
            <select className="select" style={{ width: 'auto', minHeight: 32 }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Connection type">
              {EDGE_TYPES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <button className="btn small primary" disabled={busy || note.trim().length < 2} onClick={() => act('approve', { note: note.trim(), type }, 'Kept. It will publish with your note.')}>
              Keep with my note
            </button>
            <button className="btn quiet small" disabled={busy} onClick={() => setNote(s.note)} title="Copy the machine's sentence into your note; keeping it makes it yours">
              Adopt the machine's sentence
            </button>
            <button className="btn small" disabled={busy} onClick={() => act('reject', undefined, 'Rejected')}>
              Reject
            </button>
          </div>
        </>
      )}
    </article>
  );
}

export function ItemSuggestions({ itemId, suggestions, onChange }: { itemId: string; suggestions: Suggestion[]; onChange: () => void }) {
  const toast = useToast();
  const [list, setList] = useState(suggestions);
  const [seen, setSeen] = useState(suggestions);
  if (seen !== suggestions) {
    setSeen(suggestions);
    setList(suggestions);
  }
  const open = list.filter((s) => s.status === 'proposed').length;
  return (
    <section className="section">
      <div className="row between">
        <h2 className="h2">Suggested links {open ? `· ${open}` : ''}</h2>
        <button
          className="btn quiet small"
          onClick={() =>
            api.post(`/api/items/${itemId}/connect`).then(
              () => toast('Looking for links in the background'),
              (e) => toast(e instanceof Error ? e.message : String(e), true),
            )
          }
        >
          Look again
        </button>
      </div>
      {!list.length && <p className="small muted" style={{ margin: 0 }}>No suggestions. The machine proposes a link only when it can quote both pieces.</p>}
      {list.map((s) => (
        <SuggestionCard key={s.id} s={s} focusItemId={itemId} onChange={(n) => (setList(list.map((x) => (x.id === s.id && n ? n : x))), onChange())} />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- the Links page

export function Links() {
  const [status, setStatus] = useState<'proposed' | 'approved' | 'rejected'>('proposed');
  const { data, setData } = useLoad(() => api.get<{ suggestions: Suggestion[]; counts: Array<{ status: string; n: number }> }>(`/api/suggestions?status=${status}`), [status]);
  const count = (s: string) => data?.counts.find((c) => c.status === s)?.n ?? 0;
  return (
    <div className="links-grid">
      <div className="stack" style={{ gap: 16 }}>
        <div>
          <div className="label">Links</div>
          <h1 className="display" style={{ fontSize: 'clamp(30px, 4vw, 40px)', margin: '6px 0 0' }}>
            What the machine thinks <i>connects</i>
          </h1>
          <p className="small muted" style={{ margin: '8px 0 0', maxWidth: '60ch' }}>
            Each suggestion quotes both pieces, and both quotes were found word for word in the stored sources. Keep a link with a note in your words; reject it and the judge learns what you do not want.
          </p>
        </div>
        <div className="tray-tabs" role="group" aria-label="Show">
          {(['proposed', 'approved', 'rejected'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === 'proposed' ? 'Suggested' : s === 'approved' ? 'Kept' : 'Rejected'} · {count(s)}
            </button>
          ))}
        </div>
        {!data ? (
          <Spinner text="Loading…" />
        ) : data.suggestions.length === 0 ? (
          <p className="tray-empty">Nothing here.</p>
        ) : (
          data.suggestions.map((s) => (
            <SuggestionCard key={s.id} s={s} onChange={(n) => n && setData({ ...data, suggestions: data.suggestions.map((x) => (x.id === s.id ? n : x)) })} />
          ))
        )}
      </div>
      <aside className="sticky stack" style={{ gap: 16 }}>
        <Threads />
      </aside>
    </div>
  );
}

function Threads() {
  const toast = useToast();
  const { data, reload } = useLoad(() => api.get<{ threads: ThreadUi[] }>('/api/threads'), []);
  const [busy, setBusy] = useState(false);
  return (
    <section className="stack" style={{ gap: 14 }}>
      <div className="row between">
        <h2 className="h2">Threads</h2>
        <button
          className="btn small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.post<{ clusters: number; drafted: string[] }>('/api/threads/suggest');
              toast(r.drafted.length ? `Drafted ${r.drafted.length} thread${r.drafted.length === 1 ? '' : 's'}` : r.clusters ? 'Every cluster already has a thread' : 'Keep more links first: a thread needs three connected pieces');
              await reload();
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e), true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Reading the links…' : 'Suggest threads'}
        </button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Groups of three or more pieces joined by links you kept. The machine drafts a name; you name it.</p>
      {data?.threads.map((th) => <ThreadCard key={th.id} thread={th} onSaved={reload} />)}
    </section>
  );
}

function ThreadCard({ thread, onSaved }: { thread: ThreadUi; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(thread.title_text);
  const [italic, setItalic] = useState(thread.title_italic ?? '');
  const [summary, setSummary] = useState(thread.summary);
  const [gists, setGists] = useState<Record<string, string>>(Object.fromEntries(thread.points.map((p) => [p.itemId, p.gist])));
  const [busy, setBusy] = useState(false);
  const machine = thread.status === 'proposed' && !thread.edited;
  const style = checkStyle([title, italic, summary].filter(Boolean).join('. '), { strict: false });
  async function save(status?: ThreadUi['status']) {
    setBusy(true);
    try {
      await api.patch(`/api/threads/${thread.id}`, { title_text: title, title_italic: italic || null, summary, gists, ...(status ? { status } : {}) });
      toast(status === 'approved' ? 'Thread approved; it publishes with any Haul it touches' : status === 'rejected' ? 'Thread set aside' : 'Saved');
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }
  if (thread.status === 'rejected')
    return (
      <div className="small muted row between">
        <span>Set aside: {thread.title_text}</span>
        <button className="btn quiet small" onClick={() => save('proposed')}>
          Reconsider
        </button>
      </div>
    );
  return (
    <article className={`thread ${thread.status}`}>
      <div className="row between">
        <span className="label">{thread.status === 'approved' ? 'Approved thread' : 'Suggested thread'} · {thread.points.length} pieces</span>
        {machine && <span className="small machine">Drafted by the machine</span>}
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <input className="input serif" style={{ flex: '2 1 160px', fontSize: 20, color: machine ? 'var(--machine)' : undefined }} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Thread title" />
        <input className="input serif" style={{ flex: '1 1 100px', fontSize: 20, fontStyle: 'italic', color: machine ? 'var(--machine)' : undefined }} value={italic} onChange={(e) => setItalic(e.target.value)} placeholder="in italic" aria-label="Thread title, italic part" />
      </div>
      <TextArea className={`compact${machine ? ' machine-area' : ''}`} value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="Thread summary" />
      {!style.ok && <span className="small warn">{style.issues[0]?.message}</span>}
      <ol className="timeline">
        {thread.points.map((p) => (
          <li key={p.itemId} data-type={p.item?.type}>
            <span className="yr num">{p.year || '—'}</span>
            <span className="stack" style={{ gap: 4 }}>
              <span className="serif" style={{ fontSize: 15.5 }}>
                {p.item ? <Link to={`/item/${p.itemId}`}>{displayTitle(p.item)}</Link> : 'A deleted item'}
                {p.item ? <span className="small muted"> · {typeLabel[p.item.type]}</span> : null}
              </span>
              {p.edge && <span className="edge">{p.edge}</span>}
              <input
                className="input"
                style={{ fontSize: 13.5, minHeight: 32, color: machine ? 'var(--machine)' : undefined }}
                value={gists[p.itemId] ?? ''}
                onChange={(e) => setGists({ ...gists, [p.itemId]: e.target.value })}
                placeholder="One line on what this piece adds"
                aria-label="What this piece adds"
              />
            </span>
          </li>
        ))}
      </ol>
      <div className="row">
        {thread.status !== 'approved' && (
          <button className="btn small primary" disabled={busy || !style.ok} onClick={() => save('approved')}>
            Approve as mine
          </button>
        )}
        <button className="btn small" disabled={busy} onClick={() => save()}>
          Save
        </button>
        {thread.status !== 'approved' ? (
          <button className="btn quiet small" disabled={busy} onClick={() => save('rejected')}>
            Set aside
          </button>
        ) : (
          <button className="btn quiet small" disabled={busy} onClick={() => save('proposed')}>
            Unapprove
          </button>
        )}
      </div>
    </article>
  );
}
