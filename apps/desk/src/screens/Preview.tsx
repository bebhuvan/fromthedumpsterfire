// A preview of the assembled bundle, laid out like the reader app (cover, field note, items).
// Everything here comes from the bundle that would be published, rendered as text (never as HTML).

import { haulSlug, type Haul, type Item } from '@fdf/shared/haul';
import { typeLabel, typeSwatch } from '@fdf/shared/tokens';
import { safeHref } from '../lib/core';

function Highlighted({ text, highlight }: { text: string; highlight?: string }) {
  if (!highlight) return <>{text}</>;
  const i = text.indexOf(highlight);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{highlight}</mark>
      {text.slice(i + highlight.length)}
    </>
  );
}

function ItemPreview({ item, n, total }: { item: Item; n: number; total: number }) {
  const sw = `var(--${typeSwatch[item.type]})`;
  return (
    <article style={{ ['--type' as string]: sw, borderTop: '1px solid var(--rule)' }}>
      <div className="pv-item-head" style={{ background: sw }}>
        <div className="row between">
          <span className="label ink">{n} of {total}</span>
        </div>
        <div className="label ink" style={{ marginTop: 18 }}>
          {[typeLabel[item.type], item.source.name, item.source.date, item.minutes ? `${item.minutes} min` : null].filter(Boolean).join(' · ')}
        </div>
        <h3 className="display" style={{ fontSize: 40, margin: '8px 0 0', lineHeight: 0.98 }}>
          {item.title.text} {item.title.italic && <i>{item.title.italic}</i>}
        </h3>
        {item.creator && <div className="serif" style={{ fontStyle: 'italic', fontSize: 17, marginTop: 8 }}>{item.creator}</div>}
      </div>
      <div className="pv-body">
        <div className="h2" style={{ marginTop: 22 }}>Why it's here</div>
        <p className="why">{item.why.text || '(missing)'}</p>
        {item.excerpt && (
          <blockquote className="pv-quote" style={{ margin: '24px 0 0' }}>
            <Highlighted text={item.excerpt.text} highlight={item.excerpt.highlight} />
            <div className="small muted" style={{ fontFamily: 'var(--sans)', marginTop: 8 }}>{item.excerpt.locator} · matched word for word against the source</div>
          </blockquote>
        )}
        {item.marginalia.length > 0 && (
          <div className="pv-marg">
            <div className="label machine" style={{ color: 'var(--machine)' }}>Marginalia</div>
            {item.marginalia.map((m, i) => (
              <p key={i} className="machine" style={{ margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.55 }}>
                {m.text} <span className="muted small">({m.cite})</span>
              </p>
            ))}
          </div>
        )}
        {item.wiki.length > 0 && (
          <>
            <div className="h2" style={{ marginTop: 24 }}>Further, via Wikipedia</div>
            {item.wiki.map((w) => (
              <div key={w.url} style={{ borderTop: '1px solid var(--rule)', padding: '10px 0' }}>
                <a className="serif" href={safeHref(w.url)} target="_blank" rel="noreferrer noopener" style={{ fontSize: 17 }}>
                  {w.title} ↗
                </a>
                <div className="serif muted" style={{ fontSize: 14.5 }}>{w.summary}</div>
              </div>
            ))}
          </>
        )}
        {item.connections.length > 0 && (
          <>
            <div className="h2" style={{ marginTop: 24 }}>Where it connects</div>
            {item.connections.map((c, i) => (
              <div key={i} className="panel plate" style={{ marginTop: 8 }}>
                <div className="label ink">{c.type}</div>
                <div className="serif" style={{ fontSize: 17 }}>{c.title}</div>
                <div className="serif" style={{ fontSize: 14.5 }}>{c.note}</div>
              </div>
            ))}
          </>
        )}
        <a className="btn primary" style={{ marginTop: 24, width: '100%', justifyContent: 'space-between' }} href={safeHref(item.source.url)} target="_blank" rel="noreferrer noopener">
          <span className="serif" style={{ fontStyle: 'italic', fontWeight: 400, fontSize: 16 }}>Read the original</span> ↗
        </a>
      </div>
    </article>
  );
}

export function Preview({ haul }: { haul: Haul }) {
  const fn = haul.fieldNote;
  return (
    <div className="preview-wrap">
      <div className="phone" aria-label="Preview of the Haul">
        <div className="pv-cover" style={{ background: `var(--${haul.swatch})` }}>
          <div className="label ink">From the Dumpster Fire · Haul {haulSlug(haul.number)}</div>
          <div className="display">
            {haul.title.text || 'Untitled'} {haul.title.italic && <i>{haul.title.italic}</i>}
          </div>
          <p className="serif" style={{ fontSize: 17, margin: '14px 0 0' }}>{haul.deck}</p>
        </div>
        <div className="pv-body">
          <div className="label" style={{ marginTop: 22 }}>Field note</div>
          <h3 className="display" style={{ fontSize: 32, margin: '6px 0 0' }}>
            {fn.title.text} {fn.title.italic && <i>{fn.title.italic}</i>}
          </h3>
          {fn.paragraphs.map((p, i) => (
            <p key={i} className="serif" style={{ fontSize: 17.5, lineHeight: 1.55, margin: '12px 0 0', ['--type' as string]: `var(--${haul.swatch})` }}>
              <Highlighted text={p} highlight={fn.highlight && p.includes(fn.highlight) ? fn.highlight : undefined} />
            </p>
          ))}
          {fn.route.length > 0 && (
            <>
              <div className="label" style={{ marginTop: 22 }}>The route</div>
              {fn.route.map((r, i) => (
                <div key={i} className="route-step" style={{ marginTop: 8, gridTemplateColumns: '44px 1fr' }}>
                  <span className="label">{r.day}</span>
                  <span className={r.by === 'machine' ? 'machine' : 'serif'} style={{ fontSize: r.by === 'machine' ? 14 : 16 }}>{r.text}</span>
                </div>
              ))}
            </>
          )}
        </div>
        {haul.items.map((it, i) => (
          <ItemPreview key={it.id} item={it} n={i + 1} total={haul.items.length} />
        ))}
        <div className="pv-body" style={{ borderTop: '1px solid var(--rule)' }}>
          <div className="label" style={{ marginTop: 20 }}>Colophon</div>
          <p className="serif muted" style={{ fontSize: 14.5 }}>{haul.colophon}</p>
          {haul.corrections?.map((c, i) => (
            <p key={i} className="small muted">Correction, {c.date}: {c.text}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
