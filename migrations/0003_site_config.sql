-- The published site appearance.
--
-- One row, forever: `CHECK (id = 1)` makes "the current look" a fact the schema
-- enforces rather than a convention the code remembers. There is no history
-- table and no draft row — an operator publishes and that is the site, which is
-- the whole point of the feature. Rolling back is publishing again.
--
-- `config` is opaque JSON on purpose. The catalogue of legal palettes, layouts,
-- effects, ornaments and typesets lives in src/data/, and duplicating those id
-- lists here or in the Worker would create two sources of truth that drift the
-- first time one gains an entry. The browser already validates this object
-- field by field on read (src/config/persistence.ts) and falls back per field,
-- because a stored layout id that no longer exists would otherwise render an
-- unstyled page forever. That check is the load-bearing one, so it stays the
-- only one.
--
-- No personal data (SPEC-ACCOUNTS.md §9): the row holds an appearance and the
-- account id that set it, which the inventory already covers.
CREATE TABLE IF NOT EXISTS site_config (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  config        TEXT    NOT NULL,
  published_at  INTEGER NOT NULL,
  published_by  TEXT    REFERENCES accounts(id) ON DELETE SET NULL
);
