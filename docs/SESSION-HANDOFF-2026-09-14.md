# Session handoff — 2026-09-14, the find-and-fix audit

**Read this first if you are a new session picking this up.** It exists because a long
find-and-fix sweep was paused mid-flight and the work must not live only in one session's
scrollback.

**The companion document is `docs/AUDIT-2026-09-14.md`** — that is the *what and why* (every finding,
what was fixed, what was deliberately not). **This file is the *state*: what is finished, what is
half-finished, and what to do next.** Read that one for reasoning, this one for position.

---

## The single most important thing to know

**The five subagents that did most of this work are GONE.** In-process agents do not survive a
session reset. Their edits are on disk and committed; their context is not recoverable. Nothing
below can be "resumed" by messaging an agent — it has to be picked up from this file.

Where an agent's work is incomplete, the "next step" line is the whole inheritance. Treat those
lines as the spec.

## State at the pause

**All four gates were re-run by the coordinator AFTER every agent stopped, so these numbers are the
state of the committed tree, not an agent's claim about it:**

- `npm run typecheck` — **clean**, app and worker (exit 0).
- `npm run check` — **86 passed**, 0 failed, 0 skipped. Includes the new pin gate.
- `npm run build` — succeeds; entry chunk **343.56 kB raw / 113.43 kB gzip** (was 517.79 / 162.54).
- `npm run test:auth` — **409 checks passed**, with migration 0009 applied.
- Working tree: ~67 files, all committed. Nothing is stashed.

**One caveat on `npm run check`:** it passed on this run, but the fairness gate below fails roughly
2 runs in 5 *in-suite* for reasons nobody has explained. A single green run is not proof it is
stable. See item 1.

### Two gotchas that will waste your time if you do not know them

1. **`wrangler dev` serves `/` as 404 after a rebuild.** The asset manifest goes stale. Kill it,
   `npm run build`, start it again. This cost this session twice.
2. **The rate-limit tests 429 from accumulated state.** Driving the auth routes repeatedly fills
   the Durable Object buckets, and the signup allowance (12) is sized only just above one harness
   run. Symptom: `a fabricated code is refused — status 429`. Cure: stop wrangler,
   `rm -rf .wrangler/state/v3/do`, restart, re-run. This is **not** a regression, and this session
   briefly mistook it for one.
3. There is a **second, pre-existing flaky gate**: `duel: fairness, reachability, stability`
   (`check.ts` ~1486) fails on side bias at ~3σ on roughly 2 runs in 5. **It will fail
   `predeploy` at random.** It is not caused by any of this work — see "In flight" below.

## What is finished and verified

All of this is committed, and `docs/AUDIT-2026-09-14.md` carries the full reasoning for each.
The security-shaped ones were **break-verified** — the test was watched failing against the old
code before the new code was believed.

- **The lockout** — an anonymous stranger could block the operator out of every password-proven
  route (publish, all admin writes, the six release-gated downloads routes, TOTP, passkeys,
  pairing) at ~6 requests/hour, *while signed in, including with a passkey*. `signin` and
  `assertPassword` shared a bucket name; they no longer do. Break-verified both directions.
- **The rate limiter's refund** did not lift the block it was refunding, so a correct password
  right at the allowance locked the caller out for the rest of the window.
- **`opened()`** returned an entry that could never open, which satisfied `claim`'s emptiness
  guard — so a code redeemed, burned a use, and handed back a ticket that 403s. The same fix
  closed `AUDIT-FINDINGS.md` #13 (never-uploaded files). Two new e2e assertions cover it, and the
  existing fixture was made realistic — it had been asserting the bug.
- **A lone-surrogate filename** saved cleanly then 500'd on every click, for ever.
- **`REACH`** was indexed without an own-property guard, silently skipping the release password.
- **Trailing slashes** minted an unbounded family of self-canonicalising indexable pages.
- **Live download codes and grants** could become permanently unrevokable past 200 rows.
- **Three HIGH script bugs**: a Windows prefix blocklist entry left `~/.ssh`, `.aws`, `.gnupg`,
  `.docker`, `.kube` *themselves* shareable; a symlinked `$HOME` defeated every `$HOME`-derived
  entry on Linux and macOS; and the kiosk URL allowlist could be turned into `["*"]` via a
  multi-line host that produced **valid** JSON.
- **The flaky health-bar gate** — the *gate* was wrong, not the renderer. Misattribution by
  coordinate when both fighters clamp to the same arena wall. 2.5% of runs → 0/400. Fixed by
  draw-order attribution, explicitly **not** by exempting airborne fighters.
- Plus the browser half: the operator's hero ornament never changing for a whole session, the
  downloads index not resetting scroll, back/forward playing no transition and destroying the
  forward entry, share codes repairing instead of refusing, Shift+Arrow paging the site, focus
  return not gated on the top trap, the agent-key prompt having no accessible name, a live region
  wrapping a 2,000-row table, and the blob download racing its own revoke.

## In flight when paused — per agent

> Each agent was asked for a completion report before stopping. **Their reports are appended at the
> bottom of this file.** Read those before touching the corresponding files; they carry the
> "exact next step" lines.

1. **Duel / gates** — was on three things: (a) the **second flaky gate**
   (`duel: fairness, reachability, stability`), (b) the **pin half** of the background duel (a pin
   change still never reaches a running fight; needs a `pin` field on `DuelState` so
   `advanceDuel`'s match-boundary re-roll can honour it), (c) retiring the stale `TODO.md` entry
   that still calls the health-bar gate unchased. **This agent owns `scripts/check.ts`.**
   *On (a), the standing instruction was: do not fix it by raising the threshold until it stops
   failing. Establish whether the director is genuinely side-biased or whether the gate's
   statistic assumes an independence that ~120 correlated matches do not have. Those are
   different bugs.*
2. **Worker hardening round 2** — 14 items including migration `0009` (case-insensitive unique
   indexes for machines/setups), `deleteAccount` not hanging up signalling sockets, an uncapped
   browser-socket role, the `role=agent` comment that will be trusted when phase 3 widens the
   gate, a re-completable recovery ticket, a 6× iteration-floor mismatch, and `gate()` debiting
   earlier buckets for attempts a later bucket refuses. **Check migration 0009's state carefully —
   a half-applied migration is the worst thing in this handoff.**
3. **Bundle split** — ~29% of the 512KB bundle is code an anonymous visitor can never run.
   Introduced `src/components/Lazy.tsx`. **Verify the site actually works before trusting this**:
   a partially-applied code-split builds fine and throws at runtime. It was explicitly permitted
   to skip the duel half if it could not be done safely.
4. **Assets & hygiene** — photo re-encode (measured 64% available), wrangler bump to clear
   `npm audit`, and two comments that state things the code does not do. **Confirm the photo
   originals were preserved and that `docs/PHOTOS.md` matches what is on disk.**
5. **Setup-code lookalikes** — combining marks (`\p{Mn}`) and the 40-codepoints-vs-40-UTF-16-units
   truncation mismatch. *On the first: the instruction was to MEASURE in a browser before acting,
   because folding a mark that renders visibly would refuse honest codes — the outage this
   pipeline's carve-out reasoning exists to prevent.*

## The biggest thing NOT started

**The gates.** The fix crews wrote roughly **forty gate specs** and only four were implemented
(82 → 86). They are in `docs/AUDIT-2026-09-14.md` and in the agents' reports. This is the highest
-value remaining work, because this codebase's own rule is *when you fix a bug that got past the
checks, add a check* — and today three of the worst bugs sat behind gates that were **green
throughout**:

1. The **Windows blocklist gate reads the entry arrays as text** and never calls
   `Test-ShareableFolder`. That is why a prefix entry that did not block its own directory sat
   there with two gates passing.
2. **Nothing gates the deploy shape** — no check mentions `_redirects`, `_headers`,
   `rollupOptions`, `fxlab`, `sitelab` or `run_worker_first`. Audit item 39's fix exists only as a
   comment in `wrangler.toml`; re-adding a negation passes every check.
3. **Nothing gates `src/hooks` at all** — and three of today's findings were in there.

A gate that reads the source tests the source's *shape*, not its behaviour. Where a gate can
execute the thing, it must, and it has to be break-verified: if it does not fail when you revert
the fix, it is not a gate yet.

## Deliberately left for the client — do NOT decide these

- **`beginUpload` can dark a live download without the password** (`TODO.md` *Needs the client* 3).
- **Sessions survive a password change and an operator reset** (item 2) — a §9 inventory change.
- The **four duel sliders**, the **eight copy facts**, and whether `/work`'s case studies and the
  guestbook quotes are real. That last one matters most: a fabricated case study is evidence of
  capability that has to go.

## Not deployed

Live is Worker `38ceae8d` (rollback `df6dba2a`). `main` is **ahead of production** and none of
today's work is deployed. **Do not deploy from this state** — `predeploy` runs the full check, and
the fairness gate above will fail it at random. Settle that first.

---

## Agent reports

*(Condensed from each agent's report at the pause. If a section is missing, that agent did
not report before the session ended — treat its files as unverified and read the diff.)*

### 1. Duel / gates — **pin DONE, TODO entry DONE, fairness gate DIAGNOSED but NOT fixed.**

**The fairness diagnosis is the most valuable single result of the session, and it overturned both
standing hypotheses — mine included. Do not re-run this investigation; read it.**

Measured over **150 passes of the gate's exact simulation** (3 × 120,000 frames each, 17,886
matches):

- **The engine is not biased.** p(a wins) = **0.4976**, z = 0.64. Per pairing: 0.4951, 0.4956,
  0.5020. Zero draws. A real side bias is excluded at ~0.4%.
- **Matches are independent.** Lag-1 P(same winner as previous) = **0.4972** over 17,436 adjacent
  pairs. **The "correlated matches" hypothesis — which I gave the agent as the likely cause — was
  wrong.** Overdispersion is only 1.13×.
- **The random `n` is not the defect either.** Fixing the match count instead of the frame budget
  changes nothing (max σ 2.6–2.89 vs 2.72).
- σ distribution: median 0.74, p95 2.09, **max 2.72; ≥3σ in 0 of 150**. So the binomial model is
  very nearly right and the inherent false-failure rate is ≈**0.27%** — about 1 predeploy in 370,
  not the 40% the 2-in-5 observation implied.

**The actual defect is that the gate is BLIND, not that it is flaky.** At n ≈ 119 a 3σ threshold
only detects a bias of p ≥ **0.638** half the time. A director favouring one side 60/40 sails
straight through. It spends 360,000 frames on a question it cannot answer, and occasionally cries
wolf while doing so.

**⚠ UNRESOLVED, and it must not be lost:** the 2-failures-in-5 full-suite runs (3.03σ, 3.16σ) are
**not reproducible** — 0 in 150 standalone passes, and P(2 of 5 | 0.27%) ≈ 3.6e-5. The agent ruled
out `DUEL_TUNING` pollution (check.ts never calls `applyDuelTuning`; every direct mutation is at
lines 2017–2072 / 2484–2554, i.e. *after* the gate at 1486, each restoring). Same code, same
tuning, same simulation. **No mechanism found.** Something about the in-suite environment differs
from the standalone one and nobody knows what. Treat a future 3σ failure as unexplained rather than
as noise.

**Next step, designed but NOT validated:** replace the win-count statistic with the **role coin** —
`st.dir.att` sampled at every sequence start, ~2,800 samples per pass against 119, detecting p ≥
~0.537. That is literally the invariant CLAUDE.md names ("no sequence names a side"). A harness
exists at `scratchpad/fair3.ts` but **its 200-pass null calibration was killed at the stop, so
there is no calibration data. Do not ship a threshold without it.** Rejected candidate, so nobody
retries it: **blow counts** look like 24× the samples but are not — each match ends at a fixed
`MAX_HEALTH`, so blows-landed is a rescaling of the win margin.

**The pin half is DONE and break-verified.** New `DuelState.pin`; `createDuel` sets null; the
match-boundary re-roll reads `st.pin` ahead of `st.pool`. `effects.ts` assigns `st.pin` **and
`st.pool`** per frame — `st.pool` is the half a pin-only fix misses, because a fight built pinned
carries no pool, so lifting the pin would leave the boundary nothing to roll from. The roster gate
now drives pin → bind → hold a second boundary → lift → rolls again, over 12 boundaries.
Alignment is deliberately **not** re-checked in `DuelState`; `validDuelSettings` owns that.

Also: a comment-only correction in `src/data/duelSettings.ts` (its `pin` doc claimed a pin survives
resets "because `DuelState.pool` goes null", which the fix falsified). Revert freely; no behaviour.

### 3. Bundle split — **DONE, fully wired, and driven in a browser on the real production chunks.**

**−174.23 kB raw (−33.6%), −49.11 kB gzip (−30.2%).** Entry went 517.79 kB → **343.56 kB** raw,
162.54 → **113.43 kB** gzip.

`src/components/Lazy.tsx` (new) exports `Lazy({children, error?})` — a `Suspense` with fallback
**always `null`, never a spinner** (a spinner inside an already-painted page is a flash and a
reflow) wrapped in a class error boundary, because a rejected `import()` throws from inside
`React.lazy` and with nothing above it React unmounts the whole tree, i.e. a blank page on a route
that used to work — and `ChunkFailed()`, the route-level failure card built from existing classes
only. `src/App.tsx` is its only dependent.

Behind boundaries: SignIn, SignUp, Admin (drags DownloadEditor, DownloadCodes, DuelBench,
DuelSettingsEditor, ProofDialog), MachinesPage, SharePage, DownloadsPage (drags DownloadPage), plus
SiteConfigPanel and OperatorDoor as overlays. The overlays mount on first open and stay mounted
(`panelOpen || panelSeen`), matching the panel's existing documented behaviour, so from first open
onward it is byte-identical to before. The two overlay chunks are prefetched in an effect keyed on
`isOperator` — they are the only split surfaces reached by a *gesture* (⌘K, five taps, `sudo`) with
no page transition to spend the round trip inside. **Nothing fires for a visitor.**

Deliberately not split: chrome, hero, grid, FxCanvas, Greeting, Screensaver, Toast, and
`CommandPalette` — the palette is the only route to a third of the site off the desk, and
`Header.tsx` imports from it anyway. `ConfigContext` untouched, so §11's synchronous first render is
unaffected. `vite.config.ts` untouched, so the benches stay excluded by construction.

**Verified in a browser, on the production build under `vite preview`, cold reloads:** `/` and
`/404` fetch **exactly one** JS file — an anonymous visitor downloads no lazy chunk at all.
`/signin` fetches entry + SignIn + PasswordField + grantKey + QrCode and renders the form. All 14
routes render their real `h1`, correct wrapper class, zero overflow, no console errors. Grep proves
the operator literals are absent from the entry and present in exactly one other chunk each.

**Could NOT verify** (say so rather than assume): the operator surfaces themselves — panel, door,
`/admin`, `/machines`, `/share` — need a signed-in session and there was no Worker/D1. Their chunks
exist and are proven absent from the entry, but **the first-open path was never exercised. That is
the highest-value five minutes available on this change.** Also unverified: phone/tablet bands
(desk only), and anything rAF-driven.

> **✅ DONE 2026-09-15 — the operator surfaces are verified and this item is closed.** Driven in a
> real browser as a signed-in operator (`scripts/local-operator.ts`) against the **production
> chunks**, served by `wrangler dev` after `npm run build`, with forced calm defeated.
> **All eight lazy chunks mount and render: zero console errors, zero horizontal overflow.**
> `/admin` renders its real `h1` and **all five sections** — Accounts, Downloads pages, Download
> codes, What the duel does, The duel — with **4 canvases**, which is the three duel hosts
> `CLAUDE.md` names plus the background, so `DownloadEditor`, `DownloadCodes`, `DuelBench` and
> `DuelSettingsEditor` are all proven to mount rather than merely to exist. `/machines`, `/share`,
> `/downloads` and `/signup` likewise. **Both overlays were opened for the first time**: the panel
> via the Config tab (renders in full), and the door via typed `sudo` *with the panel already
> open*, which is the exact not-modal behaviour `CLAUDE.md` documents. The panel closing as the
> door opens is also by design — `useOperatorRoutes.ts:102` says so.
>
> Two things this did **not** cover, so they stay open: the phone and tablet bands (desk only),
> and anything rAF-driven. And it is not the same thing as item 5 of *Needs hardware or a human
> eye* — the operator surfaces have still not been judged **by eye** since the password fields
> landed. This proves they mount, not that they look right.
>
> **One papercut found:** `scripts/local-operator.ts` defaults to `OP_HANDLE=operator`, and the
> Worker refuses that handle as reserved — so the dev scaffolding fails out of the box with
> *"That handle is reserved."* Run it as `OP_HANDLE=patrick node …`. Worth a one-line default
> change.

**The duel is NOT split, and it is a one-file job outside that agent's scope.**
`src/fx/effects.ts` *statically* imports `./duel` for `drawFx`, which every visitor's canvas calls
every frame — so `duel.ts` (39.0 kB) + `fighters.ts` (21.0 kB) sit in the entry whatever `App.tsx`
does. `FxCanvas.tsx` also statically imports `applyDuelTuning`. Next step: put the duel branch of
`drawFx` behind a module-level handle populated by `import("./duel")` when the resolved effect is a
duel — safe because duels are operator-only and `FALLBACK_FX` renders meanwhile — and move
`applyDuelTuning` out of `FxCanvas.tsx`'s static imports. **A further ~60 kB, taking the entry under
285 kB.** Worth a line in `CLAUDE.md` when somebody next edits it.

### 2. Worker hardening round 2 — **all 14 items DONE, but TWO THINGS ARE UNVERIFIED.**

> **✅ BOTH now verified by the coordinator after the agent stopped — this is no longer a risk.**
>
> 1. **`migrations/0009_case_insensitive_names.sql` applied cleanly** to local D1
>    (`npm run db:migrate` → `0009_case_insensitive_names.sql ✅`).
>    **`db:migrate:remote` is still a separate deliberate step and has NOT been run.**
> 2. **`npm run test:auth` → 409 checks passed** against the running Worker with all 14 changes in.
>    The agent's flagged risks (item 7's 600,000 password floor, item 5's recovery one-shot) did
>    **not** materialise.

Files: `accounts.ts`, `admin.ts`, `downloadPages.ts`, `index.ts`, `machines.ts`, `setups.ts`,
`signal.ts`, `totp.ts`, plus the new migration. Typecheck clean at the pause.

The items worth knowing about without re-reading the diff:

- **Migration 0009** recreates `idx_machines_owner_name` and `idx_setups_name` with `COLLATE
  NOCASE`, so the unique index finally backstops the race its `COLLATE NOCASE` pre-checks
  describe. A unique index cannot be built over existing duplicates, so it **renames the losers**
  (`substr(name,1,29) || ' (' || substr(id,1,8) || ')'`, inside `NAME_MAX`) rather than deleting
  anything — a machines row is an agent's introduction and a setups row is a saved look; a rename
  costs one edit and is visible, a delete is silent and permanent. The suffix comes from the row's
  own id, not a `COUNT(*)`, because a count subquery would read the table the statement is halfway
  through rewriting. Proved by replaying 0001–0008 into `node:sqlite`, seeding duplicates, running
  0009: names preserved for the earliest row, counts unchanged, later case-variant insert raises
  `UNIQUE`.
- **`completeSignIn`'s recovery spend moved to the FIRST thing it does**, as a conditional
  `UPDATE … AND used_at IS NULL` with `meta.changes !== 1` throwing the *same* sentence a stale
  ticket gets. Closes the patient version (one completion per 30s step for the ticket's 5-minute
  life) and the two-tab race, and closes a second gap nobody had noticed: nothing previously
  checked the ticket's credential belonged to the ticket's account.
- **`expectDisplayName`** now lives in `worker/accounts.ts` and both `machines.ts` and `setups.ts`
  delegate to it. Its `NAME_CONTROL`/`NAME_DECEPTIVE` regexes were proved **character-for-character
  identical** to `src/share/setupCode.ts`'s `CONTROL`/`DECEPTIVE` by extracting both as source
  text. Nothing is imported from `src/`; the duplication is deliberate and documented.
- **Read this before editing those two regex lines.** They are written as `\uXXXX` **escapes, never
  literal characters**. The agent wrote literals first and broke the parse: U+2028/U+2029 are
  LineTerminators in JavaScript source — legal in string literals since ES2019 but *not* inside a
  regex literal — so the regex was unterminated and the reported error landed three lines below.
  It also found that **this harness's tool transport converts `\uXXXX` in command text into the
  real character**, which is how the literals got there. Verify any edit to those lines
  **byte-wise** (`cat -A`), not visually.
- `deleteAccount` now reads machine ids *before* its delete batch and fires `/shutdown` at each DO
  *after* it commits, under `Promise.allSettled` — same order and reason as `machines.remove()`.
- `signal.ts` gained `MAX_BROWSER_SOCKETS = 8`, and **refuses the newcomer rather than evicting the
  incumbent** — deliberately the opposite of the agent rule, because evicting a browsing tab would
  turn a bound into a way to knock somebody off a browse.
- `role=agent` is now refused structurally (`machine.owner_id !== account.id`) as a statement
  separate from the ownership `WHERE`, so a phase-3 widening of the *reach* gate cannot silently
  widen the *role* gate. Tautological today, and the comment says so, so it is not deleted as dead.
- `gate()` now asks every bucket in parallel and **refunds the ones that allowed** when any refuses,
  so a blocked signup bucket no longer drains the shared client allowance. It also reports the
  *latest* `retryAt` — telling somebody 30 seconds when another bucket holds them an hour is an
  answer that does not survive them acting on it.
- `recordFailure` was deleted (it had no callers left after the signup fix) and replaced by a
  comment explaining that a bare `/fail` after a reservation halves the allowance.
- `listPages` bounded at 500 **inside a subquery** — an outer `LIMIT` bounds what returns but not
  what is computed, and the per-row correlated `COUNT(*)` was the actual cost on the one downloads
  route a stranger can call.
- `savePage`'s unknown-visibility fallback moved from `"public"` (the widest) to `"granted"`.
- `base32Decode` deleted — zero references anywhere, and an exported decoder whose doc comment
  mentions what "the user retyped" reads as a live inbound path and invites one.

### 4. Assets & hygiene — **photos and deps DONE; three comment/doc items UNSTARTED.**

**Photographs: done, and the originals are safe.** Verified in two places, the second being the one
that matters: **all eight were already tracked in git, so every original byte is in `HEAD`** — 8/8
SHA-256 digests confirmed matching. Rollback is `git checkout HEAD -- public/photos/` plus reverting
the *Encoding* section of `docs/PHOTOS.md`. (There are also scratchpad copies, but treat those as
disposable — the scratchpad is session-scoped and will not survive.)

**2,045,250 → 584,848 bytes, −71.4%** (better than the 728KB the audit predicted — mozjpeg's tables
beat whatever produced that estimate). sharp 0.35.2, Lanczos3 to 900px, `mozjpeg: true`, q72,
progressive, sRGB and format unchanged. `sharp` was used as a build-time tool only — **no runtime
dependency added**; `dependencies` is still just react and react-dom.

- **EXIF verified stripped, not assumed** — JPEG marker segments walked directly: zero APPn and
  zero COM in all eight, not even the JFIF APP0 the Commons thumbnails carried. The gallery's
  "EXIF stripped" line stays true.
- **Quality checked visually, not just numerically** — compared against a 900px/q95 reference at
  1:1 with the tile's real `grayscale(0.85) contrast(1.05)` / `opacity 0.8` filter. Worst DSSIM
  0.064. `crt-alive` (the 87% drop — a dark room around one lit screen, the banding risk) was
  looked at specifically. Nothing held back at higher quality.
- **`docs/PHOTOS.md` updated and re-verified against `identify` output on disk.** One gotcha
  recorded there: `identify` reports `q=92` for these because ImageMagick infers quality from
  quantisation tables and mozjpeg uses its own — the encoder setting is 72.

**Dependencies: `wrangler` 4.122.0 → 4.131.2, `@cloudflare/workers-types` → 5.20260914.1. `npm
audit` 3 high → 0.** Proven, not merely installed: build succeeded and `wrangler dev` served
`GET /` and `/contact` as 200s. Note it proved this against a **pristine `git archive HEAD`**
extraction, because the live tree would not build at that moment — `worker/accounts.ts:369` had the
unterminated regex described above. **That is since fixed and typecheck is clean**, so its warning
on that point is stale; the bump itself is sound.

**Three items UNSTARTED, each with its exact next step:**

1. **`tsconfig.json:20-26`** still ends `Recorded in TODO.md rather than half-fixed here.` — and it
   is not recorded there. So the 274KB gate suite, `auth-e2e.ts`, `local-operator.ts` and the bench
   generators are typechecked by **nothing**, including the suite that is the only thing between
   this repo and a bad deploy. The agent drafted a drop-in `TODO.md` entry; it is in the audit
   record. The real fix is a third config (`tsconfig.scripts.json`, with `@types/node` and its own
   lib set) added to `npm run typecheck` — **not** widening the app config, which fails on
   `process` and on TS 5.7's `ArrayBuffer` variance rules.
2. **`index.html:19-23`** claims the inline data: icon "keeps /favicon.ico from falling through to
   the Worker". Measured false: `/favicon.ico` answers **200 `text/html`** — the app shell with an
   injected config script — and so does `/apple-touch-icon.png`, which iOS fetches for a
   home-screen bookmark. The tag stops most *browsers* asking; crawlers, unfurlers and iOS still
   do. Recommended beyond the comment fix: a Worker route returning 404 (or the real SVG) for both
   — it is the same shape as audit item 39 and the trailing-slash bug, the SPA fallback answering
   200 at addresses that are not pages.
3. **`docs/DOWNLOADS.md`** wants the operator-facing note that `code`-visibility pages are publicly
   enumerable (slug, title, summary, layout, file count) so they should be **named neutrally**, or
   use `granted` if the name itself is the secret. The agent deliberately did not draft wording
   without reading the file first — matching that runbook's voice matters more than speed.

### 5. Setup-code lookalikes — **COMPLETE. Nothing outstanding.**

**Finding 1, combining marks: measured, and the conclusion is DO NOTHING to the code.** This is
the important part to preserve, because the obvious instinct is to "harden" the filter and that
would be wrong.

Measured in a real browser against `.v-setup-name`'s resolved style (13px JetBrains Mono), two ways
at once — DOM `getBoundingClientRect` width and a 3× supersampled canvas raster diffed on alpha:

- All **2,543** code points matching `\p{M}` swept, appended to a base label.
- **263** are `Default_Ignorable_Code_Point` / `Variation_Selector` — and those are the *only* ones
  that draw nothing. Seven are pixel-identical and zero-width (U+034F, U+180B–U+180D,
  U+E0100–U+E0102), and **all seven are already refused** by `DECEPTIVE`, singly and as twins.
- The other **2,280 all draw ink. Zero invisible.** The 387 faintest were re-measured against
  eleven different base strings — **4,257 comparisons, zero invisible pairs** — so nothing hides
  under a wider glyph either.
- Scale: a full stop draws 4.9 CSS px of ink; the faintest mark in Unicode (U+0742, Syriac) draws
  **1.0** — one opaque pixel. Still ink.

**Why folding `\p{M}` would be a bug, not a hardening:** in Hebrew, Arabic, Thai and the Indic
scripts the marks *are* the vowels and NFKC does not compose them. Folding would collide Thai `ก`
with `กั`, and a pointed Hebrew spelling with its unpointed one — different words, two honest
folders, and the whole code refused. That is the `Документы` mistake one level down. Folding only
the faint ones would be an enumeration (already thrown out once in this file) keyed on a *fallback
font* — the 1.0-pixel figure is JetBrains Mono's, and another reader's fallback gives another
number.

Changed: **comments only** in `src/share/setupCode.ts`, carrying the measurement, the counts, the
outage argument and a **revisit-if: `--font-mono` changes**. `CONTROL`, `DECEPTIVE`, `CONFUSABLES`
and `foldLabel` are byte-identical to before.

**Finding 2, the 40-codepoints-vs-40-UTF-16-units truncation: already fixed earlier in this same
session's working tree — do NOT re-fix it.** `HEAD` has `${label:0:40}`; the tree has a
UTF-16-counting `text_cut` (shell) and `Limit-Text` (PowerShell). Verified by driving the sliced
functions and then the real decoder: 40 astral code points is **80 units → REFUSED** under HEAD,
**40 units → ACCEPTED** under the fix. Mid-surrogate splitting is impossible in both; under `pwsh`
a bare `Substring(0,39)` yields `loneSurrogate=True` while `Limit-Text 39` yields 38 units and
`False`, so that guard is load-bearing and works. The two shell scripts' `text_probe` blocks are
byte-identical.

**One residual found and deliberately not fixed (fails closed):** `check_folder`'s path-length
pre-filter is `[ ${#c} -gt 400 ]`. `${#c}` counts **bytes** under `LC_ALL=C` and code points under
UTF-8, while the ceiling the decoder enforces is UTF-16 units — measured, a 204-code-point Cyrillic
path reads 204 in one locale and **387** in the other. So on a headless box or in a minimal
container an honest ~220-character non-ASCII path is refused as *"too long to share"* with a wrong
number. It over-refuses, lands before any link is made, and the authoritative `text_len` check runs
afterwards — so it is a correctness bug, not a security one. Left alone because `check_folder` is
sliced and driven standalone by the gate and its own comment forbids depending on anything outside
itself.

**Gate specs it left** (none written — it was told to report them): gate the *property the browser
measurement rests on* rather than the rendering, since `check.ts` has no rasteriser — sweep all
code points and assert every ignorable `\p{M}` is refused through the **real `decodeSetupCode`**
(not by testing the regex in isolation), with U+FE0E/U+FE0F as the carve-outs (accepted singly,
refused as a twin), and assert the converse so nobody hardens the filter into refusing Thai or
Devanagari. **Pin the counts** (263 / 2,280 / 2,543) so a newer Unicode table fails loudly rather
than silently widening the invisible set. Drive the three truncation functions and assert
`decodeSetupCode` **accepts** the result — grepping for `text_cut` is not a gate, since
`text_cut 400` against a 40-unit ceiling would pass such a grep.
