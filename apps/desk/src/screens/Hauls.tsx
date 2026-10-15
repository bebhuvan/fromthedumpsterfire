import { haulSlug } from '@fdf/shared/haul';
import { api, type HaulListRow } from '../api';
import { Link, navigate, useLoad, useToast } from '../lib/core';

export function Hauls() {
  const toast = useToast();
  const { data } = useLoad(() => api.get<{ hauls: HaulListRow[] }>('/api/hauls'), []);
  const hauls = data?.hauls ?? [];
  const next = (hauls[0]?.number ?? 0) + 1;
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="row between">
        <div>
          <div className="label">Hauls</div>
          <h1 className="display" style={{ fontSize: 40, margin: '6px 0 0' }}>
            Every issue, <i>in order</i>
          </h1>
        </div>
        <button
          className="btn primary"
          onClick={async () => {
            try {
              const r = await api.post<{ haul: { id: string } }>('/api/hauls');
              navigate(`/haul/${r.haul.id}`);
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e), true);
            }
          }}
        >
          Start Haul {haulSlug(next)}
        </button>
      </div>
      {!data ? (
        <p className="tray-empty">Opening…</p>
      ) : hauls.length === 0 ? (
        <p className="tray-empty">No Hauls yet. Start the first one, then add items from the tray.</p>
      ) : (
        <div className="hauls">
          {hauls.map((h) => (
            <Link key={h.id} to={`/haul/${h.id}`} className="haul-card" style={{ ['--sw' as string]: `var(--${h.swatch})` }}>
              <div className="label ink">
                Haul {haulSlug(h.number)} · {h.status === 'published' ? `published${h.version > 1 ? `, v${h.version}` : ''}` : 'draft'} · {h.item_count} items
              </div>
              <div className="display">
                {h.title_text || 'Untitled'} {h.title_italic && <i>{h.title_italic}</i>}
              </div>
              {h.deck && <p className="serif" style={{ margin: '8px 0 0', fontSize: 15.5 }}>{h.deck}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
