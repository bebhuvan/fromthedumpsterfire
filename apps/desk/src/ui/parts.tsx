// Shared pieces: the auto-growing text box, voice notes, type picker, checks panel, the flame.

import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { typeLabel, typeSwatch, type ContentType } from '@fdf/shared/tokens';
import { api, type Check, type CheckStatus, type Note } from '../api';
import { useToast } from '../lib/core';

/** A textarea that grows with its text, keeps the caret in view, and saves on Cmd/Ctrl+Enter. */
export function TextArea({ onSubmit, className = '', value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { onSubmit?: () => void; value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      spellCheck
      autoCapitalize="sentences"
      {...rest}
      className={`area ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
          e.preventDefault();
          onSubmit();
        }
        rest.onKeyDown?.(e);
      }}
    />
  );
}

export function Flame({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5c2 3.6 5.5 6 5.5 10.6a5.5 5.5 0 0 1-11 0c0-3.1 1.6-4.7 2.8-6.3.4 2 1.2 2.8 2 3.1 0-2.7 0-5 .7-7.4z" fill="var(--ember)" />
      <path d="M12 12.5c1.2 1.6 2.4 2.4 2.4 4a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2 1.2-2.8.4.8.8 1.2 1.2 1.2z" fill="var(--bg)" />
    </svg>
  );
}

export const CONTENT_TYPES = Object.keys(typeSwatch) as ContentType[];

/**
 * What each type means, in the editor's terms. The public label (typeLabel) is shorter; the type
 * itself only decides the printed form the piece gets on the site and in the app.
 */
export const deskTypeLabel: Record<ContentType, string> = {
  essay: 'Article or essay',
  post: 'Blog post or newsletter',
  talk: 'Talk or lecture',
  video: 'Video',
  podcast: 'Podcast or interview',
  paper: 'Paper or report',
  poem: 'Poem',
  passage: 'Passage from a book',
  rhymes: 'Rhymes (then and now)',
  'rabbit-hole': 'Rabbit hole (Wikipedia)',
  quote: 'Quotation (printed as an epigraph)',
  letter: 'Letter (printed as the letter itself: dateline, salutation, close)',
  speech: 'Speech (printed as a transcript)',
  social: 'Post on X, Bluesky, Substack Notes… (printed as a clipping, never the platform’s embed)',
  image: 'Picture, artwork or meme (printed as a mounted print)',
  book: 'Book (printed as its jacket)',
  tool: 'Tool or app (printed as a specimen label)',
};

/** How each type is printed, so the choice reads as a layout decision. */
export const deskTypeForm: Record<ContentType, string> = {
  essay: 'Printed as a magazine opening: title, your note, the excerpt pulled out.',
  post: 'Printed as a magazine opening: title, your note, the excerpt pulled out.',
  talk: 'Printed as a transcript: the speaker, your note and the machine as turns.',
  video: 'Printed as a transcript, with a link to the video.',
  podcast: 'Printed as a transcript, with a link to the episode.',
  paper: 'Printed as an offprint: abstract, notes and references.',
  poem: 'Printed as a broadside: the poem set large, line breaks kept.',
  passage: 'Printed as a page from the book.',
  rhymes: 'Printed as facing pages: then and now.',
  'rabbit-hole': 'Printed as a catalogue card.',
  quote: 'Printed as an epigraph: the line set large, who said it and when beneath.',
  letter: 'Printed as the letter itself: dateline and place, salutation, the text, the close. Add who it was to below.',
  speech: 'Printed as a transcript of the speech, with where and when it was given.',
  social: 'Printed as a clipping of the post, quoted whole with the handle and date. Never the platform’s embed.',
  image: 'Printed as a mounted print: the picture large, its credit and licence beneath. Add the picture below.',
  book: 'Printed as its jacket: title, author, year, your note on the flap.',
  tool: 'Printed as a specimen label: what it is, what it does, your note.',
};

export function TypeSelect({ value, onChange, className = 'select' }: { value: ContentType; onChange: (t: ContentType) => void; className?: string }) {
  // Rhymes are made with their own button; offer the type only to an item that already is one.
  const types = CONTENT_TYPES.filter((t) => t !== 'rhymes' || value === 'rhymes');
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value as ContentType)} aria-label="Type">
      {types.map((t) => (
        <option key={t} value={t}>
          {deskTypeLabel[t] ?? typeLabel[t]}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------- voice notes

/**
 * AAC in MP4 first: it plays on iOS and Android, so the note can be published to both. WebM/Ogg
 * (Opus) are the fallback; they play on Android only and the Desk marks them so.
 */
export const RECORDER_TYPES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4;codecs=aac', 'audio/aac', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

function pickMime(): string {
  for (const m of RECORDER_TYPES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';
}

const IOS_FORMATS = new Set(['m4a', 'mp3', 'wav']);

/** "Android only" for a note whose format iOS cannot play (it still publishes). */
export function FormatBadge({ format }: { format?: string | null }) {
  if (!format) return null;
  return IOS_FORMATS.has(format) ? (
    <span className="badge" title="Plays on iOS and Android">{format}</span>
  ) : (
    <span className="badge warn" title="iOS cannot play this recording. It still publishes; iPhone readers will not see the play button. Record in Safari or upload an m4a or mp3 to fix.">
      {format} · Android only
    </span>
  );
}

/**
 * Record (or upload) a voice note. The server transcribes it with Whisper and cleans it
 * deletion-only; `onNote` receives both versions.
 */
export function VoiceNote({ target, itemId, haulId, onNote, label = 'Voice note' }: { target: string; itemId?: string; haulId?: string; onNote: (n: Note) => void; label?: string }) {
  const toast = useToast();
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const chunks = useRef<Blob[]>([]);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rec]);

  async function upload(blob: Blob, name: string) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, name);
      fd.append('target', target);
      if (itemId) fd.append('itemId', itemId);
      if (haulId) fd.append('haulId', haulId);
      const { note } = await api.post<{ note: Note }>('/api/notes', fd);
      onNote(note);
    } catch (e) {
      toast(`Voice note failed: ${e instanceof Error ? e.message : e}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = r.mimeType || 'audio/webm';
        void upload(new Blob(chunks.current, { type }), `note.${type.includes('mp4') || type.includes('aac') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`);
      };
      r.start(1000);
      setSecs(0);
      setRec(r);
    } catch {
      toast('Microphone unavailable. Upload an audio file instead.', true);
    }
  }

  function stop() {
    rec?.stop();
    setRec(null);
  }

  if (busy) return <span className="row small muted spin"><span className="progress-dot" /> Transcribing…</span>;
  return (
    <span className="row">
      {rec ? (
        <button type="button" className="btn small" onClick={stop}>
          <span className="rec-dot" aria-hidden="true" /> Stop · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
        </button>
      ) : (
        <button type="button" className="btn small" onClick={start}>
          {label}
        </button>
      )}
      {!rec && (
        <>
          <button type="button" className="btn quiet small" onClick={() => file.current?.click()}>
            Upload audio
          </button>
          <input
            ref={file}
            type="file"
            accept="audio/*,.m4a,.mp3,.ogg,.opus,.webm,.wav"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f, f.name);
              e.target.value = '';
            }}
          />
        </>
      )}
    </span>
  );
}

/** As spoken / as it will print, with what the cleanup removed. */
export function NoteCompare({ note, onUse }: { note: Note; onUse?: (text: string) => void }) {
  const deleted = (() => {
    try {
      return JSON.parse(note.deleted_words ?? '[]') as string[];
    } catch {
      return [];
    }
  })();
  return (
    <div className="voice">
      <div className="panel plate">
        <div className="row between">
          <div className="label">Your voice note{note.seconds ? ` · ${Math.floor(note.seconds / 60)}:${String(Math.round(note.seconds % 60)).padStart(2, '0')}` : ''} · as spoken</div>
          <FormatBadge format={note.format} />
        </div>
        <p className="muted">{note.transcript_raw || '(no speech found)'}</p>
        <audio controls preload="none" src={`/api/notes/${note.id}/audio`} style={{ width: '100%', marginTop: 10 }} />
      </div>
      <div className="panel line">
        <div className="label ink">As it will print</div>
        <p style={{ fontStyle: 'italic' }}>{note.transcript_clean}</p>
        <p className="machine small" style={{ fontFamily: 'var(--sans)', fontStyle: 'normal' }}>
          {deleted.length ? `Removed ${deleted.length} filler${deleted.length === 1 ? '' : 's'} (${deleted.slice(0, 6).join(', ')}${deleted.length > 6 ? '…' : ''}) and fixed punctuation.` : 'Punctuation only.'} Nothing reworded.
        </p>
        {onUse && note.transcript_clean && (
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn small primary" onClick={() => onUse(note.transcript_clean!)}>
              Use these words
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- checks

const MARK: Record<CheckStatus, string> = { pass: '✓', warn: '◦', fail: '✕' };
const ORDER = ['why', 'links', 'quotes', 'citations', 'style', 'drafting'];
const NAMES: Record<string, string> = { why: 'Your note', links: 'Links', quotes: 'Quotes', citations: 'Citations', style: 'Style', drafting: 'Drafting' };

export function ChecksPanel({ checks, onRecheck, busy }: { checks: Check[]; onRecheck?: () => void; busy?: boolean }) {
  const sorted = [...checks].sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
  const allGood = sorted.length > 0 && sorted.every((c) => c.status !== 'fail');
  return (
    <section className={`checks${allGood && sorted.every((c) => c.status === 'pass') ? ' allgood' : ''}`} aria-label="Checks">
      <div className="row between">
        <div className="label ink">Checks before this item can ship</div>
        {onRecheck && (
          <button type="button" className="btn quiet small" onClick={onRecheck} disabled={busy}>
            {busy ? 'Checking…' : 'Check again'}
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="small muted">Checks run when the machine has finished reading.</p>
      ) : (
        <ul>
          {sorted.map((c) => (
            <li key={c.name}>
              <span className={`mk ${c.status}`} aria-label={c.status}>
                {MARK[c.status]}
              </span>
              <span>
                <strong style={{ fontWeight: 600 }}>{NAMES[c.name] ?? c.name}</strong> · {c.detail.summary}
                {c.detail.rows && c.detail.rows.some((r) => r.status !== 'pass') && (
                  <details>
                    <summary>Details</summary>
                    {c.detail.rows.map((r, i) => (
                      <div key={i}>
                        <span className={`mk ${r.status}`}>{MARK[r.status]}</span> {r.label}
                        {r.detail ? `: ${r.detail}` : ''}
                      </div>
                    ))}
                  </details>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Spinner({ text }: { text: string }) {
  return (
    <span className="row small muted spin">
      <span className="progress-dot" /> {text}
    </span>
  );
}
