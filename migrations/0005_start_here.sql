-- 2026-10-17: the editor's "start here" for a long item: a time ("42:06") or page ("p. 12"), and a
-- few words of their own. Additive; existing rows keep NULL.
ALTER TABLE items ADD COLUMN start_at TEXT;
ALTER TABLE items ADD COLUMN start_note TEXT;
