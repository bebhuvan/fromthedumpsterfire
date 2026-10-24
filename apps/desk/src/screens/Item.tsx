// One item under review. The source on the left; on the right, the work in the order the editor
// does it: why it's here, the excerpt (and the big ideas of a long piece), the title, the notes and
// further reading to include, a plate, and what is still missing. Everything else sits under More.
// The editor's words in serif, the machine's in blue sans.

import { useMemo, useState, type ReactNode } from 'react';
import { checkStyle } from '@fdf/shared/style';
import { excerptAdvice, isPunctuated } from '@fdf/shared/quoting';
import { type ContentType } from '@fdf/shared/tokens';
import { api, displayTitle, type Check, type Draft, type Excerpt, type ItemDetail, type MarginalBody, type Note, type Title, type TitleBody, type TrayItem, type WikiCard } from '../api';
import { navigate, safeHref, SaveNote, useAutosave, useKeys, useLoad, usePoll, useToast } from '../lib/core';
import { ChecksPanel, deskTypeForm, deskTypeLabel, NoteCompare, Spinner, TextArea, TypeSelect, VoiceNote } from '../ui/parts';
import { Reader, type Selection } from './Reader';
import { TrayList } from './Tray';
import { PlatesSection } from './Plates';
import { ItemSuggestions } from './Links';
import { RhymeEditor } from './Rhyme';
import { BlocksSection, PictureForm } from './Blocks';
import { ShelfLink } from './Shelf';

const IN_FLIGHT = /queued|fetching|reading|drafting|checking/;

export function ItemReview({ id }: { id: string }) {
  const { data } = useLoad(() => api.get<ItemDetail>(`/api/items/${id}`), [id]);
  if (data?.item.kind === 'rhyme') return <RhymeEditor id={id} />;
  return <ItemReviewInner id={id} />;
}

type Act = <T>(label: string, fn: () => Promise<T>, done?: string) => Promise<T | undefined>;

function ItemReviewInner({ id }: { id: string }) {
  const toast = useToast();
  const { data, error, reload, setData } = useLoad(() => api.get<ItemDetail>(`/api/items/${id}`), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  // On a phone the work and the piece take turns on the screen; on a wide screen they sit side by side.
  const [pane, setPane] = useState<'work' | 'piece'>('work');
  usePoll(reload, Boolean(data && IN_FLIGHT.test(data.item.status)), 3500);
  useKeys({ Escape: () => navigate('/') }, []);

  const act: Act = async (label, fn, done) => {
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
  };

  if (error) return <p className="tray-empty">Could not open this item: {error}</p>;
  if (!data) return <p className="tray-empty">Opening…</p>;
  const { item, source } = data;
  const flight = IN_FLIGHT.test(item.status);
  const chosen = data.excerpts.find((e) => e.chosen) ?? null;
  const patch = (b: Record<string, unknown>) => api.patch<{ item: ItemDetail['item'] }>(`/api/items/${id}`, b).then((r) => setData({ ...data, item: r.item }));
  const visible = (kind: string) => data.drafts.filter((d) => d.kind === kind && d.status !== 'rejected');
  const at = (d: Draft<MarginalBody>) => (d.body.cite.kind === 'source' ? d.body.cite.start : 0);
  const ideas = (visible('idea') as Draft<MarginalBody>[]).sort((a, b) => at(a) - at(b));
  const notes = visible('marginal') as Draft<MarginalBody>[];
  const setAside = data.drafts.filter((d) => (d.kind === 'idea' || d.kind === 'marginal') && d.status === 'rejected').length;
  const pictureSet = data.plates.some((p) => p.status === 'chosen' && p.id === item.plate);
  let n = 0;
  const next = () => ++n;

  return (
    <div className="review" data-type={item.type}>
      <aside className="rail" aria-label="Tray">
        <TrayList selected={id} />
      </aside>
      <div>
        <header className="item-head">
          <span className="label">
            {[deskTypeLabel[item.type], item.source_name, item.source_date, item.minutes ? `${item.minutes} min` : null].filter(Boolean).join(' · ')}
          </span>
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
            <button className="btn quiet small" disabled={!!busy} onClick={() => act('archive', () => patch({ archived: !item.archived }), item.archived ? 'Back in the tray' : 'Archived')}>
              {item.archived ? 'Unarchive' : 'Archive'}
            </button>
            <DeleteItem id={id} busy={!!busy} />
          </div>
        </header>

        <div className="pane-switch" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={pane === 'work'} onClick={() => setPane('work')}>
            The work
          </button>
          <button type="button" role="tab" aria-selected={pane === 'piece'} onClick={() => (setPane('piece'), window.scrollTo({ top: 0 }))}>
            The piece{source ? <span className="pane-n"> · {source.word_count.toLocaleString('en-IN')} words</span> : null}
          </button>
        </div>

        <div className="cols" data-pane={pane}>
          <div className="reader-col">
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
                onPullQuote={(s: Selection) => act('block', () => api.post(`/api/items/${id}/blocks`, { kind: 'quote', start: s.start, end: s.end, text: s.text }), 'Pull quote added. Found word for word.')}
              />
            ) : (
              <div className="panel line">
                <p className="serif muted" style={{ fontSize: 17, margin: 0 }}>{flight ? 'The source text appears here once it has been fetched.' : 'No source text yet.'}</p>
              </div>
            )}
            {source && (source.extractor === 'ocr' || source.extractor === 'pasted') && <SourceFix id={id} text={source.text} imageUrl={item.file_key ? `/api/items/${id}/file` : null} onSaved={reload} />}
            {!flight && (
              <div className="row" style={{ marginTop: 10, gap: 6 }}>
                {(['talk', 'video', 'podcast'].includes(item.type) || item.status === 'failed') && <TranscriptBox id={id} hasSource={Boolean(source)} onSaved={reload} />}
                {(['paper', 'essay', 'passage'].includes(item.type) || item.status === 'failed') && item.kind !== 'image' && <PdfUpload id={id} hasSource={Boolean(source)} onSaved={reload} />}
              </div>
            )}
          </div>

          <div className="steps">
            {item.status === 'failed' && !flight && <FetchFailed detail={data} act={act} />}
            <Step n={next()} title="Why it's here" done={Boolean(item.why_text?.trim())} hint="Your words, typed or dictated. Never reworded.">
              <WhySection key={`why-${id}`} detail={data} onSaved={reload} />
            </Step>

            {item.type === 'image' && (
              <Step n={next()} title="The picture" done={pictureSet} hint="The picture itself, printed as a mounted print, with the credit and licence you state.">
                <PictureStep detail={data} onSaved={reload} />
              </Step>
            )}

            {item.type === 'book' && (
              <Step n={next()} title="On the shelf" optional done={Boolean(item.shelf_id)} hint="Point this book to its page on the shelf, where your notes on it live. Readers follow it from the Haul.">
                <ShelfLink detail={data} onChange={reload} />
              </Step>
            )}

            {TYPE_FIELDS[item.type] && (
              <Step n={next()} title={TYPE_FIELDS[item.type]!.title} optional done={TYPE_FIELDS[item.type]!.fields.some((k) => Boolean(item[k]))} hint={TYPE_FIELDS[item.type]!.hint}>
                <TypeFields detail={data} onPatch={patch} />
              </Step>
            )}

            {(source || !EXCERPT_OPTIONAL.has(item.type)) && (
              <Step n={next()} title="The excerpt" optional={EXCERPT_OPTIONAL.has(item.type)} done={Boolean(chosen)} hint={ideas.length ? 'Optional when you include big ideas below.' : 'The passage readers get. Up to two paragraphs.'}>
                <ExcerptSection detail={data} chosen={chosen} act={act} />
              </Step>
            )}

            {ideas.length > 0 && (
              <Step n={next()} title="The big ideas" done={ideas.some(isIn)} hint="For a long piece. Tick the ones to print, in the machine's voice, each with where it is said.">
                <CheckedLines kind="idea" drafts={ideas} act={act} autoCaptions={Boolean(source && ['captions-auto', 'captions', 'transcript', 'whisper'].includes(source.extractor) && !isPunctuated(source.text))} />
              </Step>
            )}

            {(ideas.length > 0 || ['talk', 'video', 'podcast', 'paper'].includes(item.type)) && (
              <Step n={next()} title="Start here" optional done={Boolean(item.start_at)} hint="For a long piece: the moment a reader should begin, and a few words on why. Printed near the top.">
                <StartHereSection detail={data} ideas={ideas} onPatch={patch} />
              </Step>
            )}

            <Step n={next()} title="Add to this item" optional done={(data.blocks ?? []).length > 0} hint="Pull quotes, code, a video, a podcast or recording, pictures. Printed after your note, in this order.">
              <BlocksSection detail={data} onChange={reload} />
            </Step>

            <Step n={next()} title="Title" done={Boolean(item.title_choice)} hint={item.title_choice ? undefined : 'The original title is used unless you pick another.'}>
              <TitleSection detail={data} onPatch={patch} />
            </Step>

            <Step n={next()} title="Notes and further reading" optional hint="Only what you tick is printed. Each line was checked against its source.">
              {notes.length > 0 ? <CheckedLines kind="marginal" drafts={notes} act={act} /> : <p className="small muted" style={{ margin: 0 }}>The machine found nothing that needed a note.</p>}
              {setAside > 0 && <p className="small muted" style={{ margin: 0 }}>{setAside} more {setAside === 1 ? 'line was' : 'lines were'} set aside: the checker could not confirm {setAside === 1 ? 'it' : 'them'} from the source.</p>}
              <WikiSection itemId={id} cards={data.wiki} act={act} />
            </Step>

            <Step n={next()} title="" optional bare>
              <PlatesSection target={{ kind: 'item', id }} plates={data.plates} decision={data.item.plate} onChange={reload} title={<StepTitle n={n} title="Plate" optional />} />
            </Step>

            <Ready detail={data} chosen={chosen} ideasIn={ideas.filter(isIn).length} busy={busy === 'check'} onRecheck={() => act('check', () => api.post(`/api/items/${id}/check`), 'Checked')} />

            <details className="section more">
              <summary className="h2">More</summary>
              <div className="stack" style={{ gap: 26, marginTop: 14 }}>
                <DetailsSection detail={data} onPatch={patch} />
                <div className="row">
                  <button className="btn small" disabled={!!busy || flight || !source} onClick={() => act('redraft', () => api.post(`/api/items/${id}/redraft`), 'Redrafting')}>
                    Redraft titles, excerpts and notes
                  </button>
                  <button className="btn quiet small" disabled={!!busy || flight} onClick={() => act('refetch', () => api.post(`/api/items/${id}/refetch`), 'Fetching again')}>
                    Fetch the source again
                  </button>
                </div>
                <p className="small muted" style={{ margin: 0 }}>Redrafting keeps everything you chose, kept or edited.</p>
                <ItemSuggestions itemId={id} suggestions={data.suggestions} onChange={reload} />
                <ConnectionsSection detail={data} act={act} />
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

const isIn = (d: Draft) => d.status === 'kept' || d.status === 'edited';

/** Types where an excerpt is not expected: a picture, a book's jacket, a tool's label. */
const EXCERPT_OPTIONAL: ReadonlySet<string> = new Set(['image', 'book', 'tool']);

type FieldKey = 'handle' | 'recipient' | 'place' | 'year';
/** The fields a form prints, per type: a post's handle, a letter's recipient and place, a speech's place. */
const TYPE_FIELDS: Partial<Record<ContentType, { title: string; hint: string; fields: FieldKey[] }>> = {
  social: { title: 'The post', hint: 'Printed on the clipping with the date.', fields: ['handle', 'year'] },
  letter: { title: 'The letter', hint: 'Printed in the dateline and the salutation.', fields: ['recipient', 'place', 'year'] },
  speech: { title: 'The speech', hint: 'Printed with the transcript: where and when it was given.', fields: ['place', 'year'] },
};

const FIELD: Record<FieldKey, { label: string; ph: string }> = {
  handle: { label: 'Handle', ph: '@visakanv' },
  recipient: { label: 'Written to', ph: 'John Herschel' },
  place: { label: 'Where', ph: 'Manchester' },
  year: { label: 'Year', ph: '1865' },
};

function TypeFields({ detail, onPatch }: { detail: ItemDetail; onPatch: (b: Record<string, unknown>) => Promise<void> }) {
  const { item } = detail;
  const toast = useToast();
  return (
    <div className="row" style={{ alignItems: 'flex-end' }}>
      {(TYPE_FIELDS[item.type]?.fields ?? []).map((k) => (
        <ItemField key={`${item.id}-${k}`} k={k} value={item[k]} onSave={(v) => onPatch({ [k]: v }).catch((e) => toast(e instanceof Error ? e.message : String(e), true))} />
      ))}
    </div>
  );
}

/** One of the new item fields: text, or a whole year (empty clears it). */
function ItemField({ k, value, onSave }: { k: FieldKey; value: string | number | null | undefined; onSave: (v: string | number | null) => void }) {
  const { label, ph } = FIELD[k];
  return (
    <label className="field" style={{ flex: k === 'year' ? '0 1 110px' : '1 1 180px' }}>
      <span className="label">{label}</span>
      <input
        className={`input${k === 'year' ? ' num' : ''}`}
        inputMode={k === 'year' ? 'numeric' : undefined}
        defaultValue={value ?? ''}
        placeholder={ph}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v === String(value ?? '')) return;
          if (k === 'year') {
            if (v && !/^-?\d{1,4}$/.test(v)) return void (e.target.value = String(value ?? ''));
            onSave(v ? Number(v) : null);
          } else onSave(v);
        }}
      />
    </label>
  );
}

/** A Picture item's picture: the one captured, an upload or a link, with its credit and licence. */
function PictureStep({ detail, onSaved }: { detail: ItemDetail; onSaved: () => Promise<void> }) {
  const { item } = detail;
  const [busy, setBusy] = useState(false);
  const current = detail.plates.find((p) => p.status === 'chosen' && p.id === item.plate);
  const [replacing, setReplacing] = useState(false);
  if (current && !replacing)
    return (
      <div className="stack" style={{ gap: 8 }}>
        <p className="small" style={{ margin: 0 }}>
          The picture is set: {current.institution} · {current.licence}. Its caption is under Plate below.
        </p>
        <button type="button" className="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={() => setReplacing(true)}>
          Replace the picture
        </button>
      </div>
    );
  return <PictureForm itemId={item.id} busy={busy} setBusy={setBusy} asPlate fromUpload={item.kind === 'image' && Boolean(item.file_key)} onDone={async () => (await onSaved(), setReplacing(false))} />;
}

// ---------------------------------------------------------------- steps

function StepTitle({ n, title, done, optional }: { n: number; title: string; done?: boolean; optional?: boolean }) {
  return (
    <span className="step-title">
      <span className={`step-n${done ? ' done' : ''}`} aria-hidden="true">
        {done ? '✓' : n}
      </span>
      {title}
      {optional && <span className="small muted step-opt">optional</span>}
      {done && <span className="sr-only"> (done)</span>}
    </span>
  );
}

function Step({ n, title, done, optional, hint, bare, children }: { n: number; title: string; done?: boolean; optional?: boolean; hint?: string; bare?: boolean; children: ReactNode }) {
  if (bare) return <div className="step">{children}</div>;
  return (
    <section className="step section" aria-label={title}>
      <h2 className="h2">
        <StepTitle n={n} title={title} done={done} optional={optional} />
      </h2>
      {hint && <p className="small muted step-hint">{hint}</p>}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- why it's here

function WhySection({ detail, onSaved }: { detail: ItemDetail; onSaved: () => void }) {
  const { item } = detail;
  const why = useAutosave(`why:${item.id}`, item.why_text ?? '', (v) => api.patch(`/api/items/${item.id}`, { why_text: v }));
  const [note, setNote] = useState<Note | null>(detail.notes.find((n) => n.target === 'why') ?? null);
  return (
    <>
      <TextArea
        className="editor"
        value={why.value}
        onChange={(e) => why.onChange(e.target.value)}
        onSubmit={() => void why.flush().then(onSaved)}
        onBlur={() => void why.flush().then(onSaved)}
        placeholder="Why you pulled this out of the fire, the way you would tell a friend."
        aria-label="Why it's here"
      />
      <div className="row between">
        <div className="row">
          <VoiceNote
            target="why"
            itemId={item.id}
            onNote={(n) => {
              setNote(n);
              void api.patch(`/api/items/${item.id}`, { why_note_id: n.id });
            }}
          />
          <SaveNote state={why.state} />
        </div>
        {item.why_note_id && (
          <label className="row small muted">
            <input type="checkbox" checked={!!item.why_audio} onChange={(e) => void api.patch(`/api/items/${item.id}`, { why_audio: e.target.checked }).then(onSaved)} /> Publish the voice note with it
          </label>
        )}
      </div>
      {note && <NoteCompare note={note} onUse={(t) => why.onChange(why.value.trim() ? `${why.value.trim()}\n\n${t}` : t)} />}
    </>
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

// ---------------------------------------------------------------- your own transcript

const TRANSCRIPT_TYPES = '.txt,.md,.vtt,.srt,text/plain,text/markdown,text/vtt';

/** Paste or upload a transcript made elsewhere; it replaces the fetched text and the item is redrafted. */
function TranscriptBox({ id, hasSource, onSaved, as = 'transcript' }: { id: string; hasSource: boolean; onSaved: () => void; as?: 'transcript' | 'text' }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const pasting = as === 'text';
  const [text, setText] = useState('');
  const [name, setName] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button className="btn quiet small" onClick={() => setOpen(true)}>
        {pasting ? 'Paste the text yourself' : hasSource ? 'Use your own transcript instead' : 'Add a transcript yourself'}
      </button>
    );
  async function submit() {
    setBusy(true);
    try {
      const r = await api.post<{ words: number; timed: boolean }>(`/api/items/${id}/transcript`, { text, name, as });
      toast(`${pasting ? 'Text' : 'Transcript'} in: ${r.words.toLocaleString('en-IN')} words${r.timed ? ', with times' : ''}. Reading it now.`);
      setOpen(false);
      setText('');
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="section panel line" style={{ marginTop: 4, flexBasis: '100%' }}>
      <div className="label">{pasting ? "The piece's text" : 'Your transcript'}</div>
      {pasting ? (
        <p className="small muted" style={{ margin: 0 }}>
          Open the original, select the article's text, copy it and paste it here as it is. Excerpts are matched word for word against what you paste, and the machine reads and drafts from it.
        </p>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          Paste it, or choose a .txt, .md, .vtt or .srt file (yt-dlp's captions, a Whisper run on the laptop, the show's own transcript). Subtitle files keep their times. It replaces the text above, and the machine reads and drafts again from it.
        </p>
      )}
      {!pasting && <input
        type="file"
        accept={TRANSCRIPT_TYPES}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 3_000_000) return toast('That file is over 3 MB; is it a transcript?', true);
          setName(f.name);
          setText(await f.text());
        }}
      />}
      <TextArea className="compact" value={text} onChange={(e) => (setText(e.target.value), setName(undefined))} placeholder={pasting ? "Paste the piece's text here." : 'Or paste the transcript here.'} />
      <div className="row">
        <button className="btn primary small" disabled={busy || text.trim().split(/\s+/).length < 50} onClick={() => void submit()}>
          {busy ? 'Saving…' : pasting ? 'Use this text' : 'Use this transcript'}
        </button>
        <button className="btn quiet small" onClick={() => setOpen(false)}>
          Cancel
        </button>
        {text && <span className="small muted">{text.trim().split(/\s+/).length.toLocaleString('en-IN')} words{name ? ` from ${name}` : ''}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- when the fetch fails

/** Why the fetch failed, in plain words, and every way out: again, the text by hand, a PDF, or delete. */
function FetchFailed({ detail, act }: { detail: ItemDetail; act: Act }) {
  const { item } = detail;
  const why = item.status_detail ?? '';
  const explain = /paid subscribers|members-only|password-protected|only part of this post/i.test(why)
    ? 'Only part of this piece is free to read, and the Desk reads only what is free. Paste the text or upload a PDF if you have a copy.'
    : /429|too many/i.test(why)
    ? 'The site turned the Desk away for asking too often. That usually passes within the hour: try again later, or paste the text now.'
    : /\b(401|403)\b|blocked|forbidden/i.test(why)
      ? 'The site does not let the Desk fetch it. Paste the text or upload a PDF instead.'
      : /\b(404|410)\b/.test(why)
        ? 'The page is not there any more. Check the link, or paste the text if you have it.'
        : 'Try again, or bring the text in yourself.';
  const media = ['talk', 'video', 'podcast'].includes(item.type);
  return (
    <div className="section panel line fetch-failed">
      <div className="label">The fetch failed</div>
      <p style={{ margin: '6px 0 0' }}>{explain}</p>
      <p className="small muted" style={{ margin: '4px 0 0' }}>{why}</p>
      <div className="row" style={{ marginTop: 12, gap: 6 }}>
        <button className="btn small" onClick={() => act('refetch', () => api.post(`/api/items/${item.id}/refetch`), 'Fetching again')}>
          Try again
        </button>
        <TranscriptBox id={item.id} hasSource={false} onSaved={() => act('pasted', async () => true)} as={media ? 'transcript' : 'text'} />
        {!media && item.kind !== 'image' && <PdfUpload id={item.id} hasSource={false} onSaved={() => act('pdf', async () => true)} />}
      </div>
    </div>
  );
}

/** Delete for good, after a confirm. Archive is the gentler way to clear the tray. */
function DeleteItem({ id, busy }: { id: string; busy: boolean }) {
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  return (
    <button
      className="btn quiet small danger"
      disabled={busy || deleting}
      onClick={async () => {
        if (!window.confirm('Delete this item for good? Its notes, excerpts and files go with it. Archive keeps it, out of the tray.')) return;
        setDeleting(true);
        try {
          await api.del(`/api/items/${id}`);
          toast('Deleted');
          navigate('/');
        } catch (e) {
          toast(e instanceof Error ? e.message : String(e), true);
          setDeleting(false);
        }
      }}
    >
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  );
}

// ---------------------------------------------------------------- your own PDF

/** Upload the PDF yourself when the link will not give it up (a paywall, a download block). */
function PdfUpload({ id, hasSource, onSaved }: { id: string; hasSource: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <label className={`btn quiet small${busy ? ' disabled' : ''}`} style={{ cursor: 'pointer' }}>
      {busy ? 'Uploading…' : hasSource ? 'Upload the PDF yourself' : 'Upload the PDF'}
      <input
        type="file"
        hidden
        accept="application/pdf,.pdf"
        disabled={busy}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          try {
            const fd = new FormData();
            fd.append('file', f);
            await api.post(`/api/items/${id}/file`, fd);
            toast(`${f.name} uploaded. Reading it now; the link stays as the source.`);
            onSaved();
          } catch (err) {
            toast(err instanceof Error ? err.message : String(err), true);
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

// ---------------------------------------------------------------- excerpt

/** A passage as it will print: paragraphs kept, the highlight marked. */
function Passage({ text, hl }: { text: string; hl?: [number, number] | null }) {
  const paras: Array<{ start: number; text: string }> = [];
  const re = /\n\s*\n/g;
  let last = 0;
  for (let m = re.exec(text); ; m = re.exec(text)) {
    const end = m ? m.index : text.length;
    if (text.slice(last, end).trim()) paras.push({ start: last, text: text.slice(last, end) });
    if (!m) break;
    last = m.index + m[0].length;
  }
  return (
    <>
      {paras.map((p) => {
        const a = hl ? Math.max(hl[0], p.start) - p.start : -1;
        const b = hl ? Math.min(hl[1], p.start + p.text.length) - p.start : -1;
        return (
          <p key={p.start}>
            {hl && a < b ? (
              <>
                {p.text.slice(0, a)}
                <mark>{p.text.slice(a, b)}</mark>
                {p.text.slice(b)}
              </>
            ) : (
              p.text
            )}
          </p>
        );
      })}
    </>
  );
}

function ExcerptSection({ detail, chosen, act }: { detail: ItemDetail; chosen: Excerpt | null; act: Act }) {
  const candidates = detail.excerpts.filter((e) => !e.chosen);
  const [locator, setLocator] = useState(chosen?.locator ?? '');
  const words = detail.source?.word_count ?? 0;
  const type = detail.item.type as ContentType;
  const hl: [number, number] | null = chosen && chosen.highlight_start != null && chosen.highlight_end != null ? [chosen.highlight_start, chosen.highlight_end] : null;
  const advice = chosen ? excerptAdvice(chosen.text, words, type) : null;
  return (
    <>
      {chosen ? (
        <div className="stack" style={{ gap: 10 }}>
          <blockquote className="excerpt">
            <Passage text={chosen.text} hl={hl} />
          </blockquote>
          {advice && <div className={`small ${advice.over ? 'warn' : 'muted'}`}>{advice.message}</div>}
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
          {!hl && <p className="small muted" style={{ margin: 0 }}>To underline one line: select it inside the tinted passage in the source, then choose Mark highlight.</p>}
          <label className="field">
            <span className="label">Where it is (page, time, section)</span>
            <input
              className="input"
              value={locator}
              onChange={(e) => setLocator(e.target.value)}
              onBlur={() => locator !== (chosen.locator ?? '') && act('excerpt', () => api.patch(`/api/excerpts/${chosen.id}`, { locator }))}
              placeholder="p. 12, Section 1, at 23:10"
            />
          </label>
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>Use one of the machine's passages below, or select any passage in the piece and choose Make excerpt.</p>
      )}
      {candidates.length > 0 && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="label machine">{chosen ? 'Other passages the machine proposed' : 'Passages the machine proposed'}</div>
          {candidates.map((c) => {
            const a = excerptAdvice(c.text, words, type);
            const chl: [number, number] | null = c.highlight_start != null && c.highlight_end != null ? [c.highlight_start, c.highlight_end] : null;
            return (
              <div key={c.id} className="cand-card">
                {c.why && <p className="machine small" style={{ margin: 0 }}>{c.why}</p>}
                <div className="serif cand-text">
                  <Passage text={c.text} hl={chl} />
                </div>
                <div className="row between">
                  <span className={`small ${a.over ? 'warn' : 'muted'}`}>
                    {a.words} words{c.locator ? ` · ${c.locator}` : ''}
                  </span>
                  <button className="btn small" onClick={() => act('excerpt', () => api.patch(`/api/excerpts/${c.id}`, { chosen: true }), 'Excerpt set')}>
                    Use this
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- notes and ideas: tick to include

function CheckedLines({ kind, drafts, act, autoCaptions = false }: { kind: 'idea' | 'marginal'; drafts: Draft<MarginalBody>[]; act: Act; autoCaptions?: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const style = checkStyle(text);
  const live = drafts.filter((d) => d.status !== 'cut');
  async function save(draftId: string) {
    await act('note', () => api.patch(`/api/drafts/${draftId}`, { text, status: 'kept' }), 'Saved; checked again against its source');
    setEditing(null);
  }
  return (
    <div className="lines">
      {live.map((d) => {
        const b = d.body;
        const on = isIn(d);
        const flagged = b.verdict === 'partly' || b.verdict === 'unsupported';
        return (
          <div key={d.id} className={`line-row${on ? ' on' : ''}`}>
            <input
              type="checkbox"
              checked={on}
              aria-label={on ? 'Included; untick to leave it out' : 'Include'}
              onChange={(e) => void act('note', () => api.patch(`/api/drafts/${d.id}`, { status: e.target.checked ? 'kept' : 'proposed' }))}
            />
            <div className="stack" style={{ gap: 6, flex: 1 }}>
              {editing === d.id ? (
                <>
                  <TextArea className="machine-area compact" value={text} onChange={(e) => setText(e.target.value)} onSubmit={() => void save(d.id)} />
                  {!style.ok && <div className="small warn">{style.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' ')}</div>}
                  <div className="row">
                    <button className="btn small primary" disabled={!style.ok} onClick={() => void save(d.id)}>
                      Save and check
                    </button>
                    <button className="btn quiet small" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <p className="note-text">{b.text}</p>
              )}
              {kind === 'idea' && b.cite.kind === 'source' && (
                <p className="serif small idea-quote">
                  “{b.cite.quote.replace(/\s*\n\s*/g, ' ')}”{b.locator ? <span className="muted"> · {b.locator}</span> : null}
                </p>
              )}
              {kind === 'marginal' && <span className="note-cite">{b.cite.kind === 'source' ? <>From the piece: “{b.cite.quote.slice(0, 120)}{b.cite.quote.length > 120 ? '…' : ''}”</> : <>From Wikipedia: {b.cite.title}</>}</span>}
              {flagged && <span className="small warn">The checker could not confirm your edit: {b.reason}</span>}
              {kind === 'idea' && <IdeaReaction draft={d} act={act} />}
              {editing !== d.id && (
                <button
                  className="btn quiet small"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => {
                    setEditing(d.id);
                    setText(b.text);
                  }}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        );
      })}
      {kind === 'idea' && autoCaptions && <p className="small muted" style={{ margin: 0 }}>This transcript has no punctuation, so the site prints each idea with its time, not the transcript's words.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- the editor's take on an idea

/** One line in your own words on an idea, typed or dictated; printed beside it in your serif. */
function IdeaReaction({ draft, act }: { draft: Draft<MarginalBody>; act: Act }) {
  const saved = draft.body.reaction ?? '';
  const [v, setV] = useState(saved);
  const [open, setOpen] = useState(Boolean(saved));
  const [note, setNote] = useState<Note | null>(null);
  const save = (text: string) => text.trim() !== saved.trim() && act('note', () => api.patch(`/api/drafts/${draft.id}`, { reaction: text }), text.trim() ? 'Your take is saved; the idea is ticked' : undefined);
  if (!open)
    return (
      <button className="link-btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
        Add your take
      </button>
    );
  return (
    <div className="stack" style={{ gap: 6 }}>
      <TextArea className="editor compact" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => void save(v)} onSubmit={() => void save(v)} placeholder="Your take, in a line. Never reworded." aria-label="Your take on this idea" />
      <div className="row">
        <VoiceNote target="reaction" itemId={draft.item_id} onNote={setNote} label="Say it" />
      </div>
      {note && (
        <NoteCompare
          note={note}
          onUse={(t) => {
            const next = v.trim() ? `${v.trim()} ${t}` : t;
            setV(next);
            void save(next);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- start here

function StartHereSection({ detail, ideas, onPatch }: { detail: ItemDetail; ideas: Draft<MarginalBody>[]; onPatch: (b: Record<string, unknown>) => Promise<void> }) {
  const { item } = detail;
  const toast = useToast();
  const [at, setAt] = useState(item.start_at ?? '');
  const [noteText, setNoteText] = useState(item.start_note ?? '');
  const save = (b: Record<string, unknown>) => onPatch(b).catch((e) => toast(e instanceof Error ? e.message : String(e), true));
  // Times of the ideas you kept (or all, if none kept yet): one tap to start there.
  const picks = [...new Set((ideas.some(isIn) ? ideas.filter(isIn) : ideas).map((d) => d.body.locator?.replace(/^at /, '') ?? '').filter((l) => /^\d|^p\./.test(l)))].slice(0, 8);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '0 1 140px' }}>
          <span className="label">Time or page</span>
          <input className="input num" value={at} onChange={(e) => setAt(e.target.value)} onBlur={() => at !== (item.start_at ?? '') && void save({ start_at: at.trim() })} placeholder="42:06 or p. 12" />
        </label>
        <label className="field" style={{ flex: '1 1 220px' }}>
          <span className="label">Why there (your words)</span>
          <input className="input serif" value={noteText} onChange={(e) => setNoteText(e.target.value)} onBlur={() => noteText !== (item.start_note ?? '') && void save({ start_note: noteText })} placeholder="Where the argument starts to bite" />
        </label>
      </div>
      {picks.length > 0 && (
        <div className="row" style={{ gap: 6 }}>
          <span className="small muted">From the ideas:</span>
          {picks.map((p) => (
            <button key={p} className="btn quiet small" onClick={() => (setAt(p), void save({ start_at: p }))}>
              {p}
            </button>
          ))}
        </div>
      )}
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
  const options = (detail.drafts.filter((d) => d.kind === 'title' && d.status !== 'cut' && d.status !== 'rejected') as Draft<TitleBody>[])
    .map((d) => ({ ...d, angle: d.body.angle, body: norm(d.body) }))
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
    <fieldset style={{ border: 0, margin: 0, padding: 0 }} className="stack">
      <legend className="sr-only">Title</legend>
      {original && (
        <label className="opt">
          <input type="radio" name="title" checked={isSame(current, original) || !current} onChange={() => choose(original)} />
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
            <span className="small machine" style={{ display: 'block' }}>{ANGLE[o.angle ?? ''] ?? 'Suggested by the machine'}</span>
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

const ANGLE: Record<string, string> = {
  turn: 'Machine · a turn of phrase',
  fact: 'Machine · the striking fact',
  question: 'Machine · the question it answers',
  lift: 'Machine · lifted from the piece',
  plain: 'Machine · plainly put',
};

// ---------------------------------------------------------------- wikipedia: tick to include

function WikiSection({ itemId, cards, act }: { itemId: string; cards: WikiCard[]; act: Act }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const live = cards.filter((c) => c.status !== 'cut');
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="label" style={{ marginTop: 6 }}>Further reading, from Wikipedia</div>
      <div className="lines">
        {live.map((c) => (
          <div key={c.id} className={`line-row${c.status === 'kept' ? ' on' : ''}`}>
            <input
              type="checkbox"
              checked={c.status === 'kept'}
              aria-label={c.status === 'kept' ? `Included: ${c.title}` : `Include ${c.title}`}
              onChange={(e) => void act('wiki', () => api.patch(`/api/wiki/${c.id}`, { status: e.target.checked ? 'kept' : 'proposed' }))}
            />
            <div style={{ flex: 1 }}>
              <a className="serif" style={{ fontSize: 16 }} href={safeHref(c.url)} target="_blank" rel="noreferrer noopener">
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
                  {c.summary}{' '}
                  <button
                    className="link-btn small"
                    onClick={() => {
                      setEditing(c.id);
                      setSummary(c.summary);
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
              {c.http_status != null && c.http_status !== 200 && <div className="small warn">The link returned {c.http_status}</div>}
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
    </div>
  );
}

// ---------------------------------------------------------------- ready?

const BLOCKING = ['links', 'quotes', 'citations', 'style'];

function Ready({ detail, chosen, ideasIn, busy, onRecheck }: { detail: ItemDetail; chosen: Excerpt | null; ideasIn: number; busy: boolean; onRecheck: () => void }) {
  const { item, checks } = detail;
  if (IN_FLIGHT.test(item.status)) return null;
  const todo: string[] = [];
  if (!item.why_text?.trim()) todo.push("Say why it's here.");
  if (item.type === 'image' && !detail.plates.some((p) => p.status === 'chosen' && p.id === item.plate)) todo.push('Add the picture, with its credit and licence.');
  if (!chosen && !ideasIn && !EXCERPT_OPTIONAL.has(item.type)) todo.push('Choose an excerpt' + (detail.drafts.some((d) => d.kind === 'idea' && d.status !== 'rejected') ? ', or tick some big ideas.' : '.'));
  const failing = checks.filter((c: Check) => c.status === 'fail' && BLOCKING.includes(c.name));
  for (const c of failing) todo.push(`${CHECK_NAMES[c.name] ?? c.name}: ${c.detail.summary ?? 'failed'}`);
  const ready = todo.length === 0;
  return (
    <section className={`step section ready${ready ? ' is-ready' : ''}`} aria-label="Ready for a Haul">
      <h2 className="h2">{ready ? 'Ready for a Haul' : 'Before it can go in a Haul'}</h2>
      {ready ? (
        <p className="small" style={{ margin: 0 }}>Everything that prints has been checked. Add it to a Haul from the Hauls page.</p>
      ) : (
        <ul className="todo">
          {todo.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <details>
        <summary className="small muted">All checks</summary>
        <ChecksPanel checks={checks} busy={busy} onRecheck={onRecheck} />
      </details>
    </section>
  );
}

const CHECK_NAMES: Record<string, string> = { links: 'Links', quotes: 'The excerpt', citations: 'Notes and ideas', style: 'House style' };

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
    <div className="stack" style={{ gap: 10 }}>
      <h3 className="h3">Details</h3>
      <label className="field">
        <span className="label">What kind of thing it is</span>
        <TypeSelect value={item.type} onChange={(t: ContentType) => void onPatch({ type: t })} />
        <span className="small muted">{deskTypeForm[item.type]}</span>
      </label>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {field('creator', 'By', 'Author, speaker or show')}
        {field('source_name', 'Source', 'Publication, venue, book')}
        {field('source_date', 'Date', '1945, or 7 March 1986')}
        {field('url', 'Link to the original (https)', 'https://', 'url')}
        {field('minutes', 'Minutes', '', 'number')}
        {field('locator', 'Default locator', 'Transcript, Chapter VII')}
        <ItemField key={`${item.id}-year`} k="year" value={item.year} onSave={(v) => void onPatch({ year: v }).catch((err) => toast(err instanceof Error ? err.message : String(err), true))} />
      </div>
    </div>
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
    <div className="stack" style={{ gap: 10 }}>
      <h3 className="h3">Your connections {detail.connections.length ? `· ${detail.connections.length}` : ''}</h3>
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
      <p className="small muted" style={{ margin: 0 }}>Connections publish only between items in the same Haul.</p>
    </div>
  );
}
