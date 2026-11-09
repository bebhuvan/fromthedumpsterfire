// The inbox: one capture box for everything, and the tray of items waiting on the editor.

import { useEffect, useMemo, useRef, useState } from 'react';
import { detectText, detectUrl, extractUrls } from '@fdf/shared/detect';
import type { ContentType } from '@fdf/shared/tokens';
import { api, displayTitle, parseChecks, type Captured, type Note, type TrayItem } from '../api';
import { Link, navigate, timeAgo, useKeys, useLoad, usePoll, useToast } from '../lib/core';
import { safeGet, safeSet } from '../theme';
import { deskTypeLabel, NoteCompare, TextArea, VoiceNote } from '../ui/parts';

export function Tray() {
  const [view, setView] = useState<'tray' | 'archived'>('tray');
  const [refresh, setRefresh] = useState(0);
  return (
    <div className="desk-grid">
      <div className="stack" style={{ gap: 18 }}>
        <div>
          <div className="label">Capture</div>
          <h1 className="display" style={{ fontSize: 'clamp(30px, 4vw, 40px)', margin: '6px 0 0' }}>
            What did you pull out <i>of the fire?</i>
          </h1>
        </div>
        <Capture onCaptured={() => setRefresh((n) => n + 1)} />
        <div className="row">
          <NewRhyme />
        </div>
        <p className="kbd-help">
          Paste a link anywhere on the Desk to capture it. <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> saves. <kbd>J</kbd> <kbd>K</kbd> move through the tray, <kbd>Enter</kbd> opens.
        </p>
      </div>
      <div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="tray-tabs" role="group" aria-label="Show">
            <button type="button" aria-pressed={view === 'tray'} onClick={() => setView('tray')}>
              Tray
            </button>
            <button type="button" aria-pressed={view === 'archived'} onClick={() => setView('archived')}>
              Archived
            </button>
          </div>
        </div>
        <TrayList view={view} refresh={refresh} keyboard />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- rhymes

function NewRhyme() {
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn small"
      data-type="rhymes"
      style={{ background: 'var(--type)', borderColor: 'transparent' }}
      onClick={async () => {
        try {
          const r = await api.post<{ item: { id: string } }>('/api/rhymes', {});
          navigate(`/item/${r.item.id}`);
        } catch (e) {
          toast(e instanceof Error ? e.message : String(e), true);
        }
      }}
    >
      New rhyme: then and now
    </button>
  );
}

// ---------------------------------------------------------------- capture

interface Pending {
  url?: string;
  text?: string;
  type: ContentType;
  auto: ContentType;
}

function useLocal(key: string): [string, (v: string) => void] {
  const [v, setV] = useState(() => safeGet(`desk:draft:${key}`) ?? '');
  return [
    v,
    (nv: string) => {
      setV(nv);
      safeSet(`desk:draft:${key}`, nv);
    },
  ];
}

export function Capture({ onCaptured }: { onCaptured: () => void }) {
  const toast = useToast();
  const [text, setText] = useLocal('capture');
  const [why, setWhy] = useLocal('capture-why');
  const [source, setSource] = useLocal('capture-source');
  const [sourceUrl, setSourceUrl] = useLocal('capture-source-url');
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  // On a phone the capture box starts as one paste field; the rest opens once there is something to capture.
  const [focused, setFocused] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // A voice note shared from another app arrives as ?note=id.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('note');
    if (id) {
      api.get<{ note: Note }>(`/api/notes/${id}`).then((r) => setNote(r.note), () => {});
      navigate('/', true);
    }
  }, []);

  useKeys({ c: () => boxRef.current?.focus() });

  const pending: Pending[] = useMemo(() => {
    const t = text.trim();
    if (!t) return [];
    const urls = extractUrls(t);
    const rest = urls.reduce((s, u) => s.split(u).join(' '), t).replace(/[\s,;•*\-–—\d.)]+/g, ' ').trim();
    if (urls.length && rest.length < 40) return urls.map((url) => {
      const auto = detectUrl(url).type;
      return { url, auto, type: auto };
    });
    const auto = detectText(t).type;
    return [{ text: t, auto, type: auto }];
  }, [text]);

  const isPassage = pending.length === 1 && pending[0]!.text !== undefined;

  async function submit() {
    if (!pending.length || busy) return;
    setBusy(true);
    try {
      const entries = pending.map((p) =>
        p.url
          ? { url: p.url, type: p.type !== p.auto ? p.type : undefined, why: why || undefined, whyNoteId: note?.id }
          : { text: p.text, type: p.type, source: source || undefined, sourceUrl: sourceUrl || undefined, why: why || undefined, whyNoteId: note?.id },
      );
      const r = await api.post<{ captured: Captured[] }>('/api/capture', { entries });
      const dup = r.captured.filter((c) => c.duplicateOf).length;
      toast(`Captured ${r.captured.length - dup}${dup ? `; ${dup} already in the tray` : ''}`);
      setText('');
      setWhy('');
      setSource('');
      setSourceUrl('');
      setNote(null);
      onCaptured();
      if (r.captured.length === 1 && r.captured[0]!.id) navigate(`/item/${r.captured[0]!.id}`);
    } catch (e) {
      toast(`Not captured: ${e instanceof Error ? e.message : e}. Your text is kept.`, true);
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = [...files];
    if (!list.length) return;
    const audio = list.filter((f) => f.type.startsWith('audio/'));
    const docs = list.filter((f) => !f.type.startsWith('audio/'));
    if (audio.length) toast('Audio goes in as a voice note: use the voice note button.');
    if (!docs.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      docs.forEach((f) => fd.append('file', f));
      if (why) fd.append('why', why);
      if (note) fd.append('whyNoteId', note.id);
      const r = await api.post<{ captured: Captured[] }>('/api/capture/file', fd);
      const bad = r.captured.filter((c) => c.error);
      bad.forEach((b) => toast(b.error!, true));
      const ok = r.captured.length - bad.length;
      if (ok) {
        toast(`Uploaded ${ok} file${ok === 1 ? '' : 's'}`);
        setWhy('');
        setNote(null);
        onCaptured();
      }
    } catch (e) {
      toast(`Upload failed: ${e instanceof Error ? e.message : e}`, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`capture stack${drag ? ' dragging' : ''}${text.trim() || why.trim() || note || focused ? ' open' : ' closed'}`}
      style={{ gap: 14 }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDrag(false);
        void uploadFiles(e.dataTransfer.files);
      }}
    >
      <label className="field">
        <span className="label">Links, or a passage with where it is from</span>
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSubmit={submit}
          placeholder="Paste one link or many. Or a passage, a poem, a paragraph from a book."
          aria-label="Capture"
          autoFocus={!('ontouchstart' in window)}
          onFocus={(e) => ((boxRef.current = e.currentTarget), setFocused(true))}
        />
      </label>

      {pending.length > 0 && (
        <div className="chips" aria-label="What will be captured">
          {pending.map((p, i) => (
            <span key={p.url ?? i} className="chip" data-type={p.type}>
              <span>{p.url ? p.url.replace(/^https?:\/\/(www\.)?/, '') : `${p.text!.split(/\s+/).length} words`}</span>
              <span className="muted">{deskTypeLabel[p.type]}</span>
            </span>
          ))}
          <span className="small muted">The type only sets how a piece is laid out. Change it on the item if it is wrong.</span>
        </div>
      )}

      {isPassage && (
        <div className="row" style={{ alignItems: 'stretch' }}>
          <label className="field" style={{ flex: '2 1 240px' }}>
            <span className="label">Where it is from</span>
            <input className="input serif" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Tagore, Stray Birds, 1916, no. 69" />
          </label>
          <label className="field" style={{ flex: '1 1 200px' }}>
            <span className="label">Link to the original</span>
            <input className="input" type="url" inputMode="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://archive.org/…" />
          </label>
        </div>
      )}

      <label className="field capture-why">
        <span className="label">Why it's here (optional, in your words)</span>
        <TextArea className="editor compact" value={why} onChange={(e) => setWhy(e.target.value)} onSubmit={submit} placeholder="Say it the way you would to a friend." />
      </label>

      {note && <NoteCompare note={note} onUse={(t) => setWhy(why ? `${why}\n\n${t}` : t)} />}

      <div className="row between">
        <div className="row">
          <VoiceNote target="capture" onNote={setNote} />
          <button type="button" className="btn quiet small capture-more" onClick={() => fileRef.current?.click()}>
            Add PDF or page photo
          </button>
          <input ref={fileRef} type="file" hidden multiple accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/heic" onChange={(e) => e.target.files && void uploadFiles(e.target.files)} />
        </div>
        <button type="button" className="btn primary capture-go" onClick={submit} disabled={!pending.length || busy}>
          {busy ? 'Capturing…' : pending.length > 1 ? `Capture ${pending.length}` : 'Capture'} <kbd>⌘↵</kbd>
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the tray

const IN_FLIGHT = /queued|fetching|reading|drafting|checking/;

export function statusText(i: Pick<TrayItem, 'status' | 'status_detail' | 'has_excerpt' | 'kept_ideas' | 'has_why' | 'checks' | 'haul_number' | 'standing'>): { text: string; tone: '' | 'warn' | 'bad' } {
  if (i.status === 'failed') return { text: `Failed: ${(i.status_detail ?? '').slice(0, 80)}`, tone: 'bad' };
  if (i.status === 'paused') return { text: 'Paused at the spend ceiling', tone: 'warn' };
  if (IN_FLIGHT.test(i.status)) return { text: i.status_detail ?? `${i.status[0]!.toUpperCase()}${i.status.slice(1)}…`, tone: '' };
  const checks = parseChecks(i.checks);
  if (i.haul_number) return { text: i.standing?.text ?? `In Haul ${i.haul_number}`, tone: '' };
  if (checks.links === 'fail') return { text: 'A link failed to resolve', tone: 'warn' };
  const todo = [!i.has_why && 'your note', !i.has_excerpt && !i.kept_ideas && 'an excerpt'].filter(Boolean);
  if (todo.length) return { text: `Needs ${todo.join(' and ')}`, tone: 'warn' };
  return { text: 'Ready for a Haul', tone: '' };
}

export function TrayList({ view = 'tray', refresh = 0, selected, keyboard = false }: { view?: string; refresh?: number; selected?: string; keyboard?: boolean }) {
  const { data, reload } = useLoad(() => api.get<{ items: TrayItem[] }>(`/api/items?view=${view}`), [view, refresh]);
  const items = data?.items ?? [];
  const [cursor, setCursor] = useState(0);
  usePoll(reload, items.some((i) => IN_FLIGHT.test(i.status)), 4000);
  useEffect(() => {
    const h = () => void reload();
    window.addEventListener('desk:captured', h);
    return () => window.removeEventListener('desk:captured', h);
  }, [reload]);

  const groups = useMemo(() => {
    const g: Array<{ name: string; items: TrayItem[] }> = [
      { name: 'Waiting on you', items: [] },
      { name: 'Being read', items: [] },
      { name: 'Needs attention', items: [] },
      { name: 'In a Haul, not yet published', items: [] },
      { name: 'Published', items: [] },
    ];
    for (const i of items) {
      if (i.standing?.state === 'published') g[4]!.items.push(i);
      else if (i.haul_number) g[3]!.items.push(i);
      else if (IN_FLIGHT.test(i.status)) g[1]!.items.push(i);
      else if (i.status === 'failed' || i.status === 'paused') g[2]!.items.push(i);
      else g[0]!.items.push(i);
    }
    return g.filter((x) => x.items.length);
  }, [items]);
  const flat = groups.flatMap((g) => g.items);

  useKeys(
    keyboard || selected
      ? {
          j: () => {
            if (selected) {
              const k = flat.findIndex((x) => x.id === selected);
              const n = flat[Math.min(flat.length - 1, k + 1)];
              if (n) navigate(`/item/${n.id}`, true);
            } else setCursor((c) => Math.min(flat.length - 1, c + 1));
          },
          k: () => {
            if (selected) {
              const k = flat.findIndex((x) => x.id === selected);
              const n = flat[Math.max(0, k - 1)];
              if (n) navigate(`/item/${n.id}`, true);
            } else setCursor((c) => Math.max(0, c - 1));
          },
          Enter: () => {
            const n = flat[cursor];
            if (!selected && n) navigate(`/item/${n.id}`);
          },
        }
      : {},
    [flat, cursor, selected],
  );

  if (!data) return <p className="tray-empty">Opening the tray…</p>;
  if (!items.length) return <p className="tray-empty">{view === 'archived' ? 'Nothing archived.' : 'The tray is empty. Paste something you found.'}</p>;
  let idx = -1;
  return (
    <div>
      {groups.map((g) => (
        <div key={g.name}>
          <div className="label tray-group">
            {g.name} · {g.items.length}
          </div>
          <ul className="tray">
            {g.items.map((i) => {
              idx++;
              const st = statusText(i);
              const current = selected ? i.id === selected : keyboard && idx === cursor;
              return (
                <li key={i.id}>
                  <Link to={`/item/${i.id}`} data-type={i.type} aria-current={current ? 'true' : undefined}>
                    <span className="tray-title">{displayTitle(i)}</span>
                    <span className="tray-meta">
                      <span className="dot">{deskTypeLabel[i.type] ?? i.type}</span>
                      {i.source_name && <span>{i.source_name}</span>}
                      <span className={st.tone}>{st.text}</span>
                      {!selected && <span>{timeAgo(i.captured_at)}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
