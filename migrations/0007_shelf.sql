-- 2026-10-24: the shelf. The books the editor is reading or has read, each with dated notes in his
-- own words and lines he copied from the page; published by the Desk as shelf/shelf.json (Shelf in
-- packages/shared/src/shelf.ts). Additive only: nothing existing changes meaning.

-- One book. The id is its slug and its public address (/shelf/<id>), made from the title once and
-- never changed, so links from Hauls and readers' bookmarks keep working.
CREATE TABLE books (
  id               TEXT PRIMARY KEY,           -- lowercase slug, unique
  title_text       TEXT NOT NULL,
  title_italic     TEXT,                       -- the title's last phrase, set in italic
  author           TEXT NOT NULL,
  year             INTEGER,                    -- the year the book first came out
  publisher        TEXT,
  url              TEXT,                       -- where to find it (https only)
  status           TEXT NOT NULL DEFAULT 'reading', -- reading, read, put-down
  started          TEXT,                       -- ISO date
  finished         TEXT,                       -- ISO date
  spine            TEXT,                       -- one of SPINES; NULL means spineOf(id)
  -- The cover: the editor's photograph or the jacket, kept in MEDIA, with the credit rule of pictures.
  cover_key        TEXT,                       -- MEDIA key (books/<id>/cover-<n>.<ext>)
  cover_mime       TEXT,
  cover_width      INTEGER,
  cover_height     INTEGER,
  cover_caption    TEXT,
  cover_credit     TEXT,
  cover_licence    TEXT,
  cover_creator    TEXT,
  cover_source_url TEXT,                       -- where the picture was found (https)
  cover_date       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- The editor's notes on a book, verbatim, each with its day. Typed, or dictated through the voice-note
-- path (Whisper, then the deletion-only cleanup); the text is what the editor accepted.
CREATE TABLE book_notes (
  id            TEXT PRIMARY KEY,
  book_id       TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  date          TEXT NOT NULL,                 -- ISO date the note was written
  at            TEXT,                          -- where in the book: "p. 112", "chapter 4"
  text          TEXT NOT NULL,
  note_id       TEXT,                          -- the voice note (notes.id) it was dictated in
  audio_key     TEXT,                          -- that note's MEDIA key
  format        TEXT,                          -- its sniffed format (m4a, mp3, wav, mp4, webm, ogg)
  seconds       REAL,
  publish_audio INTEGER NOT NULL DEFAULT 0,    -- publish the recording with the note
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX book_notes_book ON book_notes (book_id, date);

-- Lines the editor copied out of the book, in his order, with where they are.
CREATE TABLE book_lines (
  id         TEXT PRIMARY KEY,
  book_id    TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  locator    TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX book_lines_book ON book_lines (book_id, position);

-- Each publish of the shelf: what was written and when (the file itself is shelf/shelf.json in FILES).
CREATE TABLE shelf_versions (
  version      INTEGER PRIMARY KEY,
  sha256       TEXT NOT NULL,
  books        INTEGER NOT NULL,
  published_at TEXT NOT NULL
);

-- A Haul's book item points to its shelf book; a Haul publish writes it as Item.shelf.
ALTER TABLE items ADD COLUMN shelf_id TEXT;    -- books.id, or NULL
CREATE INDEX items_shelf ON items (shelf_id);
