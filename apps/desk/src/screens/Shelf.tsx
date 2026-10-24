// The shelf: the books the editor is reading, has read, or put down, with Publish the shelf. Each book
// opens its own page (Book.tsx). A Haul's Book item links to its shelf book from the item page
// (ShelfLink below).

import { useState } from 'react';
import { BOOK_STATUSES, bookStatusLabel, spineOf, type BookStatus, type Spine } from '@fdf/shared/shelf';
import { api, type BookListRow, type ItemDetail, type ShelfCheck, type Title } from '../api';
import { Link, navigate, safeHref, useLoad, useToast } from '../lib/core';
import { Spinner } from '../ui/parts';

/** A spine's cloth as a CSS colour: the edition inks are Desk variables; ink and paper are the page's own. */
/** A book row's spine: the editor's choice, else the one its id picks. */
export const spineOfRow = (b: { id: string; spine: Spine | null }): Spine => spineOf({ id: b.id, spine: b.spine ?? undefined });

export const spineVar = (s: Spine) => (s === 'ink' ? 'var(--ink)' : s === 'paper' ? 'var(--plate)' : `var(--ed-${s})`);

/** "21 Oct 2026" from an ISO date. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

export function BookTitle({ title }: { title: Title }) {
  return (
    <>
      {title.text}
      {title.italic ? (
        <>
          {' '}
          <i>{title.italic}</i>
        </>
      ) : null}
    </>
  );
}

export function Shelf() {
  const { data, error, reload } = useLoad(() => api.get<{ books: BookListRow[] }>('/api/books'), []);
  const [adding, setAdding] = useState(false);
  const books = data?.books ?? [];
  // Reading first, then the most recently touched (the order the shelf publishes in).
  const touched = (b: BookListRow) => [b.last_note, b.finished, b.started].filter(Boolean).sort().at(-1) ?? '';
  const groups = BOOK_STATUSES.map((s) => ({ status: s, books: books.filter((b) => b.status === s).sort((a, b) => touched(b).localeCompare(touched(a)) || a.id.localeCompare(b.id)) }));
  return (
    <div className="shelf-page stack" style={{ gap: 22 }}>
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="label">Shelf</div>
          <h1 className="display" style={{ fontSize: 40, margin: '6px 0 0' }}>
            Books, <i>as I read them</i>
          </h1>
        </div>
        <button type="button" className="btn primary" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
          {adding ? 'Close' : 'Add a book'}
        </button>
      </div>
      {adding && <NewBook onDone={(id) => navigate(`/shelf/${id}`)} />}
      <div className="shelf-grid">
        <div className="stack" style={{ gap: 4 }}>
          {error && <p className="tray-empty">Could not open the shelf: {error}</p>}
          {!data && !error && <p className="tray-empty">Opening…</p>}
          {data && books.length === 0 && <p className="tray-empty">No books yet. Add the one you are reading.</p>}
          {groups.map(
            (g) =>
              g.books.length > 0 && (
                <section key={g.status} aria-label={bookStatusLabel[g.status]}>
                  <h2 className="label ink tray-group">
                    {bookStatusLabel[g.status]} <span className="muted num">· {g.books.length}</span>
                  </h2>
                  <ul className="shelf-list">
                    {g.books.map((b) => (
                      <li key={b.id}>
                        <Link to={`/shelf/${b.id}`} className="book-row">
                          <span className="spine" style={{ background: spineVar(spineOfRow(b)) }} aria-hidden="true" />
                          <span className="book-row-text">
                            <span className="tray-title">
                              <BookTitle title={b.title} />
                            </span>
                            <span className="tray-meta">
                              <span>{b.author}</span>
                              {b.year != null && <span className="num">{b.year}</span>}
                              <span>
                                {b.note_count} note{b.note_count === 1 ? '' : 's'}
                                {b.last_note ? `, last ${shortDate(b.last_note)}` : ''}
                              </span>
                              {b.status === 'read' && b.finished && <span>finished {shortDate(b.finished)}</span>}
                              {b.item_count > 0 && <span>in a Haul</span>}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ),
          )}
        </div>
        <ShelfPublish onPublished={reload} />
      </div>
    </div>
  );
}

/** A new book: its title (the italic end optional), author, year and where it stands. */
function NewBook({ onDone, initial }: { onDone: (id: string) => void; initial?: Partial<{ text: string; italic: string; author: string }> }) {
  const toast = useToast();
  const [f, setF] = useState({ text: initial?.text ?? '', italic: initial?.italic ?? '', author: initial?.author ?? '', year: '' });
  const [status, setStatus] = useState<BookStatus>('reading');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const yearOk = !f.year.trim() || /^-?\d{1,4}$/.test(f.year.trim());
  const ready = f.text.trim() && f.author.trim() && yearOk;
  async function submit() {
    setBusy(true);
    try {
      const r = await api.post<{ book: { id: string } }>('/api/books', {
        title: { text: f.text.trim(), ...(f.italic.trim() ? { italic: f.italic.trim() } : {}) },
        author: f.author.trim(),
        ...(f.year.trim() ? { year: Number(f.year.trim()) } : {}),
        status,
      });
      toast('On the shelf');
      onDone(r.book.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="panel plate stack"
      style={{ gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) void submit();
      }}
    >
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '2 1 220px' }}>
          <span className="label">Title</span>
          <input className="input serif" value={f.text} onChange={set('text')} placeholder="Seeing Like" autoFocus />
        </label>
        <label className="field" style={{ flex: '1 1 160px' }}>
          <span className="label">Its italic end (optional)</span>
          <input className="input serif" style={{ fontStyle: 'italic' }} value={f.italic} onChange={set('italic')} placeholder="a State" />
        </label>
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '2 1 220px' }}>
          <span className="label">Author</span>
          <input className="input" value={f.author} onChange={set('author')} placeholder="James C. Scott" />
        </label>
        <label className="field" style={{ flex: '0 1 110px' }}>
          <span className="label">First published</span>
          <input className="input num" inputMode="numeric" value={f.year} onChange={set('year')} placeholder="1998" aria-invalid={!yearOk} />
        </label>
      </div>
      <StatusSwitch value={status} onChange={setStatus} />
      <div className="row">
        <button type="submit" className="btn primary small" disabled={!ready || busy}>
          {busy ? 'Adding…' : 'Put it on the shelf'}
        </button>
        <span className="small muted">Its address is made from the title and does not change.</span>
      </div>
    </form>
  );
}

export function StatusSwitch({ value, onChange, disabled }: { value: BookStatus; onChange: (s: BookStatus) => void; disabled?: boolean }) {
  return (
    <div className="seg" role="group" aria-label="Where the book stands">
      {BOOK_STATUSES.map((s) => (
        <button key={s} type="button" className="btn small" aria-pressed={value === s} disabled={disabled} onClick={() => value !== s && onChange(s)}>
          {bookStatusLabel[s]}
        </button>
      ))}
    </div>
  );
}

/** What changed since the last publish, the validation result, and the button. */
function ShelfPublish({ onPublished }: { onPublished: () => void }) {
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api.get<ShelfCheck>('/api/shelf/preview'), []);
  const [result, setResult] = useState<ShelfCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const check = result ?? data;
  const blocked = Boolean(check?.problems.length);
  const nothing = Boolean(check && check.last && check.changes.length === 0);

  async function publish() {
    if (!confirm('Publish the shelf to the app and the web?')) return;
    setBusy(true);
    try {
      const r = await api.post<ShelfCheck>('/api/shelf/publish', { confirm: true }).catch((e) => (e as { body?: ShelfCheck }).body ?? Promise.reject(e));
      setResult(r);
      if (r.ok) {
        toast(`The shelf is published (v${r.version})`);
        setResult(null);
        await reload();
        onPublished();
      } else toast('Not published: fix the problems listed', true);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`panel plate stack shelf-publish${check && !blocked && !nothing ? ' is-ready' : ''}`} aria-label="Publish the shelf">
      <div className="label ink">Publish the shelf</div>
      {error && <p className="small bad" style={{ margin: 0 }}>{error}</p>}
      {!check && !error && <Spinner text="Checking the shelf…" />}
      {check && (
        <>
          <p className="small" style={{ margin: 0 }}>
            {check.last ? `Last published ${new Date(check.last.published_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}, v${check.last.version}, ${check.last.books} book${check.last.books === 1 ? '' : 's'}.` : 'Not published yet.'}
          </p>
          {check.changes.length > 0 ? (
            <div>
              <div className="small" style={{ fontWeight: 600 }}>{check.last ? 'Since then' : 'This publish'}</div>
              <ul className="changes">
                {check.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>Nothing has changed since the last publish.</p>
          )}
          {blocked ? (
            <div>
              <div className="small bad" style={{ fontWeight: 600 }}>
                {check.problems.length} thing{check.problems.length === 1 ? '' : 's'} to fix before publishing
              </div>
              <ul className="problems">
                {check.problems.slice(0, 30).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="small ok" style={{ fontWeight: 600 }}>Every book passes the shelf’s checks.</div>
          )}
          {check.warnings.length > 0 && (
            <ul className="problems warnings">
              {check.warnings.slice(0, 10).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="row">
        <button type="button" className="btn small" disabled={busy} onClick={() => (setResult(null), void reload())}>
          Check again
        </button>
        <button type="button" className="btn primary" disabled={busy || !check || blocked || nothing} onClick={() => void publish()}>
          {busy ? 'Publishing…' : 'Publish the shelf'}
        </button>
      </div>
      {check?.last && (
        <a className="small muted" href={safeHref(new URL('/files/shelf/shelf.json', location.origin).toString())} target="_blank" rel="noreferrer">
          The published shelf.json
        </a>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- the item page

/** On a Book item: which shelf book it points to, or a picker to link one or make one from the item. */
export function ShelfLink({ detail, onChange }: { detail: ItemDetail; onChange: () => Promise<void> | void }) {
  const toast = useToast();
  const { item } = detail;
  const { data } = useLoad(() => api.get<{ books: BookListRow[] }>('/api/books'), [item.shelf_id]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const books = data?.books ?? [];
  const linked = books.find((b) => b.id === item.shelf_id);

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast(done);
      await onChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  if (item.shelf_id)
    return (
      <div className="row between panel line" style={{ padding: '12px 14px' }}>
        <span className="row" style={{ gap: 10 }}>
          {linked && <span className="spine small-spine" style={{ background: spineVar(spineOfRow(linked)) }} aria-hidden="true" />}
          <span>
            <Link to={`/shelf/${item.shelf_id}`} className="serif" style={{ fontSize: 17 }}>
              {linked ? <BookTitle title={linked.title} /> : item.shelf_id}
            </Link>
            {linked && <span className="small muted"> · {bookStatusLabel[linked.status]} · {linked.note_count} note{linked.note_count === 1 ? '' : 's'}</span>}
          </span>
        </span>
        <button type="button" className="btn quiet small" disabled={busy} onClick={() => void act(() => api.put(`/api/items/${item.id}/shelf`, { bookId: null }), 'Unlinked from the shelf')}>
          Unlink
        </button>
      </div>
    );
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 240px' }}>
          <span className="label">A book on the shelf</span>
          <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{books.length ? 'Choose a book…' : 'The shelf is empty'}</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {[b.title.text, b.title.italic].filter(Boolean).join(' ')} · {b.author}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn small" disabled={busy || !pick} onClick={() => void act(() => api.put(`/api/items/${item.id}/shelf`, { bookId: pick }), 'Linked to the shelf')}>
          Link
        </button>
      </div>
      <div className="row">
        <button type="button" className="btn quiet small" disabled={busy} onClick={() => void act(() => api.post(`/api/items/${item.id}/shelf`, {}), 'Put on the shelf and linked')}>
          Or put this book on the shelf
        </button>
        <span className="small muted">Uses this item’s title, author, year and link.</span>
      </div>
    </div>
  );
}
