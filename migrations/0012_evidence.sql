-- 2026-11-14: the sources the machine may cite in its margin notes, beyond the piece itself. Each row is
-- a text the Desk fetched itself: a whole Wikipedia article (resolved by code from a model's title) or
-- a page an editorial session found and handed to the Desk, which fetched it through guardedFetch. A
-- note citing one of these quotes it word for word (drafts.body.cite.kind = 'evidence'), and the judge
-- reads the quoted stretch of this text. Private Desk material; only the title and link are published.
-- Additive only.
CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('wiki', 'web')),
  title TEXT NOT NULL,
  -- Who published it ("Wikipedia", "The Guardian"), as the reader sees it beside the note.
  publisher TEXT NOT NULL,
  url TEXT NOT NULL,
  text TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  revision TEXT,
  -- Who asked for it: 'pipeline' or '<writer> (session)'.
  via TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  UNIQUE (item_id, url)
);
CREATE INDEX evidence_item ON evidence (item_id);
