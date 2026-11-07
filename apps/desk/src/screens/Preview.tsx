// A preview of the assembled bundle, laid out like the reader app (cover, field note, items).
// Everything here comes from the bundle that would be published, rendered as text (never as HTML).

import { haulSlug, type Haul, type Item, type NoteRun } from '@fdf/shared/haul';
import { linkGroups, markRuns } from '@fdf/shared/fieldnote';
import { editionOf, typeLabel, typeSwatch, type Edition } from '@fdf/shared/tokens';
import { unitsLine } from '@fdf/shared/charts';
import { ChartPreview } from '../lib/charts';
import { safeHref } from '../lib/core';

/** A paragraph of the field note's body: links on the editor's words, italics, the highlight. */
function Runs({ runs, highlight }: { runs: NoteRun[]; highlight?: string }) {
  const piece = (r: NoteRun & { mark?: boolean }, k: number) => {
    const t = r.em ? <i key={k}>{r.text}</i> : <span key={k}>{r.text}</span>;
    return r.mark ? <mark key={k}>{t}</mark> : t;
  };
  return (
    <>
      {linkGroups(markRuns(runs, highlight)).map((g, i) =>
        g.url ? (
          <a key={i} href={safeHref(g.url)} target="_blank" rel="noreferrer noopener">
            {g.runs.map(piece)}
          </a>
        ) : (
          <span key={i}>{g.runs.map(piece)}</span>
        ),
      )}
    </>
  );
}

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

function ItemPreview({ item, n, total, edition }: { item: Item; n: number; total: number; edition: Edition }) {
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
        {item.blocks?.map((b, i) =>
          b.kind === 'chart' ? (
            <figure key={i} style={{ margin: '24px 0 0' }}>
              <div className="serif" style={{ fontSize: 21 }}>{b.chart.title}</div>
              {b.chart.note && <div className="serif" style={{ fontStyle: 'italic', fontSize: 15.5 }}>{b.chart.note}</div>}
              <div className="small muted" style={{ margin: '4px 0 8px' }}>{unitsLine(b.chart)}</div>
              <ChartPreview chart={b.chart} layout="wide" edition={edition} width="100%" />
              <figcaption className="small muted" style={{ marginTop: 6 }}>
                {b.chart.sources.map((s) => `${s.maker}, ${s.dataset}`).join('; ')}
                {b.images ? '' : ' · the app’s pictures are drawn at publish'}
              </figcaption>
            </figure>
          ) : null,
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
          {fn.body
            ? fn.body.map((b, i) => {
                const para = { fontSize: 17.5, lineHeight: 1.55, margin: '12px 0 0', ['--type' as string]: `var(--${haul.swatch})` };
                if (b.kind === 'paragraph') return <p key={i} className="serif" style={para}><Runs runs={b.runs} highlight={fn.highlight} /></p>;
                if (b.kind === 'heading') return <h4 key={i} className="display" style={{ fontSize: 22, margin: '22px 0 0' }}>{b.text}</h4>;
                if (b.kind === 'quotation')
                  return (
                    <blockquote key={i} style={{ margin: '12px 0 0 14px', paddingLeft: 12, borderLeft: '2px solid var(--rule)' }}>
                      {b.paragraphs.map((runs, k) => <p key={k} className="serif" style={{ ...para, margin: k ? '8px 0 0' : 0 }}><Runs runs={runs} highlight={fn.highlight} /></p>)}
                    </blockquote>
                  );
                return (
                  <div key={i} className="small" style={{ margin: '14px 0 0', padding: '10px 12px', border: '1px solid var(--rule)' }}>
                    <span className="label">{b.kind === 'post' ? 'X post' : b.kind === 'audio' ? 'Podcast' : 'Video'}</span>{' '}
                    {b.kind === 'post' ? `${b.author} (@${b.handle}): ${b.text}` : b.title}
                  </div>
                );
              })
            : fn.paragraphs.map((p, i) => (
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
          <ItemPreview key={it.id} item={it} n={i + 1} total={haul.items.length} edition={editionOf(haul.number, haul.edition)} />
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
