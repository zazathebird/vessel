# Pass 2 — Downloads / Catalogue Feature Audit

Read-only debugging audit. No files changed except this one. Scope: the downloads
feature end to end — `worker/downloads.ts` (840 lines), `worker/downloadPages.ts`
(1224 lines), `src/components/DownloadsPage.tsx`, `src/components/DownloadPage.tsx`,
`src/components/DownloadEditor.tsx` (1909 lines), `src/components/DownloadCodes.tsx`,
`src/components/CategoryIcon.tsx`, `src/components/FileIcon.tsx`, `src/data/downloads.ts`
(524 lines). All read in full. Also read `migrations/0005_downloads.sql`,
`migrations/0006_download_pages.sql`, `migrations/0007_download_catalogue.sql` to
confirm schema-level claims (cascades, defaults, column meanings), and the relevant
slices of `scripts/check.ts` (the `sortFiles` gate and the "release-shaped writes"
shape gate) to see what is and is not actually driven by the check suite.

Skimmed `.audit/pass1-*.md` first — none of the four cover this feature (their scope
was accounts/auth, misc components/hooks, config architecture, and the duel engine),
so nothing below duplicates a Pass 1 finding.

## Verified correct (mechanism-by-mechanism against CLAUDE.md's own claims)

- **`resolveAccess`/`canRead`/`canDownload` is the single choke point.** Traced every
  caller: `listPages`, `readPage` and `file()` (in `downloads.ts`) all call
  `resolveAccess` and then `canRead`/`canDownload` — there is no second, independent
  gate anywhere. `canDownload` really does start with `canRead(page, access)` and
  returns `false` immediately if that fails, so bytes cannot be reached through a page
  the caller could not open.
- **Ticket scoping (`@slug` / `~slug` / bare item id) is correctly asymmetric.**
  `canDownload` reads `access.ticketPages` (the strong grant) but **never**
  `access.ticketVisible` (the weak one) — confirmed by re-reading the function body,
  not just the comment. A file-scoped code's page only ever lands in `ticketVisible`
  (or is dropped as "quiet" for a `granted`/non-live page), so a one-file purchase
  cannot be turned into "every paid file on that page" by editing the `t=` query
  parameter.
- **Grants are evaluated as rows, not as two sets.** `granted()` and `grantedFile()`
  both `.some()` over `access.grants`, testing `slug` and `item` from the *same* row
  together. A wildcard in one row cannot lend itself to another row's scope — traced
  through `resolveAccess`'s grants query, which selects `(slug, item_id)` pairs
  unmodified.
- **`opened()`'s file-scope pin is genuinely unconditional and re-reads live data.**
  `row.slug !== item.slug` is checked with no carve-out for a NULL pin (the
  2026-09-04 fix), and the file's *current* page is re-resolved by id on every
  redemption (a `LEFT JOIN` against `download_pages`), not read from the code row
  cached at mint time — so a file that moved pages after a code was minted genuinely
  can no longer be opened by that code.
- **`deletePage` and `deleteFile` both delete codes, in the right order relative to
  the cascade.** `deletePage` deletes `download_codes WHERE item_id IN (subquery on
  download_files)` **before** deleting the page (while the files, and hence the
  subquery, still exist), then deletes `download_codes WHERE slug = ?` after. Order
  matters here — reading it after the page delete would find zero files, per the
  code's own comment — and it is the order in the file.
- **Range-request truth table (`rangePlan`) re-derived independently and found
  correct**, including the parts CLAUDE.md flags as previously buggy: `object.range`
  is populated even for a request that carried no `Range` header (handled by gating
  on `request.headers.has("range")`, not on the object); a declined/whole-file range
  from R2 collapses to `null` (200), never a fabricated 206; a suffix range computes
  `offset = size - suffix`; every value is clamped to `[0, size]`/`[0, size-offset]`;
  and a clamped-to-nothing range (`offset === size`) produces `length <= 0`, which is
  routed to a genuine `416` with `content-range: bytes */size`, not a `206` with an
  inverted range. Traced by hand through five cases (plain GET, ordinary range,
  suffix range, an out-of-range start, and a range R2 declines) rather than just
  trusting the comments.
- **`content-disposition` is genuinely dual-form and the ASCII fallback is actually
  ASCII.** `ascii = item.filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "")`
  strips both non-ASCII and the two characters that would break out of the quoted
  form; `extValue` correctly escapes the RFC 8187 gap characters `encodeURIComponent`
  leaves behind (`'()*!`) rather than assuming `encodeURIComponent` alone is
  RFC-5987-safe.
- **Upload ordering is exactly as documented and matches the stated failure mode it
  is designed to avoid.** A *new* file: `saveFile` (row, no bytes) then `beginUpload`
  → parts → `finishUpload`. A *replacement*: bytes uploaded and finished **first**,
  then `saveFile` with the new filename — confirmed in `FileManager.submit()`
  (`src/components/DownloadEditor.tsx:1151-1157`), matching `worker/downloadPages.ts`'s
  comment that a replacement writing metadata first would leave a row pointing at old
  bytes under the new name.
- **`beginUpload`/`finishUpload`/`abortUpload`/`uploadPart`/`saveFile`/`deleteFile`
  all normalise the id through the single `fileId()` helper** — grepped every call
  site that reads `b.id` or `url.searchParams.get("id")` in `downloadPages.ts` and
  confirmed all six use `fileId(...)`, never a bare `str(b.id, 64)`. (Two *other*
  routes that take a file id do **not** go through `fileId` — see Finding 2.)
- **The widen/release password gating for `savePage` and `saveFile` is correct in
  both directions** for every transition reachable through the shipped editor UI.
  Re-derived `REACH` (`granted:0 < code:1 < unlisted:2 < public:3`) and the
  `widens` formula (`status === "live" && (before?.status !== "live" ||
  reach(new) > reach(before))`) by hand against: new page going live (asks); a live
  page narrowing visibility (does not ask); a live page widening visibility (asks); a
  draft widening visibility while staying a draft (does not ask, correctly — nobody
  but the operator can see a draft regardless of its visibility field); unpublishing
  while simultaneously "widening" visibility (does not ask, correctly — the page
  becomes invisible either way). `saveFile`'s simpler `(free flips on) || (slug
  changes)` test was checked the same way. `scripts/check.ts`'s own gate for this
  (`the release-shaped operator writes demand the password, and the edits do not`)
  is explicitly a **shape** gate (regex over the source, not a behavioural drive) —
  worth flagging since CLAUDE.md itself warns that shape gates are the weaker kind,
  but the logic itself is sound for every input the UI can produce (see Finding 4 for
  the one gap: what happens on a malformed/absent field no UI control can send).
- **`CATEGORIES`/`MARKS` parity.** Counted by hand: 21 entries in `CATEGORIES`
  (`src/data/downloads.ts`), 21 keys in `MARKS` (`CategoryIcon.tsx`), and
  `scripts/check.ts` cross-checks `DRAWN_CATEGORIES` against the catalogue — no gap
  found.
- **SQL injection.** Every query in both worker files binds parameters via `.bind()`.
  The only string-interpolated SQL is `${REF_LENGTH}` (a module constant, `16`, never
  request-derived) inside three `substr(hex(code_hash), 1, ${REF_LENGTH})` fragments —
  not attacker-influenced.
- **Cascades match the code's own claims.** `migrations/0006_download_pages.sql`:
  `download_files.slug` and `download_blocks.slug` both `REFERENCES download_pages
  (slug) ON DELETE CASCADE`; `download_grants` has no cascade on `slug`/`item_id`
  (matches the comment that a grant outliving its page is harmless); `download_codes`
  has no foreign key on `slug` or `item_id` at all (matches the comment explaining why
  `deletePage`/`deleteFile` have to delete codes by hand). Because files genuinely
  cascade with their page, an "orphaned file with no page" state (which would have
  changed the analysis of `opened()`'s LEFT JOINs) cannot occur through normal writes.
- **"No personal data" holds structurally**, modulo the two free-text fields the code
  itself flags (`download_codes.label`, `download_grants.label`) — both are bounded
  (120 chars), both carry explicit UI copy steering the operator away from names/
  emails, and neither is a new gap beyond what the migrations' own comments already
  disclose.
- **Unbounded queries**: `listCodes`/`listGrants` are `LIMIT 200`; `listPages`/
  `readPage`'s files-and-blocks queries have no `LIMIT`, but are scoped to a table an
  operator hand-populates (the same "tiny operator-facing table" reasoning Pass 1
  applied to `listAccounts`) — noted for completeness, not a finding.

## Finding 1 — A code minted for (or already scoped to) a file whose bytes never
finished uploading redeems successfully and silently burns one of its uses

**Severity**: Medium-High (customer-facing; wastes a scarce, paid resource with no
error to explain why; plausible under the feature's own stated workflow).

**File/line**: `worker/downloads.ts`, `opened()` (~148-221) and `mintCode` (~707-728);
cross-referenced against `worker/downloadPages.ts`'s `readPage` (~589-591) and
`canDownload` (~392-408).

**Mechanism**: A file's row exists from the moment `saveFile` first creates it, with
`uploaded_at IS NULL` until `finishUpload` completes. Nothing about that state stops
either the operator from minting a file-scoped code for it, or a customer from
redeeming one:

`mintCode`'s existence check for an item-scoped code:

```ts
const has = await env.DB.prepare(
  `SELECT f.slug, p.visibility
     FROM download_files f LEFT JOIN download_pages p ON p.slug = f.slug
    WHERE f.id = ?`,
).bind(itemId).first<{ slug: string; visibility: string | null }>();
if (!has) throw new BadRequest("No such download.", 404);
if (has.visibility === "granted") throw grantedRefusal("That file's page");
pageSlug = has.slug;
```

— checks the file exists and its page isn't `granted`, but never reads
`uploaded_at`. And `opened()`'s file-scope branch, which is what `claim()` actually
consults to decide whether a redemption succeeds:

```ts
const item = await env.DB.prepare(
  `SELECT f.slug, p.visibility, p.status
     FROM download_files f LEFT JOIN download_pages p ON p.slug = f.slug
    WHERE f.id = ?`,
).bind(row.item_id).first<{ slug: string; visibility: string | null; status: string | null }>();
if (!item) return { open: [], visible: [], items: [] };
if (row.slug !== item.slug) return { open: [], visible: [], items: [] };
const quiet = item.visibility === "granted" || item.status !== "live";
return { open: [], visible: quiet ? [] : [item.slug], items: [row.item_id] };
```

— also never reads `uploaded_at`. So for a live, non-`granted` page holding an
unfinished file, this returns `{ items: [row.item_id], visible: [item.slug] }` —
non-empty — and `claim()`'s own refusal test (`if (!opens.open.length &&
!opens.visible.length && !opens.items.length) throw refused;`) does **not** fire.
The redemption proceeds, the `UPDATE ... SET uses = uses + 1 ... RETURNING uses`
statement runs, and `recordSuccess` is called — the use is genuinely spent.

The customer is then handed a ticket and a `pages: [...]` list pointing at the file's
page. But `readPage` filters files for a non-operator caller:

```ts
files: files.results
  .filter((f) => f.uploaded_at !== null || access.operator)
  .map((f) => shapeFile(f, canDownload(page, f, access))),
```

— the unfinished file is invisible to them entirely. Even if it were not filtered,
`canDownload` independently refuses it (`if (item.uploaded_at === null) return
false;`, checked before the `ticketItems` test). So the customer lands on a page
that does not show the file they were told they'd unlocked, with no error, and one of
their code's limited `max_uses` is gone.

This is the same class of bug the surrounding comment in `claim()` explicitly says
was fixed: *"This used to run after the increment, so a code whose file had been
withdrawn — or whose page had been deleted... answered 200 { pages: [], items: [] }
and charged a use for it. The customer that happens to is precisely the one with a
genuine complaint..."* That fix closed "withdrawn/deleted" but not "never finished
uploading," which is arguably the *more* likely real-world case given the
operator-workflow this feature is built around (`DownloadEditor.tsx`'s own header
comment: pages are built and codes are generated "while they are on the phone to
somebody").

**Concrete failure scenario**: Operator is on the phone with a customer, adds a new
file's metadata (`saveFile` succeeds — no password needed, no bytes yet), and — before
uploading — mints a per-file code for it via the "Code" button in `FileManager`
(`src/components/DownloadEditor.tsx:1436-1448`), which is rendered unconditionally for
any non-free file regardless of `f.uploaded`:

```tsx
{f.free ? null : (
  <button type="button" className="v-btn v-btn-quiet" ... onClick={() => setProof({ kind: "mint", file: f })}>
    Code
  </button>
)}
```

The customer redeems the code within their five allotted uses before the operator
gets around to actually uploading the bytes (plausible: the code is often read aloud
or texted immediately after minting). The redemption succeeds, `usesLeft` drops from
5 to 4, and the customer's page shows nothing. They redeem again believing the first
attempt failed (further burning uses) or contact the operator confused about why a
paid code "doesn't work."

**Suggested check** (not implemented): a behavioural gate that mints a file-scoped
code for a row with `uploaded_at IS NULL`, redeems it through `claim()`, and asserts
either that `mintCode` refuses to mint for an unfinished file, or that `opened()`
treats an unfinished file the same as a withdrawn one (empty scope, refused
redemption, use not spent) — mirroring the existing "withdrawn file" test this module
already has for the deleted-file case.

## Finding 2 — `addGrant` and `mintCode` read a caller-supplied file id without the
`fileId()` normalisation every other id-taking route uses

**Severity**: Medium (currently latent through the shipped UI; a direct match for a
failure mode the codebase's own comment names and warns against by name).

**File/line**: `worker/downloadPages.ts:1158` (`addGrant`); `worker/downloads.ts:682`
(`mintCode`).

**Mechanism**: `fileId()`'s own doc comment states the invariant plainly:

> A file id, normalised — **and every route that takes one must use this.**
> ... **The two must agree — a route that reads `str(b.id, 64)` directly is this bug
> again.**

Every route whose *own* id is a file id (`saveFile`, `deleteFile`, `beginUpload`,
`uploadPart`, `finishUpload`, `abortUpload`) does route through `fileId(...)`.
But two routes that take a file id as a *foreign* reference do not:

```ts
// worker/downloadPages.ts, addGrant
const itemId = str(b.item, 64) || null;
...
const item = await env.DB.prepare("SELECT slug FROM download_files WHERE id = ?")
  .bind(itemId)
  .first<{ slug: string }>();
```

```ts
// worker/downloads.ts, mintCode
const itemId = typeof body.item === "string" && body.item ? body.item : null;
...
const has = await env.DB.prepare(
  `SELECT f.slug, p.visibility FROM download_files f LEFT JOIN download_pages p ON p.slug = f.slug WHERE f.id = ?`,
).bind(itemId).first<...>();
```

Both compare an un-lowercased, un-trimmed-of-case string against a column that is
*always* stored lowercase (every write path funnels through `fileId()`). A caller
that sends `"Boot-Repair"` instead of `"boot-repair"` gets `has`/`item` = `null` and a
404 ("No such download." / "No such page."), even though the file genuinely exists —
the exact "operator did the right thing and the row was never found" failure the
`fileId()` comment was written to describe and prevent for the *other* six routes.

**Why it's latent today**: both call sites currently only ever receive an id that
already came from the server (a `<select>` populated by `f.id` values in
`GrantManager`, and `f.id` passed directly in `FileManager.mintFor`), so no
mixed-case value is ever actually sent through the shipped editor. But that is a
property of the current UI, not of the Worker route, which is exactly the situation
the `fileId()` comment warns is fragile — a future form control (a free-text "grant
by file id" box, an API client, a curl script the operator runs by hand) would hit
this immediately, with a 404 that looks like the file doesn't exist.

**Suggested check** (not implemented): a source-shape gate (matching the style of the
existing "release-shaped writes" gate in `scripts/check.ts`) asserting that every
occurrence of `body.item`/`b.item` used as a `download_files.id` lookup passes through
`fileId(...)`, the same way `fileId`'s own file ids are gated — or a behavioural test
that calls `addGrant`/`mintCode` with an uppercase-mixed file id that exists in
lowercase and asserts it resolves rather than 404s.

## Finding 3 — `sortFiles`'s "price" order cannot distinguish a genuinely free file
from a merely-unpriced one, and sorts both to the bottom

**Severity**: Medium (visible, customer-facing ordering defect on any page that turns
on both "Show prices" and lets visitors sort by price).

**File/line**: `src/data/downloads.ts`, `sortFiles`'s `"price"` case (~465-473);
`worker/downloadPages.ts`, `shapeFile` (~449); `scripts/check.ts`'s `sortFiles` gate
(~715-722).

**Mechanism**: `shapeFile` deliberately renders `price: 0` for **both** a genuinely
free file and a paid file the operator simply hasn't priced yet:

```ts
price: f.free === 1 ? 0 : f.price_cents,
```

`SortableFile` (the type `sortFiles` operates on) carries no `free` field at all —
only `name`, `size`, `price?`, `added?`, `category?`. So by the time a page's files
reach `sortFiles`, the two cases are indistinguishable, and the price comparator:

```ts
case "price":
  return next.sort((a, b) => (a.price || Infinity) - (b.price || Infinity) || byName(a, b));
```

sends both to the very end of a price-ascending sort, alongside each other. The
migration's own comment (`migrations/0007_download_catalogue.sql`) is explicit that
"zero means no price, not free" is a statement about the **stored** `price_cents`
column — but the **rendered** `price` field this sort actually reads collapses that
distinction back together for a `free` row, which the migration's comment never
addresses because `free` files didn't exist as a sort input at the time it was
written to describe `price_cents` alone.

The check-suite's own test for this (`scripts/check.ts` ~715-722) only ever exercises
a file named `"free-ish"` with `price: 0` and asserts it sorts last — it never
constructs a `free: true` row and checks where it lands, so the gate that is supposed
to protect this ordering cannot see the case where "free" and "unpriced" actually
collide in practice.

**Concrete impact**: On a page with "Show prices on this page" and "Let visitors
filter and search" both on (so the Price sort is offered — gated in
`DownloadPage.tsx:249` on `showPrices`), a customer sorting cheapest-first sees every
paid item with an actual price *before* every genuinely free tool, which reads
backwards — "cheapest first" implies $0 (free) items should lead, not trail behind a
$9,900 item and only then a truly-unpriced row. The visual presentation compounds
this: `formatPrice(0)` returns `null`, so a free row's price cell is blank —
identical on screen to an unpriced paid row — so a visitor has no way to tell, from
the sort position or the display, why a free tool is buried at the bottom of a
price-sorted list.

**Suggested check** (not implemented): extend the `sortFiles` gate in `scripts/check.ts`
to construct a mix of `free: true` (price 0) and priced rows and assert on where the
free row lands — the current assertion text ("an unpriced file must sort last, not
first") should be re-examined against whether a *free* file is supposed to be exempt
from that rule, since the two are documented everywhere else in this codebase as
deliberately distinct states.

## Finding 4 — `saveWithProof` bypasses the price validation `submit()` performs

**Severity**: Low-Medium (currently unreachable in the shipped UI because the proof
dialog is presented over an unedited form, but the two code paths that are supposed
to perform the same validated save have silently diverged).

**File/line**: `src/components/DownloadEditor.tsx`, `FileManager.submit()` (~1037-1041)
vs. `FileManager.saveWithProof()` (~1262-1292).

**Mechanism**: The primary save path validates the price and refuses to proceed on a
bad value:

```ts
const priceCents = toCents(form.price);
if (priceCents === null) {
  setError("That price isn't a number. Leave it blank for no price.");
  return;
}
```

But the retry path used when the Worker demands a password for a widening save
(flipping `free` on, or moving the file to another page) recomputes the price with no
such check:

```ts
async function saveWithProof(password: string) {
  ...
  await api.adminFileSave({
    ...
    priceCents: toCents(form.price) ?? 0,
  });
```

`toCents` returns `null` for a non-numeric price (e.g. the operator typed "abc" or
"$-5"); `submit()` treats that as a hard refusal, `saveWithProof` silently coerces it
to `0` cents — which the rest of the codebase (this same file's own migration
comment, `shapeFile`'s doc comment) treats as a meaningfully different state ("no
price set") from whatever the operator actually typed, applied without their
knowledge or consent.

**Why it's likely unreachable today**: `saveProof` (the state that renders this
dialog) is only set from `submit()`'s own catch block, which runs *after* `submit()`'s
price validation already passed — so `form.price` is validated by the time the dialog
can appear, and the `ProofDialog` presented over it does not appear to permit editing
`form.price` concurrently (a modal-style overlay, consistent with this codebase's
other `ProofDialog` usages per Pass 1's notes on `Dialog`/`CommandPalette`). So in
practice `toCents(form.price)` recomputes the same already-valid value.

**Concrete failure scenario** (if the assumption above is ever wrong — e.g. a future
change makes the dialog non-blocking, or `saveWithProof` is ever called from a second
site): an operator's genuinely mistyped price is saved as free-floating "$0" — the
"no price set" state — during exactly the save that is also making the file more
widely available (flipping it free, or moving it), with no error and no record that
anything was dropped.

**Suggested check** (not implemented): have `saveWithProof` reuse the same `toCents`
null-check `submit()` performs (refuse rather than default to 0), or a test that
drives `saveWithProof` directly with an invalid `form.price` and asserts it does not
silently succeed.

## Finding 5 — `savePage` defaults a malformed/absent `visibility` to `"public"` — the
widest option — where the read path treats an unrecognised value as the narrowest

**Severity**: Low (not reachable through the shipped editor, which always sends a
valid value from a closed `<select>`; a defense-in-depth / consistency gap rather
than a live hole).

**File/line**: `worker/downloadPages.ts:612-614` (`savePage`) vs. `canRead`'s default
branch (~333-337).

**Mechanism**: On the read side, an unrecognised `visibility` value is explicitly
refused rather than guessed, with the reasoning stated directly in the code:

```ts
default:
  // An unknown visibility is a page that has been edited by something that
  // is not this Worker. Refuse rather than guess — the failure of a hidden
  // page becoming public is much worse than the reverse.
  return false;
```

But the write side takes the opposite default for the same kind of malformed input:

```ts
const visibility = PAGE_VISIBILITY.includes(b.visibility as never)
  ? (b.visibility as string)
  : "public";
```

An absent or unrecognised `b.visibility` — from a malformed request, a stale/buggy
client, or a future caller of this route that isn't `DownloadEditor.tsx` — resolves to
`"public"`, the single widest value in `REACH`, rather than to the most restrictive
(`"granted"`) or to a refusal. This mirrors the schema's own column default
(`visibility TEXT NOT NULL DEFAULT 'public'` in `migrations/0006_download_pages.sql`),
so it is consistent with the *original* all-public catalogue's behaviour — but it
directly contradicts the "refuse rather than guess, because a hidden page becoming
public is much worse than the reverse" reasoning this same module states explicitly
two hundred lines away, for the same field, on the read side.

In practice the `widens` check (Finding-free, verified correct above) means this
silent default almost always *also* forces a password prompt — since "public" has the
highest `reach()` of any value, taking a page live with a defaulted-away visibility
will nearly always compare as wider than whatever it was before. So this is not a
password-gate bypass. What it is: a page whose operator believed they set (or left
unset, expecting no change) some other visibility can end up fully public, and the
confirmation dialog's copy ("This changes who can see the page, so it asks for your
password") never says *to what* it is being changed.

**Suggested check** (not implemented): a gate asserting `savePage`'s fallback for an
invalid/missing `visibility` is the most restrictive value in `PAGE_VISIBILITY`
(`"granted"`) rather than the least, or that the route refuses outright — matching the
"refuse rather than guess" doctrine `canRead` already states for the same field.

## Finding 6 — Stale "eight hex characters" comments after the `REF_LENGTH` 8→16 fix

**Severity**: Low / cosmetic (no functional effect; a documentation-drift risk in a
codebase whose own stated method is "read the logic, not the comment").

**File/line**: `worker/downloads.ts:820` (`revokeCode`'s doc comment); `src/auth/api.ts:483`
(`DownloadCodeRow.ref`'s doc comment).

**Mechanism**: `REF_LENGTH` was raised from 8 to 16 hex characters specifically to
close a 32-bit collision hole (documented at length in `worker/downloads.ts:756-771`,
"the old eight hex characters... a collision silently revoked the wrong row"). Two
other comments describing the same value were not updated:

```ts
// worker/downloads.ts:820
/**
 * Revoke by reference — the first eight hex characters of the hash, which is
 * what the list shows. ...
 */
```

```ts
// src/auth/api.ts:483
/** First eight hex characters of the stored hash — the handle for revocation. */
```

Both are now wrong — the reference is 16 hex characters (`REF_LENGTH = 16`), not
eight. No code reads these comments, so there is no live behavioural effect, but this
codebase's own `CLAUDE.md` frames exactly this shape of drift as the danger worth
recording ("a future reader could plausibly 'fix' this back into a bug") — a
maintainer trusting either comment over `REF_LENGTH` could reintroduce validation
sized for the pre-fix collision-prone value.

**Suggested check** (not implemented): none needed beyond a text fix; noting it
because the audit's brief asked to check comments against actual behaviour rather
than trust them, and these two are the one place in this slice where they disagree.

## Minor observations, not filed as findings

- **The per-code rate-limit bucket is keyed on a 4-character code prefix
  (`download:${code.slice(0, 4)}`), not on a stable identity.** This is necessary —
  bucketing on the full code would be useless, since every wrong guess names a
  different "identity" — but it means two *unrelated, both-valid* codes that happen
  to share their first four characters (32⁴ ≈ 1.05M possible prefixes) share the same
  `ACCOUNT_FREE_ATTEMPTS` (5) budget. A brute-force run against one code's suffix
  space could transiently 429 a different, legitimate customer's correct code if the
  two happen to collide on prefix. The collision probability is low and the failure
  mode (temporary 429, not data exposure) is mild, and the alternative designs all
  have their own worse tradeoffs, so this is not filed as a finding — noting it because
  it is a structurally different risk from the account-bucket-per-real-identity model
  the rate-limiting module was originally built around (Pass 1, `worker/accounts.ts`).
- **`finishUpload`'s `parts.map(...)` does not validate that each part has a numeric
  `part` and a string `etag` before calling `Number(x.part)`/`String(x.etag)`.** A
  malformed `parts` array (e.g. missing `part`) produces `NaN` as a `partNumber`,
  which will surface as an R2-thrown error inside `upload.complete(...)` — likely a
  500 rather than a clean 400. Operator-only route, no security implication, just a
  rougher error than the rest of this file's careful 400s.
- **`opened()`'s unscoped branch and `listPages`/`readPage`'s own page queries have no
  `LIMIT`.** Consistent with Pass 1's note on `listAccounts`: fine at the scale this
  feature is built for (an operator-authored, hand-populated table), flagged only for
  completeness.

## Summary

Six findings, no critical/confidentiality-breaking bugs among them, but two land at
Medium-High/Medium because they are customer-facing and directly on point for this
feature's stated design goals:

1. **(Medium-High)** A code scoped to a file that hasn't finished uploading redeems
   successfully and burns a use, with the file then invisible to the customer and no
   error anywhere in the chain — the same class of bug the surrounding code
   explicitly documents having fixed for "withdrawn" files, but the fix didn't cover
   "never finished."
2. **(Medium)** `addGrant` and `mintCode` read a file id via `str(b.item, 64)`
   instead of the mandatory `fileId()` normaliser every other id-taking route uses —
   a direct match for a failure mode this codebase's own comments name and warn
   against, currently latent only because the shipped UI never sends a mixed-case id.
3. **(Medium)** `sortFiles`'s price ordering cannot tell a genuinely free file from a
   merely-unpriced one (both render as `price: 0`, and `SortableFile` has no `free`
   field), so sorting by price buries free tools at the bottom instead of leading with
   them — and the check suite's own test data never exercises the actual collision.
4. **(Low-Medium)** `saveWithProof` recomputes a file's price without the null-check
   `submit()` applies, silently defaulting an invalid price to $0 instead of refusing
   — likely unreachable today given the modal proof dialog, but a real divergence
   between two paths meant to perform the same validated save.
5. **(Low)** `savePage` defaults a malformed/missing `visibility` to the widest value
   (`"public"`), where the read-side `canRead` explicitly refuses an unrecognised
   value as a matter of stated policy — not reachable via the shipped `<select>`, but
   an inconsistency worth closing given the stakes CLAUDE.md itself assigns to this
   exact field.
6. **(Low/cosmetic)** Two stale "eight hex characters" comments survive the
   `REF_LENGTH` 8→16 fix.

Everything else audited against the brief — `resolveAccess`/`canRead`/`canDownload`
as the single access choke point, ticket-scope asymmetry (`ticketPages` vs.
`ticketVisible`), grants-as-rows evaluation, code mint/revoke collision handling, the
full range-request truth table (206/200/416), `content-disposition` RFC 5987/8187
encoding, upload-ordering (new-file-first-row vs. replacement-bytes-first), the six
`fileId()`-normalised routes, the `savePage`/`saveFile` widen-gating logic for every
input the shipped UI can produce, category/mark parity, and SQL-injection/unbounded-
query sweeps — held up under direct re-derivation from the code, not merely against
its own comments.
