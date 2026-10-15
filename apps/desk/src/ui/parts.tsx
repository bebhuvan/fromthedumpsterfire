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

export function TypeSelect({ value, onChange, className = 'select' }: { value: ContentType; onChange: (t: ContentType) => void; className?: string }) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value as ContentType)} aria-label="Content type">
      {CONTENT_TYPES.map((t) => (
        <option key={t} value={t}>
          {typeLabel[t]}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------- voice notes

function pickMime(): string {
  for (const m of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';
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
        void upload(new Blob(chunks.current, { type }), `note.${type.includes('mp4') ? 'm4a' : 'webm'}`);
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
        <div className="label">Your voice note{note.seconds ? ` · ${Math.floor(note.seconds / 60)}:${String(Math.round(note.seconds % 60)).padStart(2, '0')}` : ''} · as spoken</div>
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
