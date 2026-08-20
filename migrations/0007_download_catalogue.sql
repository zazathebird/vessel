-- 0007 — categories, prices, filtering and sort order for the downloads pages
-- (2026-08-20, client request: "descriptions/prices, categories, filters, sort
-- by, with an icon for each category").
--
-- Purely additive: six nullable-or-defaulted columns across two existing tables.
-- Nothing that is already stored changes meaning, and every default is the
-- behaviour the page has today — a page with no sort set still renders in the
-- operator's hand order, and a file with no price still shows no figure.
--
-- THIS REVERSES ONE DOCUMENTED PRODUCT DECISION, ON THE CLIENT'S WORD.
-- `docs/DOWNLOADS.md` says "No prices on the page", on the grounds that the site
-- names no figures except the client's own rate on /home. The client has now
-- asked for prices they control. The reversal is deliberately *partial*: a price
-- is stored per file and shown only when the page it sits on has `show_prices`
-- set, which is off by default. So the site's existing behaviour is unchanged
-- until the operator turns it on, page by page, and the decision stays theirs
-- rather than being made once by a migration.
--
-- §9 OF SPEC-ACCOUNTS GAINS NOTHING. A category is a label on a program, a price
-- is a number on a program, and a sort order is a preference about a list. No
-- name, no email, no payment reference, no purchase record. Payment is still out
-- of band and a code is still a bearer token.

-- ---------------------------------------------------------------------------
-- The files.
-- ---------------------------------------------------------------------------

-- Which kind of program this is. Validated in the Worker against the list in
-- `src/data/downloads.ts` rather than by a CHECK constraint, for the same reason
-- `layout` and `visibility` are: the renderer has to branch on that list anyway,
-- and adding a category should be a deploy and not a migration.
--
-- An APPEND-ONLY CATALOGUE, like every other list on this site. The id is stored
-- in rows and is what a filter in a link points at, so entries may be added and
-- must never be renamed or reordered. `other` is the default because a file
-- saved before this migration existed genuinely has no category, and guessing
-- one from a filename would put a wrong label on somebody's work silently.
ALTER TABLE download_files ADD COLUMN category TEXT NOT NULL DEFAULT 'other';

-- The price, in cents, of the smallest unit the operator deals in. Cents rather
-- than a decimal because a price is money and money is not a float: 19.99 is not
-- representable and a sort on it would eventually disagree with itself.
--
-- ZERO MEANS "NO PRICE", NOT "FREE". Free is `free = 1` and is a different
-- statement — it is about whether the bytes need a code, which is the gate. A
-- paid file with no price set is one the operator has not put a figure on yet
-- and it renders with no figure, which is the behaviour every file has today.
ALTER TABLE download_files ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- The pages.
-- ---------------------------------------------------------------------------

-- The order files come out in, before a visitor touches anything:
--   'manual'  the operator's own order (`position`) — the default, and what
--             every page does today
--   'name' | 'newest' | 'oldest' | 'size' | 'price' | 'category'
--
-- Validated in the Worker against `FILE_SORTS`. A visitor may re-sort what they
-- are looking at; that choice lives in the tab and is never stored, because a
-- sort order is not one of the two settings a visitor may set for themselves
-- (CLAUDE.md, `vessel.calm.v1` / `vessel.sound.v1`).
ALTER TABLE download_pages ADD COLUMN sort TEXT NOT NULL DEFAULT 'manual';

-- Whether the filter row appears above the files. Off by default: a page with
-- three programs on it does not want a filter, and a control that filters
-- nothing is furniture. The operator turns it on for the pages that are long
-- enough to need it, and even then the page hides it when there is only one
-- category and one platform present — a filter with one option is a label.
ALTER TABLE download_pages ADD COLUMN show_filters INTEGER NOT NULL DEFAULT 0;

-- Whether prices render to visitors. See the note at the top: this is the switch
-- that keeps "no prices on the page" true until the operator decides otherwise,
-- and it is per page so that a page of free tools never grows a price column.
ALTER TABLE download_pages ADD COLUMN show_prices INTEGER NOT NULL DEFAULT 0;

-- Whether each file's category icon renders beside its name. On by default,
-- because it is the thing the client asked for and it costs a visitor nothing —
-- but a page of six files that are all the same category is a column of six
-- identical marks, and the operator can turn it off there.
ALTER TABLE download_pages ADD COLUMN show_icons INTEGER NOT NULL DEFAULT 1;

-- Sorting and filtering both read `category`, and a long page reads it once per
-- row. Cheap index, and it keeps a category filter from being a table scan on
-- the one query the visitor waits for.
CREATE INDEX idx_download_files_category ON download_files (slug, category);
