// Before a Haul goes out: one list, per item, of what is wrong or doubtful, each with a link to the
// place it is fixed. Two sources: the Desk's own checks (missing maker, quotation set as the editor's
// words, paywall teaser, missing date, doubtful Wikipedia card, unticked suggestions) and publish's
// dry run (what would refuse the publish). Nothing here publishes.

import { haulSlug } from '@fdf/shared/haul';
import { plainPath, plainProblem, type FixAt } from '@fdf/shared/prepublish';
import { api, displayTitle, type HaulDetail, type HaulReviewItem, type PreviewResult } from '../api';
import { Link, useLoad } from '../lib/core';
import { deskTypeLabel, Spinner } from '../ui/parts';

interface Row {
  severity: 'wrong' | 'doubt';
  text: string;
  to: string;
}

const STEP: Record<FixAt, string> = {
  why: '#step-why',
  details: '#step-details',
  source: '#step-source',
  notes: '#step-notes',
  excerpt: '#step-excerpt',
  plate: '#step-plate',
  item: '',
  suggestions: '',
};

export function HaulCheck({ id }: { id: string }) {
  const haul = useLoad(() => api.get<HaulDetail>(`/api/hauls/${id}`), [id]);
  const review = useLoad(() => api.get<{ items: HaulReviewItem[] }>(`/api/hauls/${id}/review`), [id]);
  const preview = useLoad(() => api.get<PreviewResult>(`/api/hauls/${id}/preview`), [id]);
  const h = haul.data?.haul;
  const items = review.data?.items ?? [];

  const fixAt = (itemId: string, fix: FixAt) => (fix === 'suggestions' ? `/haul/${id}/suggestions#s-${itemId}` : `/item/${itemId}${STEP[fix]}`);

  // Publish's own problems, joined to the item they belong to; the Haul's own fields kept apart.
  const perItem = new Map<string, Row[]>();
  const haulRows: Row[] = [];
  const push = (itemId: string | undefined, r: Row) => (itemId ? perItem.set(itemId, [...(perItem.get(itemId) ?? []), r]) : haulRows.push(r));
  const pv = preview.data;
  if (pv) {
    for (const p of pv.problems) {
      const { text, fix } = plainProblem(p.message);
      push(p.itemId, { severity: 'wrong', text, to: p.itemId ? fixAt(p.itemId, fix) : `/haul/${id}` });
    }
    for (const e of pv.bundleErrors) {
      const where = plainPath(e.path);
      const it = where.item != null ? items[where.item] : undefined;
      // An item publish already complained about is not listed twice for the same gap.
      if (it && pv.problems.some((p) => p.itemId === it.id)) continue;
      if (it) push(it.id, { severity: 'wrong', text: `${capital(where.where)}: ${e.message}`, to: fixAt(it.id, 'item') });
      else haulRows.push({ severity: 'wrong', text: `${where.where}: ${e.message}`, to: `/haul/${id}${/field note/i.test(where.where) ? '#field-note' : '#cover'}` });
    }
    for (const w of pv.warnings) {
      const where = plainPath(w.path);
      const it = where.item != null ? items[where.item] : undefined;
      push(it?.id, { severity: 'doubt', text: it ? `${capital(where.where)}: ${w.message}` : w.message, to: it ? fixAt(it.id, 'item') : `/haul/${id}` });
    }
  }
  for (const it of items) for (const i of it.issues) push(it.id, { severity: i.severity, text: i.message, to: fixAt(it.id, i.fix) });

  const all = [...haulRows, ...[...perItem.values()].flat()];
  const wrong = all.filter((r) => r.severity === 'wrong').length;
  const doubt = all.length - wrong;
  const clean = items.filter((it) => !perItem.get(it.id)?.length);
  const loading = !review.data || !preview.data;
  const failed = review.error || preview.error;

  return (
    <div className="check-page stack" style={{ gap: 22 }}>
      <div>
        <Link to={`/haul/${id}`} className="back small">
          ← {h ? `Haul ${haulSlug(h.number)}` : 'The Haul'}
        </Link>
        <h1 className="display" style={{ fontSize: 'clamp(28px, 4vw, 38px)', margin: '8px 0 0' }}>
          Before it goes <i>out</i>
        </h1>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          What is wrong or doubtful, item by item. Each line links to where it is fixed. Nothing here publishes.
        </p>
      </div>

      {failed ? (
        <p className="bad">Could not run the check: {failed}</p>
      ) : loading ? (
        <Spinner text="Checking every item…" />
      ) : (
        <p className={`check-sum ${wrong ? 'bad' : doubt ? 'warn' : 'ok'}`}>
          {wrong || doubt ? [wrong && `${wrong} to fix`, doubt && `${doubt} to look at`].filter(Boolean).join(', ') : 'Nothing found. Every check passes.'}
        </p>
      )}

      {haulRows.length > 0 && (
        <section className="check-item">
          <h2 className="h3">The Haul itself</h2>
          <CheckRows rows={haulRows} />
        </section>
      )}

      {items.map((it, i) =>
        perItem.get(it.id)?.length ? (
          <section key={it.id} className="check-item" data-type={it.type}>
            <h2 className="h3 check-title">
              <span className="num muted">{i + 1}</span>
              <Link to={`/item/${it.id}`}>{displayTitle(it)}</Link>
            </h2>
            <div className="small muted">{deskTypeLabel[it.type]}</div>
            <CheckRows rows={perItem.get(it.id)!} />
          </section>
        ) : null,
      )}

      {!loading && clean.length > 0 && (
        <section className="check-item">
          <h2 className="h3">Nothing to look at</h2>
          <ul className="check-clean">
            {clean.map((it) => (
              <li key={it.id}>
                <span className="num muted">{items.indexOf(it) + 1}</span> <Link to={`/item/${it.id}`}>{displayTitle(it)}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && (
        <div className="row">
          <Link to={`/haul/${id}/suggestions`} className="btn">
            Tick suggestions
          </Link>
          <button type="button" className="btn quiet" onClick={() => void Promise.all([review.reload(), preview.reload()])}>
            Check again
          </button>
        </div>
      )}
    </div>
  );
}

function CheckRows({ rows }: { rows: Row[] }) {
  const sorted = [...rows].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'wrong' ? -1 : 1));
  return (
    <ul className="check-rows">
      {sorted.map((r, k) => (
        <li key={k} className={r.severity}>
          <span className="check-mark">{r.severity === 'wrong' ? 'Fix' : 'Look'}</span>
          <span className="check-text">{r.text}</span>
          <Link to={r.to} className="check-go" aria-label={`Go and fix: ${r.text}`}>
            Go →
          </Link>
        </li>
      ))}
    </ul>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
