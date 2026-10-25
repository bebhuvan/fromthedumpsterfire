-- The editor's own reading library (Readwise Reader, Instapaper): a private index of what is saved
-- there, so a paywalled piece can be read from the editor's saved copy (library.ts). Only links,
-- titles and ids are indexed; the text is fetched for one item at a time and stored as its source.

CREATE TABLE library_docs (
  provider   TEXT NOT NULL,        -- 'readwise' | 'instapaper'
  doc_id     TEXT NOT NULL,        -- the provider's document or bookmark id
  url_key    TEXT NOT NULL,        -- normaliseLibraryUrl(url)
  url        TEXT NOT NULL,
  title      TEXT,
  saved_at   TEXT,
  PRIMARY KEY (provider, doc_id)
);
CREATE INDEX library_docs_url ON library_docs (url_key);

CREATE TABLE library_sync (
  provider   TEXT PRIMARY KEY,
  since      TEXT,                 -- changes after this are not yet indexed (ISO for Readwise, unix seconds for Instapaper)
  pending    TEXT,                 -- a sync in progress: Readwise pageCursor or Instapaper offset
  started    TEXT,                 -- the start of the sync in progress, which becomes `since` when it ends
  synced_at  TEXT
);
