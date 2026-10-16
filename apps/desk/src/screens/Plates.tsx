// Plates: public-domain images for an item or a Haul cover. The machine proposes collection
// searches; the editor can search too, then picks one or none. Everything shown comes from the
// holding institution: title, maker, date, licence and a link to the work's page.

import { useState } from 'react';
import { api, type PlateCandidate } from '../api';
import { safeHref, useToast } from '../lib/core';
import { Spinner, TextArea } from '../ui/parts';

const PROVIDER: Record<PlateCandidate['provider'], string> = {
  commons: 'Wikimedia Commons',
  aic: 'Art Institute of Chicago',
  met: 'The Met',
  smithsonian: 'Smithsonian',
  rijksmuseum: 'Rijksmuseum',
};

type Target = { kind: 'item'; id: string } | { kind: 'haul'; id: string };

export function PlatesSection({ target, plates: initial, decision, onChange, title = 'Plate' }: { target: Target; plates: PlateCandidate[]; decision: string | null; onChange: () => void; title?: string }) {
  const toast = useToast();
  const [plates, setPlates] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showSetAside, setShowSetAside] = useState(false);
  if (seen !== initial) {
    setSeen(initial);
    setPlates(initial);
  }
  const base = target.kind === 'item' ? `/api/items/${target.id}` : `/api/hauls/${target.id}`;
  const chosen = plates.find((p) => p.status === 'chosen' && p.id === decision) ?? null;
  const live = plates.filter((p) => p.status !== 'rejected' && p.id !== chosen?.id);
  const setAside = plates.filter((p) => p.status === 'rejected');

  async function run<T extends { plates?: PlateCandidate[] }>(label: string, fn: () => Promise<T>, done?: (r: T) => string) {
    setBusy(label);
    try {
      const r = await fn();
      if (r.plates) setPlates(r.plates);
      if (done) toast(done(r));
      onChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="section">
      <div className="row between">
        <h2 className="h2">{title}</h2>
        <span className="small muted">Public domain only, never generated</span>
      </div>

      {chosen ? (
        <ChosenPlate plate={chosen} onSaved={(p) => setPlates(plates.map((x) => (x.id === p.id ? p : x)))} />
      ) : decision === 'none' ? (
        <p className="small muted" style={{ margin: 0 }}>You chose no plate. Pick one below to change that.</p>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {live.length ? 'Pick one, or choose no plate.' : 'No candidates yet. Search the open collections below.'}
        </p>
      )}

      {live.length > 0 && (
        <div className="plates">
          {live.map((p) => (
            <PlateCard
              key={p.id}
              plate={p}
              busy={busy === p.id}
              onChoose={() => run(p.id, () => api.post<{ plate: PlateCandidate }>(`/api/plates/${p.id}/choose`).then((r) => ({ plates: plates.map((x) => (x.id === r.plate.id ? r.plate : x.status === 'chosen' ? { ...x, status: 'candidate' as const } : x)) })), () => 'Plate chosen and copied to the Desk')}
              onSetAside={() => run(`aside-${p.id}`, () => api.patch<{ plate: PlateCandidate }>(`/api/plates/${p.id}`, { status: 'rejected' }).then((r) => ({ plates: plates.map((x) => (x.id === r.plate.id ? r.plate : x)) })))}
            />
          ))}
        </div>
      )}
      {busy && busy.startsWith('pl_') && <Spinner text="Fetching the image and checking the institution's page…" />}

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) void run('search', () => api.post<{ added: number; plates: PlateCandidate[] }>(`${base}/plates`, { query: q.trim() }), (r) => (r.added ? `Found ${r.added} public-domain image${r.added === 1 ? '' : 's'}` : 'Nothing public-domain came back for that'));
        }}
      >
        <input className="input" style={{ flex: '1 1 220px' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the collections: “Thames 1858 engraving”" aria-label="Search for a plate" />
        <button className="btn small" type="submit" disabled={q.trim().length < 2 || !!busy}>
          {busy === 'search' ? 'Searching…' : 'Search'}
        </button>
      </form>
      <div className="row">
        {target.kind === 'item' ? (
          <button className="btn quiet small" disabled={!!busy} onClick={() => run('suggest', () => api.post<{ added: number; queries: string[]; plates: PlateCandidate[] }>(`${base}/plates/suggest`), (r) => `Searched for ${r.queries.map((x) => `“${x}”`).join(', ') || 'nothing'}: ${r.added} new`)}>
            {busy === 'suggest' ? 'Asking…' : 'Ask the machine for searches'}
          </button>
        ) : (
          <button className="btn quiet small" disabled={!!busy} onClick={() => run('items', () => api.post<{ added: number; plates: PlateCandidate[] }>(`${base}/plates/from-items`), (r) => `${r.added} candidate${r.added === 1 ? '' : 's'} from this Haul's items`)}>
            Use the items' candidates
          </button>
        )}
        {decision !== 'none' ? (
          <button className="btn quiet small" disabled={!!busy} onClick={() => run('none', () => api.post<{ plates: PlateCandidate[] }>(`${base}/${target.kind === 'item' ? 'plate-none' : 'cover-none'}`, { none: true }), () => 'No plate')}>
            No plate
          </button>
        ) : (
          <button className="btn quiet small" disabled={!!busy} onClick={() => run('none', () => api.post<{ plates: PlateCandidate[] }>(`${base}/${target.kind === 'item' ? 'plate-none' : 'cover-none'}`, { none: false }))}>
            Undo no plate
          </button>
        )}
        {setAside.length > 0 && (
          <button className="btn quiet small" onClick={() => setShowSetAside((s) => !s)}>
            {showSetAside ? 'Hide' : 'Show'} {setAside.length} set aside
          </button>
        )}
      </div>
      {showSetAside && (
        <div className="plates">
          {setAside.map((p) => (
            <PlateCard key={p.id} plate={p} onChoose={() => run(`back-${p.id}`, () => api.patch<{ plate: PlateCandidate }>(`/api/plates/${p.id}`, { status: 'candidate' }).then((r) => ({ plates: plates.map((x) => (x.id === r.plate.id ? r.plate : x)) })))} chooseLabel="Restore" />
          ))}
        </div>
      )}
    </section>
  );
}

function PlateCard({ plate: p, onChoose, onSetAside, busy, chooseLabel = 'Use this' }: { plate: PlateCandidate; onChoose: () => void; onSetAside?: () => void; busy?: boolean; chooseLabel?: string }) {
  return (
    <div className={`plate-card${p.status === 'rejected' ? ' rejected' : ''}`}>
      <div className="frame">
        <img src={`/api/plates/${p.id}/thumb`} alt={p.title} loading="lazy" />
      </div>
      <span className="t">{p.title}</span>
      <span className="m">
        {[p.creator, p.date].filter(Boolean).join(', ')}
        {p.creator || p.date ? ' · ' : ''}
        {PROVIDER[p.provider]}
      </span>
      <span className="row" style={{ gap: 4 }}>
        <span className="licence">{p.licence}</span>
        <span className="m" title={`Found for “${p.query}”`}>{p.query_by === 'machine' ? 'machine search' : 'your search'}</span>
      </span>
      <span className="row" style={{ gap: 4 }}>
        <button type="button" className="btn small" disabled={busy} onClick={onChoose}>
          {busy ? 'Copying…' : chooseLabel}
        </button>
        {onSetAside && (
          <button type="button" className="btn quiet small" onClick={onSetAside}>
            Set aside
          </button>
        )}
        <a className="btn quiet small" href={safeHref(p.source_url)} target="_blank" rel="noreferrer noopener" aria-label="The work's page at the institution">
          ↗
        </a>
      </span>
    </div>
  );
}

function ChosenPlate({ plate: p, onSaved }: { plate: PlateCandidate; onSaved: (p: PlateCandidate) => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(p.caption ?? '');
  return (
    <div className="plate-chosen">
      <img src={`/api/plates/${p.id}/thumb`} alt={p.caption ?? p.title} style={p.width && p.height ? { aspectRatio: `${p.width} / ${p.height}` } : undefined} />
      <div className="stack" style={{ gap: 8 }}>
        <div className="label ink">Chosen</div>
        {editing ? (
          <>
            <TextArea className="compact" value={caption} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" />
            <div className="row">
              <button
                className="btn small primary"
                onClick={async () => {
                  try {
                    const r = await api.patch<{ plate: PlateCandidate }>(`/api/plates/${p.id}`, { caption });
                    onSaved(r.plate);
                    setEditing(false);
                  } catch (e) {
                    toast(e instanceof Error ? e.message : String(e), true);
                  }
                }}
              >
                Save caption
              </button>
              <button className="btn quiet small" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <p className="plate-caption" style={{ margin: 0 }}>
            {p.caption} <span className="muted">{p.institution}, {p.licence}.</span>
          </p>
        )}
        <div className="small muted">
          {p.width && p.height ? `${p.width} × ${p.height} · ` : ''}
          <a href={safeHref(p.source_url)} target="_blank" rel="noreferrer noopener">
            The work at {p.institution} ↗
          </a>
        </div>
        {!editing && (
          <div className="row">
            <button className="btn quiet small" onClick={() => (setCaption(p.caption ?? ''), setEditing(true))}>
              Edit caption
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
