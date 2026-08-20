-- 0006 — operator-authored sub-pages for /downloads (2026-08-20, client request:
-- "i want to be able to design and name them as i want… each page will be able
-- to host files").
--
-- THIS REVERSES A DOCUMENTED DECISION, DELIBERATELY AND ON THE CLIENT'S WORD.
-- `src/data/downloads.ts` argues at length that the catalogue is a TypeScript
-- file *because* an editable table plus an upload interface is "a second content
-- system for a list that will have a dozen rows in it". That was a fair reading
-- of a single flat list. It is the wrong reading of what was actually asked for:
-- several pages, named and laid out by the operator, published live without a
-- deploy, with per-person access. None of that can be a deploy step — the whole
-- value is that it happens while the client is on the phone to somebody.
--
-- The catalogue was **empty** when this landed, so nothing had to be migrated
-- and no id in circulation moved. That is luck, and it is why this is cheap now
-- and would not have been in a month.
--
-- WHAT THIS STILL DOES NOT STORE. SPEC-ACCOUNTS §9's inventory gains **nothing**
-- from this migration. No name, no email, no payment reference, no IP, no
-- purchase record. Grants reference `accounts.id`, which is a handle the account
-- holder chose and which §9 already covers. A code stays a bearer token.

-- ---------------------------------------------------------------------------
-- The pages.
-- ---------------------------------------------------------------------------
CREATE TABLE download_pages (
  -- The URL: /downloads/<slug>. A WIRE FORMAT — it is what a link somebody was
  -- handed points at, so it may be added but never quietly renamed. The Worker
  -- refuses anything but lowercase-kebab, for the same reason item ids are
  -- refused: this string ends up in a URL, an R2 prefix and a bookmark.
  slug TEXT PRIMARY KEY,

  title TEXT NOT NULL,
  -- One line under the title. Optional, and empty is a legitimate answer.
  summary TEXT NOT NULL DEFAULT '',
  -- The page's own prose, for the structured layout. Free-form pages use blocks
  -- below instead; both are allowed to be present, and `layout` decides which
  -- one renders, so switching layout back and forth never destroys what was
  -- typed under the other.
  intro TEXT NOT NULL DEFAULT '',
  -- An optional warning box, rendered above the files. Above, never below --
  -- `/setup` established that ordering as a safety decision rather than a
  -- layout one, and a page that hands somebody an executable is exactly the
  -- page where it matters.
  notice TEXT NOT NULL DEFAULT '',

  -- Which of the built-in looks this page wears. Validated against a list in
  -- the Worker rather than constrained here: a CHECK constraint would need a
  -- migration every time a layout is added, and the list already has to exist
  -- in TypeScript for the renderer to branch on.
  layout TEXT NOT NULL DEFAULT 'list',

  -- 'public'   listed on /downloads for anyone
  -- 'unlisted' reachable only by its link
  -- 'code'     the whole page is behind an access code
  -- 'granted'  only accounts the operator has granted it to
  --
  -- Per-FILE gating is separate and unchanged: an item's `free` flag still
  -- decides whether the bytes need a ticket. A page can be public and every
  -- file on it paid, which is the shape the site already had.
  visibility TEXT NOT NULL DEFAULT 'public',

  -- Draft pages render for the operator and 404 for everybody else, so a page
  -- can be built in the open without being live. The client asked to "edit and
  -- publish and make live in real time"; this is the publish half.
  status TEXT NOT NULL DEFAULT 'draft',

  -- Hand-ordered on /downloads. Rewritten wholesale when the operator reorders,
  -- because a list of a dozen rows does not need anything cleverer.
  position INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_download_pages_order ON download_pages (position, created_at);

-- ---------------------------------------------------------------------------
-- Free-form blocks, for pages whose layout is 'blocks'.
-- ---------------------------------------------------------------------------
--
-- The client asked for the structured page *and* a free-form option. This is
-- the free-form half, and it is deliberately a small vocabulary rather than
-- rich text or HTML: four kinds, no nesting, no markup. Raw HTML from an admin
-- box is an XSS hole the moment the operator pastes something from a website,
-- and it would also let a page opt out of the palette system — which is the one
-- thing that keeps every surface on this site recolouring together.
CREATE TABLE download_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL REFERENCES download_pages (slug) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  -- 'heading' | 'text' | 'list' | 'files'
  kind TEXT NOT NULL,
  -- Heading and text: the words. List: one item per line. Files: unused, and
  -- the block simply renders whatever files sit in its group.
  body TEXT NOT NULL DEFAULT '',
  -- For a 'files' block: which group of this page's files to render, matched
  -- against `download_files.group_name`. Empty means every file not in a group,
  -- so the common case needs no groups at all.
  group_name TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_download_blocks_page ON download_blocks (slug, position);

-- ---------------------------------------------------------------------------
-- The files.
-- ---------------------------------------------------------------------------
CREATE TABLE download_files (
  -- The R2 object key AND the URL value, exactly as the TypeScript catalogue's
  -- `id` was. Still a wire format, still add-never-rename, and now enforced by
  -- the Worker on write instead of by `npm run check` on build.
  id TEXT PRIMARY KEY,

  slug TEXT NOT NULL REFERENCES download_pages (slug) ON DELETE CASCADE,

  name TEXT NOT NULL,
  blurb TEXT NOT NULL DEFAULT '',
  -- windows | linux | android | script | any. A label; nothing sniffs the
  -- visitor's platform, because somebody on a phone may well be fetching a
  -- Windows tool onto a memory stick.
  platform TEXT NOT NULL DEFAULT 'any',
  version TEXT NOT NULL DEFAULT '',

  -- The exact filename the visitor receives, handed to `content-disposition`
  -- verbatim. The one place the extension is decided.
  filename TEXT NOT NULL,

  -- Measured from the uploaded object rather than typed, which the TypeScript
  -- catalogue could not do: it rendered before any request to the Worker, so a
  -- size arriving late would reflow the list under the reader's thumb. A page
  -- fetched from D1 already has the number in the same response.
  size_bytes INTEGER NOT NULL DEFAULT 0,
  -- What R2 will send back as the content type.
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',

  -- 1 = one click, no code. 0 = needs a ticket.
  free INTEGER NOT NULL DEFAULT 0,

  -- Set when the file is not the operator's own work. Deliberately awkward:
  -- redistributing somebody else's software is their licence's call, and a
  -- field you have to leave blank on purpose is a better reminder than a note
  -- in a document nobody re-reads.
  author TEXT NOT NULL DEFAULT '',
  -- Anything the visitor should know BEFORE clicking.
  caveat TEXT NOT NULL DEFAULT '',

  -- Which 'files' block on a free-form page this belongs under. Empty is the
  -- default group and is what the structured layout renders.
  group_name TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL,
  -- Set when the bytes are confirmed in R2. A row without it is a file whose
  -- upload never finished, and the page hides it rather than offering a link
  -- that 404s. This is what makes a failed upload safe.
  uploaded_at INTEGER
);

CREATE INDEX idx_download_files_page ON download_files (slug, position);

-- ---------------------------------------------------------------------------
-- Per-account access.
-- ---------------------------------------------------------------------------
--
-- Client: "even more granularised options that i can set, for each user on what
-- they can see". Downloads were built anonymous on purpose — a code is a bearer
-- token so that nobody has to have an account — and this does not undo that: it
-- adds a second route in for people who *do* have one, alongside the codes,
-- which are untouched.
--
-- A grant names a page, or a single file, or neither. Neither means everything,
-- which is how the operator says "this person can see the lot" without having
-- to revisit it every time a page is added.
CREATE TABLE download_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  -- NULL = every page.
  slug TEXT,
  -- NULL = every file on the pages this grant reaches.
  item_id TEXT,
  -- The operator's note. The same warning the codes table carries applies here
  -- and is weaker for it: this row is already tied to an account, so a name in
  -- the label adds nothing the handle does not already say.
  label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  -- NULL never expires.
  expires_at INTEGER
);

CREATE INDEX idx_download_grants_account ON download_grants (account_id);

-- ---------------------------------------------------------------------------
-- Codes gain a page scope.
-- ---------------------------------------------------------------------------
--
-- `download_codes.item_id` already scoped a code to one file. A page-scoped
-- code is what makes `visibility = 'code'` usable: one code opens the page and
-- everything on it, which is the natural unit when the page *is* the product.
-- Nullable and defaulted, so every code already minted keeps meaning exactly
-- what it meant.
ALTER TABLE download_codes ADD COLUMN slug TEXT;
