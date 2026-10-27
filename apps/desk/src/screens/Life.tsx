// A Life on the Desk: a profile of one person that a model wrote (in an editorial session) from
// sources the Desk fetched itself. The editor reads it line by line, with each line's quotes from the
// sources a tap away, keeps or cuts each, and approves the whole. Lines the checker could not confirm
// are set aside and never shown, only counted. Any change clears the approval. The draft itself
// comes from the terminal (npm run editorial -- life); the rules are in packages/server/src/lives.ts.

import { useState } from 'react';
import type { LifeDraft, DraftLine } from '@fdf/shared/life';
import { lifeLines, lifeYears } from '@fdf/shared/life';
import { api, type ItemDetail } from '../api';
import { navigate, safeHref, SaveNote, useAutosave, useLoad, usePoll, useToast } from '../lib/core';
import { ChecksPanel, TextArea } from '../ui/parts';

interface LifeSourceUi {
  id: string;
  key: string;
  author: string;
  title: string;
  kind: string;
  year: string | null;
  url: string;
  via: string | null;
  workUrl: string | null;
  status: 'queued' | 'fetched' | 'failed';
  detail: string | null;
  words: number | null;
}

interface LifeView {
  sources: LifeSourceUi[];
  draft: LifeDraft | null;
  writer: string | null;
  approvedAt: string | null;
  problems: string[];
}

export function LifeEditor({ id }: { id: string }) {
  const toast = useToast();
  const item = useLoad(() => api.get<ItemDetail>(`/api/items/${id}`), [id]);
  const { data, error, setData } = useLoad(() => api.get<LifeView>(`/api/items/${id}/life`), [id]);
  usePoll(() => void item.reload(), Boolean(item.data && /fetching/.test(item.data.item.status)), 4000);

  if (error) return <p className="tray-empty">Could not open this Life: {error}</p>;
  if (!data || !item.data) return <p className="tray-empty">Opening…</p>;
  const draft = data.draft;

  async function call(fn: () => Promise<LifeView>, done?: string) {
    try {
      setData(await fn());
      void item.reload();
      if (done) toast(done);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  }
  const setLine = (lineId: string, status: 'kept' | 'cut' | 'proposed') => call(() => api.patch<LifeView>(`/api/items/${id}/life/lines/${lineId}`, { status }));

  const all = draft ? lifeLines(draft) : [];
  const setAside = all.filter((x) => x.line.status === 'rejected').length;
  const undecided = all.filter((x) => x.line.status === 'proposed').length;
  const kept = all.filter((x) => x.line.status === 'kept').length;

  return (
    <div className="stack life-desk" style={{ gap: 8 }} data-type="life">
      <div className="row between">
        <div className="label">Lives · {data.approvedAt ? 'approved' : item.data.item.status === 'ready' ? 'draft' : item.data.item.status}</div>
        <button className="btn quiet small" onClick={() => navigate('/')}>
          Back to the tray
        </button>
      </div>

      <section className="section">
        <h1 className="serif" style={{ fontSize: 44, lineHeight: 1, margin: 0 }}>{draft?.name ?? item.data.item.title}</h1>
        {draft ? <p className="serif" style={{ fontStyle: 'italic', fontSize: 22, color: 'var(--ink2)', margin: '6px 0 0' }}>{lifeYears(draft)}</p> : null}
        <WhyNote detail={item.data} />
      </section>

      <section className="section">
        <div className="label">Written from</div>
        <ul className="life-sources">
          {data.sources.map((s) => (
            <li key={s.id}>
              <b>{s.key}</b> {s.author}, <i>{s.title}</i>
              {s.year ? `, ${s.year}` : ''}. {s.via ? `${s.via}. ` : ''}
              <a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer">
                Where it was read
              </a>{' '}
              <span className={s.status === 'fetched' ? 'small' : 'bad small'}>
                {s.status === 'fetched' ? `${(s.words ?? 0).toLocaleString('en-IN')} words fetched` : s.detail ?? s.status}
              </span>
              {s.status !== 'fetched' ? (
                <button className="btn quiet small" onClick={() => call(() => api.post<LifeView>(`/api/items/${id}/life/fetch`, { key: s.key }), 'Fetched again')}>
                  Fetch again
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {!draft ? (
        <section className="section">
          <p className="small ink2">No profile yet. A session writes it from these sources and submits it with <code>npm run editorial -- life-draft {id} --data profile.json</code>; every quote and figure is checked before it arrives here.</p>
        </section>
      ) : (
        <>
          <section className="section">
            <p className="small">
              Written by {data.writer ?? draft.writer}. {kept} kept, {undecided} to read{setAside ? `, ${setAside} set aside by the checker (not shown)` : ''}. Tap “Where” under a line to see the passages it rests on.
            </p>
          </section>
          <LineView label="Under the name" line={draft.epithet} onSet={setLine} />
          {draft.sections.map((s, i) => (
            <section className="section" key={i}>
              <div className="label machine-h">{s.heading}</div>
              {s.paragraphs.map((p, j) => (
                <div className="life-para" key={j}>
                  {p.map((l) => (
                    <LineView key={l.id} line={l} onSet={setLine} />
                  ))}
                </div>
              ))}
            </section>
          ))}
          {draft.words ? (
            <section className="section">
              <div className="label">Their own words</div>
              <blockquote className="serif" style={{ fontSize: 26, fontStyle: 'italic', margin: '6px 0' }}>“{draft.words.text}”</blockquote>
              <LineView line={draft.words.context} onSet={setLine} />
            </section>
          ) : null}
          {draft.figures ? (
            <section className="section">
              <div className="label machine-h">{draft.figures.title}</div>
              {draft.figures.rows.map((r) => (
                <LineView key={r.line.id} label={r.value} line={r.line} onSet={setLine} />
              ))}
            </section>
          ) : null}
          {draft.dates.length ? (
            <section className="section">
              <div className="label">A life in dates</div>
              {draft.dates.map((d) => (
                <LineView key={d.line.id} label={d.year} line={d.line} onSet={setLine} />
              ))}
            </section>
          ) : null}
          {draft.reading.length ? (
            <section className="section">
              <div className="label">Further reading</div>
              <ul className="life-sources">
                {draft.reading.map((r, i) => (
                  <li key={i}>
                    {r.author}, <i>{r.title}</i>
                    {r.year ? `, ${r.year}` : ''}
                    {r.url ? (
                      <>
                        {' '}
                        <a href={safeHref(r.url)} target="_blank" rel="noopener noreferrer">
                          Link
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="section life-approve">
            {undecided ? (
              <div className="row">
                <button className="btn small" onClick={() => call(() => api.post<LifeView>(`/api/items/${id}/life/all`, { status: 'kept' }), `Kept the ${undecided} still to read`)}>
                  Keep the {undecided} still to read
                </button>
              </div>
            ) : null}
            {data.problems.length && !data.approvedAt ? (
              <ul className="bad small">
                {data.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            ) : null}
            {data.approvedAt ? (
              <p className="small">
                Approved {new Date(data.approvedAt).toLocaleString('en-IN')}. It prints as it stands; any change asks for approval again.{' '}
                <button className="btn quiet small" onClick={() => call(() => api.post<LifeView>(`/api/items/${id}/life/approve`, { approve: false }), 'Approval withdrawn')}>
                  Withdraw approval
                </button>
              </p>
            ) : (
              <button className="btn primary" disabled={undecided > 0} onClick={() => call(() => api.post<LifeView>(`/api/items/${id}/life/approve`, { approve: true }))}>
                Approve the profile
              </button>
            )}
          </section>
        </>
      )}

      <div className="section" style={{ marginTop: 26 }}>
        <ChecksPanel checks={item.data.checks} />
      </div>
    </div>
  );
}

/** The editor's note, autosaved, in their serif. Dictated notes come in through the voice-note path. */
function WhyNote({ detail }: { detail: ItemDetail }) {
  const why = useAutosave(`why:${detail.item.id}`, detail.item.why_text ?? '', (v) => api.patch(`/api/items/${detail.item.id}`, { why_text: v }));
  return (
    <label className="field" style={{ marginTop: 14 }}>
      <span className="label">Why it’s here</span>
      <TextArea className="editor" value={why.value} onChange={(e) => why.onChange(e.target.value)} onBlur={() => void why.flush()} placeholder="In your own words." />
      <SaveNote state={why.state} />
    </label>
  );
}

/** One machine line: its text, keep or cut, and on request the passages it cites. */
function LineView({ line, label, onSet }: { line: DraftLine; label?: string; onSet: (id: string, s: 'kept' | 'cut' | 'proposed') => void }) {
  const [open, setOpen] = useState(false);
  if (line.status === 'rejected') return null;
  return (
    <div className={`life-line ${line.status}`}>
      <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
        <p className="machine life-text">
          {label ? <b className="life-label">{label} </b> : null}
          {line.text}
        </p>
        <div className="row" style={{ gap: 4, flex: 'none' }}>
          <button className={`btn small ${line.status === 'kept' ? 'primary' : 'quiet'}`} aria-pressed={line.status === 'kept'} onClick={() => onSet(line.id, line.status === 'kept' ? 'proposed' : 'kept')}>
            Keep
          </button>
          <button className={`btn small ${line.status === 'cut' ? 'primary' : 'quiet'}`} aria-pressed={line.status === 'cut'} onClick={() => onSet(line.id, line.status === 'cut' ? 'proposed' : 'cut')}>
            Cut
          </button>
        </div>
      </div>
      <button className="btn quiet small" onClick={() => setOpen(!open)} aria-expanded={open}>
        Where{line.cites.length > 1 ? ` (${line.cites.length})` : ''}
      </button>
      {open ? (
        <ul className="life-cites">
          {line.cites.map((c, i) => (
            <li key={i}>
              <b>{c.source}</b>
              {c.at ? ` ${c.at}` : ''}: <q className="serif">{c.quote}</q>
            </li>
          ))}
          {line.reason ? <li>Checker: {line.verdict}. {line.reason}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
