// "Add to this item": pull quotes, code, video, podcasts and audio, X posts, pictures, charts. Each
// addition is checked by the server before it is kept (quotes and code word for word against the
// piece, links resolved by code, a post's words from X's own record, pictures measured and credited); what is added shows as a compact row that can
// be moved or removed. Every string here is rendered as text, never as HTML.

import { useMemo, useState } from 'react';
import { CODE_LANGS, highlightCode } from '@fdf/shared/highlight';
import { api, type BlockUi, type ItemDetail } from '../api';
import { safeHref, useToast } from '../lib/core';
import { TextArea } from '../ui/parts';
import { editionOf, type Edition } from '@fdf/shared/tokens';
import { ChartPreview } from '../lib/charts';
import { ChartEditor } from './ChartEditor';

type Kind = 'quote' | 'code' | 'video' | 'audio' | 'post' | 'image' | 'chart';

const KIND_LABEL: Record<Kind, string> = { quote: 'Pull quote', code: 'Code', video: 'Video', audio: 'Podcast or audio', post: 'X post', image: 'Picture', chart: 'Chart' };

const clock = (s?: number) => (s ? `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}` : '');

/** The Desk's list of an item's blocks, and the forms that add them. */
export function BlocksSection({ detail, onChange }: { detail: ItemDetail; onChange: () => Promise<void> | void }) {
  const toast = useToast();
  const [open, setOpen] = useState<Kind | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The preview's ink: the item's Haul's default edition (its chosen ink, if any, shows at publish).
  const edition = editionOf(detail.haul?.number ?? 1);
  const blocks = detail.blocks ?? [];
  const id = detail.item.id;
  const hasSource = Boolean(detail.source?.text.trim());

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      await onChange();
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const add = async (b: Record<string, unknown>, done: string) => (await run(() => api.post(`/api/items/${id}/blocks`, b), done)) && setOpen(null);
  const move = (i: number, d: number) => {
    const ids = blocks.map((b) => b.id);
    const [x] = ids.splice(i, 1);
    ids.splice(i + d, 0, x!);
    void run(() => api.put(`/api/items/${id}/blocks/order`, { ids }));
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      {blocks.length > 0 && (
        <ol className="blocks" aria-label="Added to this item">
          {blocks.map((b, i) => (
            <li key={b.id} className={b.status === 'cut' ? 'cut' : undefined}>
              <BlockSummary block={b} edition={edition} onEdit={b.kind === 'chart' ? () => (setOpen(null), setEditing(editing === b.id ? null : b.id)) : undefined} />
              <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                <button type="button" className="btn quiet small" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="btn quiet small" aria-label="Move down" disabled={busy || i === blocks.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button
                  type="button"
                  className="btn quiet small"
                  aria-label={`Remove this ${KIND_LABEL[b.kind].toLowerCase()}`}
                  disabled={busy}
                  onClick={() => void run(() => api.del(`/api/blocks/${b.id}`), 'Removed')}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="row add-kinds" role="group" aria-label="Add">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button key={k} type="button" className="btn quiet small" aria-pressed={open === k} onClick={() => setOpen(open === k ? null : k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {open === 'quote' && <QuoteForm busy={busy} hasSource={hasSource} onAdd={(text, locator) => add({ kind: 'quote', text, ...(locator ? { locator } : {}) }, 'Pull quote added. Found word for word.')} />}
      {open === 'code' && <CodeForm busy={busy} hasSource={hasSource} onAdd={(b) => add({ kind: 'code', ...b }, 'Code added. Found in the piece.')} />}
      {open === 'video' && <LinkForm kind="video" busy={busy} onAdd={(b) => add({ kind: 'video', ...b }, 'Video added')} />}
      {open === 'audio' && <LinkForm kind="audio" busy={busy} onAdd={(b) => add({ kind: 'audio', ...b }, 'Recording added')} />}
      {open === 'post' && <PostForm busy={busy} onAdd={(url) => add({ kind: 'post', url }, 'Post added, in X’s own words')} />}
      {open === 'image' && <PictureForm itemId={id} busy={busy} setBusy={setBusy} onDone={async () => (await onChange(), setOpen(null))} />}
      {open === 'chart' && <ChartEditor itemId={id} edition={edition} onCancel={() => setOpen(null)} onDone={async () => (await onChange(), setOpen(null))} />}
      {editing &&
        (() => {
          const b = blocks.find((x) => x.id === editing);
          return b?.body?.kind === 'chart' ? (
            <ChartEditor key={b.id} itemId={id} blockId={b.id} initial={b.body.chart} edition={edition} onCancel={() => setEditing(null)} onDone={async () => (await onChange(), setEditing(null))} />
          ) : null;
        })()}
    </div>
  );
}

function BlockSummary({ block, edition, onEdit }: { block: BlockUi; edition: Edition; onEdit?: () => void }) {
  const b = block.body;
  if (!b) return <span className="small bad">This addition is damaged; remove it.</span>;
  const head = (extra?: string) => (
    <span className="label">
      {KIND_LABEL[b.kind]}
      {extra ? ` · ${extra}` : ''}
      {block.status === 'cut' ? ' · not printed' : ''}
    </span>
  );
  switch (b.kind) {
    case 'quote':
      return (
        <span className="block-sum">
          {head(b.locator)}
          <span className="serif">“{b.text}”</span>
        </span>
      );
    case 'code':
      return (
        <span className="block-sum">
          {head([b.lang ? CODE_LANGS[b.lang] : 'plain text', b.caption].filter(Boolean).join(' · '))}
          <code className="code-line">{b.code.split('\n').slice(0, 2).join('\n')}{b.code.split('\n').length > 2 ? '\n…' : ''}</code>
        </span>
      );
    case 'video':
      return (
        <span className="block-sum with-thumb">
          {block.image ? <img src={block.image} alt="" loading="lazy" /> : <span className="thumb-none" aria-hidden="true" />}
          <span className="stack" style={{ gap: 2 }}>
            {head([b.provider === 'youtube' ? 'YouTube' : 'Vimeo', clock(b.start) && `from ${clock(b.start)}`].filter(Boolean).join(' · '))}
            <a className="serif" href={safeHref(b.link)} target="_blank" rel="noreferrer noopener">
              {b.title} ↗
            </a>
          </span>
        </span>
      );
    case 'audio':
      return (
        <span className="block-sum">
          {head([{ file: 'Audio file', spotify: 'Spotify', apple: 'Apple Podcasts' }[b.provider], clock(b.start) && `from ${clock(b.start)}`].filter(Boolean).join(' · '))}
          <a className="serif" href={safeHref(b.url)} target="_blank" rel="noreferrer noopener">
            {b.title} ↗
          </a>
        </span>
      );
    case 'post':
      return (
        <span className="block-sum">
          {head([`${b.author} @${b.handle}`, b.date, b.truncated ? 'X gives the start only' : ''].filter(Boolean).join(' · '))}
          <span className="serif" style={{ whiteSpace: 'pre-line' }}>{b.text}</span>
          <a className="small" href={safeHref(b.url)} target="_blank" rel="noreferrer noopener">
            The post on X ↗
          </a>
        </span>
      );
    case 'chart':
      return (
        <span className="block-sum with-thumb">
          <span style={{ width: 120, flex: '0 0 120px' }} aria-hidden="true">
            <ChartPreview chart={b.chart} layout="narrow" edition={edition} width={120} />
          </span>
          <span className="stack" style={{ gap: 2 }}>
            {head(`${b.chart.form} · ${b.chart.data.rows.length.toLocaleString('en-IN')} rows`)}
            <span className="serif">{b.chart.title}</span>
            <span className="small muted">{b.chart.sources.map((s) => s.maker).join('; ')}</span>
            {onEdit && (
              <button type="button" className="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={onEdit}>
                Edit
              </button>
            )}
          </span>
        </span>
      );
    case 'image':
      return (
        <span className="block-sum with-thumb">
          {block.image && <img src={block.image} alt={b.caption || 'The picture'} loading="lazy" />}
          <span className="stack" style={{ gap: 2 }}>
            {head(`${b.width} × ${b.height}`)}
            {b.caption && <span className="serif">{b.caption}</span>}
            <span className="small muted">
              {b.credit} · {b.licence}
            </span>
          </span>
        </span>
      );
  }
}

// ---------------------------------------------------------------- the forms

function NoSource({ what }: { what: string }) {
  return (
    <p className="small warn" style={{ margin: 0 }}>
      This item has no text of the piece to check {what} against, so none can be added. Paste the piece’s text (or fetch it again) first.
    </p>
  );
}

function QuoteForm({ busy, hasSource, onAdd }: { busy: boolean; hasSource: boolean; onAdd: (text: string, locator: string) => void }) {
  const [text, setText] = useState('');
  const [locator, setLocator] = useState('');
  if (!hasSource) return <NoSource what="a quote" />;
  return (
    <div className="panel line stack" style={{ gap: 10 }}>
      <p className="small muted" style={{ margin: 0 }}>
        Select a line in the piece and choose Pull quote, or paste it here. It must be in the piece word for word; what prints is the piece’s own text.
      </p>
      <TextArea className="compact" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the line from the piece." aria-label="Pull quote" />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 160px' }}>
          <span className="label">Where it is (optional)</span>
          <input className="input" value={locator} onChange={(e) => setLocator(e.target.value)} placeholder="p. 12, at 23:10" />
        </label>
        <button type="button" className="btn primary small" disabled={busy || text.trim().length < 2} onClick={() => onAdd(text, locator.trim())}>
          {busy ? 'Checking…' : 'Add pull quote'}
        </button>
      </div>
    </div>
  );
}

/** The code with its highlighting, as readers will see it: runs of text, each in its role's colour. */
export function CodePreview({ code, lang }: { code: string; lang?: string }) {
  const tokens = useMemo(() => highlightCode(code, lang), [code, lang]);
  return (
    <pre className="code-preview" aria-label="Preview">
      <code>
        {tokens.map(([role, text], i) =>
          role ? (
            <span key={i} style={{ color: `var(--code-${role})` }}>
              {text}
            </span>
          ) : (
            text
          ),
        )}
      </code>
    </pre>
  );
}

function CodeForm({ busy, hasSource, onAdd }: { busy: boolean; hasSource: boolean; onAdd: (b: { code: string; lang?: string; caption?: string }) => void }) {
  const [code, setCode] = useState('');
  const [lang, setLang] = useState('');
  const [caption, setCaption] = useState('');
  if (!hasSource) return <NoSource what="code" />;
  return (
    <div className="panel line stack" style={{ gap: 10 }}>
      <p className="small muted" style={{ margin: 0 }}>
        Paste the code from the piece with its indentation. It is matched against the piece (spacing aside, since pages lose it); your paste is what prints.
      </p>
      <textarea className="area code-area" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="Paste the code." aria-label="Code" rows={6} />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 140px' }}>
          <span className="label">Language</span>
          <select className="select" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="">Plain text</option>
            {Object.entries(CODE_LANGS).map(([k, name]) => (
              <option key={k} value={k}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: '2 1 200px' }}>
          <span className="label">Caption (optional, your words)</span>
          <input className="input serif" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="The loop that does all the work" />
        </label>
      </div>
      {code.trim() && <CodePreview code={code} lang={lang || undefined} />}
      <div className="row">
        <button type="button" className="btn primary small" disabled={busy || !code.trim()} onClick={() => onAdd({ code, ...(lang ? { lang } : {}), ...(caption.trim() ? { caption: caption.trim() } : {}) })}>
          {busy ? 'Checking…' : 'Add code'}
        </button>
      </div>
    </div>
  );
}

function LinkForm({ kind, busy, onAdd }: { kind: 'video' | 'audio'; busy: boolean; onAdd: (b: { url: string; title?: string; start?: string }) => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const video = kind === 'video';
  return (
    <div className="panel line stack" style={{ gap: 10 }}>
      <p className="small muted" style={{ margin: 0 }}>
        {video
          ? 'Paste a YouTube or Vimeo link (watch, youtu.be, Shorts or embed; a t= time is kept). The title and poster come from the video itself.'
          : 'Paste a Spotify or Apple Podcasts episode or show link, or an https link to an audio file (.mp3, .m4a). Spotify gives its own title; for the others, type it.'}
      </p>
      <label className="field">
        <span className="label">{video ? 'Video link' : 'Episode or file link'}</span>
        <input className="input" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={video ? 'https://youtu.be/…' : 'https://open.spotify.com/episode/…'} />
      </label>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {!video && (
          <label className="field" style={{ flex: '2 1 200px' }}>
            <span className="label">Title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Episode title (Spotify fills it in)" />
          </label>
        )}
        <label className="field" style={{ flex: '0 1 130px' }}>
          <span className="label">Start at (optional)</span>
          <input className="input num" value={start} onChange={(e) => setStart(e.target.value)} placeholder="42:06" />
        </label>
        <button type="button" className="btn primary small" disabled={busy || !/^https?:\/\//i.test(url.trim())} onClick={() => onAdd({ url: url.trim(), ...(title.trim() ? { title: title.trim() } : {}), ...(start.trim() ? { start: start.trim() } : {}) })}>
          {busy ? 'Checking…' : video ? 'Add video' : 'Add recording'}
        </button>
      </div>
    </div>
  );
}

/** An X post: the link alone. Its words, author and date come from X's own record of it. */
function PostForm({ busy, onAdd }: { busy: boolean; onAdd: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const ok = /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/\w{1,15}\/status(es)?\/\d+/i.test(url.trim());
  return (
    <div className="panel line stack" style={{ gap: 10 }}>
      <p className="small muted" style={{ margin: 0 }}>
        Paste the link to a post on X. Its words, who posted it and the date come from X’s own public record; it prints as a clipping, never X’s embed. X gives a long post only to “…”, and readers are sent to the post for the rest. Add a picture from it separately, with its credit.
      </p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 260px' }}>
          <span className="label">Post link</span>
          <input className="input" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://x.com/…/status/…" />
        </label>
        <button type="button" className="btn primary small" disabled={busy || !ok} onClick={() => onAdd(url.trim())}>
          {busy ? 'Fetching…' : 'Add post'}
        </button>
      </div>
    </div>
  );
}

const LICENCES = ['Public domain', 'CC0', 'CC BY 4.0', 'CC BY-SA 4.0', '© the creator, shown for commentary'];

/**
 * A picture, uploaded or linked, with the credit and licence the editor states. `asPlate` makes it
 * the item's own picture (a Picture item prints as it); otherwise it is added as a block.
 */
/**
 * A picture with its credit: upload or link, then who made it, where it was found and the licence.
 * Posts to an item's picture route by default; `endpoint` sends it elsewhere (a shelf book's cover).
 */
export function PictureForm({
  itemId,
  busy,
  setBusy,
  onDone,
  asPlate = false,
  fromUpload = false,
  endpoint,
  submitLabel,
  doneToast,
}: {
  itemId?: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onDone: () => Promise<void> | void;
  asPlate?: boolean;
  fromUpload?: boolean;
  endpoint?: string;
  submitLabel?: string;
  doneToast?: string;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [useCaptured, setUseCaptured] = useState(fromUpload);
  const [url, setUrl] = useState('');
  const [f, setF] = useState({ caption: '', credit: '', licence: '', sourceUrl: '', creator: '', date: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const hasPicture = Boolean(file || url.trim() || useCaptured);
  const ready = hasPicture && f.credit.trim() && f.licence.trim() && f.creator.trim() && (f.sourceUrl.trim() || !file);

  async function submit() {
    setBusy(true);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      else if (useCaptured) fd.append('fromUpload', '1');
      else fd.append('url', url.trim());
      for (const [k, v] of Object.entries(f)) if (v.trim()) fd.append(k, v.trim());
      if (asPlate) fd.append('as', 'plate');
      await api.post(endpoint ?? `/api/items/${itemId}/picture`, fd);
      toast(doneToast ?? (asPlate ? 'The picture is set, with its credit and licence' : 'Picture added'));
      await onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel line stack" style={{ gap: 10 }}>
      <p className="small muted" style={{ margin: 0 }}>
        Upload the picture or link to the image file. Name who made it and where you found it, and say under what licence: an archive’s statement (“public domain”, “CC BY 4.0”), or for a meme, “© the creator, shown for commentary”. It is copied to our own files; never hotlinked.
      </p>
      {fromUpload && (
        <label className="row small">
          <input type="checkbox" checked={useCaptured} onChange={(e) => setUseCaptured(e.target.checked)} /> Use the picture you captured
        </label>
      )}
      {!useCaptured && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="btn small" style={{ cursor: 'pointer' }}>
            {file ? 'Choose another' : 'Upload a picture'}
            <input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => (setFile(e.target.files?.[0] ?? null), (e.target.value = ''))} />
          </label>
          {!file && (
            <label className="field" style={{ flex: '1 1 220px' }}>
              <span className="label">Or a link to the image</span>
              <input className="input" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/picture.jpg" />
            </label>
          )}
        </div>
      )}
      {preview && <img className="picture-preview" src={preview} alt="The picture you chose" />}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 200px' }}>
          <span className="label">Credit (required)</span>
          <input className="input" value={f.credit} onChange={set('credit')} placeholder="Katsushika Hokusai, via the Met" />
        </label>
        <label className="field" style={{ flex: '1 1 200px' }}>
          <span className="label">Licence (required)</span>
          <input className="input" value={f.licence} onChange={set('licence')} list="licences" placeholder="Public domain" />
          <datalist id="licences">
            {LICENCES.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {LICENCES.map((l) => (
          <button key={l} type="button" className="btn quiet small" aria-pressed={f.licence === l} onClick={() => setF({ ...f, licence: l })}>
            {l}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="label">Caption (your words, printed beneath)</span>
        <input className="input serif" value={f.caption} onChange={set('caption')} placeholder="Under the Wave off Kanagawa, about 1831." />
      </label>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 160px' }}>
          <span className="label">Made by (required: a name, or “Unknown”)</span>
          <input className="input" value={f.creator} onChange={set('creator')} placeholder="Katsushika Hokusai" />
        </label>
        <label className="field" style={{ flex: '0 1 120px' }}>
          <span className="label">Date (optional)</span>
          <input className="input" value={f.date} onChange={set('date')} placeholder="1831" />
        </label>
        <label className="field" style={{ flex: '2 1 220px' }}>
          <span className="label">Where you found it (required for uploads, https)</span>
          <input className="input" type="url" inputMode="url" value={f.sourceUrl} onChange={set('sourceUrl')} placeholder="https://www.metmuseum.org/art/collection/…" />
        </label>
      </div>
      <div className="row">
        <button type="button" className="btn primary small" disabled={busy || !ready} onClick={() => void submit()}>
          {busy ? 'Copying…' : (submitLabel ?? (asPlate ? 'Use this picture' : 'Add picture'))}
        </button>
        {!ready && <span className="small muted">{hasPicture ? 'Add the credit and the licence.' : 'Choose a picture first.'}</span>}
      </div>
    </div>
  );
}

