-- 2026-10-24: rich media on an item (Item.blocks in the bundle), the new item fields, and each
-- Haul's edition colour. Additive only; existing rows keep NULL and publish exactly as before.

-- What the editor adds to an item, printed in order after the note and the excerpt: pull quotes and
-- code (both excerpts: matched against the stored source text), video and audio embeds (resolved
-- from the editor's link by code), and pictures (with the credit and licence the editor states).
CREATE TABLE blocks (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                 -- quote, code, video, audio, image
  body       TEXT NOT NULL,                 -- JSON: the bundle Block, without public URLs (see blocks.ts)
  media_key  TEXT,                          -- MEDIA key of a video poster or a picture
  mime       TEXT,
  status     TEXT NOT NULL DEFAULT 'kept',  -- kept (printed) or cut (kept on the Desk, never printed)
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX blocks_item ON blocks (item_id, position);

ALTER TABLE items ADD COLUMN year INTEGER;     -- the year the work was made, when source_date does not say it
ALTER TABLE items ADD COLUMN handle TEXT;      -- a social post's handle, e.g. "@visakanv"
ALTER TABLE items ADD COLUMN recipient TEXT;   -- who a letter was written to
ALTER TABLE items ADD COLUMN place TEXT;       -- where a letter was written or a speech given

ALTER TABLE hauls ADD COLUMN edition TEXT;     -- one of EDITIONS (tokens.ts); NULL means editionOf(number)
