-- 2026-10-17: the machine says in one line why it proposes each excerpt (shown on the Desk only).
-- Additive; existing rows keep NULL.
ALTER TABLE excerpts ADD COLUMN why TEXT;
