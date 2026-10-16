-- Native provider adapters report cached and reasoning tokens; the ledger keeps them so cost can be
-- audited per kind of token. input_tokens stays the total input (cached included) and
-- output_tokens the total output (reasoning included).
ALTER TABLE model_calls ADD COLUMN cached_input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model_calls ADD COLUMN cache_write_tokens  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE model_calls ADD COLUMN reasoning_tokens    INTEGER NOT NULL DEFAULT 0;
