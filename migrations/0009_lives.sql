-- 2026-10-27: Lives, a profile of one person per Haul, written by a model from named sources
-- (packages/server/src/lives.ts, packages/shared/src/life.ts). Additive only.

-- The sources a Life is written from, each fetched by code and kept as text to check quotes against.
-- `key` is the id the profile cites ("guha"); the text is private like every item's source.
CREATE TABLE life_sources (
  id           TEXT PRIMARY KEY,
  item_id      TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  author       TEXT NOT NULL,
  title        TEXT NOT NULL,
  kind         TEXT NOT NULL,               -- book, report, article, reference
  publisher    TEXT,
  year         TEXT,
  url          TEXT NOT NULL,               -- where the text was read
  via          TEXT,                        -- how, when not the work itself
  work_url     TEXT,                        -- the work, to buy or borrow
  status       TEXT NOT NULL DEFAULT 'queued', -- queued, fetched, failed
  detail       TEXT,
  text         TEXT,
  word_count   INTEGER,
  extractor    TEXT,
  meta         TEXT,                        -- JSON SourceMeta: page offsets, where the text came from
  snapshot_key TEXT,                        -- MEDIA key of the fetched bytes
  position     INTEGER NOT NULL DEFAULT 0,
  fetched_at   TEXT,
  created_at   TEXT NOT NULL,
  UNIQUE (item_id, key)
);

-- The profile on the Desk: a LifeDraft (lines with their verbatim quotes and the editor's ticks).
-- Approval covers the draft as it stood; any change to it clears approved_at.
CREATE TABLE lives (
  item_id     TEXT PRIMARY KEY REFERENCES items (id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  writer      TEXT,                         -- who wrote it, e.g. "claude-opus-5-5 (session)"
  problems    TEXT,                         -- JSON: the last check's problems (empty when clean)
  approved_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
