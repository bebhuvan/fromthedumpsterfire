-- 2026-11-07: the field note's embeds (packages/server/src/fieldnote.ts, packages/shared/src/fieldnote.ts).
-- A link on a line of its own in the field note (a YouTube or Vimeo video, a Spotify episode, an X post)
-- is resolved by code when the note is saved: JSON keyed by the link, each with its stored block (as
-- blocks.body stores one), its poster's MEDIA key, or the reason it could not be resolved. Additive only.
ALTER TABLE hauls ADD COLUMN fn_embeds TEXT NOT NULL DEFAULT '{}';
