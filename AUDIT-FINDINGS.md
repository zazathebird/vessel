# Site-wide debug audit — running findings

Started 2026-09-13; committed 2026-09-14 so it does not live on one machine only. Purpose: find and record every bug,
inconsistency, dead code path, or invariant violation across the whole vessel-main project —
**no fixes applied here**, just findings. Five sequential passes, each reviewing and building on
the last — then a sixth, a fresh scan of four slices the first five never touched. The routing of
every open finding is in `TODO.md`; this file is the index and `.audit/pass*.md` the evidence.

Baseline: `npm run check` — 81/81 automated checks pass (2026-09-13). **Superseded 2026-09-14**: the
desktop-looks project split into its own repository (`../debian`, see CLAUDE.md's "The desktop of
that machine is a project..." entry and `desktop-project-location` project memory); one gate split
in two and one moved out, so the count as of Pass 2 is **80/80**. Any Pass-1 finding that cites an
absolute check.ts line number should be treated as approximate — the new gates were appended near
the end of the file (~line 5700), so line numbers *before* that point are unaffected, but re-grep
rather than trust a stale number blindly. The gate's own "still needs a person" list is the map for
what automation can't catch:
- whether the duel reads well (rAF parks in automation)
- whether any layout is beautiful, or the copy sounds right
- whether a QR actually scans on a phone
- the operator surfaces, which need a signed-in session
- whether a category's icon reads as that category, and whether any two are alike
- whether a desktop look resembles the distribution it imitates, and whether the host actually serves files

A "finding" here means something that looks wrong, inconsistent, contradicts a stated CLAUDE.md
invariant, is dead/unreachable code, or is a real risk — not a stylistic opinion, and not something
CLAUDE.md already documents as a deliberate, known deviation.

## Status legend
- 🔴 confirmed bug/defect
- 🟡 suspected / needs verification
- 🔵 informational / dead code / cleanup opportunity (not a functional bug)
- ⚪ investigated, turned out fine (false alarm) — kept for the record so passes don't re-litigate it
- ✅ CLAUDE.md-documented deliberate deviation — not a bug, noted only to avoid re-flagging

---

## Pass 1 — source-level sweep (done, 2026-09-13/14)

Run as four parallel file-scope reviews, each reading its slice in full rather than skimming, each
re-deriving CLAUDE.md's stated invariants from the actual code rather than trusting comments. Full
detail in `.audit/pass1-*.md`; table below is the index. Scope covered: accounts/auth (worker +
`src/auth`), misc components/hooks/audio/pageIds, core config/state architecture + duel *data*
(`duelSettings.ts`/`stations.ts`/guardrails), and the duel *engine* (`src/fx/duel.ts`,
`fighters.ts`, the duel React hosts and bench tooling). Explicitly **not** covered by Pass 1 (flagged
for Pass 2, now underway — see below): downloads/catalogue feature, phase-2 sharing
(`worker/signal.ts`, `worker/machines.ts`, `src/share/*`), `worker/index.ts`/CSP/origin checks,
`worker/rate-limit.ts`'s own Durable Object logic, CSS stylesheets, and the sixteen non-duel FX
effects + the three setup scripts.

| # | File | Severity | One-line summary |
|---|---|---|---|
| 1 | `.audit/pass1-accounts-auth.md` — Finding 1 | 🔴 Low–Medium | `signup`'s "handle taken" branch calls `recordFailure` on top of `assertAttempt`'s own reservation, double-counting against the `signup:`/`client:` rate-limit buckets — an honest user picking 2–3 taken handles burns 4–6 of the 12-attempt allowance instead of 2–3, and can lock themselves out within one afternoon. Self-DoS only, not exploitable for escalation. |
| 2 | `.audit/pass1-components-misc.md` — Finding 1 | 🔴 Medium | `SiteConfigPanel.tsx`/`OperatorDoor.tsx` both render `role="dialog" aria-modal="true"` while deliberately passing no `{ modal: true }` to `useFocusTrap` (per CLAUDE.md, "the panel and door are deliberately not modal"). The ARIA markup tells assistive tech the page is inert while sighted/keyboard users can still act on it underneath — a real WCAG/ARIA authoring-practices violation, independent of whether the underlying non-modal behaviour is desired. |
| 3 | `.audit/pass1-components-misc.md` — Finding 2 | 🔴 Medium | Arrow-key NAV paging (`useOperatorRoutes.ts`) checks `!panelOpen` but not `!doorOpen`, so pressing ArrowLeft/Right while the operator door is open silently navigates the page underneath a `aria-modal="true"` dialog. No gate covers it (`grep doorOpen` in check.ts: zero hits). Looks like an omission, not a design choice — the exact same class of bug the panel gate exists to prevent. |
| 4 | `.audit/pass1-components-misc.md` — Finding 3 | 🔵 Low | `useEdgeFade`'s `document.fonts.ready.then(schedule)` isn't cancelled on unmount; a fast page change before fonts load can call `setAttribute` on a detached node. No-op leak, not user-visible. |
| 5 | `.audit/pass1-config-architecture.md` — Finding 1 | 🔴 Bug (latent) | `Object.freeze()` is shallow: `DEFAULT_DUEL_SETTINGS` is frozen at the top level but `DEFAULT_DUEL_SETTINGS.tuning` is a fresh unfrozen object underneath it, contradicting the file's own comment and CLAUDE.md's claim that mutating it "throws rather than passing." Every unpublished visitor's session currently shares this exact object instance (`persistence.ts`'s no-published-config branch spreads shallowly). Nothing mutates it in place today, so it's latent — but the safety net the comment claims exists doesn't, for the one field (`tuning`) most likely to be touched by future editor code. |
| 6 | `.audit/pass1-config-architecture.md` — Finding 2 | 🔵 Informational | The 2026-09-03 byte-vs-UTF16 `MAX_CONFIG_BYTES` fix (`worker/site-config.ts`) is correct, but `scripts/check.ts` has zero occurrences of `TextEncoder`/`byteLength` — its gate only checks the constant's value and that nothing truncates, not that the comparison is actually byte-based. A regression back to `.length` (UTF-16 code units) would pass every existing gate. Exactly the "gate tests shape not behaviour" pattern CLAUDE.md warns about elsewhere. |
| 7 | `.audit/pass1-config-architecture.md` — Finding 3 | 🔵 Informational | `LOOK_KEYS` in `src/data/lookSettings.ts` has zero importers; `scripts/check.ts` independently hardcodes the identical 11-name list as a regex. The two agree today by luck, not by construction — adding a 12th `PageLook` dial would silently leave the hardcoded regex stale. |
| 8 | `.audit/pass1-config-architecture.md` — Finding 4 | 🔵 Informational | `src/data/pageIds.ts`'s header comment enumerates 16 pages and omits `downloads`; the actual union has 17 (CLAUDE.md's own "Implementation traps" section already has the right number). Cosmetic — `PATHS`/`pageFromPath` are correct — but a header comment a future reader would trust uncritically. |
| 9 | `.audit/pass1-config-architecture.md` — Finding 5 | 🔵 Informational, low confidence | `src/data/pages.ts`'s header claims "thirteen pages that render blocks"; actual count of non-empty `blocks` arrays is 11. Likely stale from before `downloads`/`share` existed. |
| 10 | `.audit/pass1-duel.md` — Finding 1 | 🔴 Medium | `scripts/duel-bench.template.html:647` floors the frame delta at `0.2`, not `0` — the exact regression class CLAUDE.md documents fixing everywhere else ("the floor was 0.2 and undocumented... a 500Hz panel ran 1.67× fast"). The other three duel hosts (`DuelOrnament.tsx`, `DuelBench.tsx`, `DuelSettingsEditor.tsx`) all floor at 0 and are gated by `check.ts`'s `hosts` array; `duel-bench.template.html` is not in that array (`grep duel-bench scripts/check.ts`: zero hits) and has no gate at all. This is the one tool built specifically so the client can judge duel *tempo* on a real display — on any display faster than 300Hz it runs the fight up to 1.67× too fast, corrupting the one judgment it exists to support. |
| 11 | `.audit/pass1-duel.md` — Finding 2 | 🔵 Low | `DuelBench.tsx` and `duel-bench.template.html`'s size-preset labels ("phone" = 200px, "desk" = 320/360px) are stale against the real 2026-08-28 slot widths (281px phone, 292–340px tablet/desk per `chrome.css`), which `duel-shot.mjs` was already corrected to use. Labelling/convenience issue for a human reviewer, not a simulation error — the canvas buffer itself is still the correct 700×700. |

Everything else named in each file's "Verified correct" / "Areas covered" sections was independently
re-derived from current code and confirmed to match the documented invariant — not itemized here to
keep this table to real findings; see the individual pass-1 files for the full list of what was
checked and cleared (it is extensive: admin `proven()` gating, IPv6 /64 bucketing, the monotonic
WebAuthn replay guard, `validDuelPages`'s refuse-never-repair discipline, guardrail resolution
wiring, share-code round-tripping, and roughly 40 other confirmed-clean mechanisms across the four
files).

---

## Pass 2 — the areas Pass 1 explicitly left out (done, 2026-09-14)

Four parallel agents, same method as Pass 1 (read the full file, re-derive the invariant from the
code, don't trust the comment — several claims verified by actually executing the code: the
PowerShell escaper/canonicaliser under `pwsh`, `setup-bundle.sh` twice against a real directory, a
25-emoji label through bash's substring operator). No overlap with Pass 1's findings.

| # | File | Severity | One-line summary |
|---|---|---|---|
| 12 | `.audit/pass2-sharing.md` — Finding 1 | 🔴 **Medium–High** | `MachinesPage.tsx`'s "accept the new key" button (lines 740/749) calls `shareStore.savePin` **before** `connect()`/`dial()` ever cryptographically verifies the offered agent key, reversing the documented "pin after verification, never before" rule that `DriveConnection.open`'s own internal path correctly follows. `shareStore.deletePin` exists but is never called anywhere — no rollback if the subsequent connection fails or was never legitimate. This is the one finding across both passes that most directly undermines a stated security invariant. |
| 13 | `.audit/pass2-downloads.md` — Finding 1 | 🔴 Medium–High | A download code scoped to (or minted for) a file whose bytes never finished uploading (`uploaded_at IS NULL`) redeems successfully and burns one of the code's limited uses — neither `mintCode` nor `opened()` checks `uploaded_at`, only whether the file row exists and its page isn't `granted`. The customer's page then shows nothing (both `readPage`'s filter and `canDownload` correctly hide the unfinished file), with no error anywhere in the chain telling them why. Same bug class the code already fixed for "withdrawn/deleted" files, just not for "never finished." |
| 14 | `.audit/pass2-downloads.md` — Finding 2 | 🔴 Medium | `addGrant` (`worker/downloadPages.ts:1158`) and `mintCode` (`worker/downloads.ts:682`) read a caller-supplied file id via raw `str(b.item, 64)`/`body.item` instead of the mandatory `fileId()` lowercasing normaliser every other id-taking route uses — `fileId()`'s own doc comment names this exact failure mode ("a route that reads `str(b.id, 64)` directly is this bug again"). Currently latent because the shipped UI only ever sends server-sourced lowercase ids. |
| 15 | `.audit/pass2-downloads.md` — Finding 3 | 🔴 Medium | `sortFiles`'s `"price"` sort can't distinguish a genuinely free file from a merely-unpriced one — both render as `price: 0` and `SortableFile` carries no `free` field — so sorting cheapest-first buries free tools at the very bottom instead of leading with them. The check suite's own gate never constructs a `free: true` row, so it can't see the collision it's supposed to guard against. |
| 16 | `.audit/pass2-worker-css.md` — Finding 1 | 🔴 Medium | `.v-knock`'s own button label ("◈ operator access") and `.v-saver-label` ("click to return," the screensaver's only exit instruction, further dimmed by `opacity: 0.6`) both still render in `--faint`, failing WCAG 1.4.3 on all 25 palettes — the exact bug class a 2026-08-17 pass fixed everywhere else (`.v-door-row`, `.v-door-routes`, `.v-panel-label`, `.v-dlcodes-state`). Both are "operator-only is not a WCAG exemption" cases per CLAUDE.md's own stated rule; a sibling element in each case (`.v-knock-state`) was correctly fixed while the parent's own label text was missed. |
| 17 | `.audit/pass1/pass2 duel bench, cross-referenced` — 🔴 Medium | — | *(carried forward, not new)* Pass 1 Finding 10 (`duel-bench.template.html`'s 0.2 frame-delta floor) is now independently corroborated: Pass 2's FX audit confirms `FxCanvas.tsx` itself floors correctly at 0 and is "the fourth host in that same class of bug… clean here too" — meaning `duel-bench.template.html` is now the *only* frame-timing host left in the whole codebase with the 0.2 regression. |
| 18 | `.audit/pass2-sharing.md` — Finding 2 | 🟡 Low–Medium | `machines.ts`'s `remove()` only *asks* the machine's signalling Durable Object to hang up live sessions via a best-effort `fetch` wrapped in a silently-swallowing `try/catch`; if that call fails (DO overload, transient edge issue), already-open agent/browser sockets and any established P2P transfer keep running indefinitely with no retry, no detection, and a `{status: "removed"}` response that claims success unconditionally. Narrow blast radius today (no grantee model yet). |
| 19 | `.audit/pass2-worker-css.md` — Finding 2 | 🟡 Low–Medium | `worker/setups.ts`'s `save()` claims its `ON CONFLICT` clause closes the check-then-insert race for case-variant names, but the DB's unique index is binary-collated while the app's own duplicate check is `COLLATE NOCASE` — two concurrent saves of e.g. `"Home"` and `"home"` both pass the check and both insert, producing two permanent rows for what the app treats as one setup. **The identical shape exists in `worker/machines.ts`'s `rename`, per its own migration comment — not yet independently audited.** |
| 20 | `.audit/pass2-downloads.md` — Finding 4 | 🟡 Low–Medium | `FileManager.saveWithProof()` (the retry path after the Worker demands a password for a widening save) recomputes a file's price with `toCents(form.price) ?? 0` — silently coercing an invalid price to "free" instead of refusing, unlike the primary `submit()` path which hard-refuses the same bad input. Likely unreachable today (the proof dialog sits over an unedited form) but a real divergence between two paths meant to perform the same validated save. |
| 21 | `.audit/pass2-sharing.md` — Finding 3 | 🔵 Low | `worker/machines.ts`'s `expectName()` (machine names, drive labels typed directly rather than via a setup code) applies only trim+length checks — none of `src/share/setupCode.ts`'s Unicode control/deceptive-character or visual-confusable filtering, which that file treats as load-bearing for the identical class of human-facing label. Self-inflicted only until phase-3 grants expose these labels to someone other than their author. |
| 22 | `.audit/pass2-downloads.md` — Finding 5 | 🔵 Low | `savePage` defaults a malformed/missing `visibility` to `"public"` (the widest option), where `canRead`'s read-side default explicitly refuses an unrecognised value on the stated principle "a hidden page becoming public is much worse than the reverse." Not reachable via the shipped `<select>`; the `widens` password gate catches most real-world instances of this anyway (public is nearly always "wider"). |
| 23 | `.audit/pass2-fx-setup.md` — Finding 2 | 🔵 Low | `macos-share-setup.sh`/`linux-share-setup.sh` truncate a folder-derived label at 40 Unicode *codepoints* (`${label:0:40}`), but the label's own adjacent comment says the decoder measures 40 UTF-16 *units* — a label with >20 non-BMP characters (many emoji, some CJK Extension ideographs) passes the script's own check untouched while exceeding the real limit, so the site refuses a code the script reported as successfully built, with no diagnostic. Verified by executing the substring operator on a 25-emoji label (25 codepoints, 50 UTF-16 units). The Windows script doesn't have this gap (`.NET`'s `string.Length` already counts UTF-16 units). |
| 24 | `.audit/pass2-worker-css.md` — observation | 🔵 Informational | The report-only CSP header (with a freshly-minted nonce) is attached to every non-API response including static assets (JS/font/image requests), contradicting `cspPolicy`'s own doc comment that the CSP belongs "only where there is a document for it to govern." Harmless today (browsers don't action a CSP header on a non-navigation resource fetch) but a live contradiction of the stated design, costing a nonce mint per asset request for no purpose. |
| 25 | `.audit/pass2-fx-setup.md` — Finding 1 | 🔵 Informational | `perf.ts`'s own comment (and CLAUDE.md, verbatim) claims the capability probe "can only ever start things two tiers down"; the actual thresholds allow landing on `TIERS[3]`, three tiers down. No incorrect behaviour results — the continuous sampler still recovers, just with a slightly more pessimistic worst case than the design narrative states. |
| 26 | `.audit/pass2-downloads.md` — Finding 6 | 🔵 Cosmetic | Two comments (`worker/downloads.ts:820`, `src/auth/api.ts:483`) still say a download-code reference is "the first eight hex characters," left over from the `REF_LENGTH` 8→16 collision fix. No code reads these comments. |

Everything else named in each pass-2 file's "Verified correct" section was independently re-derived
from current code (in several cases by executing it — the SDP-fingerprint regex against RFC 8122 §5
attack shapes, the rate limiter's Durable Object backoff math at its boundaries, all eleven CSS
gotchas against the current selectors, the range-request truth table by hand-tracing five cases,
the PowerShell escaper/canonicaliser under `pwsh`) and found to match CLAUDE.md's claims. Not
itemized here; see the individual `.audit/pass2-*.md` files.

## Pass 3 — gate-coverage and cross-cutting follow-ups (done, 2026-09-14)

Full detail in `.audit/pass3-followups.md`. Resolved the two items Pass 2 explicitly left open,
swept for siblings of a confirmed bug class, and confirmed gate coverage by direct grep rather than
trusting each originating pass's own "no gate" claim.

| # | File | Severity | One-line summary |
|---|---|---|---|
| 27 | `.audit/pass3-followups.md` §1 | 🔴 Low–Medium | `worker/machines.ts` has the identical case-collision race Finding 19 (`pass2-worker-css.md` #2) found in `worker/setups.ts` — `idx_machines_owner_name` is also a bare binary-collated unique index behind a `COLLATE NOCASE` runtime check, in both `pair()` and `rename()`. `rename()` is additionally worse than `pair()` in the same file: `pair()`'s `INSERT` is wrapped in a `try/catch` that converts a `UNIQUE` violation into a friendly 409, but `rename()`'s `UPDATE` has no such guard, so even an exact-string collision race surfaces as an unhandled exception rather than the same 409 its sibling function three lines above produces for identical input. |
| — | `.audit/pass3-followups.md` §2 | (upgrades #23) | Pass 2 Finding 23 (fx-setup, the macOS/Linux label-truncation unit mismatch) was flagged there as resting on the scripts' own comment, decoder unread. Confirmed directly against `src/share/setupCode.ts`: `MAX_LABEL = 40`, enforced via `str()`'s `value.length > max` — genuinely UTF-16 code units. The finding stands as confirmed, not assumed. |
| — | `.audit/pass3-followups.md` §3 | ✅ swept, clean | Every `COLLATE NOCASE` use in `worker/` (6, across `setups.ts`/`machines.ts` only) cross-checked against every `CREATE UNIQUE INDEX` in `migrations/` (6 total). Exactly two instances of the bug class exist (`setups`, `machines`), both now identified; the other four unique indexes are either built on a precomputed lowercase column (`idx_accounts_handle_lower`) or key opaque ids where case is not a question. No undiscovered third instance. |
| — | `.audit/pass3-followups.md` §4 | ✅ confirmed | Direct grep (not trusting the originating pass's own claim) confirms zero gate coverage in `scripts/check.ts` for the five most severe findings so far: sharing pin-before-verify (#12), downloads unfinished-upload redemption (#13), `sortFiles` free-vs-unpriced (#15), the duel-bench 0.2 floor (#10/#17), and the shallow-frozen `tuning` object (#5). |
| — | `.audit/pass3-followups.md` §5 | informational | Re-ran `npm run check`: still 80/80. Noted for the record (not a `vessel-main` bug): a first run mid-session found `../debian` checked out and ran its two cross-repo gates for real; a second run minutes later found it absent and correctly reported "NOT RUN" rather than passing silently — exactly the documented fallback behaviour, caused by the sibling repo being under active, independent development by a peer session. |

New running total: **22 real findings** (27 numbered entries minus the duplicate cross-reference at
#17 and the three non-finding sweep/confirmation rows above), spanning 🔴 8 Medium-or-higher, 🟡 3
Low–Medium, 🔵 11 Low/informational/cosmetic. None are critical/confidentiality-breaking on their
own; the two Medium-High findings (#12 sharing pin-before-verify, #13 downloads unfinished-upload)
are the ones worth prioritizing first if any fixing happens.

## Pass 4 — direct re-verification of the top findings (done, 2026-09-14)

Rather than re-deriving everything a third time, this pass spot-checked the two Medium-High
findings directly against the live source (not the pass files' quoted excerpts, which could in
principle have gone stale), and checked one natural adjacent question each finding raises:

- **#12 (sharing pin-before-verify)**: re-read `src/components/MachinesPage.tsx` lines 700-755
  directly. Confirmed unchanged: `await shareStore.savePin(asked.machine.id, asked.offered);` on
  the line immediately before `await connect(asked.machine, asked.drive, asked.key);`, inside the
  "accept the new key" button's handler. Still live, still exactly as described.
- **#13 (downloads unfinished-upload code redemption)**: re-read `worker/downloads.ts`'s `opened()`
  (lines 148-221) directly and grepped the whole file for `uploaded_at` — zero matches anywhere in
  `downloads.ts`. Confirmed the redemption path genuinely never reads the column. Checked the
  natural adjacent question — does `addGrant` (a *permanent* access row, not a limited-use code)
  have the same gap? No: grants don't have a `uses` counter to burn, so there is no equivalent
  "wasted resource" failure mode for grants the way there is for codes; `canDownload`'s own
  `uploaded_at` check (`worker/downloadPages.ts:395`) still correctly hides the file from an actual
  page view regardless of how the caller got there. The bug is specific to the code-redemption
  accounting, not a wider pattern.

Both top findings hold, unchanged, against current source.

## Pass 5 — final synthesis (done, 2026-09-14)

Five passes, nine files, roughly the whole codebase (accounts/auth, config/state architecture, the
duel engine, downloads/catalogue, phase-2 sharing, worker infra/CSP/CSS, the sixteen non-duel FX
effects, the setup scripts, the desktop-host split). **22 real findings**, zero of them critical or
independently exploitable for account takeover/data exfiltration across accounts — this codebase's
prior security passes (37-49, per the project's own memory) already closed the sharp edges. What
this audit found is the next layer down: places where a stated invariant is contradicted by the
actual code, in ways ranging from "a customer gets quietly shortchanged" to "a comment is stale."

### Tier 1 — worth fixing regardless of what else happens (customer-facing or security-adjacent)

1. **#12 — `MachinesPage.tsx` pins an unverified agent key before the connection proves it.**
   The one finding across both passes that most directly undermines a stated security invariant
   ("pin after verification, never before"). Fix shape is small: move the `savePin` call to fire
   only after `connect()`/`dial()` resolves successfully, matching `DriveConnection.open`'s own
   internal ordering — the correct pattern already exists two files away.
2. **#13 — a download code minted for an unfinished upload redeems and burns a use, silently.**
   Directly costs a paying customer one of their limited redemptions with no error anywhere in the
   chain. Fix shape: `opened()`'s file-scope branch and `mintCode`'s existence check both need one
   more column in the query (`uploaded_at`) and the same "quiet"/refuse treatment already given to
   a withdrawn or deleted file.
3. **#16 — `.v-knock` and `.v-saver-label` fail WCAG contrast on all 25 palettes.** Both are the
   *only* label for what they do (operator-access button, screensaver-exit instruction) — this is
   the same bug class a 2026-08-17 pass fixed everywhere else, just two spots it missed. One-line
   CSS fix each (`--faint` → `--muted`), and worth a gate (grep every `color: var(--faint)` against
   an explicit allow-list) so a third instance can't recur unnoticed the way these two did.
4. **#17/#10 — `duel-bench.template.html` runs the fight ~1.67× fast on displays over 300Hz.** This
   is the one tool built specifically to let the client judge duel *tempo* — the thing a still image
   can't answer — and it is currently the only frame-timing host left in the codebase with the 0.2
   floor bug every other host already had fixed. One-character fix (`0.2` → `0`), plus adding the
   file to `check.ts`'s existing `hosts` gate array (which already covers the other four).

### Tier 2 — real bugs, narrower blast radius or already load-bearing mitigations elsewhere

5. **#14 — `addGrant`/`mintCode` skip the mandatory `fileId()` normaliser.** Latent today (the
   shipped UI never sends a mixed-case id), but a direct match for a failure mode this codebase's
   own comments name and warn against.
6. **#15 — `sortFiles` can't tell free from merely-unpriced, buries free tools at the bottom of a
   price-ascending sort.** Customer-visible on any page with prices + sorting both on.
7. **#27 — `worker/machines.ts` has the identical case-collision race as `#19`/`setups.ts`, plus a
   worse unhandled-exception gap in `rename()` specifically** (no `try/catch` where its sibling
   `pair()` has one three lines above). Data-integrity only, bounded by `MACHINES_MAX`.
8. **#18 — machine removal's "sockets close immediately" claim rests on a single best-effort fetch**
   with no retry/detection on failure. Narrow blast radius today (no grantee model yet).
9. **#19 — `worker/setups.ts`'s `ON CONFLICT` doesn't cover the race its own comment claims it
   covers**, for the same reason as #27.
10. **#20 — `saveWithProof` silently coerces an invalid price to $0** instead of refusing, unlike
    its sibling `submit()`. Likely unreachable today given the modal dialog.
11. **#5 — `DEFAULT_DUEL_SETTINGS.tuning` is not actually frozen** (shallow `Object.freeze`).
    Latent — nothing mutates it in place today — but the safety net the comment claims exists
    doesn't, for the one field most likely to be touched by future editor code.
12. **#2/#3 — the operator panel/door's `aria-modal="true"` contradicts their genuinely-non-modal
    keyboard routing**, and arrow-key paging can fire while the door is open. Real WCAG violation
    plus a real (if low-consequence) state bug; both stem from the same design tension (panel/door
    deliberately not modal) and might be worth resolving together rather than patching each symptom.

### Tier 3 — low severity, latent, or narrow (self-inflicted-only today)

13. **#1** — signup's taken-handle path double-counts against its own rate-limit bucket (self-DoS
    only, makes the limiter *stricter* not looser).
14. **#21** — `machines.ts`'s `expectName` skips the Unicode deception filtering `setupCode.ts`
    treats as load-bearing for the same data shape (no cross-account exposure exists yet to exploit
    it).
15. **#22** — `savePage` defaults malformed `visibility` to the widest option, inconsistent with the
    read-side's explicit "refuse rather than guess" (not reachable via the shipped UI).
16. **#23** — macOS/Linux setup-script label truncation counts codepoints where the decoder counts
    UTF-16 units (confirmed exploitable with >20 non-BMP characters in a folder name; narrow
    trigger).
17. **#4** — `useEdgeFade`'s uncancelled `fonts.ready` promise (no-op leak, not user-visible).

### Tier 4 — informational / cosmetic / documentation drift only

18. **#6** — `MAX_CONFIG_BYTES`'s byte-vs-UTF16 fix has no regression gate (app code itself correct).
19. **#7** — `LOOK_KEYS` is dead code duplicating a hardcoded gate list.
20. **#8, #9** — stale page-count/block-count comments in `pageIds.ts`/`pages.ts` headers.
21. **#24** — the report-only CSP header fires on static-asset requests too (no observable effect).
22. **#25** — `perf.ts`'s "two tiers down" claim is actually three tiers in the worst case (no
    incorrect behaviour results).
23. **#26** — two stale "eight hex characters" comments after the `REF_LENGTH` 8→16 fix.

### What this audit is not

Per its own opening rule, **no fixes were applied anywhere** — every finding above is a
description and a suggested check, not a patch. It also does not cover what `npm run check`'s own
"still needs a person" list already names as out of its reach (whether the duel *reads* well,
whether any layout is beautiful, whether a QR scans on a real phone, the operator surfaces that
need a signed-in session, whether two category icons are visually confusable, whether the desktop
host is actually serving files) — those need a human or a browser session, not a source read.

**Next step is a decision, not more auditing**: whether any of Tier 1-2 gets fixed now, batched
into one pass, or left as a documented, deliberate backlog the way this codebase already keeps one
in `TODO.md`. That decision is the client's/operator's to make, consistent with this project's
`conflicts-are-my-call`-style memory note reserving money/business/taste calls for him — a fix
decision for customer-facing bugs like #12/#13 plausibly falls there rather than being mine to
just apply.

**Update, 2026-09-14, later the same day**: this whole file (Pass 1–5, `.audit/pass1-*.md` through
`pass3-followups.md`) was committed to `vessel-main` at Patrick's explicit request by the peer
session working the desktop-host split (`72ea204`), and the findings were triaged into `TODO.md` as
the project's single backlog rather than left in a second next-steps document. **#12 has since been
fixed and gated** (commit `2315676`) — the peer session's own security review caught that its first
attempted fix (bare `deletePin`) left a worse gap (an unpinned state after a failed connect, which
the *next* successful connect would then silently trust), so the shipped fix threads an
`acceptNewKey` flag through `DriveConnection.open` instead, and the check.ts gate for it is
discussed again below (Pass 6, Finding 6 of the meta-audit). #13 remains open, unclaimed, in
`TODO.md`.

---

## Pass 6 — a second scan, entirely new territory (done, 2026-09-14)

Requested explicitly as a fresh bug-hunting pass rather than a continuation of Passes 1–5 ("do
another scan, of something different this time... I'll have opus or fable do the fixes" —
findings-only, as before). Four parallel agents, each given a slice of the codebase none of Passes
1–5 had touched: the host-provisioning scripts (as opposed to the customer-facing setup scripts
Pass 2 already covered), a meta-audit of `scripts/check.ts` itself (does the checker's own logic
hold up, as opposed to auditing what it checks), the remaining untouched components and data files,
and the project's own dev/test tooling (`auth-e2e.ts`, `webauthn-sim.ts`, the bench/shot scripts).
**23 new findings.**

### 6A — Host provisioning scripts (`.audit/pass6-host-scripts.md`)

`thinkcentre-setup.sh`, `pi-setup.sh`, `plasma-dark-setup.sh` plus four smaller scripts — the ones
that turn a fresh machine into the always-on sharing host, distinct from the setup scripts a
*customer* runs (Pass 2). An unusually well-defended set of scripts; every "obvious" bug class
(word-splitting, ufw/sshd ordering, docker-group shortcuts, kiosk-unit hardening, `--no-sandbox`)
was checked and found genuinely, carefully handled. The two real findings are novel structural gaps:

| # | Severity | One-line summary |
|---|---|---|
| 28 | 🔴 **Medium–High** | `thinkcentre-setup.sh`'s `canon_store()` only resolves symlinks via `cd -P`/`pwd -P` when the **full target path already exists** (`[ -d "${out}" ]`) — so `--store <symlinked-ancestor>/newdir`, where the leaf doesn't exist yet (the normal first-run case), bypasses the `/etc`/`/usr`/etc. blocklist entirely as a plain string comparison, and `prepare_store()`'s subsequent `mkdir -p`/`chown`/`chmod` all follow the symlink for real — landing a desktop-user-owned, mode-0750 directory inside (e.g.) `/etc`. The identical attack against an *already-existing* leaf **is** caught correctly; the gap is specific to the not-yet-created case, which is also the overwhelmingly common one. Same failure class CLAUDE.md documents fixing three times in the customer-facing setup scripts, reappearing in a fourth, previously-unaudited script. |
| 29 | 🔴 Medium | `pi-setup.sh`'s documented fallback to Debian's plain `chromium` package (when Raspberry Pi OS's `chromium-browser` is unavailable) silently defeats the "Chromium never auto-upgrades under the kiosk" invariant — `configure_unattended_upgrades()`'s premise for leaving Chromium unblocked only holds for the Pi-specific package, and nothing tracks which package a run actually installed or blacklists the Debian-origin fallback the way `thinkcentre-setup.sh` does. This is the concrete mechanism behind an already-flagged-as-unverified open question in `docs/HOST-BUILD-LOG.md` item 4. |
| 30 | 🔵 Medium | `plasma-dark-setup.sh`'s `set_key()` silently no-ops **all** theming (colour scheme, accent, icons, fonts, window buttons — ~2 dozen call sites) when `kwriteconfig6`/`5` are absent, contradicting its own warning message, which promises a "writing config files directly" fallback that doesn't exist. The script completes and reports success with a completely unthemed, default-Breeze desktop underneath. |
| 31 | 🔵 Medium | `imagemagick`/`rsvg-convert` — the two tools the wallpaper subsystem's own extensively-commented "THE TRAP" section says are required to avoid a previously-shipped rendering bug — are never installed by any script in the repo except inside a `LOOK=deepin`-only branch, so the per-look wallpaper feature (11 of 17 looks, plus the universal fallback used by every look including the default) silently does nothing on a fresh netinst. |
| 32 | 🔵 Low | `DEEPINISH`'s optional-package gate checks `[ "${LOOK}" = "deepin" ]` exactly, excluding `deepin-exact` even though it needs the identical icon theme and drawing tool — the icon list silently falls through to a less-faithful theme with no warning that the intended package was never requested. |
| 33 | 🔵 Low | `--accent`'s validation regex (`^[0-9]{1,3},[0-9]{1,3},[0-9]{1,3}$`) checks digit *count*, not value *range* — `999,999,999` passes despite the error message's own "0-255 each" claim. |
| 34 | 🔵 Low | The "only set a font key if `fc-list` confirms it's installed" pattern is applied to the Ubuntu display font but not to the JetBrains Mono monospace font one line above the comment explaining why it should be — if `fonts-jetbrains-mono` fails to install, the desktop is left naming an absent font in `kdeglobals`. |
| 35 | 🔵 Low | `thinkcentre-setup.sh`'s `sshd_ports()` final fallback (reached only when both `sshd -T` and the `ssh.socket` probe fail) parses only `/etc/ssh/sshd_config`, never `sshd_config.d/*.conf` drop-ins — contradicting the file's own "ask the daemon, never parse the file" principle. Current outcome is fail-closed (an empty result correctly `die`s rather than defaulting to port 22), but a stale `Port` line in the main file alongside a real one in a drop-in could report a wrong-but-non-empty port. |

### 6B — Meta-audit of `scripts/check.ts` (`.audit/pass6-check-meta-audit.md`)

Not an audit of the application — an audit of the 274KB gate suite itself, applying CLAUDE.md's own
standard ("a gate that reads the source is testing shape, not behaviour") to the checker rather than
to what it checks. Every one of the 77 registered checks was read in full. The great majority —
essentially the entire 22-check duel section, the guardrail/station resolvers, the per-page
look-override gate, the QR section, and the two execution-driven filesystem/PowerShell gates — are
genuinely behaviour-driven and several explicitly carry the scar tissue of having been rewritten
from a predicate-only shape after a real incident. No inverted conditions, off-by-ones,
self-comparisons, or always-false-gated checks were found anywhere. Three of the six findings below
were an explicit adversarial re-read requested by the check's own author (the peer session) of the
three newest gates in the file:

| # | Severity | One-line summary |
|---|---|---|
| 36 | 🟡 Medium | The "Could NOT be run on this machine" (`SKIPPED`) summary banner is nested inside the `if (failed.length === 0)` branch of the final report — the moment *any* check fails, for any unrelated reason, the one piece of information the file's own philosophy insists must never silently disappear does exactly that. Per-line `NOT RUN` text is unaffected; only the end-of-run summary reminder is lost, and only on runs that are already red. |
| 37 | 🟡 Medium (latent) | `checkAsync` has no synchronous-exception safety, unlike `check`. Safe today because its one call site is a proper `async` function (JS auto-converts a pre-`await` throw into a rejected promise), but the type signature doesn't require `async`, and a future gate written as `checkAsync("x", () => syncSetup().then(...))` where `syncSetup()` can throw would crash the entire Node process mid-suite, silently dropping every check registered after it — no `FAIL` line, no summary, nothing. |
| 38 | 🔵 Low | `every page is reachable off the desk`'s two `CommandPalette` assertions are regex-on-source (`/for \(const entry of \[\.\.\.NAV, \.\.\.FOOTER_NAV\]\)/`, `/:\s*commands;/`) despite the check's name and messages describing a behavioural guarantee ("reachable", "browsed by touch") — the exact shape the guardrail/station gates were rewritten away from after a real incident, not fixed here. Regexes are narrow enough that a plausible rewrite would fail loudly rather than pass silently, so practical risk is low today. |
| 39 | 🟡 **Medium** *(adversarial re-read, confirmed)* | `the two LOOK_FILES copies agree` records a plain `ok` — same status column as every genuine pass — when the sibling desktop repo is absent, having compared **zero bytes** of either file. `SKIPPED.push(...)` is the intended second-mention safety net, but that's Finding 36's exact nested-banner bug, and even when it does print, the check's own line already reads as an ordinary pass to anything that only looks at the `ok`/`FAIL` column (a human skimming for `FAIL`, a CI dashboard counting "ok" lines). On the default state of a fresh clone (no sibling checked out), this check would report green forever regardless of whether the two `LOOK_FILES` copies have actually drifted. |
| 40 | 🔵 Low *(adversarial re-read, confirmed)* | `the desktop looks are one closed set` has the identical absent-sibling fallback shape, but is meaningfully more honest: three of its four sub-checks (validator/error-message/accent-table agreement) run unconditionally and for real even without the sibling; only the fourth (preview-screenshot parity) goes dark, and the returned text says so in the same sentence as the real result. The `ok`-vs-partial distinction is still invisible at the status-column level, same underlying gap as #39, just smaller in what it actually leaves unverified. |
| 41 | 🟡 Low–Medium *(adversarial re-read, confirmed)* | The agent-key pin-writer allow-list gate (protecting Finding #12, now fixed) is a raw substring scan for the literal spelling `shareStore.savePin(` across `src/`. It would not catch a destructured/aliased binding (`const { savePin } = shareStore`), a re-exported wrapper using dynamic property access, or the function passed by reference to a third file (`onAccept={shareStore.savePin}` — structurally the same shape of indirection as the bug it exists to catch a recurrence of). No live bug today (both current call sites match the expected shape); the identical substring-scan-as-allow-list technique also appears at check.ts's per-page-look-override gate (line ~4338) for a different invariant, so this is a systemic technique in the file, not a one-off shortcut. The check's own author judged this an acceptable, proportionate trade-off given what a text-reading script can do without the TypeScript compiler API; this pass's independent judgement agrees it's reasonable but not complete, and worth naming precisely because it protects a security property that has already regressed once. |

### 6C — Remaining components and data files (`.audit/pass6-components-data.md`)

`Admin.tsx`, `SiteConfigPanel.tsx` (full logic this time — Pass 1 only touched one CSS/ARIA line on
it), `QrCode.tsx`, `Hero.tsx`, `palettes.ts`, `snippets.ts`, `mail.ts`, plus a structural pass over
`pages.ts`/`pageIds.ts`/`migrations/0003`. Notably: the hand-rolled QR encoder needed no
hand-re-derivation at all — `scripts/check.ts`'s existing QR section already re-derives it from the
ISO spec four independent ways and would have caught the kind of fault the file's own history
comments describe. An independent WCAG contrast recomputation across all 25 palettes reproduced
CLAUDE.md's cited figures within rounding tolerance — no palette has drifted out of step with the
document.

| # | Severity | One-line summary |
|---|---|---|
| 42 | 🔴 Medium | `SiteConfigPanel`'s "Published" success toast is invalidated by mere **navigation**, not just an appearance edit — the `useEffect` resetting `publishState` depends on the whole `Config` object, which also carries `page`/`sub`. The panel is a 420px drawer, not a scrim (the rest of the page, including nav, stays clickable) — so an operator who publishes, then clicks a nav link to check how it reads on another page (an entirely natural next action), sees the message flip back to "Unpublished changes are lost when you reload" for a publish that fully succeeded and is still live. The functional twin of Pass 1's #2 (the same drawer's `aria-modal="true"` already flagged as false for the identical reason). |
| 43 | 🔵 Low | Look-dial toast feedback is inconsistent across six per-page dials: Palette/Layout/Background announce "on `<page>` only" in page-scope mode; Ornament/Station give a toast but never the scope qualifier; Typography gives no toast at all, in either scope. An operator relying on the panel's own stated mechanism for telling site-wide from page-scoped edits apart gets it for half the dials. |
| 44 | 🔵 Low | `Admin.tsx`'s "reset password" button disables purely on `recoveryCodesRemaining === 0`, ignoring that the server's actual guard also accepts a `prf`-capable passkey (with a key slot) as a valid "other way in" — a server-legitimate reset can be client-unreachable. Low-impact: the same account could just self-service `changePassword` via the working passkey instead. |
| 45 | 🔵 Cosmetic | `pageIds.ts`'s header comment says "sixteen pages" and omits `downloads`; real union has 17 (matches CLAUDE.md elsewhere) — same drift pattern as Pass 1's #8, on the same file, not yet corrected. |
| 46 | 🔵 Cosmetic | `palettes.ts`'s header comment says "The 24 palettes"; the real array has 25 (Cold Open was appended after the comment was written, and calls itself "the twenty-fifth" in its own nearby comment) — matches CLAUDE.md elsewhere. |

### 6D — Dev/test tooling (`.audit/pass6-dev-tooling.md`)

`auth-e2e.ts` (3,495 lines), `webauthn-sim.ts`, and the five bench/shot scripts Pass 1 either didn't
cover at all (`fx-bench`/`fx-shot`/`ornament-shot`) or covered only the *duel*-specific template
(not the `.mjs` generators themselves). Confirmed independently sound: the documented `auth-e2e.ts`
reachability-gate "known wart," the fetch-shim's cookie isolation between raw-`Client` and
`src/auth`-driven requests, genuine independence of both the TOTP and WebAuthn CBOR/DER "second
opinions" from the application code they check, and that none of the five dev-only benches leaks
into the production bundle.

| # | Severity | One-line summary |
|---|---|---|
| 47 | 🔴 Medium | `scripts/fx-bench.template.html`'s Play-loop floors the frame delta at `0.2`, not `0` — a **third** instance of the exact bug CLAUDE.md documents fixing everywhere else (after `duel-bench.template.html`, #10/#17), with a comment that falsely claims parity with `FxCanvas.tsx` (which correctly floors at 0). Zero `check.ts` gate coverage, same as its duel counterpart. On a >300Hz display, every one of the sixteen live-preview effects — including both duel-effects' pacing — runs up to 1.67× too fast for the one tool built to let a human judge their real tempo. |
| 48 | 🟡 Low–Medium | `auth-e2e.ts`'s own signup-rate-limit test states the exact expected block point in a comment ("attempt 14") but its assertion accepts anything from 2 through 14 — wide enough to pass whether the still-open #1 (handle-taken double-count) is live or not. Hand-simulating the arithmetic puts the real, current block point at ~7-8, roughly half the documented-correct value, and this test cannot tell the difference. |
| 49 | 🔵 Low | A "this runs last, nothing can follow" comment banner in `auth-e2e.ts` sits ~830 lines before the section it actually describes, directly above (and factually contradicted by) the large Downloads section that immediately follows it. No behavioural effect (the real section genuinely does run last); a real trap for a future editor trusting the comment's position to mean end-of-file. |
| 50 | 🔵 Low | `local-operator.ts`'s copy of the `d1()` shell helper is missing the double-quote guard its `auth-e2e.ts` counterpart has, via an unvalidated `OP_HANDLE` environment variable — a local-only, self-triggered shell-quoting hazard, not remotely exploitable. |

### Pass 6 running total

**23 new findings**: 5 at 🔴/🟡 Medium-or-higher (#28 host-scripts symlink bypass, #29 Pi chromium
auto-upgrade hole, #36/#39/#41 check.ts's own honesty-of-reporting gaps, #42 SiteConfigPanel's false
"unpublished" message, #47 the third 0.2-floor instance, #48 the too-loose rate-limit test), the
rest Low/informational/cosmetic. Combined with Passes 1–5's 22, **the audit's running total across
both scans is 45 real findings**, of which one (#12) is fixed and gated as of this update.

The most notable pattern from this second scan: three of Pass 6's findings (#36, #39, #41) are about
the checker's own honesty in reporting what it did and didn't verify — a different category from
everything Passes 1–5 found, and arguably the most structurally important, since a gate that reports
`ok` for work it never did is the mechanism by which every other kind of finding in this whole audit
stays hidden the longest.

### Triage, 2026-09-14 — six verified by hand, all 44 open findings routed

A third session read this index and **verified six findings directly against live source** rather
than trusting the pass files' excerpts, choosing the ones that drive the routing decision. All six
held, unchanged:

- **#10/#17 and #47** — `grep` across `scripts/`, `src/`, `worker/`: exactly two `Math.max(0.2` frame
  floors (`duel-bench.template.html:647`, `fx-bench.template.html:356`) against four hosts correctly
  at `Math.max(0` (`DuelOrnament`, `DuelBench`, `DuelSettingsEditor`, `FxCanvas`). Confirmed.
- **#28** — `canon_store()` read in full: the `cd -P`/`pwd -P` resolution is genuinely inside
  `if [ -d "${out}" ]`, so a not-yet-created leaf is compared lexically. Confirmed. **Severity argued
  down from Medium–High to Medium**: it requires a symlink whose ancestor already points into a
  blocked directory, on a machine being run with sudo by its own operator. The rule it breaks is
  real; the exploit path is not.
- **#29** — `configure_unattended_upgrades()` read in full: its stated premise is "Chromium comes
  from the Raspberry Pi archive, [which] is not in that list", which the `chromium` fallback at
  line ~305 makes false. Confirmed.
- **#36 and #39** — `if (SKIPPED.length > 0)` is nested inside `if (failed.length === 0)`, and the
  `LOOK_FILES` check's absent-sibling branch returns a `NOT RUN —` *detail* while `check()` still
  records `ok`. Both confirmed as described.
- **#42** — `useEffect(… , [config])` at `SiteConfigPanel.tsx:103`, and `config` carries `page`/`sub`
  (`ConfigContext`). Confirmed.

The routing itself lives in **`TODO.md`**, not here, so there is one backlog rather than two: nine
findings wanting judgment (led by the check.ts honesty group, then #13), a mechanical group safe for
a smaller model (led by the two frame floors), and nine left deliberately unrouted as too narrow to
carry a session. The stated rule for the split is that **the fix is rarely the work in this
codebase — the gate is**, so the line is drawn where `CLAUDE.md` already draws it: `worker/`,
`src/auth`, `src/share`, `migrations/` and the host scripts' security controls want the more capable
model regardless of how few characters the fix is.
