// Keep or skip: the machine's offers for one item (or a whole Haul) one at a time, each with where
// it comes from. Keep prints it; Skip leaves it out (status 'cut'); Back undoes the last answer.
// Each answer shows at once and goes back, with the reason, if the Desk refuses it. Thumb buttons at
// the bottom, a swipe on the card, or the arrow keys on a laptop.

import { useEffect, useRef, useState } from 'react';
import { api, displayTitle, type HaulSuggestionItem, type ItemDetail, type MarginalBody, type Draft } from '../api';
import { Link, navigate, safeHref, useKeys, useLoad } from '../lib/core';
import { kindLabel, nextOffer, offersFor, type Offer } from '../lib/offers';
import { Spinner } from '../ui/parts';

type Answer = { offer: Offer; status: 'kept' | 'cut' };

export function DecideItem({ id }: { id: string }) {
  const { data, error } = useLoad(() => api.get<ItemDetail>(`/api/items/${id}`), [id]);
  if (error) return <p className="tray-empty">Could not open this item: {error}</p>;
  if (!data) return <Spinner text="Gathering the machine's offer…" />;
  const title = displayTitle(data.item);
  return <Deck title={title} back={`/item/${id}`} offers={offersFor({ id, title }, data.drafts as Draft<MarginalBody>[], data.wiki)} />;
}

export function DecideHaul({ id }: { id: string }) {
  const { data, error } = useLoad(() => api.get<{ items: HaulSuggestionItem[] }>(`/api/hauls/${id}/suggestions`), [id]);
  if (error) return <p className="tray-empty">Could not open the suggestions: {error}</p>;
  if (!data) return <Spinner text="Gathering the machine's offers…" />;
  const offers = data.items.flatMap((it) => offersFor({ id: it.id, title: displayTitle(it) }, it.drafts, it.wiki));
  return <Deck title="This Haul" back={`/haul/${id}`} offers={offers} acrossItems listHref={`/haul/${id}/suggestions`} />;
}

function Deck({ title, back, offers, acrossItems = false, listHref }: { title: string; back: string; offers: Offer[]; acrossItems?: boolean; listHref?: string }) {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const at = nextOffer(offers, new Set(answers.map((a) => a.offer.id)));
  const offer = offers[at];
  const kept = answers.filter((a) => a.status === 'kept').length;

  // Saves for one offer go out in order, so an answer and its undo cannot cross on the way.
  const chains = useRef(new Map<string, Promise<unknown>>());
  const save = (o: Offer, status: 'kept' | 'cut' | 'proposed') => {
    const run = (chains.current.get(o.id) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => api.patch(o.what === 'draft' ? `/api/drafts/${o.id}` : `/api/wiki/${o.id}`, { status }));
    chains.current.set(o.id, run);
    return run;
  };

  function answer(status: 'kept' | 'cut') {
    if (!offer) return;
    const o = offer;
    setFailed(null);
    setAnswers((a) => [...a, { offer: o, status }]);
    setDx(0);
    save(o, status).catch((e) => {
      // Take the answer back: the offer is shown again before the later ones, with the reason.
      setAnswers((a) => a.filter((x) => x.offer.id !== o.id));
      setFailed(`Not saved, so it is back: ${e instanceof Error ? e.message : String(e)}`);
    });
  }

  function undo() {
    const last = answers.at(-1);
    if (!last) return;
    setFailed(null);
    setAnswers((a) => a.filter((x) => x !== last));
    save(last.offer, 'proposed').catch((e) => {
      setAnswers((a) => [...a, last]);
      setFailed(`Could not undo: ${e instanceof Error ? e.message : String(e)}`);
    });
  }

  useKeys({ ArrowRight: () => answer('kept'), ArrowLeft: () => answer('cut'), Backspace: undo, Escape: () => navigate(back) }, [offer, answers]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [at]);

  const head = (
    <div className="deck-top">
      <Link to={back} className="deck-close" aria-label="Close">
        ✕ <span>{title}</span>
      </Link>
      <span className="muted">{offers.length ? `${Math.min(answers.length + 1, offers.length)} of ${offers.length}` : ''}</span>
    </div>
  );

  if (!offers.length)
    return (
      <div className="deck">
        {head}
        <p className="deck-done serif">Nothing is waiting. Every offer has an answer.</p>
        <Link to={back} className="btn">Back</Link>
      </div>
    );

  if (!offer)
    return (
      <div className="deck">
        {head}
        <div className="deck-progress"><i style={{ width: '100%' }} /></div>
        <p className="deck-done serif">
          Done. You kept {kept} and skipped {answers.length - kept}.
        </p>
        <div className="row">
          <Link to={back} className="btn primary">Back to {acrossItems ? 'the Haul' : 'the item'}</Link>
          {answers.length > 0 && <button type="button" className="btn quiet" onClick={undo}>Undo the last one</button>}
          {listHref && <Link to={listHref} className="btn quiet">See them all as a list</Link>}
        </div>
      </div>
    );

  const machine = offer.kind !== 'card';
  return (
    <div className="deck">
      {head}
      <div className="deck-progress"><i style={{ width: `${(answers.length / offers.length) * 100}%` }} /></div>
      <div className="deck-of">
        <span>{kindLabel[offer.kind]}{acrossItems ? <> · <Link to={`/item/${offer.itemId}`}>{offer.itemTitle}</Link></> : null}</span>
        <span>{kept} kept · {answers.length - kept} skipped</span>
      </div>
      <div
        className="deck-card"
        style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 40}deg)` : undefined, opacity: dx ? Math.max(0.4, 1 - Math.abs(dx) / 400) : undefined }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('a,button')) return;
          start.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const x = e.clientX - start.current.x;
          if (Math.abs(x) > Math.abs(e.clientY - start.current.y)) setDx(x);
        }}
        onPointerUp={() => {
          start.current = null;
          if (dx > 90) answer('kept');
          else if (dx < -90) answer('cut');
          else setDx(0);
        }}
        onPointerCancel={() => ((start.current = null), setDx(0))}
      >
        {machine ? (
          <>
            <div className="deck-who">MACHINE</div>
            <p className="deck-line">{offer.text}</p>
          </>
        ) : (
          <a className="deck-title serif" href={safeHref(offer.from.url)} target="_blank" rel="noreferrer noopener">
            {offer.text} ↗
          </a>
        )}
        <div className="deck-src">
          <div className="deck-from">
            {offer.from.label}
            {offer.from.locator ? ` · ${offer.from.locator}` : ''}
          </div>
          {offer.from.words && <p className="deck-words serif">{machine && offer.kind === 'idea' ? `“${offer.from.words}”` : offer.from.words}</p>}
          {machine && <div className="small ok">✓ Matches its source</div>}
        </div>
        <div className="deck-links small">
          <Link to={`/item/${offer.itemId}#step-notes`}>Edit the wording</Link>
          {answers.length > 0 && (
            <>
              {' · '}
              <button type="button" className="link-btn" onClick={undo}>
                Back
              </button>
            </>
          )}
        </div>
        {failed && <p className="small bad">{failed}</p>}
      </div>
      <div className="deck-choose">
        <button type="button" className="btn" onClick={() => answer('cut')}>
          Skip
        </button>
        <button type="button" className="btn primary" onClick={() => answer('kept')}>
          Keep
        </button>
      </div>
      <p className="deck-hint">or swipe: left to skip, right to keep</p>
    </div>
  );
}
