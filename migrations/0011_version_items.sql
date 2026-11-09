-- 2026-11-09: which Desk items each published version carries, so every item can say where it stands
-- ("published in version 3", or "in Haul 002, not yet published" when added after the Haul went out).
-- JSON array of item ids, written at publish (publish.ts). Older versions are filled in once from their
-- bundle the first time they are asked about (standing.ts). Additive only.
ALTER TABLE haul_versions ADD COLUMN item_ids TEXT;
