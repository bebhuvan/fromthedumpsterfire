-- The Desk: items captured by the editor, what the pipeline extracted and drafted, the Hauls they
-- are published in, model spend, and the reader app's push devices.
-- Times are ISO-8601 UTC strings. JSON columns hold small structured values only.

-- One captured thing: a URL, a file, a pasted passage, an image of a page.
CREATE TABLE items (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,              -- source kind: article, pdf, youtube, podcast, x, arxiv, text, image...
  type          TEXT NOT NULL,              -- editorial ContentType (essay, talk, paper, poem...)
  type_by       TEXT NOT NULL DEFAULT 'auto', -- 'auto' or 'editor'
  status        TEXT NOT NULL DEFAULT 'queued', -- queued, fetching, reading, drafting, checking, ready, failed, paused
  status_detail TEXT,
  url           TEXT,
  canonical_url TEXT,
  file_key      TEXT,                       -- R2 key of an uploaded PDF or image
  title         TEXT,                       -- the source's own title
  title_choice  TEXT,                       -- JSON Title chosen for publishing {text, italic?}
  creator       TEXT,
  source_name   TEXT,
  source_date   TEXT,
  minutes       INTEGER,
  capture_text  TEXT,                       -- what the editor pasted or shared alongside
  why_text      TEXT,                       -- the editor's "why it's here", verbatim
  why_note_id   TEXT,                       -- voice note it came from, if any
  why_audio     INTEGER NOT NULL DEFAULT 0, -- publish the voice note audio with the item
  media         TEXT,                       -- JSON Media
  plate         TEXT,                       -- JSON Plate
  locator       TEXT,                       -- default excerpt locator
  archived      INTEGER NOT NULL DEFAULT 0,
  captured_at   TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX items_status ON items (archived, status, captured_at);
CREATE INDEX items_canonical ON items (canonical_url);

-- Extracted, clean source text. Excerpt offsets index into `text`.
CREATE TABLE sources (
  item_id      TEXT PRIMARY KEY REFERENCES items (id) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  extractor    TEXT NOT NULL,               -- readability, unpdf, tomarkdown, captions, whisper, ocr, pasted, oembed, arxiv
  word_count   INTEGER NOT NULL,
  snapshot_key TEXT,                        -- R2 key of the raw fetched bytes
  text_key     TEXT,                        -- R2 key of the text, for long sources
  meta         TEXT,                        -- JSON: page offsets, headings, duration, language
  fetched_at   TEXT NOT NULL,
  edited       INTEGER NOT NULL DEFAULT 0   -- the editor corrected the text (OCR fixes)
);

-- Excerpts the editor selected (or the machine proposed) with offsets into sources.text.
CREATE TABLE excerpts (
  id              TEXT PRIMARY KEY,
  item_id         TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  start           INTEGER NOT NULL,
  end             INTEGER NOT NULL,
  text            TEXT NOT NULL,
  highlight_start INTEGER,                  -- offsets within text
  highlight_end   INTEGER,
  locator         TEXT,
  origin          TEXT NOT NULL DEFAULT 'editor', -- editor or machine
  chosen          INTEGER NOT NULL DEFAULT 0,
  verified        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE INDEX excerpts_item ON excerpts (item_id);

-- Machine drafts: title options, marginalia, reading cards. Proposed until the editor acts.
CREATE TABLE drafts (
  id         TEXT PRIMARY KEY,
  item_id    TEXT REFERENCES items (id) ON DELETE CASCADE,
  haul_id    TEXT,
  kind       TEXT NOT NULL,                 -- title, marginal, card, question, route
  body       TEXT NOT NULL,                 -- JSON
  status     TEXT NOT NULL DEFAULT 'proposed', -- proposed, kept, cut, edited
  check_json TEXT,                          -- JSON: style result, citation check
  model      TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX drafts_item ON drafts (item_id, kind);
CREATE INDEX drafts_haul ON drafts (haul_id, kind);

-- Wikipedia cards. Models propose topics; code resolves and fetches each one.
CREATE TABLE wiki_cards (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  query       TEXT NOT NULL,
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL,                -- shown to readers (editable)
  extract     TEXT NOT NULL,                -- Wikipedia's own lead, for checking citations
  url         TEXT NOT NULL,
  revision    TEXT,
  status      TEXT NOT NULL DEFAULT 'proposed', -- proposed, kept, cut
  http_status INTEGER,
  checked_at  TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX wiki_item ON wiki_cards (item_id);

-- The checks panel: the latest result of each named check for an item.
CREATE TABLE checks (
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  name    TEXT NOT NULL,                    -- links, quotes, style, citations, why
  status  TEXT NOT NULL,                    -- pass, warn, fail
  detail  TEXT NOT NULL,                    -- JSON: { summary, rows: [...] }
  at      TEXT NOT NULL,
  PRIMARY KEY (item_id, name)
);

-- Voice notes: audio in R2, the raw transcript, and the deletion-only cleanup.
CREATE TABLE notes (
  id               TEXT PRIMARY KEY,
  item_id          TEXT,
  haul_id          TEXT,
  target           TEXT NOT NULL,           -- why, fieldnote, answer, capture
  audio_key        TEXT NOT NULL,
  mime             TEXT NOT NULL,
  seconds          REAL,
  transcript_raw   TEXT,
  transcript_clean TEXT,
  deleted_words    TEXT,                    -- JSON list of what cleanup removed
  clean_method     TEXT,                    -- model or code
  created_at       TEXT NOT NULL
);

-- Hauls being composed and published.
CREATE TABLE hauls (
  id              TEXT PRIMARY KEY,
  number          INTEGER NOT NULL UNIQUE,
  title_text      TEXT NOT NULL DEFAULT '',
  title_italic    TEXT,
  deck            TEXT NOT NULL DEFAULT '',
  swatch          TEXT NOT NULL DEFAULT 'apricot',
  fn_title_text   TEXT NOT NULL DEFAULT '',
  fn_title_italic TEXT,
  fn_body         TEXT NOT NULL DEFAULT '', -- paragraphs separated by blank lines
  fn_highlight    TEXT,
  fn_note_id      TEXT,                     -- voice note published as field-note audio
  route           TEXT NOT NULL DEFAULT '[]', -- JSON RouteStep[]
  questions       TEXT NOT NULL DEFAULT '[]', -- JSON [{q, answer}]
  colophon        TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'draft', -- draft, published
  version         INTEGER NOT NULL DEFAULT 0,
  published_at    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE haul_items (
  haul_id  TEXT NOT NULL REFERENCES hauls (id) ON DELETE CASCADE,
  item_id  TEXT NOT NULL REFERENCES items (id),
  position INTEGER NOT NULL,
  PRIMARY KEY (haul_id, item_id)
);
CREATE INDEX haul_items_item ON haul_items (item_id);

-- Typed connections the editor adds between items (machine edge-judging comes later).
CREATE TABLE connections (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  to_item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  note       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Every published bundle version. The bundle itself lives in R2 at `path`.
CREATE TABLE haul_versions (
  haul_id      TEXT NOT NULL REFERENCES hauls (id),
  version      INTEGER NOT NULL,
  path         TEXT NOT NULL,
  correction   TEXT,
  sha256       TEXT NOT NULL,
  published_at TEXT NOT NULL,
  notified     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (haul_id, version)
);

-- Every model call, with its cost. Spend ceilings are enforced from this table.
CREATE TABLE model_calls (
  id            TEXT PRIMARY KEY,
  at            TEXT NOT NULL,
  task          TEXT NOT NULL,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  item_id       TEXT,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  audio_seconds REAL NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0,
  latency_ms    INTEGER NOT NULL DEFAULT 0,
  ok            INTEGER NOT NULL,
  error         TEXT
);
CREATE INDEX model_calls_at ON model_calls (at);
CREATE INDEX model_calls_item ON model_calls (item_id);

-- Pipeline runs, for provenance and the Desk's progress line.
CREATE TABLE runs (
  id          TEXT PRIMARY KEY,             -- workflow instance id
  item_id     TEXT NOT NULL,
  status      TEXT NOT NULL,
  step        TEXT,
  error       TEXT,
  started_at  TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX runs_item ON runs (item_id, started_at);

-- Reader-app push registrations (POST /v1/devices). Tokens are FCM registration tokens.
CREATE TABLE devices (
  token        TEXT PRIMARY KEY,
  platform     TEXT NOT NULL,
  enabled      INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  last_sent_at TEXT,
  last_error   TEXT,
  failures     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX devices_enabled ON devices (enabled);
