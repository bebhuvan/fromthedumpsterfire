// One book on the shelf: where it stands (with its dates), the editor's notes newest first with an
// Add note box (typed or dictated; dictation goes through the voice-note path and is never reworded),
// the lines copied from the page, the cover with its credit, its details, and the Haul items that
// point to it. The editor's words in serif.

import { useState } from 'react';
import { bookStatusLabel, SPINES, type BookStatus, type Spine } from '@fdf/shared/shelf';
import { api, displayTitle, type BookDetail, type BookLineUi, type BookNoteUi, type Note } from '../api';
import { Link, navigate, safeHref, useLoad, useToast } from '../lib/core';
import { FormatBadge, NoteCompare, TextArea, VoiceNote } from '../ui/parts';
import { PictureForm } from './Blocks';
import { BookTitle, shortDate, spineOfRow, spineVar, StatusSwitch } from './Shelf';

/** Today in India time, as an ISO date (the default for a note's day). */
const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const words = (s: string) => (s.match(/\S+/g) ?? []).length;
const LINE_WORDS = 60;

type Act = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;

export function BookPage({ id }: { id: string }) {
  const toast = useToast();
  const { data, error, reload, setData } = useLoad(() => api.get<BookDetail>(`/api/books/${id}`), [id]);
  const [busy, setBusy] = useState(false);

  /** Run a change; a route that answers with the book's detail replaces it, others reload. */
  const act: Act = async (fn, done) => {
    setBusy(true);
    try {
      const r = (await fn()) as Partial<BookDetail> & { warning?: string | null };
      if (r && r.book && r.notes && r.lines && r.items) setData(r as BookDetail);
      else await reload();
      if (r?.warning) toast(r.warning, true);
      else if (done) toast(done);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="tray-empty">Could not open this book: {error}</p>;
  if (!data) return <p className="tray-empty">Opening…</p>;
  const { book } = data;
  const patch = (b: Record<string, unknown>, done?: string) => act(() => api.patch(`/api/books/${id}`, b), done);

  return (
    <div className="book-page">
      <header className="book-head">
        <span className="spine tall" style={{ background: spineVar(spineOfRow(book)) }} aria-hidden="true" />
        <div style={{ minWidth: 0 }}>
          <Link to="/shelf" className="label">
            ← Shelf · {bookStatusLabel[book.status]}
          </Link>
          <h1 className="display">
            <BookTitle title={book.title} />
          </h1>
          <div className="serif" style={{ fontSize: 19, fontStyle: 'italic', marginTop: 6 }}>
            {book.author}
            {book.year != null ? `, ${book.year}` : ''}
          </div>
        </div>
      </header>

      <div className="book-cols">
        <div className="steps">
          <section className="section" aria-label="Where it stands">
            <h2 className="h2">Where it stands</h2>
            <StatusSwitch value={book.status} disabled={busy} onChange={(s: BookStatus) => void patch({ status: s }, s === 'read' ? 'Marked read; finished today unless you change it' : `Marked ${bookStatusLabel[s].toLowerCase()}`)} />
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <DateField key={`s-${book.started}`} label="Started" value={book.started} onSave={(v) => void patch({ started: v })} />
              {(book.status !== 'reading' || book.finished) && <DateField key={`f-${book.finished}`} label={book.status === 'put-down' ? 'Finished (if ever)' : 'Finished'} value={book.finished} onSave={(v) => void patch({ finished: v })} />}
            </div>
          </section>

          <section className="section" aria-label="Notes">
            <h2 className="h2">Notes</h2>
            <p className="small muted step-hint">Your words, typed or dictated, each with its day. Newest first. Never reworded.</p>
            <AddNote bookId={id} act={act} />
            {data.notes.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>No notes yet.</p>
            ) : (
              <ol className="book-notes">
                {data.notes.map((n) => (
                  <BookNoteRow key={`${n.id}-${n.text.length}-${n.date}`} note={n} act={act} />
                ))}
              </ol>
            )}
          </section>

          <section className="section" aria-label="Lines from the book">
            <h2 className="h2">Lines from the book</h2>
            <p className="small muted step-hint">Copied out from the page by you, with where they are. A line is a sentence or two.</p>
            <Lines bookId={id} lines={data.lines} act={act} />
          </section>
        </div>

        <aside className="steps book-side">
          <section className="section" aria-label="Cover">
            <h2 className="h2">Cover</h2>
            <Cover detail={data} act={act} />
          </section>

          <section className="section" aria-label="In Hauls">
            <h2 className="h2">In Hauls</h2>
            {data.items.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>No Haul item points here yet. Link one from a Book item’s page.</p>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 6 }}>
                {data.items.map((it) => (
                  <li key={it.id} className="small">
                    <Link to={`/item/${it.id}`} className="serif" style={{ fontSize: 16 }}>
                      {displayTitle(it)}
                    </Link>
                    <span className="muted"> · {it.haul_number ? `Haul ${String(it.haul_number).padStart(3, '0')}, ${it.haul_status === 'published' ? 'published' : 'draft'}` : 'not in a Haul yet'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section" aria-label="Details">
            <h2 className="h2">Details</h2>
            <Details detail={data} patch={patch} />
          </section>

          <DeleteBook id={id} title={[book.title.text, book.title.italic].filter(Boolean).join(' ')} busy={busy} />
        </aside>
      </div>
    </div>
  );
}

function DateField({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string) => void }) {
  return (
    <label className="field" style={{ flex: '0 1 180px' }}>
      <span className="label">{label}</span>
      <input
        className="input num"
        type="date"
        defaultValue={value ?? ''}
        max="2100-12-31"
        onBlur={(e) => {
          if (e.target.value !== (value ?? '')) onSave(e.target.value);
        }}
      />
    </label>
  );
}

// ---------------------------------------------------------------- notes

function AddNote({ bookId, act }: { bookId: string; act: Act }) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(todayIst());
  const [at, setAt] = useState('');
  const [voice, setVoice] = useState<Note | null>(null);
  const [used, setUsed] = useState(false);
  const [publishAudio, setPublishAudio] = useState(false);

  async function save() {
    const ok = await act(
      () => api.post(`/api/books/${bookId}/notes`, { text: text.trim(), date, ...(at.trim() ? { at: at.trim() } : {}), ...(voice && used ? { noteId: voice.id, publishAudio } : {}) }),
      'Note added',
    );
    if (ok) {
      setText('');
      setAt('');
      setVoice(null);
      setUsed(false);
      setPublishAudio(false);
    }
  }

  return (
    <div className="panel line stack add-note" style={{ gap: 10 }}>
      <TextArea className="editor compact" value={text} onChange={(e) => setText(e.target.value)} onSubmit={() => text.trim() && void save()} placeholder="What you made of it today." aria-label="A new note" />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '0 1 170px' }}>
          <span className="label">Day</span>
          <input className="input num" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field" style={{ flex: '1 1 140px' }}>
          <span className="label">Where in the book</span>
          <input className="input" value={at} onChange={(e) => setAt(e.target.value)} placeholder="p. 112" />
        </label>
      </div>
      <div className="row between">
        <VoiceNote target="book" label="Dictate" onNote={(n) => (setVoice(n), setUsed(false))} />
        <button type="button" className="btn primary small" disabled={!text.trim() || !date} onClick={() => void save()}>
          Add note
        </button>
      </div>
      {voice && (
        <>
          <NoteCompare
            note={voice}
            onUse={(t) => {
              setText((cur) => (cur.trim() ? `${cur.trim()}\n\n${t}` : t));
              setUsed(true);
            }}
          />
          {used && (
            <label className="row small muted">
              <input type="checkbox" checked={publishAudio} onChange={(e) => setPublishAudio(e.target.checked)} /> Publish the recording with this note
              <FormatBadge format={voice.format} />
            </label>
          )}
        </>
      )}
    </div>
  );
}

function BookNoteRow({ note, act }: { note: BookNoteUi; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [date, setDate] = useState(note.date);
  const [at, setAt] = useState(note.at ?? '');
  if (editing)
    return (
      <li className="book-note editing">
        <TextArea className="editor compact" value={text} onChange={(e) => setText(e.target.value)} aria-label="The note" />
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '0 1 170px' }}>
            <span className="label">Day</span>
            <input className="input num" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field" style={{ flex: '1 1 140px' }}>
            <span className="label">Where in the book</span>
            <input className="input" value={at} onChange={(e) => setAt(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button type="button" className="btn primary small" disabled={!text.trim()} onClick={() => void act(() => api.patch(`/api/book-notes/${note.id}`, { text, date, at }), 'Note saved').then((ok) => ok && setEditing(false))}>
            Save
          </button>
          <button type="button" className="btn quiet small" onClick={() => (setEditing(false), setText(note.text), setDate(note.date), setAt(note.at ?? ''))}>
            Cancel
          </button>
        </div>
      </li>
    );
  return (
    <li className="book-note">
      <div className="book-note-head">
        <span className="label num">{shortDate(note.date)}</span>
        {note.at && <span className="small muted">{note.at}</span>}
      </div>
      <p className="book-note-text">{note.text}</p>
      {note.audio && (
        <div className="stack" style={{ gap: 6 }}>
          <audio controls preload="none" src={note.audio} style={{ width: '100%' }} />
          <label className="row small muted">
            <input type="checkbox" checked={!!note.publish_audio} onChange={(e) => void act(() => api.patch(`/api/book-notes/${note.id}`, { publishAudio: e.target.checked }), e.target.checked ? 'The recording will publish with it' : 'The recording stays on the Desk')} /> Publish
            the recording with it
            <FormatBadge format={note.format} />
          </label>
        </div>
      )}
      <div className="row">
        <button type="button" className="btn quiet small" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" className="btn quiet small danger" onClick={() => confirm('Delete this note?') && void act(() => api.del(`/api/book-notes/${note.id}`), 'Note deleted')}>
          Delete
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- lines

function Lines({ bookId, lines, act }: { bookId: string; lines: BookLineUi[]; act: Act }) {
  const [text, setText] = useState('');
  const [locator, setLocator] = useState('');
  const n = words(text);
  const move = (i: number, d: -1 | 1) => {
    const ids = lines.map((l) => l.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void act(() => api.put(`/api/books/${bookId}/lines/order`, { ids }));
  };
  return (
    <>
      {lines.length > 0 && (
        <ol className="book-lines">
          {lines.map((l, i) => (
            <LineRow key={`${l.id}-${l.text.length}-${l.locator}`} line={l} first={i === 0} last={i === lines.length - 1} onMove={(d) => move(i, d)} act={act} />
          ))}
        </ol>
      )}
      <div className="panel line stack" style={{ gap: 10 }}>
        <TextArea className="compact" value={text} onChange={(e) => setText(e.target.value)} placeholder="A line as the book prints it." aria-label="A line from the book" />
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 140px' }}>
            <span className="label">Where it is</span>
            <input className="input" value={locator} onChange={(e) => setLocator(e.target.value)} placeholder="p. 4" />
          </label>
          <button
            type="button"
            className="btn small"
            disabled={!text.trim()}
            onClick={() =>
              void act(() => api.post(`/api/books/${bookId}/lines`, { text: text.trim(), ...(locator.trim() ? { locator: locator.trim() } : {}) }), 'Line added').then((ok) => {
                if (ok) {
                  setText('');
                  setLocator('');
                }
              })
            }
          >
            Add line
          </button>
        </div>
        {text.trim() && (
          <span className={`small ${n > LINE_WORDS ? 'warn' : 'muted'}`}>
            {n} word{n === 1 ? '' : 's'}
            {n > LINE_WORDS ? `. Past about ${LINE_WORDS} words a line reads as a passage; it still saves.` : ''}
          </span>
        )}
      </div>
    </>
  );
}

function LineRow({ line, first, last, onMove, act }: { line: BookLineUi; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(line.text);
  const [locator, setLocator] = useState(line.locator ?? '');
  if (editing)
    return (
      <li className="book-line editing">
        <TextArea className="compact" value={text} onChange={(e) => setText(e.target.value)} aria-label="The line" />
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 140px' }}>
            <span className="label">Where it is</span>
            <input className="input" value={locator} onChange={(e) => setLocator(e.target.value)} />
          </label>
          <button type="button" className="btn primary small" disabled={!text.trim()} onClick={() => void act(() => api.patch(`/api/book-lines/${line.id}`, { text, locator }), 'Line saved').then((ok) => ok && setEditing(false))}>
            Save
          </button>
          <button type="button" className="btn quiet small" onClick={() => (setEditing(false), setText(line.text), setLocator(line.locator ?? ''))}>
            Cancel
          </button>
        </div>
      </li>
    );
  return (
    <li className="book-line">
      <blockquote className="book-line-text">{line.text}</blockquote>
      <div className="row between">
        <span className="small muted">
          {line.locator ?? ''}
          {line.warning && <span className="warn">{line.locator ? ' · ' : ''}{words(line.text)} words, long for a line</span>}
        </span>
        <span className="row" style={{ gap: 2 }}>
          <button type="button" className="btn quiet small" aria-label="Move up" disabled={first} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" className="btn quiet small" aria-label="Move down" disabled={last} onClick={() => onMove(1)}>
            ↓
          </button>
          <button type="button" className="btn quiet small" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="btn quiet small danger" onClick={() => confirm('Delete this line?') && void act(() => api.del(`/api/book-lines/${line.id}`), 'Line deleted')}>
            Delete
          </button>
        </span>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- cover

function Cover({ detail, act }: { detail: BookDetail; act: Act }) {
  const { book } = detail;
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [caption, setCaption] = useState(book.cover_caption ?? '');
  if (!book.cover || replacing)
    return (
      <div className="stack" style={{ gap: 8 }}>
        <p className="small muted" style={{ margin: 0 }}>
          Your own photograph of the book, or the jacket from the publisher. Name who made it and where you found it, as for any picture.
        </p>
        <PictureForm
          busy={busy}
          setBusy={setBusy}
          endpoint={`/api/books/${book.id}/cover`}
          submitLabel="Use as the cover"
          doneToast="The cover is set, with its credit"
          onDone={async () => {
            await act(() => api.get(`/api/books/${book.id}`));
            setReplacing(false);
          }}
        />
        {replacing && (
          <button type="button" className="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={() => setReplacing(false)}>
            Keep the current cover
          </button>
        )}
      </div>
    );
  const source = safeHref(book.cover_source_url);
  return (
    <figure className="cover-figure">
      <img src={book.cover} alt={`The cover of ${[book.title.text, book.title.italic].filter(Boolean).join(' ')}`} width={book.cover_width ?? undefined} height={book.cover_height ?? undefined} />
      <figcaption className="stack" style={{ gap: 8 }}>
        <span className="small">
          {[[book.cover_creator, book.cover_date].filter(Boolean).join(', '), book.cover_credit !== book.cover_creator ? book.cover_credit : null].filter(Boolean).join(' · ')} · <span className="licence">{book.cover_licence}</span>
          {source && (
            <>
              {' · '}
              <a href={source} target="_blank" rel="noreferrer noopener">
                where it came from ↗
              </a>
            </>
          )}
        </span>
        <label className="field">
          <span className="label">Caption (your words, optional)</span>
          <input className="input serif" value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={() => caption !== (book.cover_caption ?? '') && void act(() => api.patch(`/api/books/${book.id}/cover`, { caption }), 'Caption saved')} placeholder="My copy, a little foxed." />
        </label>
        <span className="row">
          <button type="button" className="btn quiet small" onClick={() => setReplacing(true)}>
            Replace the cover
          </button>
          <button type="button" className="btn quiet small danger" onClick={() => confirm('Remove the cover?') && void act(() => api.del(`/api/books/${book.id}/cover`), 'Cover removed')}>
            Remove
          </button>
        </span>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- details

function Details({ detail, patch }: { detail: BookDetail; patch: (b: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const { book } = detail;
  const text = (k: 'author' | 'publisher' | 'url', label: string, ph: string, flex = '1 1 200px') => (
    <label className="field" style={{ flex }}>
      <span className="label">{label}</span>
      <input
        key={`${k}-${book[k] ?? ''}`}
        className="input"
        type={k === 'url' ? 'url' : 'text'}
        inputMode={k === 'url' ? 'url' : undefined}
        defaultValue={book[k] ?? ''}
        placeholder={ph}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v === (book[k] ?? '')) return;
          void patch({ [k]: k === 'author' ? v : v || (k === 'url' ? '' : null) }, 'Saved');
        }}
      />
    </label>
  );
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '2 1 200px' }}>
          <span className="label">Title</span>
          <input key={`t-${book.title_text}`} className="input serif" defaultValue={book.title_text} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== book.title_text && void patch({ title: { text: e.target.value.trim(), italic: book.title_italic ?? '' } }, 'Saved')} />
        </label>
        <label className="field" style={{ flex: '1 1 140px' }}>
          <span className="label">Italic end</span>
          <input key={`i-${book.title_italic}`} className="input serif" style={{ fontStyle: 'italic' }} defaultValue={book.title_italic ?? ''} onBlur={(e) => e.target.value.trim() !== (book.title_italic ?? '') && void patch({ title: { text: book.title_text, italic: e.target.value.trim() } }, 'Saved')} />
        </label>
      </div>
      <p className="small muted" style={{ margin: '-4px 0 0' }}>
        Its address stays /shelf/{book.id}.
      </p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {text('author', 'Author', 'James C. Scott')}
        <label className="field" style={{ flex: '0 1 110px' }}>
          <span className="label">First published</span>
          <input
            key={`y-${book.year}`}
            className="input num"
            inputMode="numeric"
            defaultValue={book.year ?? ''}
            placeholder="1998"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === String(book.year ?? '')) return;
              if (v && !/^-?\d{1,4}$/.test(v)) return void (e.target.value = String(book.year ?? ''));
              void patch({ year: v ? Number(v) : null }, 'Saved');
            }}
          />
        </label>
      </div>
      {text('publisher', 'Publisher', 'Yale University Press', '1 1 100%')}
      {text('url', 'Where to find it (https)', 'https://openlibrary.org/works/…', '1 1 100%')}
      <div className="field">
        <span className="label">Spine on the shelf</span>
        <div className="swatches spines" role="group" aria-label="Spine colour">
          {SPINES.map((s: Spine) => (
            <button key={s} type="button" title={s} aria-label={s} aria-pressed={spineOfRow(book) === s} style={{ background: spineVar(s) }} onClick={() => void patch({ spine: s }, 'Spine set')} />
          ))}
        </div>
        <span className="small muted">{book.spine ? `Your choice: ${book.spine}.` : `Picked from its address: ${spineOfRow(book)}.`}</span>
      </div>
    </div>
  );
}

function DeleteBook({ id, title, busy }: { id: string; title: string; busy: boolean }) {
  const toast = useToast();
  return (
    <div className="row">
      <button
        type="button"
        className="btn quiet small danger"
        disabled={busy}
        onClick={async () => {
          if (!confirm(`Take ${title} off the shelf for good, with its notes, lines and cover?`)) return;
          try {
            await api.del(`/api/books/${id}`);
            toast('Taken off the shelf');
            navigate('/shelf');
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), true);
          }
        }}
      >
        Take it off the shelf
      </button>
    </div>
  );
}
