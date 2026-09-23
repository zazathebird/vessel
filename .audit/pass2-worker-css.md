# Pass 2 — Worker infrastructure & CSS audit

Scope reviewed in full: `worker/index.ts`, `worker/rate-limit.ts`, `worker/page-meta.ts`,
`worker/setups.ts`, `worker/env.ts`, and all seven stylesheets in `src/styles/` (`base.css`,
`chrome.css`, `entrances.css`, `fonts.css`, `interaction.css`, `layouts.css`, `overlays.css`).
`CLAUDE.md` read in full first, with particular attention to *Deployment*, *CSS invariants* and
*Accessibility*. `.audit/pass1-*.md` skimmed to avoid duplicating accounts/auth, config-architecture,
component/hook and duel findings.

Also read, because the brief's questions cross into them and pass 1 explicitly deferred them:
`worker/site-config.ts`'s `withSiteConfig` (nonce-threading only — the `MAX_CONFIG_BYTES` gate-coverage
gap is already Finding 2 of `pass1-config-architecture.md` and is not repeated here), `wrangler.toml`
(the `run_worker_first`/routes/dev-protocol claims), `src/config/bands.ts` (`adaptLayout`,
`PHONE_LAYOUTS`, `TABLET_LAYOUTS` — needed to check every `.band-*.layout-*` compound selector in the
stylesheets against which layouts actually survive which band), and `migrations/0001_phase1_accounts.sql`
/ `0004_phase2_machines.sql` (the `setups`/`machines` table definitions, to confirm collation).

**Out of scope, not audited**: `worker/site-config.ts` beyond the nonce line (pass 1's
config-architecture slice), `worker/accounts.ts`/`admin.ts`/etc. (pass 1's accounts slice),
`worker/downloads.ts`/`downloadPages.ts`/`machines.ts`/`signal.ts` (named out of scope by pass 1 and
not in this pass's file list either — flag for whoever covers the sharing/downloads worker surface).

## Method notes

For the eleven CSS gotchas, every one was re-derived from the actual current selector/rule rather
than trusted from a comment: `adaptLayout`/`PHONE_LAYOUTS`/`TABLET_LAYOUTS` were read from
`src/config/bands.ts` and used to build the full set of layouts that survive each band, then every
`.band-phone.layout-*` / `.band-tablet.layout-*` compound in the stylesheets was checked against that
set for "correctly written but structurally unreachable" (the twin trap CLAUDE.md names). For the
worker, the routing switch in `worker/index.ts` was read end to end to confirm the origin check is
applied once, globally, ahead of dispatch, rather than trusting the per-route comments.

## Verified correct (mechanism-by-mechanism against the brief)

- **`foreignOrigin` has exactly two callers** (`crossOrigin`, used by every `/api/*` request ahead of
  `route()`, and `signalUpgrade`), confirmed by grep across `worker/` and `src/`; no third copy of an
  origin/CSRF test exists anywhere in the reviewed files. `crossOrigin` is invoked once, globally, for
  every `/api/*` path before the routing switch — no individual route handler can be reached without
  passing it, and none needs its own copy.
- **The CSP nonce is threaded consistently.** `worker/index.ts` mints one nonce per non-API request,
  passes it to `withSiteConfig` (which stamps it on the injected `window.__VESSEL_SITE__` script, or
  omits the attribute entirely if the config script isn't emitted) and to `cspPolicy` (which names it
  in `script-src`) — both from the same local variable, so they cannot drift. `withSiteConfig` has
  exactly one call site (grepped), which always passes a nonce, so the function's defensive
  `nonce?: string` optionality is never exercised with `undefined` in practice.
- **`page-meta.ts` emits exactly one `<meta name="description">`.** `withPageMeta` removes every
  existing `meta[name="description"]` element (HTMLRewriter's `.on()` fires for all matches, not just
  the first) before appending its own single tag at the end of `<head>`; `index.html`'s static tag is
  the only pre-existing one, so the net result on every route is exactly one. Verified the escape
  order (`clamp()` before `esc()`, not after) doesn't create a malformed entity. Confirmed the
  `sub`/`notfound`/`unlisted` canonical logic against the doc's stated cases (404 gets no canonical;
  a `/downloads/<name>` sub-page canonicalises to the index, never to itself).
- **`rate-limit.ts` (the Durable Object).** Re-derived `attempt`/`fail`/`succeed`/`check`/`reset`/`alarm`
  by hand rather than trusting the comments. `attempt()`'s check-then-reserve is genuinely atomic
  (single-threaded DO execution), and `fail()`'s and `attempt()`'s backoff math
  (`Math.min(WINDOW_MS * 2 ** (over - 1), MAX_PENALTY_MS)`) is correct at the boundaries checked
  (`over` transitioning 0→1, and unbounded `over` under sustained attack — `2 ** n` overflowing to
  `Infinity` is still handled correctly by `Math.min`). `succeed()`'s decay-by-one (never wipe) and
  `/reset`'s full wipe are the documented asymmetry and are implemented exactly as described. The
  alarm reschedules correctly on every `attempt`/`fail` call (a later `setAlarm` call replaces the
  Durable Object's single pending alarm), so a sustained attack keeps pushing the cleanup alarm
  forward rather than firing mid-attack, and `alarm()`'s `expiresAt <= now` re-check before
  `deleteAll()` correctly no-ops if the bucket was extended after the alarm was scheduled. No
  off-by-one, no double-count, no window where a concurrent burst is under-counted.
- **`.band-phone`/`.band-tablet` compound-class discipline in the stylesheets.** Built the reachable
  set from `adaptLayout`: on phone only `stack`, `console` and `sheet` layouts survive as themselves
  (everything else collapses to `stack`); on tablet everything survives except `mosaic`, `magazine`,
  `ledger`, `radial` and `hud` (which collapse to `cinematic`). Checked every `.band-phone.layout-*`
  and `.band-tablet.layout-*` selector in `chrome.css`, `layouts.css`, `overlays.css` and
  `entrances.css` against that set: every live rule targets a reachable pairing
  (`.band-phone.layout-stack`, `.band-phone.layout-sheet`, `.band-tablet.layout-sidescroll`,
  `.band-tablet.layout-marginalia`, `.band-tablet.layout-stack`, etc.), and every *unreachable*
  pairing that was checked (`.band-phone.layout-sidescroll`, `.band-phone.layout-ledger`,
  `.band-tablet.layout-mosaic`/`magazine`/`ledger`/`radial`/`hud`) appears **only** inside a comment
  explaining why it was deliberately removed, never as a live rule. No regression of the trap found.
- **Animated-transform-beats-declared-transform.** Grepped every static `transform:` declaration in
  `chrome.css` (`.is-calm .v-sonar-beam`, `.v-lens-glint`, `.v-orbit-pill`, `.v-orbit-pill::before`)
  and confirmed none of them sits on an element that also carries a running `animation` touching
  `transform` — the one case that used to (`.v-toast`) is fixed exactly as the comment at
  `chrome.css:2270-2286` describes: centring moved to the separate `translate` property, `v-rise`'s
  keyframe keeps `transform`, and the two compose. `.v-shock` folds its own centring into its own
  keyframe rather than fighting a static declaration. `.v-footer-link.is-found` and `.v-block`'s base
  rise correctly use `backwards`, never `both`, matching the third gotcha.
- **From-only keyframes vs. `clip-path`'s discrete flip.** `v-console-wipe` and `.v-termbar-title`'s
  entrance both declare an explicit landing `clip-path: inset(0 0 0 0)` rather than relying on
  interpolation to `none` — exactly the fix CLAUDE.md documents. `entrances.css`'s shared `v-ent`
  keyframe is genuinely from-only, and only for `translate`/`scale`/`rotate`/`opacity`, none of which
  has this problem.
- **`.v-chrome`'s flex column and Terminal's opt-out.** `.v-chrome { height: 100dvh; ... }` with
  `.layout-terminal .v-chrome { height: auto; min-height: 100dvh; }`; `.v-stage { flex: 1 1 auto;
  min-height: 0; }` with Terminal's `.layout-terminal .v-stage { flex: 0 0 auto; min-height: auto; }`.
  Matches the doc exactly, including the "softening to `min-height` for everyone" failure mode
  described in the comment being the thing *not* done.
- **Scroll-snap**: `.layout-stack .v-stage { scroll-snap-type: y proximity; }` for tablet/desk,
  `.band-phone.layout-stack .v-stage { scroll-snap-type: none; }` for phone — correct compound form,
  and it wins over the non-phone rule both by specificity (0-3-0 vs 0-2-0) and by source order.
- **`.v-stage`'s `overflow-x`**: only `overflow-y: auto` is declared; per the CSS Overflow spec a
  `visible` value paired with a non-`visible` value on the other axis computes to `auto`, which is
  exactly why Split's and Mosaic's pointer-light pseudo-elements are pinned to `inset: ... 0` on the
  horizontal axis (checked both) rather than bleeding outward.
- **Floated `::first-letter`**: Magazine uses `initial-letter: 3 3` behind `@supports`, not
  `float: left`, exactly as documented — no float-based drop cap anywhere in the stylesheets.
- **`.v-account`'s flex-item width fix**: `.v-account { width: min(100%, 34rem); }` plus
  `.layout-sidescroll .v-stage:has(.v-account), ...:has(.v-downloads) { display: block; ... }` —
  confirmed both the width fix and the `:has()` opt-out are present and keyed on the container class,
  not a page id list.
- **`clip-path` clipping `box-shadow` away**: HUD's `.layout-hud .v-block` uses
  `filter: drop-shadow(...)` for elevation instead of `box-shadow`, with `box-shadow: none` stated
  explicitly, exactly as the doc describes; the "filter makes a containing block for `position: fixed`"
  consequence is called out in the same comment and is safe here (content blocks hold no fixed
  descendants).
- **`interaction.css`/`entrances.css` specificity discipline**: every hover/press/disabled selector is
  prefixed `.vessel` (0-2-0), the entrances base rule is `.has-entrances:not(.layout-console) .v-block`
  (0-3-0, `:not()` contributing its argument's specificity as documented), and Deck's second-animation
  problem is fixed **twice** — once in `layouts.css` as the base-layer longhand re-list, again in
  `entrances.css` as the entrance-layer longhand re-list — matching the comment's account of why one
  fix alone was insufficient (the later-imported shorthand at higher specificity resets the pair).
- **Accessibility tokens elsewhere**: systematically grepped every stylesheet for `faint` — the four
  literal `color: var(--faint)` uses are `.v-caret` and `.v-footer-dot` (both named in CLAUDE.md as
  the genuine decorative exceptions) plus the two flagged in Finding 1 below. Every other historical
  `--faint`-as-text-colour site (`.v-door-row`, `.v-door-routes`, `.v-panel-label`, `.v-dlcodes-state`,
  `::placeholder`) has already been moved to `--muted`, with a comment recording why.

## Finding 1 — `.v-knock` and `.v-saver-label` still render real, non-decorative text in `--faint`, failing the same contrast test the codebase has fixed everywhere else

**File/line**: `src/styles/overlays.css:366-382` (`.v-knock`), `src/styles/overlays.css:555-566`
(`.v-saver-label`).

**Mechanism**: CLAUDE.md's *Accessibility* section states the rule in general form: *"`--faint` is not
a text colour (2.78–4.09:1 on all 25 palettes). Text uses `--muted` — including the footer... `.v-caret`
and `.v-footer-dot` remain and genuinely are decorative."* Every other historical use of `--faint` as a
text colour has a paired comment recording the 2026-08-17 audit that moved it to `--muted`
(`.v-door-row`, `.v-door-routes`, `.v-panel-label`, `.v-dlcodes-state`). A full sweep of all seven
stylesheets for `var(--faint)` used as a `color` finds exactly four sites: `.v-caret` and
`.v-footer-dot` (both named as the intended exceptions) — and these two, which are not:

```css
/* src/styles/overlays.css */
.v-knock {
  ...
  color: var(--faint);
}
.v-knock-state {
  color: var(--muted);
}
```

`.v-knock` (`src/components/SiteConfigPanel.tsx:728-731`) is a real, clickable `<button>`:

```tsx
<button type="button" className="v-knock" onClick={() => say("you are already inside")}>
  <span>◈ operator access</span>
  <span className="v-knock-state">{config.unlocked ? "found" : "locked"}</span>
</button>
```

The `<span className="v-knock-state">` (the "found"/"locked" word) was correctly bumped to `--muted`,
but the button's own label — "◈ operator access", the text that actually names what the control does —
has no override and inherits `.v-knock`'s base `color: var(--faint)`. The fix was applied to the child
state span and missed the parent's own label text.

```css
.v-saver-label {
  position: absolute;
  ...
  color: var(--faint);
  opacity: 0.6;
}
```

`.v-saver-label` (`src/components/Screensaver.tsx:19`) renders `"click to return"` — the only text on
screen telling a visitor how to dismiss the full-viewport screensaver overlay. It is not decorative in
the sense `.v-caret`/`.v-footer-dot` are (a blinking terminal cursor, a clock's hidden-route dot); it is
the sole instruction on an interactive full-screen control, the same category CLAUDE.md classifies
`.v-door-routes` under ("instructional text a person is expected to read"). The additional
`opacity: 0.6` compounds the failure: effective contrast against the already-failing `--faint`
(2.78–4.09:1) drops further, to roughly 1.7–2.5:1 depending on palette.

**Concrete impact**: On any of the 25 palettes, a low-vision visitor cannot reliably read either "◈
operator access" (the only label identifying what the door/panel-access control does — the "found"/
"locked" state word beside it is legible, the control's own name is not) or "click to return" (the only
on-screen instruction for exiting the screensaver, at reduced opacity on top of an already-failing
token). Both fail WCAG 1.4.3 (4.5:1 required for normal text) on every one of the 25 palettes, which is
exactly the failure class CLAUDE.md records as fixed everywhere else in the codebase and states the
general rule against ("operator-only is not a WCAG exemption," said explicitly of `.v-panel-label`,
which is the same "operator-only chrome" category `.v-knock` belongs to).

**Severity**: Medium (WCAG 1.4.3 contrast failure on visible, non-decorative interactive/instructional
text, on all 25 palettes; not a security issue).

**Suggested check** (not implemented): extend whatever gate already prevents new `--faint`-as-text-colour
regressions (if one exists) — or add one — to grep every stylesheet for `color: var(--faint)` and
assert the selector is in an explicit, named allow-list (`.v-caret`, `.v-footer-dot`) rather than
merely counting occurrences, the same shape as the `PICKABLE_FX`/`FX` or `PUBLISHED_KEYS` parity gates
elsewhere in `scripts/check.ts`.

## Finding 2 — `worker/setups.ts`'s case-insensitive "replace on same name" logic has an uncovered concurrent-insert race, because the DB's uniqueness is case-sensitive

**File/line**: `worker/setups.ts:68-120` (`save`), schema at
`migrations/0001_phase1_accounts.sql:124-133`.

**Mechanism**: The unique index backing `setups` is declared with no collation override:

```sql
CREATE TABLE setups (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  ...
);
CREATE UNIQUE INDEX idx_setups_name ON setups (account_id, name);
```

SQLite's default text collation is `BINARY`; neither the column nor the index declares `COLLATE
NOCASE`, so `(account_id, "Home")` and `(account_id, "home")` are two distinct values as far as the
unique constraint is concerned. The application logic in `save()` treats them as the same setup — by
design, per its own comment:

```ts
// Case-insensitive, unlike the unique index, which collates binary: a person
// saving "workshop mode" over "Workshop Mode" means the same setup...
const existing = await env.DB.prepare(
  "SELECT id, created_at FROM setups WHERE account_id = ? AND name = ? COLLATE NOCASE",
)
  .bind(account.id, name)
  .first<{ id: string; created_at: number }>();

if (existing) {
  // ... UPDATE ...
}
// ... falls through to INSERT ... ON CONFLICT (account_id, name) DO UPDATE ...
```

The `INSERT ... ON CONFLICT (account_id, name) DO UPDATE` is explicitly documented as the fix for the
check-then-insert race: *"The ON CONFLICT covers the race this check-then-insert leaves open: two
concurrent saves of a genuinely new name both pass the SELECT above."* That claim is true only for two
concurrent saves of the **exact same string**. It is false for two concurrent saves whose names differ
only in case: two requests naming "Home" and "home" (or any case variant of the same intended setup)
both see nothing from the `COLLATE NOCASE` `SELECT` (neither exists yet), both fall through to the
`INSERT`, and because the unique index is binary-collated, `ON CONFLICT (account_id, name)` does not
fire for either — `"Home" != "home"` under `BINARY` collation — so **both inserts succeed**, leaving two
rows in the table for what the application (and the `SELECT ... COLLATE NOCASE` that runs on every
subsequent save) treats as one identity.

**Concrete impact**: Two setups panels open in different tabs (or a retried request after a slow
response, or simply two rapid double-clicks that race two `fetch()` calls) saving "Weird Mode" and
"weird mode" within the same request window produces two permanent rows rather than one being replaced
by the other — violating the stated design ("Saving over an existing name replaces it — that is what
'save' means to the person doing it") and leaving the account's setups list with an apparent duplicate
that no later same-cased save can merge (a subsequent save of either exact casing will now match one of
the two rows via `COLLATE NOCASE`'s `LIMIT`-free `SELECT`... `first()`, silently updating whichever row
SQLite happens to return first and leaving the other as permanent dead weight). This is a data-integrity
bug, not a security issue — `SETUPS_MAX` (50) bounds the damage per account and no cross-account leak is
possible — but it directly contradicts the code's own comment about what the `ON CONFLICT` clause
covers.

Note: `worker/machines.ts` (out of scope for this pass and pass 1) has the identical shape —
`migrations/0004_phase2_machines.sql`'s comment for `idx_machines_owner_name` says *"the handler checks
case-insensitively (like setups) and this backstops the race,"* which is the same overstated claim,
un-audited here. Whoever covers `machines.ts` should check `rename`'s handler for the same gap.

**Severity**: Low–Medium (data-integrity bug, not exploitable across accounts or for privilege
escalation; the failure mode is a cosmetic and slightly confusing duplicate row).

**Suggested check** (not implemented): a gate that fires two genuinely concurrent `save()` calls (via
`Promise.all`) with names differing only by case and asserts exactly one row exists afterward — the
same "drive it, don't re-derive it" shape CLAUDE.md's *Checks* section asks for, since a comment
asserting a race is closed is exactly the kind of claim that has previously shipped false elsewhere in
this codebase (the blocklist-array and passkey-replay examples the *Checks* section itself names).

## Other observations, not rising to findings

- **The report-only CSP header is attached to every non-API response, not only documents.**
  `worker/index.ts`'s non-API branch (`harden(unvalidatable(withPageMeta(...)), cspPolicy(nonce, url))`)
  runs unconditionally for anything not under `/api/`, so a request for a JS bundle, a font file or an
  image also gets a fresh `content-security-policy-report-only` header (and pays for a
  `crypto.getRandomValues` nonce mint) even though `cspPolicy`'s own doc comment says the CSP belongs
  "only where there is a document for it to govern... API responses are JSON to a fetch — a policy
  there is noise." This is harmless in practice — browsers do not action a CSP response header on a
  non-navigated resource fetch (an image, a `<script src>`, a `<link>` stylesheet, a font), so no
  spurious reports are generated and enforcing mode would not be affected — but it is a live
  contradiction of the stated design principle and costs a nonce generation per static asset request
  for no purpose. Not filed as a finding because it has no observable effect today.
- **`RateLimiter.attempt()` and `RateLimiter.fail()` duplicate the exact backoff formula**
  (`Math.min(WINDOW_MS * 2 ** (over - 1), MAX_PENALTY_MS)` plus the `blockedUntil`/`expiresAt`
  assignment) verbatim rather than sharing a helper. Both are currently correct and identical, but a
  future retune of the penalty curve in one is not guaranteed to be mirrored in the other, and nothing
  in `scripts/check.ts` (not audited in this pass, but `rate-limit.ts` itself has no such guard) would
  catch the two drifting apart. Not filed as a finding since both are correct today — a maintainability
  note only.
- **`SETUPS_MAX`'s count-then-insert has the same generic check-then-act shape** as `MAX_PASSKEYS` in
  pass 1's slice (`count(*)` read, then an unconditional insert), which pass 1 explicitly accepted as
  "the one acceptable race" for passkeys ("can overshoot by one row under concurrency"). The same
  reasoning applies here and is not a new bug, just noted for symmetry since this file wasn't in pass
  1's slice.

## Summary

Two confirmed findings. **Finding 1** (Medium): `.v-knock`'s button label and `.v-saver-label`'s
screensaver-exit instruction both still render in `--faint`, which CLAUDE.md's own accessibility
section documents as failing WCAG 1.4.3 on all 25 palettes and states should never carry text — every
other historical instance of this exact bug (`.v-door-row`, `.v-door-routes`, `.v-panel-label`,
`.v-dlcodes-state`, `::placeholder`) has a recorded 2026-08-17 fix; these two were missed. **Finding 2**
(Low–Medium): `worker/setups.ts`'s `ON CONFLICT` clause does not cover the race its own comment claims
it covers — two concurrent saves of differently-cased names for what the app treats as one setup both
succeed, because the DB's unique index is binary-collated while the app's uniqueness check is
`COLLATE NOCASE`. The identical shape exists in the out-of-scope `worker/machines.ts` per its own
migration comment and should be checked by whoever audits that file.

Everything else asked for in the brief — the origin-check singularity (`foreignOrigin`, two callers,
applied globally ahead of dispatch), CSP nonce threading, the HTTPS-redirect workerd quirk,
`unvalidatable()`'s ETag/cache-control stripping, `run_worker_first`'s no-negation fix, the rate
limiter's attempt/check/succeed/reset/alarm semantics, `page-meta.ts`'s exactly-one-description
invariant, and all eleven CSS gotchas (band/layout compounds, animated-vs-declared transform,
`.v-block`'s `backwards` fill, the entrance-layer specificity math and Deck's double-fix, the
from-only-keyframe/`clip-path` discrete-flip handling, the flex-column chrome with Terminal's opt-out,
scroll-snap by band, `.v-stage`'s `overflow-x`, Magazine's `initial-letter`, `.v-account`'s
`:has()`-scoped width fix, and HUD's `drop-shadow` substitution for `box-shadow`) — was independently
re-derived from the current code/CSS rather than trusted from comments, and found to still hold. A
green reading of these two files' comments would have been correct for every one of them except the
two findings above.
