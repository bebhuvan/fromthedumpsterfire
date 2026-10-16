-- Milestone 6 on the Desk: public-domain plates, embeddings for connection candidates, machine-
-- suggested connections with verified quotes from both ends, Threads, Rhymes, and the playable
-- format of voice notes. Additive only: every earlier column keeps its meaning, except items.plate,
-- which now holds the editor's plate decision (NULL undecided, 'none', or a plates.id).

-- Candidate images for an item or a Haul cover. Models only propose search queries; code queries the
-- open-access APIs and records exactly what each one says about the work and its licence.
CREATE TABLE plates (
  id           TEXT PRIMARY KEY,
  item_id      TEXT REFERENCES items (id) ON DELETE CASCADE,
  haul_id      TEXT REFERENCES hauls (id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,                -- commons, aic, met, smithsonian, rijksmuseum
  provider_id  TEXT NOT NULL,                -- the provider's own id for the work or file
  query        TEXT NOT NULL,
  query_by     TEXT NOT NULL DEFAULT 'machine', -- machine or editor
  title        TEXT NOT NULL,
  creator      TEXT,
  date         TEXT,
  institution  TEXT NOT NULL,
  licence      TEXT NOT NULL,                -- e.g. "Public domain", "CC0"
  licence_url  TEXT,
  source_url   TEXT NOT NULL,                -- the work's page at the institution
  image_url    TEXT NOT NULL,                -- a sane-size rendition (about 1200px wide)
  thumb_url    TEXT,
  width        INTEGER,
  height       INTEGER,
  caption      TEXT,                         -- defaults from the metadata; the editor may rewrite it
  status       TEXT NOT NULL DEFAULT 'candidate', -- candidate, chosen, rejected
  check_status INTEGER,                      -- HTTP status of the image fetch-check
  checked_at   TEXT,
  r2_key       TEXT,                         -- MEDIA key of the copied image, once chosen
  mime         TEXT,
  bytes        INTEGER,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX plates_item ON plates (item_id, status);
CREATE INDEX plates_haul ON plates (haul_id, status);
CREATE UNIQUE INDEX plates_unique ON plates (COALESCE(item_id, ''), COALESCE(haul_id, ''), provider, provider_id);

ALTER TABLE hauls ADD COLUMN cover_plate TEXT;   -- NULL undecided, 'none', or a plates.id

-- What was embedded into Vectorize for each item: source chunks (offsets into sources.text) and
-- one vector for the reading card. The vector id is chunks.id.
CREATE TABLE chunks (
  id         TEXT PRIMARY KEY,                -- <itemId>:<n> or <itemId>:card
  item_id    TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  n          INTEGER NOT NULL,
  kind       TEXT NOT NULL,                   -- chunk or card
  start      INTEGER,
  end        INTEGER,
  model      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX chunks_item ON chunks (item_id);

-- Machine-suggested connections. Each carries a quote from both ends, verified verbatim against the
-- stored source text, and the judge's confidence. The editor approves (with a note in their own
-- words), rejects, or leaves it.
CREATE TABLE suggestions (
  id            TEXT PRIMARY KEY,
  from_item_id  TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  to_item_id    TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  note          TEXT NOT NULL,                -- the machine's one-sentence justification
  editor_note   TEXT,                         -- the editor's words, published as the connection note
  from_quote    TEXT NOT NULL,
  from_start    INTEGER NOT NULL,
  from_end      INTEGER NOT NULL,
  to_quote      TEXT NOT NULL,
  to_start      INTEGER NOT NULL,
  to_end        INTEGER NOT NULL,
  confidence    REAL NOT NULL,
  routes        TEXT NOT NULL DEFAULT '{}',   -- JSON: why the pair was a candidate
  status        TEXT NOT NULL DEFAULT 'proposed', -- proposed, approved, rejected
  connection_id TEXT,
  model         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX suggestions_from ON suggestions (from_item_id, status);
CREATE INDEX suggestions_to ON suggestions (to_item_id, status);

-- Unordered pairs already judged (a < b), so a pair is never paid for twice.
CREATE TABLE judged_pairs (
  a       TEXT NOT NULL,
  b       TEXT NOT NULL,
  outcome TEXT NOT NULL,                      -- edge, none, dropped
  at      TEXT NOT NULL,
  PRIMARY KEY (a, b)
);

ALTER TABLE connections ADD COLUMN suggestion_id TEXT;

-- Threads: clusters of kept connections, named by the machine and approved by the editor.
CREATE TABLE threads (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,          -- the id readers see; stable across Hauls
  title_text   TEXT NOT NULL,
  title_italic TEXT,
  summary      TEXT NOT NULL,
  points       TEXT NOT NULL,                 -- JSON [{itemId, year, gist, edge}]
  item_ids     TEXT NOT NULL,                 -- JSON sorted item ids of the cluster it was drafted from
  status       TEXT NOT NULL DEFAULT 'proposed', -- proposed, approved, rejected
  edited       INTEGER NOT NULL DEFAULT 0,
  model        TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Rhymes: a then/now pair of quotes, each verified verbatim against a fetched source item.
CREATE TABLE rhymes (
  item_id      TEXT PRIMARY KEY REFERENCES items (id) ON DELETE CASCADE,
  then_item_id TEXT REFERENCES items (id),
  then_year    TEXT NOT NULL DEFAULT '',
  then_quote   TEXT,
  then_start   INTEGER,
  then_end     INTEGER,
  then_cite    TEXT NOT NULL DEFAULT '',
  now_item_id  TEXT REFERENCES items (id),
  now_year     TEXT NOT NULL DEFAULT '',
  now_quote    TEXT,
  now_start    INTEGER,
  now_end      INTEGER,
  now_cite     TEXT NOT NULL DEFAULT '',
  bridge       TEXT NOT NULL DEFAULT '',      -- machine voice in the app (blue); style-checked
  updated_at   TEXT NOT NULL
);

-- The real container and codec of a voice note, sniffed from its bytes: m4a (AAC), mp3, wav play on
-- both platforms; webm and ogg (Opus) play on Android only.
ALTER TABLE notes ADD COLUMN format TEXT;
