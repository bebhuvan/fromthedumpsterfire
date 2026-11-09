-- 2026-11-09: which Desk items each published version carries, so every item can say where it stands
-- ("published in version 3", or "in Haul 002, not yet published" when added after the Haul went out).
-- JSON array of item ids, written at publish (publish.ts). Older versions are filled in once from their
-- bundle the first time they are asked about (standing.ts). Additive only.
ALTER TABLE haul_versions ADD COLUMN item_ids TEXT;

-- An item is in one Haul at most. The Desk always checked this before writing; the index makes two
-- writes landing together unable to break it (the tray's join would otherwise list the item twice).
CREATE UNIQUE INDEX IF NOT EXISTS haul_items_one_haul ON haul_items (item_id);
