# Pass 6 — Admin/SiteConfigPanel/QR/Hero + palettes/snippets/mail/pages data

Scope reviewed in full: `src/components/Admin.tsx`, `src/components/SiteConfigPanel.tsx` (full
logic this time — Pass 1 only covered one CSS/`aria-modal` finding on it), `src/components/QrCode.tsx`
and its encoder `src/auth/qr.ts`, `src/components/Hero.tsx`, `src/data/palettes.ts`,
`src/data/snippets.ts`, `src/data/mail.ts`, `migrations/0003_site_config.sql`, and a structural
(not copy-quality) pass over `src/data/pages.ts` (all 828 lines) and `src/data/pageIds.ts`. Also read,
for cross-reference only: `src/components/ProofDialog.tsx`, `worker/admin.ts` (all four write
handlers + `listAccounts`), `src/auth/api.ts` (`AdminAccount`/`ApiError`/`call`), `src/data/guardrails.ts`
(`Combination`/`combinationOf`/`warnings`), `src/data/lookSettings.ts` (`PageLook`/`validLookPages`),
`scripts/check.ts`'s QR section (§3) and its snippet/404-count gates, and `src/config/ConfigContext.tsx`
(just enough to confirm `page` lives on the same `Config` object `SiteConfigPanel` watches).

Confirmed against `.audit/pass1-*.md` through `pass3-followups.md`: none of the above files appear in
their file lists except the single `aria-modal` line item on `SiteConfigPanel.tsx`/`OperatorDoor.tsx`
in `pass1-components-misc.md` §1, which this pass does not re-litigate.

## Verified correct

- **All four `Admin.tsx` actions are wired to the same `ProofDialog`, and all four call the exact
  server routes `worker/admin.ts` gates behind `proven()`** — `run()`'s switch maps `"operator"` →
  `adminSetOperator`, `"totp"` → `adminResetTotp`, `"reset"` → `adminResetPassword`, `"delete"` →
  `adminDeleteAccount`, each given the `authSecret` from `derivePassword(me.account.handle, password)`
  (the *caller's* own credential, correctly — never the target's). No fifth write route exists that
  the dialog forgot.
- **"Last way in" and other 400 refusals render comprehensibly.** `worker/admin.ts`'s `BadRequest`
  messages are already full sentences addressed to a person ("You are the only operator. Make someone
  else an operator before removing your own.", "That account has no other credential that can open
  its key, so a reset would seal it for good. Delete it instead, or leave it be.", "Change your own
  password from your account instead.", "You cannot delete the account you are signed in with.").
  `src/auth/api.ts`'s `call()` surfaces `body.error` verbatim as `ApiError.message`, and
  `Admin.tsx`'s `confirmed()` catch renders `cause.message` inside the still-open `ProofDialog` next
  to the password field the user just typed into — not flattened to a generic failure, and not lost
  behind a closed dialog.
- **No stale-closure bug in the list-reload pattern.** `load` is a stable `useCallback` with no
  captured mutable state; `confirmed()` always reloads (`await load()`) and then refreshes the
  session (`await refresh()`) using the server's answer rather than patching local state, matching
  the file's own stated reasoning ("the server's answer is what is true"). Checked the one
  interesting edge (an operator removing *their own* operator flag, which the UI permits — only
  `reset`/`delete` hide `self`, not the operator toggle): `load()`'s own try/catch swallows the
  resulting 403 from the now-non-operator caller internally, and the very next `refresh()` flips
  `isOperator` to false, which unconditionally renders the "Not for you" branch — so the stray
  error is generated but never surfacing anywhere. Wasteful (one guaranteed-to-fail request) but not
  user-visible and not a bug worth gating.
- **`ProofDialog`'s `requireText` (delete confirmation) and busy/disabled wiring are correct** —
  `ready` correctly ANDs `!busy`, a non-empty password, and (when `requireText` is set) an exact
  trimmed match; `onClose` is neutered while `busy`; the form's single `onSubmit` is the same path
  as the button, per the project's stated form convention.
- **The QR encoder (`src/auth/qr.ts`) was not re-derived by hand — `scripts/check.ts`'s existing
  QR section (§3, ~lines 1093–1292) already does exactly what the brief asks for and does it better
  than a manual check could**: an independent from-scratch Reed–Solomon implementation checked
  against the ISO/IEC 18004 worked example, a free-module count reconstructed from the specification
  (not from `qrMatrix`'s own `reserved()`, specifically so the two can't share a mistake), a
  format-info check that reads the symbol at ZXing/python-qrcode's published bit positions (not the
  encoder's own `writeFormat` positions), and a full independent decoder that round-trips three
  payload sizes including the real `otpauth://` URI shape. Hand-tracing the encoder's masking,
  interleaving and bit-placement logic against these four independent checks found no discrepancy,
  and the file's own history comments (transposed format copies, a 16-module corner
  over-reservation, a pad-run phase bug) all read as already fixed and now covered by a check that
  would have caught the specific fault. No finding here — re-deriving it from scratch would be
  redundant with what the gate already does.
- **`QrCode.tsx`'s refuse-to-render contract is intact**: `qrMatrix` is only ever called inside the
  `useMemo`'s `try`, the `catch` returns `null`, and the component bails to `null` before touching
  `modules`, so a >213-byte `value` cannot white-screen either of its two current callers.
- **`Hero.tsx` has no bugs** — it is a thin, correctly-wired presentational component; the
  `cta.action === "reveal-mail"` branch matches the one CTA in `src/data/pages.ts` that sets it
  (`contact`'s primary CTA).
- **`src/data/mail.ts`** does what its comment claims: the full address never appears as one
  contiguous string literal in source (the `@` is synthesized via `String.fromCharCode(64)`), which
  is what defeats a naive full-address regex scrape of the bundle.
- **`migrations/0003_site_config.sql`** — single-row table via `CHECK (id = 1)`, `published_by`
  correctly `ON DELETE SET NULL` (an operator account being deleted later must not orphan the FK or
  crash a read of `site_config`). No issue found.
- **`src/data/pages.ts` structural counts all check out**: `PAGES` is a `Record<PageId, Page>`
  (TypeScript enforces all 17 keys present, so no missing-page defect is reachable), every
  `PageCta.to` is a compiler-checked `PageId`, `loud: true` appears exactly once across the whole
  file (the scams page's "they will lose their temper" block), matching the "about once per page"
  rule with room to spare, and the 404's "eleven other pages" line is independently gated
  (`scripts/check.ts` "every route has copy, and the 404's page count is true", computing
  `content.length` from `PATHS` minus the account/notfound pages and asserting the word appears in
  `PAGES.notfound`'s body) — confirmed correct by re-deriving the count myself (11) rather than
  trusting the gate's own arithmetic.
- **`src/data/snippets.ts`**: `SNIPPETS` is `Record<PageId, readonly string[]>` (all 17 keys
  present), manually counted at 23 total strings over 17 routes (home carries 7, every other route
  carries exactly 1) — matches the audit brief's cited "23 snippets over 17 routes" figure exactly,
  and that figure is itself computed dynamically by `scripts/check.ts` (`${lines} snippets over
  ${routes.length} routes`) rather than hand-typed anywhere, so it cannot drift silently.
  `NEVER_ROTATES` is gated (`SNIPPETS[id].length === 1` asserted for scams/setup/contact), and the
  day-based rotation is deterministic and gated for stability-within-a-day and full pool coverage.
- **`src/data/palettes.ts`**: 25 distinct `PaletteId`s with 25 corresponding `PALETTES` entries
  (matches CLAUDE.md's "twenty-five palettes" and the Cold Open entry's own comment calling itself
  "the twenty-fifth"). `LOW_CONTRAST` names exactly the four palettes CLAUDE.md's accessibility
  section names (Peat, Oxide, Terracotta Night, Deco Gold). `DEFAULT_PALETTE_INDEX = 0` is Nebula
  Drift, matching "Nebula Drift wins on load." `TIME_OF_DAY`'s six palette ids (`uv`, `arctic`,
  `reef`, `vapor`, `obsidian`, `nebula`) are all valid, live ids. I independently recomputed WCAG
  contrast ratios for `muted` against `surface` across all 25 palettes (range: 6.21–8.31:1) and for
  `a3` against `surface` (oxide 2.98, xerox 4.03, peat 4.21, all other 22 well above 4.5:1) — this
  reproduces CLAUDE.md's claimed shape exactly (three failing danger-text palettes, the same three
  named: oxide/xerox/peat) and the absolute numbers are within ~0.02–0.04 of the document's cited
  figures (oxide 3.00, xerox 4.07, peat 4.25), a gap fully explained by rounding/precision in
  whatever one-off script produced the documented numbers rather than any actual value drift. No
  palette has been edited out of step with the claim.

## Finding 1 — SiteConfigPanel's "Published" confirmation is invalidated by mere navigation, not just by an appearance change

**File/line**: `src/components/SiteConfigPanel.tsx:103-105`

```ts
useEffect(() => {
  setPublishState((state) => (state === "published" ? "idle" : state));
}, [config]);
```

**Mechanism**: `config` here is the single `Config` object from `useConfig()`, and `page` (the
current route) lives on that *same* object — confirmed in `src/config/ConfigContext.tsx`, where
`go()` does `setConfig((prev) => ({ ...prev, page, ...(result ?? {}) }))` (line ~647) and the
initial boot state is `{ ...loaded, ...motion, page: pageFromPath(window.location.pathname) }`
(line ~201). So this `useEffect`'s dependency array does not distinguish "the operator changed an
appearance dial" from "the operator (or anyone with mouse access to the page behind the drawer)
navigated to a different route."

The panel is not a full-screen modal that blocks the rest of the page: `.v-panel` in
`src/styles/overlays.css:171-186` is `position: fixed; right: 0; width: min(92vw, 420px)` — a
right-hand drawer, not a scrim. `useFocusTrap` only intercepts `Tab`/`Escape`; it does not stop a
mouse click on anything still visible to the left of the drawer (the header nav, the footer nav, a
CTA button in the page body) at any viewport wider than ~420px. Pass 1 already flagged this same
gap between the drawer's `role="dialog" aria-modal="true"` and its actual non-blocking behaviour as
an accessibility defect (`pass1-components-misc.md` §1); this finding is the *functional*
consequence of the same underlying fact, not a restatement of it.

**Concrete impact**: an operator publishes a setup, sees "Published. Every visitor gets this look
from now on." (the `publishState === "published"` branch), and then — without touching a single
control in the panel — clicks a visible nav pill or footer link to check how the published look
reads on another page (an entirely natural thing to do right after publishing). `config.page`
changes, this effect fires, and `publishState` silently resets to `"idle"`, so the panel now shows
"This changes the site for every visitor, not just you. Unpublished changes are lost when you
reload." This is false: nothing was changed, and the just-published config is still live. An
operator who trusts that message could re-type their password and publish again for no reason, or
— worse — could read it as "my last publish didn't stick" and start second-guessing a successful
action. It also fires on the same `Config` object's `sub` field (the `/downloads/<name>` sub-page),
so browsing a download's sub-page while the panel is open has the identical effect.

**Severity**: Medium (no security impact, but it is exactly the class of bug this codebase's own
philosophy singles out — "does the thing it claims to do actually happen," CLAUDE.md's *Checks*
section — inverted here into a control claiming something *didn't* happen when it did).

**Suggested check** (not implemented): drive `ConfigContext` and `SiteConfigPanel` together in a
test, set `publishState` to `"published"` by simulating a successful publish, then call `go()` to a
different page with no other config change, and assert `publishState` is still `"published"`. A
narrower fix shape worth naming for whoever implements it: the effect should depend on the
*appearance* slice of `config` (or a shallow-diff against the last-published payload) rather than
the whole object, since `page`, `sub`, and `unlocked` are not appearance and `publishable(config)`
presumably already excludes at least some of them.

## Finding 2 — Look-dial feedback is inconsistent: Typography gives no confirmation at all, and Ornament/Station never announce page-only scope

**File/line**: `src/components/SiteConfigPanel.tsx:377-465` (Layout/Background sections, for
contrast) and `:467-482` (Typography), `:419-465` (Ornament/Station).

**Mechanism**: Three of the six per-page "look" dial sections tell the operator, via `say()`,
whether the click they just made applies to the whole site or only to the page behind the drawer —
and the Palette handler's own comment explains *why* this matters: "Silently changing a setting the
operator did not touch is worse than the overwrite it was avoiding. So: pick the palette, leave the
mode alone, and *say* what will happen." (`:313-338`). Layout and Background follow the identical
pattern:

```ts
// Palette
say(target === "page" ? `${palette.name}, on ${config.page} only` : ...);
// Layout
say(target === "page" ? `${layout.label}, on ${config.page} only` : `${layout.label} layout`);
// Background
say(target === "page" ? `${effect.label}, on ${config.page} only` : effect.label);
```

Ornament and Station are the same kind of single-select dial, gated through the identical
`setLook()`/`target` machinery, but their handlers drop the scope qualifier entirely:

```ts
// Ornament
onClick={() => { setLook({ ornament: ornament.id }); say(ornament.id === "none" ? "ornament off" : ornament.label); }}
// Station
onClick={() => { setLook({ station: station.id }); say(station.label); }}
```

Typography goes further and calls `say()` not at all:

```ts
onClick={() => setLook({ type: i })}
```

**Concrete impact**: with `target === "page"`, clicking a Typography chip changes the typeface for
the current page only, with zero toast feedback of any kind — the operator's only signal is the
`is-active` class moving to a different chip, identical to what happens in site mode, so there is no
way to tell from the toast stream (which every other control in this panel uses) whether the change
just applied site-wide or to one page. Ornament and Station give *a* toast, but the same
site-vs-page ambiguity applies to them: clicking "Sonar" while `target === "page"` says only
"Sonar", exactly what it would say in site mode, whereas the equivalent Palette/Layout/Background
click would say "Sonar, on work only." An operator relying on the panel's own stated mechanism for
telling site-wide from page-scoped edits gets it for 3 of 6 dials and not the other 3.

**Severity**: Low (no data loss or security issue — `setLook()`'s actual write is correct in all six
sections; this is purely a feedback/consistency gap that increases the chance of an operator
believing a page-scoped edit is site-wide or vice versa, in the same drawer that already tracks
"which dial is which" `overridden` count elsewhere on the page).

**Suggested check** (not implemented): a source-level gate over `SiteConfigPanel.tsx` asserting
every `setLook(...)` call site is immediately followed by a `say(...)` call whose string branches on
`target`, the same shape `code-review`/`check.ts` already uses elsewhere in this codebase to assert
a control "reaches" what it claims to (e.g. the guardrail-warning render gate, the duel-tuning
call-site gate).

## Finding 3 — Admin's "reset password" button is disabled more conservatively than the server's actual refusal, blocking a legitimate reset

**File/line**: `src/components/Admin.tsx:208-221`, compared against `worker/admin.ts:259-281`
(`resetPassword`'s guard).

**Mechanism**: the client disables the button on:

```ts
disabled={
  working ||
  !account.credentials.password ||
  account.credentials.recoveryCodesRemaining === 0
}
```

The server's actual refusal is a different, wider test — it allows the reset if the account has
**any** key slot from a passkey *or* an unspent recovery code:

```sql
EXISTS (SELECT 1
         FROM key_slots s JOIN credentials c ON c.id = s.credential_id
        WHERE s.account_id = ?
          AND (c.kind = 'passkey' OR (c.kind = 'recovery' AND c.used_at IS NULL)))
```

`listAccounts` (`worker/admin.ts:104-137`) exposes a raw `passkeys` count to the client
(`credentials.passkeys`, an unfiltered `COUNT` of unspent passkey credentials — it does not and
cannot distinguish a `prf`-capable passkey with a key slot from a `prf`-less one with none, per
CLAUDE.md's own note that a `prf`-less passkey "registers with no key slot, deliberately"), but the
client's disabled condition never reads it at all — it disables purely on
`recoveryCodesRemaining === 0`, regardless of `credentials.passkeys`.

**Concrete impact**: an account that has exhausted all ten recovery codes but *does* have a
`prf`-capable passkey (holding an openable key slot) is a case the server would legitimately allow
to be reset — the passkey slot is "another way in." The Admin UI disables the button for this
account unconditionally, so the operator has no way to trigger a reset the server would actually
honour (e.g. to retire a password suspected of compromise on an account that otherwise signs in via
passkey). Because `credentials.passkeys` doesn't distinguish keyed from keyless passkeys, the
client cannot correctly replicate the server's exact rule either way — but the current
implementation resolves that ambiguity by always refusing, producing a guaranteed false negative
rather than an occasional false positive.

**Severity**: Low (the same outcome — the password credential being retired without escrow — is
almost always reachable another way, since an account with a working passkey can already sign in
and use self-service `changePassword` without any operator action; this is a UI gap in a control
that has a viable workaround, not a security or data-loss issue).

**Suggested check** (not implemented): either have `listAccounts` additionally report whether *any*
of an account's passkeys carries a key slot (a cheap `EXISTS` alongside the existing `passkeys`
count), and gate the button on that OR `recoveryCodesRemaining > 0`, or — if the extra column is not
wanted — leave the button enabled whenever a password exists and let the server's own message
(`"That account has no other credential that can open its key..."`) be the source of truth, since
`Admin.tsx` already renders that message comprehensibly inside the dialog (see Verified section
above).

## Finding 4 — `src/data/pageIds.ts`'s header comment undercounts the routes it defines by one and omits `downloads` from the enumeration

**File/line**: `src/data/pageIds.ts:1-9`

```ts
/**
 * The sixteen pages and their real URLs — the spec's nine, plus setup and scams,
 * plus signup, signin and admin (phase 1), and machines and share (phase 2,
 * SPEC-ACCOUNTS.md §13).
 * ...
 */
```

**Mechanism**: the `PageId` union defined two lines below actually has 17 members (the comment's own
9 + 2 + 3 + 2 = 16 arithmetic never included `downloads`, which was added on 2026-08-19/20 per the
`FOOTER_NAV` and `SUB_PREFIX` comments further down in the *same file*). CLAUDE.md's own
"Implementation traps" section already states the correct, current figure: "**Seventeen real URLs
are wired in `src/data/pageIds.ts`**." So the file's own top-of-file doc comment is the thing that
drifted, not the type or CLAUDE.md.

**Concrete impact**: purely a stale-comment/documentation-drift issue — `PATHS`, `NAV`,
`FOOTER_NAV`, `pageFromPath`/`subFromPath` are all independently correct and gated (confirmed under
"Verified correct" above). A future reader trusting this file's own header rather than counting the
union by hand would undercount the site's routes by one and miss that `downloads` exists at all,
which is exactly the kind of drift this project's `CLAUDE.md` exists to prevent elsewhere.

**Severity**: Low (comment-only; no behavioural effect).

**Suggested check**: none needed beyond a human editing pass — a machine gate asserting a doc
comment's prose number matches a `.length` would be unusually brittle for a one-line fix.

## Finding 5 — `src/data/palettes.ts`'s header comment undercounts the palette list by one

**File/line**: `src/data/palettes.ts:1-7`

```ts
/**
 * The 24 palettes, copied verbatim from PALETTES in the design prototype
 * (design_handoff_vessel_v2/Site v2 - Vessel.dc.html:288).
 * ...
 */
```

**Mechanism**: the array below this comment holds 25 entries — the original 24 from the prototype
plus `coldopen`, appended at index 24 with its own comment explicitly calling it "the twenty-fifth,
and the first that is not from the prototype" (`:55-68`). The file's own header was never updated
when that palette was added, so it now describes only the prototype subset rather than the shipped
array. CLAUDE.md's *Known deviations* §13 correctly states "twenty-five palettes."

**Concrete impact**: comment-only, same class as Finding 4 — every consumer of `PALETTES` reads
`.length` or iterates the array directly, so nothing downstream is affected; this is purely a trap
for a future human reader of this specific file who trusts its header over counting the array.

**Severity**: Low (comment-only; no behavioural effect).

**Suggested check**: none needed.

## Summary

Five findings, all confirmed by direct code inspection (no fixes applied, per instructions):

1. **Medium** — `SiteConfigPanel`'s "Published" success state resets to "idle" on any change to the
   whole `Config` object, including pure navigation (`page`/`sub`), not just an actual appearance
   edit — because the panel drawer is a 420px sidebar rather than a true scrim and the rest of the
   page stays clickable, an operator can trigger a false "unpublished changes" message immediately
   after a real, successful publish.
2. **Low** — Look-dial feedback is inconsistent across the panel: Palette/Layout/Background announce
   "on `<page>` only" in page-scope mode, but Ornament/Station never do, and Typography gives no
   confirmation toast at all under any scope.
3. **Low** — `Admin.tsx`'s "reset password" button disables solely on `recoveryCodesRemaining === 0`,
   ignoring the server's actual (wider) guard, which also accepts a passkey holding a key slot as
   "another way in" — a legitimate reset can be server-permitted but client-unreachable.
4. **Low** — `src/data/pageIds.ts`'s header comment says "sixteen pages" and omits `downloads`;
   the real, correctly-implemented union has 17, matching CLAUDE.md's own count elsewhere.
5. **Low** — `src/data/palettes.ts`'s header comment says "The 24 palettes"; the real array has 25
   (Cold Open was appended after the comment was written), matching CLAUDE.md's own count elsewhere.

Everything else audited in this pass — all four `Admin.tsx` write actions and their password-proof
wiring, the QR encoder (already exceptionally well-gated by three independent `scripts/check.ts`
checks that re-derive rather than trust the encoder's own logic), `Hero.tsx`, `mail.ts`,
`migrations/0003_site_config.sql`, and the structural shape of `pages.ts`/`snippets.ts` (route
counts, CTA target validity, the 404's self-referential page count, the 23-snippets/17-routes
figure) — held up against direct re-derivation and against CLAUDE.md's specific claims, including an
independent WCAG contrast recomputation across all 25 palettes that reproduced the document's cited
figures within measurement-precision tolerance. `Admin.tsx`, `SiteConfigPanel.tsx` and the guardrail
UI it drives are genuinely "operator surfaces" per CLAUDE.md's own framing (nothing automated
verifies them in a browser), so Findings 1–3 above are exactly the class of defect that framing warns
would otherwise go unnoticed.
