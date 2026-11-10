// Where an item stands, said plainly at the top of the item page, with the one step that moves it
// on: add it to the newest draft Haul, or open the Haul it is in. The add shows at once and is
// undone, with the reason, if the Desk refuses it.

import { useEffect, useState } from 'react';
import { haulSlug } from '@fdf/shared/haul';
import { api, type ItemDetail, type Standing, type StandingResult } from '../api';
import { Link } from '../lib/core';

interface Placed {
  standing: Standing;
  haul: ItemDetail['haul'];
  draft: ItemDetail['draftHaul'];
}

export function StandingBar({ detail, onChange }: { detail: ItemDetail; onChange?: () => void }) {
  const itemId = detail.item.id;
  const [placed, setPlaced] = useState<Placed>({ standing: detail.standing, haul: detail.haul, draft: detail.draftHaul });
  const [busy, setBusy] = useState<'add' | 'out' | null>(null);
  const [failed, setFailed] = useState<{ how: 'add' | 'out'; message: string } | null>(null);
  useEffect(() => setPlaced({ standing: detail.standing, haul: detail.haul, draft: detail.draftHaul }), [detail.standing, detail.haul, detail.draftHaul]);

  async function move(how: 'add' | 'out') {
    const target = how === 'add' ? placed.draft : placed.haul;
    if (!target || busy) return;
    const before = placed;
    setFailed(null);
    setBusy(how);
    // Show the result before the Desk answers.
    setPlaced(
      how === 'add'
        ? { ...placed, standing: { state: 'haul', text: `In Haul ${haulSlug(target.number)}, not yet published` }, haul: { id: target.id, number: target.number, status: 'draft', version: 0 } }
        : { ...placed, standing: { state: 'desk', text: 'On the Desk, not in a Haul' }, haul: null },
    );
    try {
      const path = `/api/hauls/${target.id}/items/${itemId}`;
      const r = how === 'add' ? await api.post<StandingResult>(path) : await api.del<StandingResult>(path);
      setPlaced({ standing: r.standing, haul: r.haul, draft: r.draft });
      onChange?.();
    } catch (e) {
      setPlaced(before);
      setFailed({ how, message: `${how === 'add' ? 'Not added' : 'Not taken out'}: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  }

  const { standing, haul, draft } = placed;
  const inHaul = Boolean(haul);
  return (
    <div className={`standing st-${standing.state}`} role="status">
      <div className="standing-text">
        <span className="standing-main">{standing.text}</span>
        {busy && <span className="small muted"> · saving…</span>}
        {standing.detail && <span className="standing-detail small muted">{standing.detail}</span>}
        {failed && (
          <span className="standing-detail small bad">
            {failed.message}{' '}
            <button type="button" className="link-btn small" onClick={() => void move(failed.how)}>
              Try again
            </button>
          </span>
        )}
      </div>
      <div className="standing-acts">
        {!inHaul && draft && (
          <button type="button" className="btn primary small" disabled={Boolean(busy)} onClick={() => void move('add')}>
            Add to Haul {haulSlug(draft.number)}
          </button>
        )}
        {!inHaul && !draft && (
          <Link to="/hauls" className="btn small">
            Start a Haul
          </Link>
        )}
        {haul && (
          <Link to={`/haul/${haul.id}`} className="btn small">
            Open Haul {haulSlug(haul.number)}
          </Link>
        )}
        {haul && haul.status !== 'published' && (
          <button type="button" className="btn quiet small" disabled={Boolean(busy)} onClick={() => void move('out')}>
            Take out
          </button>
        )}
      </div>
    </div>
  );
}
