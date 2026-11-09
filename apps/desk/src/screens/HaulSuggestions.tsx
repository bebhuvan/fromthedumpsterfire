// Every margin note, big idea and Wikipedia card across a Haul's items on one page, each with its
// source line and a tick, so the editor can go through them in one sitting on a phone instead of
// opening each item. Ticks show at once; one the Desk refuses goes back and says so on its row.
// Only ticked lines print; "Leave out" takes a line out of the queue and off the item page.

import { useEffect, useState } from 'react';
import { haulSlug } from '@fdf/shared/haul';
import { api, displayTitle, type Draft, type HaulDetail, type HaulSuggestionItem, type MarginalBody, type WikiCard } from '../api';
import { Link, safeHref, useLoad } from '../lib/core';
import { Spinner } from '../ui/parts';

type Status = string;
const isIn = (s: Status) => s === 'kept' || s === 'edited';

export function HaulSuggestions({ id }: { id: string }) {
  const haul = useLoad(() => api.get<HaulDetail>(`/api/hauls/${id}`), [id]);
  const { data, error, setData } = useLoad(() => api.get<{ items: HaulSuggestionItem[] }>(`/api/hauls/${id}/suggestions`), [id]);
  const [only, setOnly] = useState(true);
  const [rowState, setRowState] = useState<Record<string, 'saving' | string>>({});
  // Lines ticked on this visit stay in view under "Waiting", so a tick never makes the page jump.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const h = haul.data?.haul;

  useEffect(() => {
    const target = location.hash.slice(1);
    if (data && target) requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }));
  }, [Boolean(data)]);

  async function set(what: 'draft' | 'wiki', itemId: string, rowId: string, status: Status) {
    const apply = (st: Status) =>
      setData((d) =>
        d && {
          items: d.items.map((it) =>
            it.id !== itemId ? it : what === 'draft' ? { ...it, drafts: it.drafts.map((x) => (x.id === rowId ? { ...x, status: st as Draft['status'] } : x)) } : { ...it, wiki: it.wiki.map((x) => (x.id === rowId ? { ...x, status: st as WikiCard['status'] } : x)) },
          ),
        },
      );
    const it = data?.items.find((x) => x.id === itemId);
    const before = what === 'draft' ? it?.drafts.find((x) => x.id === rowId)?.status : it?.wiki.find((x) => x.id === rowId)?.status;
    apply(status);
    setTouched((t) => new Set(t).add(rowId));
    setRowState((r) => ({ ...r, [rowId]: 'saving' }));
    try {
      await api.patch(what === 'draft' ? `/api/drafts/${rowId}` : `/api/wiki/${rowId}`, { status });
      setRowState(({ [rowId]: _, ...r }) => r);
    } catch (e) {
      if (before) apply(before);
      setRowState((r) => ({ ...r, [rowId]: `Not saved: ${e instanceof Error ? e.message : String(e)}` }));
    }
  }

  const items = data?.items ?? [];
  const waiting = (it: HaulSuggestionItem) => it.drafts.filter((d) => d.status === 'proposed').length + it.wiki.filter((w) => w.status === 'proposed').length;
  const total = items.reduce((n, it) => n + waiting(it), 0);
  const shown = (s: Status, rowId: string) => s !== 'cut' && (!only || s === 'proposed' || touched.has(rowId));

  return (
    <div className="sugg-page stack" style={{ gap: 22 }}>
      <div>
        <Link to={`/haul/${id}`} className="back small">
          ← {h ? `Haul ${haulSlug(h.number)}` : 'The Haul'}
        </Link>
        <h1 className="display" style={{ fontSize: 'clamp(28px, 4vw, 38px)', margin: '8px 0 0' }}>
          Tick what <i>prints</i>
        </h1>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          The machine's margin notes, big ideas and further reading for every item in this Haul. Each was checked against its source. Only what you tick is printed.
        </p>
      </div>

      {error ? (
        <p className="bad">Could not open the suggestions: {error}</p>
      ) : !data ? (
        <Spinner text="Gathering suggestions…" />
      ) : (
        <div className="row between sugg-bar">
          <span className={total ? 'warn' : 'ok'}>{total ? `${total} waiting for a tick` : 'Nothing waiting. Every suggestion has an answer.'}</span>
          <div className="tray-tabs" role="group" aria-label="Show">
            <button type="button" aria-pressed={only} onClick={() => setOnly(true)}>
              Waiting
            </button>
            <button type="button" aria-pressed={!only} onClick={() => setOnly(false)}>
              All
            </button>
          </div>
        </div>
      )}

      {items.map((it, i) => {
        const notes = it.drafts.filter((d) => d.kind === 'marginal' && shown(d.status, d.id));
        const ideas = it.drafts.filter((d) => d.kind === 'idea' && shown(d.status, d.id));
        const cards = it.wiki.filter((w) => shown(w.status, w.id));
        if (!notes.length && !ideas.length && !cards.length) return null;
        return (
          <section key={it.id} id={`s-${it.id}`} className="check-item" data-type={it.type}>
            <h2 className="h3 check-title">
              <span className="num muted">{i + 1}</span>
              <Link to={`/item/${it.id}#step-notes`}>{displayTitle(it)}</Link>
            </h2>
            <div className="lines">
              {ideas.map((d) => (
                <Line key={d.id} on={isIn(d.status)} state={rowState[d.id]} label="Big idea" onTick={(on) => void set('draft', it.id, d.id, on ? 'kept' : 'proposed')} onCut={() => void set('draft', it.id, d.id, 'cut')}>
                  <IdeaBody d={d} />
                </Line>
              ))}
              {notes.map((d) => (
                <Line key={d.id} on={isIn(d.status)} state={rowState[d.id]} label="Margin note" onTick={(on) => void set('draft', it.id, d.id, on ? 'kept' : 'proposed')} onCut={() => void set('draft', it.id, d.id, 'cut')}>
                  <p className="note-text">{d.body.text}</p>
                  <span className="note-cite">
                    {d.body.cite.kind === 'source' ? <>From the piece: “{clip(d.body.cite.quote, 140)}”</> : <>From Wikipedia: {d.body.cite.title}</>}
                  </span>
                </Line>
              ))}
              {cards.map((c) => (
                <Line key={c.id} on={c.status === 'kept'} state={rowState[c.id]} label="Further reading" onTick={(on) => void set('wiki', it.id, c.id, on ? 'kept' : 'proposed')} onCut={() => void set('wiki', it.id, c.id, 'cut')}>
                  <a className="serif" style={{ fontSize: 16 }} href={safeHref(c.url)} target="_blank" rel="noreferrer noopener">
                    {c.title} ↗
                  </a>
                  <span className="serif muted" style={{ fontSize: 15 }}>
                    {c.summary}
                  </span>
                </Line>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Line({ on, state, label, onTick, onCut, children }: { on: boolean; state?: string; label: string; onTick: (on: boolean) => void; onCut: () => void; children: React.ReactNode }) {
  return (
    <div className={`line-row${on ? ' on' : ''}`}>
      <label className="tick">
        <input type="checkbox" checked={on} aria-label={on ? `${label}, included; untick to leave it out` : `Include this ${label.toLowerCase()}`} onChange={(e) => onTick(e.target.checked)} />
      </label>
      <div className="stack" style={{ gap: 6, flex: 1 }}>
        <span className="label machine">{label}</span>
        {children}
        <div className="row between small">
          <span className={state && state !== 'saving' ? 'bad' : 'muted'}>{state === 'saving' ? 'Saving…' : state ?? (on ? 'Will print' : '')}</span>
          {!on && (
            <button type="button" className="btn quiet small" onClick={onCut}>
              Leave out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function IdeaBody({ d }: { d: Draft<MarginalBody> }) {
  return (
    <>
      <p className="note-text">{d.body.text}</p>
      {d.body.cite.kind === 'source' && (
        <p className="serif small idea-quote">
          “{clip(d.body.cite.quote.replace(/\s*\n\s*/g, ' '), 220)}”{d.body.locator ? <span className="muted"> · {d.body.locator}</span> : null}
        </p>
      )}
      {d.body.reaction && <p className="serif small" style={{ margin: 0 }}>Your take: {d.body.reaction}</p>}
    </>
  );
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);
