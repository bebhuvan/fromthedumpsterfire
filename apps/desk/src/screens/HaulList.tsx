// The Haul's items in their printed order, as a reader meets them: number, type and source, the
// title, the editor's first line. Each carries its mark (ready, look, fix) and its first problem
// with a link to fix it. Hold a row to drag it to a new place; "⋯" offers the same moves as buttons.

import { useEffect, useRef, useState } from 'react';
import { typeLabel } from '@fdf/shared/tokens';
import { displayTitle, type HaulDetail, type HaulReviewItem } from '../api';
import { Link } from '../lib/core';
import { haulMark, moveTo } from '../lib/offers';
import type { FixAt } from '@fdf/shared/prepublish';

type Row = HaulDetail['items'][number];

const STEP: Record<FixAt, string> = { why: '#step-why', details: '#step-details', source: '#step-source', notes: '#step-notes', excerpt: '#step-excerpt', plate: '#step-plate', item: '', suggestions: '' };

export function HaulList({ haulId, items, review, onOrder }: { haulId: string; items: Row[]; review: HaulReviewItem[] | null; onOrder: (ids: string[]) => void }) {
  const ids = items.map((i) => i.id);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  // While dragging, the page must not scroll under the finger.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => dragRef.current && e.preventDefault();
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  const shown = drag ? moveTo(items, drag.from, drag.over) : items;
  const issuesOf = (id: string) => review?.find((r) => r.id === id)?.issues ?? null;

  /** Where the dragged item lands: after every other item whose middle is above the finger. */
  function overIndex(y: number): number {
    const others = [...(listRef.current?.querySelectorAll<HTMLElement>(':scope > li:not(.moving)') ?? [])];
    return others.filter((r) => r.getBoundingClientRect().top + r.offsetHeight / 2 < y).length;
  }

  return (
    <ol
      className={`haul-list${drag ? ' dragging' : ''}`}
      ref={listRef}
      onPointerMove={(e) => {
        if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8) {
          clearTimeout(hold.current.timer);
          hold.current = null;
        }
        if (drag) setDrag({ ...drag, over: overIndex(e.clientY) });
      }}
      onPointerUp={() => {
        if (hold.current) clearTimeout(hold.current.timer);
        hold.current = null;
        if (drag) {
          if (drag.over !== drag.from) onOrder(moveTo(ids, drag.from, drag.over));
          setDrag(null);
        }
      }}
      onPointerCancel={() => {
        if (hold.current) clearTimeout(hold.current.timer);
        hold.current = null;
        setDrag(null);
      }}
    >
      {shown.map((it, i) => {
        const issues = issuesOf(it.id);
        const mark = issues ? haulMark(issues) : null;
        const first = issues ? [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'wrong' ? -1 : 1))[0] : undefined;
        const moving = drag && it.id === ids[drag.from];
        const at = ids.indexOf(it.id);
        return (
          <li
            key={it.id}
            data-type={it.type}
            className={moving ? 'moving' : undefined}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('a,button') || e.button !== 0) return;
              // Moves and the release keep coming to the list even if the pointer leaves it.
              listRef.current?.setPointerCapture(e.pointerId);
              const { clientX: x, clientY: y } = e;
              hold.current = {
                x,
                y,
                timer: setTimeout(() => {
                  hold.current = null;
                  navigator.vibrate?.(8);
                  setMenu(null);
                  setDrag({ from: at, over: at });
                }, 350),
              };
            }}
          >
            <span className="hl-n num">{i + 1}</span>
            <div className="hl-body">
              <div className="hl-meta">
                <i className="hl-sw" />
                {typeLabel[it.type]}
                {it.source_name ? ` · ${it.source_name}` : ''}
                {moving ? ' · moving…' : ''}
              </div>
              <Link to={`/item/${it.id}`} className="hl-title" draggable={false}>
                {displayTitle(it)}
              </Link>
              {it.why_text?.trim() ? <div className="hl-why">{it.why_text.trim().split('\n')[0]}</div> : <div className="hl-why missing">No note yet</div>}
              {first && (
                <div className={`hl-issue ${first.severity}`}>
                  <span>
                    {first.message}
                    {issues!.length > 1 ? ` (and ${issues!.length - 1} more)` : ''}
                  </span>
                  <Link to={first.fix === 'suggestions' ? `/haul/${haulId}/decide` : `/item/${it.id}${STEP[first.fix]}`}>Go</Link>
                </div>
              )}
              {menu === it.id && (
                <div className="hl-menu row">
                  <button type="button" className="btn quiet small" disabled={at === 0} onClick={() => (onOrder(moveTo(ids, at, at - 1)), setMenu(null))}>
                    Move up
                  </button>
                  <button type="button" className="btn quiet small" disabled={at === ids.length - 1} onClick={() => (onOrder(moveTo(ids, at, at + 1)), setMenu(null))}>
                    Move down
                  </button>
                  <button type="button" className="btn quiet small" disabled={at === 0} onClick={() => (onOrder(moveTo(ids, at, 0)), setMenu(null))}>
                    To the top
                  </button>
                  <button type="button" className="btn quiet small danger" onClick={() => (onOrder(ids.filter((x) => x !== it.id)), setMenu(null))}>
                    Take out
                  </button>
                </div>
              )}
            </div>
            <div className="hl-side">
              <span className={`hl-mark ${mark ?? ''}`}>{mark === 'ok' ? '✓' : mark === 'look' ? 'Look' : mark === 'fix' ? 'Fix' : ''}</span>
              <button type="button" className="hl-more" aria-label={`Move or take out ${displayTitle(it)}`} aria-expanded={menu === it.id} onClick={() => setMenu(menu === it.id ? null : it.id)}>
                ⋯
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
