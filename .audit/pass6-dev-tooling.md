# Pass 6 — Dev/test tooling audit

Scope: the project's own verification and demonstration scripts, as opposed to the
application code they exercise (`worker/`, `src/`), which five earlier passes already
covered end to end. Read in full: `scripts/auth-e2e.ts` (3495 lines), `scripts/webauthn-sim.ts`,
`scripts/duel-shot.mjs`, `scripts/duel-bench.mjs`, `scripts/fx-bench.mjs` and
`scripts/fx-bench.template.html`, `scripts/fx-shot.mjs`, `scripts/ornament-shot.mjs`,
`scripts/local-operator.ts`, `scripts/local-signin-check.ts`. Read for cross-reference:
`worker/accounts.ts` (signup/rate-limit path), `worker/rate-limit.ts` (`RateLimiter.attempt`/
`.fail`), `worker/webauthn.ts` (the CBOR reader and `derToP1363`, to check independence from
the sim), `src/fx/FxCanvas.tsx` and `scripts/check.ts` (the frame-delta-clamp gate's `hosts`
list). Skimmed `.audit/pass1-accounts-auth.md` and `.audit/pass1-duel.md` per the brief, to
avoid re-filing their findings — `duel-bench.template.html`'s 0.2 frame-delta floor and the
stale phone/desk size-preset labels are pass 1's, not repeated here. `scripts/duel-shot.mjs`,
`scripts/duel-bench.mjs` themselves, and `fx-bench.mjs`/`fx-shot.mjs`/`ornament-shot.mjs`
entirely were **not** in pass 1's scope; they are covered here for the first time.

Read-only. Nothing was fixed. No script was executed against a real Worker, D1 or network
resource — every claim below is from reading source, cross-referencing constants against the
files that define them, and (for the rate-limit finding) hand-simulating the arithmetic
`worker/rate-limit.ts` implements.

## Verified correct

- **The "known wart" in `auth-e2e.ts` is exactly as CLAUDE.md describes, unchanged.** The
  reachability gate (`section("Reachability")`, lines 424–432) calls `process.exit(1)` with
  "The Worker is not running. Start it with `npm run dev:worker`." when `/api/health` is not
  200. Two sections that need **zero** network calls — `section("The file protocol's path
  rule (§12 S) — pure, before any wire")` at line 1864 and `section("Share codes (wire
  format)...")` at line 1942, both explicitly commented "pure, so it runs before any wire,
  next to the path rule for the same reason" — sit 1,400+ lines *after* that gate, not before
  it. Confirmed by reading both sections in full: neither calls `fetch`, `client.call`, nor
  any `api.*` function; both are pure calls into `isValidPath`, `fingerprintFromSdp`,
  `encodeShareCode`/`decodeShareCode` and the catalogue arrays. So appending a new wire-format
  assertion and running `npm run test:auth` without `npm run dev:worker` still runs none of
  the wire-format coverage and exits on what reads as an unrelated environment problem. Not
  improved, not worsened.
- **The fetch-shim's cookie isolation for `Client` (the raw, non-`src/auth` HTTP client) is
  genuinely preserved**, traced rather than assumed. `Client.call` (line 213) builds an
  **absolute** URL itself (`` `${BASE}${path}` ``) before calling `fetch`, and the module-level
  shim installed at line 112 (`globalThis.fetch = ...`) returns `nodeFetch(input, init)`
  unmodified whenever `!url.startsWith("/")`. Since `Client`'s URLs never start with `/`, every
  `Client` instance's own `cookie`/`ip` state reaches `nodeFetch` untouched, with no
  interference from the `browser`-scoped cookie the shim injects for `src/auth`'s relative-URL
  calls. The two code paths (`Client` for raw-wire assertions, `flows.ts`/`api.ts` via
  `asBrowser()` for the "driven for real" sections) cannot cross-contaminate cookies. Confirmed
  by reading both branches of the shim and both call sites, not by trusting the header comment.
- **The independent RFC 6238 TOTP implementation is genuinely independent.** `totpCode()` in
  `auth-e2e.ts` (line 276), and the near-identical copies in `local-operator.ts` and
  `local-signin-check.ts`, are written out from the RFC rather than imported from
  `worker/totp.ts` — confirmed no import of `worker/totp` (or any shared TOTP helper) exists in
  any of the three files.
- **`scripts/webauthn-sim.ts` is genuinely independent of `worker/webauthn.ts`'s decoder.**
  The sim's `cborEncode`/`write`/`head` (CBOR writer) and `p1363ToDer` (signature format
  converter) share no code with the Worker's `CborReader` class or its `derToP1363` function —
  grepped for any shared helper name across both files and found none; each implements its half
  of the wire format from the spec, independently, in the opposite direction from the other
  (the sim *encodes* what the Worker *decodes*, and *converts* P1363→DER where the Worker
  converts DER→P1363). The only things imported from application code are `PRF_INPUT` (a
  constant, not decode logic) and `toBase64Url` (a byte-transport helper used identically by
  real browsers) from `src/auth/`, neither of which is part of the mechanism under test. This
  is the opposite of the "gate confirms itself" pattern CLAUDE.md warns about elsewhere (e.g.
  the old `duelCamera` gate) — a shared encoder here would have been that bug, and there isn't
  one.
- **None of the five dev-only benches (`fxlab.html`, `sitelab.html`, `duel-bench`/-shot,
  `fx-bench`/-shot, `ornament-shot`) has gained a reference that would pull it into the
  production bundle.** Grepped `src/`, `index.html` and `vite.config.ts` for every script's
  filename: the only hits are prose comments in `src/fx/duel.ts`, `src/fx/fighters.ts`,
  `src/components/DuelOrnament.tsx` and `src/components/DuelBench.tsx` referencing
  `duel-shot.mjs`/`duel-bench.mjs` by name in explanatory text — no `import`, no `<script
  src>`, no `rollupOptions.input` entry. Confirmed clean for the newer tooling as well as the
  two pass 1 already checked.
- **`scripts/duel-shot.mjs`'s `scale` mode already carries the corrected real slot widths**
  (`[281, 'phone'], [240, 'tablet'], [340, 'desk']`, line 404) with a comment explaining the
  2026-08-28/30 widening — this is the fix pass 1 credited it with; still present and correct.
  Its `run(st, n)` helper (line 125) steps `advanceDuel(st, 1)` in a loop rather than a single
  bulk call, correctly avoiding the "4-frame accumulator clamp swallows a big step" trap the
  file's own comment names.
- **`scripts/local-operator.ts` and `scripts/local-signin-check.ts` correctly reuse the
  relative-URL-only fetch-shim pattern** and, like `auth-e2e.ts`, run `d1()` asynchronously via
  `promisify(exec)` rather than `execSync` — both apply the "blocking exec starves undici's
  socket bookkeeping" lesson CLAUDE.md documents for `auth-e2e.ts`.
- **`scripts/ornament-shot.mjs` and `scripts/fx-shot.mjs`'s scraped catalogue counts are
  correct today**: `ornament-shot.mjs`'s regex-scrape of `src/data/ornaments.ts` finds exactly
  8 entries (its own guard requires `>= 8`) and of `src/data/palettes.ts` exactly 25 (guard
  requires `>= 25`) — both re-verified independently by grep rather than trusting the script's
  own exit code. `fx-shot.mjs`'s default `--pal nebula,xerox,solar` resolves against three real
  palette ids (`nebula`, `xerox`, `solar` all present in `PALETTES`), so the "two ends plus the
  default" comparison the header comment promises actually renders three palettes, not fewer.

## Finding 1 — `scripts/fx-bench.template.html`'s Play-loop frame-delta floor is 0.2, not 0, and the comment claiming parity with `FxCanvas` is wrong

**File/line**: `scripts/fx-bench.template.html:356` (inside the `Play` button's `requestAnimationFrame` loop).

**Mechanism**:

```js
// Clamped exactly as FxCanvas clamps it, so a stall cannot jump the
// world forward and a 120Hz display does not run the fields at double
// speed.
var dt = Math.min(3, Math.max(0.2, (now - last) / (1000 / 60)));
```

`src/fx/FxCanvas.tsx:253` — the file this comment claims parity with — reads:

```ts
const dt = Math.min(3, Math.max(0, frameMs / (1000 / 60)));
```

Floored at **0**, not 0.2. This is the identical regression class CLAUDE.md's "Physics and
rendering" section documents at length for the duel hosts: *"The floor was 0.2 and
undocumented, and it reintroduced the very fault the clamp exists to prevent — 0.2 is a 300Hz
frame, so a faster display had its real delta rounded up and a 500Hz panel ran 1.67× fast."*
`scripts/check.ts`'s frame-clamp gate (`hosts`, line 2263) greps exactly four files for this
pattern — `src/fx/FxCanvas.tsx`, `DuelOrnament.tsx`, `DuelBench.tsx`,
`DuelSettingsEditor.tsx` — and `scripts/fx-bench.template.html` is not among them; grepping
`check.ts` for `fx-bench`, `duel-bench`, `ornament-shot` or `fx-shot` returns zero matches
anywhere in the file, so none of the four newer bench/shot tools has any gate coverage at all.

**Concrete impact**: `fx-bench.mjs` builds this template into a single self-contained HTML file
specifically so the operator can hand it to "a designer who has never cloned the repo" (the
file's own header comment) for a live, non-headless review of all sixteen background effects —
the same job `duel-bench.mjs` does for the fight, and for the identical documented reason
(`document.hidden` parks `requestAnimationFrame` in every automated context, so a human with a
real, focused tab is the only way to see motion). On any display faster than 300Hz — the
`check.ts` file itself notes "480 and 540Hz displays ship" — clicking **Play** on this bench
runs every effect up to 1.67× too fast: `rain`'s fall speed, `plasma`'s churn, the two
duel-effects' pacing (`DEFAULT_DUEL_SETTINGS` is wired through), all reported to the reviewer
faster than the site actually shows them. **`Step` is unaffected** (it always passes a fixed
`dt: 1`, per the template's own comment at line 228 explaining why), so this only misleads a
human clicking Play — which is exactly the scenario the tool exists for, since Step exists
for the headless/hidden case and Play is the "does it read at the right pace" case.

**Severity**: Medium. Same class and same root cause as the already-fixed duel-host bug
CLAUDE.md documents in detail (the file was almost certainly copied from a duel host's Play
loop, or from `duel-bench.template.html` itself, before that one was corrected everywhere the
gate could see) — and it is not new: pass 1 explicitly did not audit `fx-bench.mjs`/
`fx-bench.template.html`, so this is a first sighting, not a regression since a prior pass. It
degrades a tool built for exactly one purpose (accurate live-tempo review) on exactly the
hardware that purpose depends on.

**Suggested improvement** (not implemented, read-only pass): change `0.2` to `0` at line 356,
and add `scripts/fx-bench.template.html` (and `scripts/duel-bench.template.html`, which
carries the same bug per pass 1) to `check.ts`'s frame-clamp `hosts` array or a sibling check —
noting, as pass 1 already noted for the duel template, that the gate greps literal source
files, not bundled/generated output, so the template's raw source is the right target.

## Finding 2 — `auth-e2e.ts`'s signup rate-limit test tolerance is wide enough to pass whether or not the bucket is double-counted

**File/line**: `scripts/auth-e2e.ts:3463–3478`, the `"the signup allowance is tighter than the
client bucket's fifty"` check inside `section("Rate limiting (§4)...")`.

**Mechanism**: The test's own comment states a precise expectation:

```js
// With SIGNUP_FREE_ATTEMPTS = 12, a clean bucket refuses attempt 14 (the
// thirteenth failure is what arms the block); earlier only if a previous
// run happened to draw the same address inside the window.
const creator = new Client(`198.51.100.${1 + Math.floor(Math.random() * 254)}`);
let signupBlockedAt = -1;
for (let attempt = 1; attempt <= 15 && signupBlockedAt < 0; attempt += 1) {
  await creator.call("/api/auth/signup", { body: fixturePayload });
  if (creator.lastStatus === 429) signupBlockedAt = attempt;
}
check("account creation from one address meets backoff", signupBlockedAt > 0, ...);
check(
  "the signup allowance is tighter than the client bucket's fifty",
  signupBlockedAt > 1 && signupBlockedAt <= 14,
  `blocked at attempt ${signupBlockedAt}`,
);
```

`worker/accounts.ts`'s `signup` (line 660) still contains, unchanged from what
`.audit/pass1-accounts-auth.md` Finding 1 already reported:

```ts
if (taken) {
  await recordFailure(env, names);           // +1 to the bucket
  throw new BadRequest("That handle is taken. Pick another.", 409);
}
```

...on top of `assertAttempt(env, names)` (line 611), which itself reserves +1 via
`RateLimiter.attempt()` (`worker/rate-limit.ts:118`) **before** the handler even parses the
body. Every ordinary "handle taken" response in this loop therefore consumes **two** units of
the `signup:` bucket's 12-attempt allowance, not one (the concurrent-duplicate-INSERT race
branch a few lines below, by contrast, correctly does *not* call `recordFailure`, with an
explicit comment explaining why — so the file now contains two adjacent, contradictory
positions on the same mechanism: the catch-branch comment says double-counting "would halve
the real allowance," while a newer comment on `recordFailure`'s declaration, lines 398–403,
describes the `if (taken)` branch's call as "still needed... and harmless after
`assertAttempt`"). Hand-simulating `RateLimiter.attempt`/`.fail` against this loop (attempt 1
succeeds and consumes 1; every subsequent "taken" response consumes 2 via reserve-then-fail)
puts the actual block point at **attempt 7 or 8**, not 14 — roughly half of what the test's own
comment describes as correct.

The assertion's range, `signupBlockedAt > 1 && signupBlockedAt <= 14`, accepts *any* value from
2 through 14. Both the documented-correct behaviour (block at 14) and the actual, currently
double-counted behaviour (block at ~7–8) fall inside that range, so **the check passes either
way** and cannot distinguish them. This is the exact "loose assertion that could pass
vacuously" pattern the brief asks to look for: the test drives the real mechanism and reads a
real status code (it is not vacuous in the sense of never failing at all), but its tolerance
band is wide enough that it never actually confirms the specific, numbered invariant its own
adjacent comment states.

**Concrete impact**: A future regression that widens or further loosens the double-count (or a
fix that removes it and restores block-at-14) would both leave this section fully green.
Nobody reviewing a passing `npm run test:auth` run learns anything about which of the two
behaviours is live. Whether the double-count itself is a live bug or a since-relitigated
intentional design is an application-code question already on record (pass 1's Finding 1,
apparently not resolved since — the code and its own comments now disagree with each other
about it) and is out of this pass's scope to re-adjudicate; what belongs to this pass is that
the harness cannot tell the difference, despite writing out the exact number that would let it.

**Severity**: Low–Medium. Does not itself cause a security or availability failure (that would
be the underlying app-code question); it is a gap in test rigor on a mechanism the file's own
comments show real concern about getting right down to the exact attempt count.

**Suggested improvement** (not implemented, read-only pass): tighten the assertion to the
specific documented value (e.g. `signupBlockedAt === 14`, or a narrow ±1 band) so a change in
either direction — a fix or a further regression — moves the test's verdict.

## Finding 3 — A comment block describing the rate-limiting section sits 830 lines from that section, directly above unrelated code it factually misdescribes

**File/line**: `scripts/auth-e2e.ts:2551–2569`, immediately preceding
`section("Downloads sub-pages (2026-08-20)...")` at line 2570.

**Mechanism**:

```js
// Rate limiting ---------------------------------------------------------------
//
// **This runs last, and it has to.** §4's per-client bucket is keyed by
// `clientKey`, and in local development there is no edge in front of the
// Worker, so `cf-connecting-ip` is absent and every request in this harness
// shares the single bucket named "local". Tripping the backoff therefore
// blocks the whole run. That is the rate limiter working correctly rather than
// a flaw in it — but it does mean nothing can follow this section.
/*
 * Downloads sub-pages (2026-08-20). The operator authors a page, uploads a
 * real file into local R2, and every one of the four visibilities is checked
 * ...
 */
section("Downloads sub-pages (2026-08-20) — authoring, uploading, and who may see it");
```

The actual `section("Rate limiting (§4) — the RateLimiter's backoff path, exercised at last")`
does not appear until line 3402 — after the entire ~830-line Downloads section this comment
block sits directly above. The comment's own claim, read in place, is false: it says "nothing
can follow this section" while roughly 830 lines of a large, independent test section (which
itself makes dozens of real network calls, including several that could plausibly trip a rate
limit of their own) immediately follows it. The banner-style `// Rate limiting
---------------------------------------------------------------------------` divider comment
that normally marks a section boundary in this file is doing so for a section that isn't there
yet.

**Concrete impact**: None on the actual test run — `section("Rate limiting...")` genuinely is
the last section in the file (confirmed by reading to EOF), so the underlying constraint the
comment describes ("this must run last") is honoured by the code's real structure regardless of
where the comment sits. The impact is purely on a future maintainer: anyone reading top-to-
bottom hits an emphatic "this runs last... nothing can follow" banner immediately before 830
lines of code that visibly *does* follow it, which is confusing at best and actively misleading
if someone uses this comment's position as a guide for where a new section is safe to insert
(inserting one directly after this banner, trusting it to mean "end of file," would silently
land the new section *before* Downloads and Rate Limiting rather than after them, changing
execution order without any error). Most plausible cause: the Downloads section was added after
the Rate Limiting section already existed with this leading comment, and the insertion landed
above the comment instead of below it, or the comment was written for a Rate Limiting section
that used to be positioned here and was later moved down without moving its banner.

**Severity**: Low. Cosmetic/documentation drift in a test file rather than a behavioural bug —
but it is precisely the kind of drift CLAUDE.md's "Checks" section warns about in spirit ("a
gate that reads its own source is testing the source's shape, not its behaviour"): here a
*comment* asserts something about the file's shape that a `grep` for the real section title
immediately disproves.

**Suggested improvement** (not implemented, read-only pass): move the `// Rate limiting
---` banner comment (lines 2551–2558) down to directly precede the real
`section("Rate limiting...")` at line 3402, where an identical, shorter restatement already
exists in the section's own title string ("exercised at last").

## Finding 4 — `scripts/local-operator.ts`'s `d1()` helper omits the shell-escaping guard its `auth-e2e.ts` counterpart has, reopening a quoting hazard on an env-supplied handle

**File/line**: `scripts/local-operator.ts:33–35`, compared with `scripts/auth-e2e.ts:176–179`.

**Mechanism**: `auth-e2e.ts`'s `d1()` helper:

```ts
async function d1(sql: string): Promise<void> {
  if (sql.includes('"')) throw new Error("keep double quotes out of harness SQL");
  await execAsync(`npx wrangler d1 execute vessel --local --command "${sql}"`);
}
```

`local-operator.ts`'s copy of the same helper drops the guard entirely:

```ts
async function d1(sql: string): Promise<void> {
  await execAsync(`npx wrangler d1 execute vessel --local --command "${sql}"`);
}
```

Both build the exact same double-quoted shell command string, so both are equally exposed to a
`"` in `sql` breaking out of the intended argument and being interpreted as additional shell
syntax by `exec`'s `/bin/sh -c` invocation. `local-operator.ts` calls this with
`` `UPDATE accounts SET is_operator = 1 WHERE handle = '${HANDLE}'` ``, where `HANDLE` comes
directly from `process.env.OP_HANDLE ?? "operator"` with no validation — an environment
variable, one shell-metacharacter away (a `"`, or a `` ` ``/`$(...)` once inside the double
quotes) from command injection into the developer's own machine when they run
`OP_HANDLE='x" ; rm -rf ~ #' npm run ...`-shaped input. `auth-e2e.ts`'s otherwise-identical
helper would at least throw a clear `Error` instead of silently mis-quoting.

**Concrete impact**: Low in practice — `OP_HANDLE` is a value the developer running the script
sets for themselves, not attacker-controlled input, so this is a self-inflicted foot-gun rather
than a remotely exploitable issue. It is included because it is a genuine inconsistency between
two copies of the same helper doing the same shell-quoting-sensitive job, one of which was
clearly hardened (the guard's own message — "keep double quotes out of harness SQL" — reads as
a deliberate fix) while the sibling script copied the vulnerable half of the pattern without
the fix.

**Severity**: Low (local-only, self-triggered, no privilege boundary crossed).

**Suggested improvement** (not implemented, read-only pass): add the same
`if (sql.includes('"')) throw ...` guard to `local-operator.ts`'s `d1()`, or factor both copies
into one shared helper so a future fix to one cannot silently miss the other.

## Summary

Four findings, all in the dev/test tooling itself rather than in the application it exercises:

1. **`scripts/fx-bench.template.html`'s Play-loop frame-delta floor is 0.2, not 0** (Medium) —
   the identical, previously-documented-and-fixed-elsewhere regression class, present in a file
   pass 1 did not audit and with zero `check.ts` gate coverage; its own comment incorrectly
   claims parity with `FxCanvas.tsx`, which floors at 0.
2. **`auth-e2e.ts`'s signup-rate-limit assertion tolerance (2–14) is too wide to distinguish
   correct behaviour from the already-double-counted bucket** (Low–Medium) — the test drives
   the real mechanism and states the exact expected number in a comment, but its assertion
   would pass unchanged whether that number is honoured or halved.
3. **A "this runs last" comment banner sits 830 lines from the section it describes**, directly
   above and factually contradicted by the Downloads section that immediately follows it
   (Low) — cosmetic, but a real trap for a future editor trusting the comment's position.
4. **`local-operator.ts`'s copy of the `d1()` shell helper is missing the double-quote guard**
   `auth-e2e.ts`'s copy has (Low) — a local-only, self-triggered quoting hazard via an
   unvalidated environment variable.

Everything else named in the brief was independently re-derived from current source and found
correct: the reachability-gate-before-pure-wire-format-sections "known wart" is present exactly
as CLAUDE.md describes, neither better nor worse; the fetch-shim's cookie isolation for
absolute-URL (`Client`) requests versus relative-URL (`src/auth`) requests was traced end to
end and holds; the RFC 6238 TOTP implementations in all three harness-adjacent scripts are
genuinely independent of `worker/totp.ts`; `scripts/webauthn-sim.ts` shares no CBOR/DER logic
with `worker/webauthn.ts` and is a real second opinion, not a shared-encoder illusion;
`duel-shot.mjs` carries the corrected real slot widths and correctly steps frame-by-frame
rather than in clamped bulk calls; none of the five dev-only benches has gained a reference
that would pull it into the production bundle; and the catalogue counts `ornament-shot.mjs` and
`fx-shot.mjs` scrape from `src/data/` are accurate against the current 8-ornament,
25-palette shape.

Not covered here and worth naming rather than implying is clean by omission: this pass did not
execute any of the bench/shot scripts (no headless Chrome was launched, no Worker was started),
per the instruction not to touch real network/D1/Worker resources — Finding 1's on-screen
effect (does `fx-bench`'s Play mode actually run fast on a >300Hz-reporting display) is
confirmable from the arithmetic alone, exactly as pass 1 noted for the equivalent duel-bench
finding, but a live demonstration would need a real browser session or a monkeypatched
`performance.now()`.
