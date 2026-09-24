# Pass 6 — Meta-audit of `scripts/check.ts` itself

This pass does not audit the application; it audits the 274KB / 5,921-line gate that is supposed to
catch regressions in it (`npm run check`, currently **77 registered checks**: 66 top-level `check(...)`
calls, 11 more gated behind `if (!FAST) check(...)`, and one `checkAsync(...)`). The brief: for each
check, decide whether it drives real behaviour (imports and calls the actual function/component and
reads what it emits) or tests the source's *shape* (`readFileSync` + regex/string-match), and for
shape-based gates, ask whether the matched shape could survive a change that breaks the invariant the
check's name claims to verify. Also: does the check *runner* itself have a bug that could silently
drop or miscount a result.

## Scope

**Read in full** (every check body, not just the name): the whole file, top to bottom — the runner
(`check`, `checkAsync`, the `pending`/`SKIPPED`/`UNCHECKABLE` machinery and the report loop at the
bottom), all 4 stylesheet/CSS-shape checks, all 9 downloads checks, the custom-property check, the
206/range-plan check, all 4 QR checks, all **22** duel checks (the largest single category — the fight
simulation, camera, costume-roster, pacing-knob, canvas-hygiene and spark-geometry gates), all 6
catalogue/ornament/station/guardrail checks, the 3 per-page-look-override checks, the 5
navigation/pointer-route checks, the sitemap/snippet/meta-description checks, the setup-code check, the
2 Windows-encoding/blocklist-text checks, the 2 execution-driven blocklist/resolver checks, the
Worker wire-format checks (`setups.ts` pattern, bounded-JSON stream, release-password gating,
`-BrowserProfile` charset), the agent-key-pin check, and the 4 desktop/host-script checks.

**Skimmed for cross-reference, not re-verified**: `.audit/pass1-*.md` through `pass3-followups.md`,
to recognise the *pattern* of already-confirmed gaps (the byte-vs-UTF16 `MAX_CONFIG_BYTES` shape gate,
`duel-bench.template.html` having zero coverage) without re-litigating them — those are cited below
only where a *new* instance of the same class turned up elsewhere.

**Ran once for a baseline**: `npm run check:fast` — 69 of 69 checks passed (fast mode skips the 11
`if (!FAST)` duel-simulation gates), no entries under "Could NOT be run on this machine" (the desktop
sibling repo is checked out in this environment, so the two desktop gates ran for real rather than
being named under `SKIPPED`). This confirms the baseline is green and is not itself evidence about any
finding below — every finding here is about the check *logic*, established by reading it, not by
breaking it and re-running (this pass is read-only, per instructions, and does not modify
`scripts/check.ts`).

## Verified sound

The overwhelming majority of what was read is genuinely behaviour-driven, and several categories are
about as rigorous as a check-in-a-CI-script can be:

- **The duel gates (22 of them) almost all drive `advanceDuel`/`createDuel`/`buildSequence`/`drawDuel`
  over tens to hundreds of thousands of stepped frames and assert on emitted state**, not on source
  text: the hit-flash/reaction-ordering gate (line 1320) walks 300,000 frames tracking every damage
  frame and every reaction start rather than a single `last` pointer (its own comment records that the
  naive version produced 296 false violations); the camera gate (1786) and the Size gate (3763) frame
  a real fight and measure the emitted view rectangle against the focus box, not against a re-derived
  formula (the file's own history records that an earlier version "restated the renderer's arithmetic
  from the same constant the renderer reads" and stayed green through a reverted fix); the canvas-
  hygiene gate (2625) and the health-bar gate (2005) both use a `Proxy`/recording `CanvasRenderingContext2D`
  and read back the actual `save`/`restore` depth, composite operation and drawn rectangles, rather
  than asserting on the drawing code's text. The costume-roster gate (2784) builds a fake body from
  each fighter's real `prop`/`stance` and drives every `back`/`head`/`overlay` hook across the full
  swept domain of `t`, `vx`, `airborne` and (as of the audited version) six off-hand positions — the
  file's own comment records that the *previous* version, which drove only the guard pose, missed a
  60%-cover/60%-alpha shield and a 36.9-unit sideways reach that the renderer's other off-hand poses
  produce.
- **The guardrail/station/grain resolution gates (3956, 4012, 4071, 4122, 4153, 4192, 4404, 4460)
  correctly moved from testing the predicate (`isAllowed`) to testing the thing that actually renders**
  (`effectiveStation`, `effectiveGrain`, `resolve`, and `themeClasses` itself via the `CLASSES` helper
  at line 4119) — which is exactly the fix CLAUDE.md documents as necessary after `resolve()` was found
  to have zero callers in `src/` while its own predicate-only gate stayed green.
- **The per-page look-override gate** (4262) round-trips through `applyLook` and then re-derives the
  wrapper's actual CSS custom properties via `themeVars`/`CLASSES`, and separately great-scans
  `src/components`, `src/fx`, `src/hooks` for any file reading a stored appearance dial outside the
  allow-list — a real "does the seam get bypassed" check, not just a "does the seam exist" check.
- **The setup-code, share-code and QR checks are proper round-trip + malformed-input suites**: `qr:
  output decodes back to its input` independently reimplements a decoder from the ISO spec (not from
  `qr.ts`'s own internals) so it cannot share a mistake with the encoder; `setup codes round-trip, and
  refuse everything malformed` (4846) drives `decodeSetupCode`/`encodeSetupCode` against ~30 adversarial
  payloads including bidi overrides, variation selectors, doubled whitespace and eight different
  visual-confusable pairs, and separately confirms the *carve-out* (an honest emoji-bearing label, two
  distinct Cyrillic labels) is not over-refused.
- **The two execution-driven filesystem gates** — `the setup scripts REFUSE, driven against a real home
  directory` (5230) and `the Windows script resolves EVERY path component` (5332) — are the strongest
  gates in the file precisely because they do not read the scripts at all for their core assertion:
  they slice the real `check_folder`/resolver logic out of the shipped script, `eval`/execute it via
  `bash -c` or `pwsh -File` against real temporary directories (including one with a space in `$HOME`,
  the exact shape that broke the old string-based blocklist), and read back real verdicts. Both are
  documented as break-verified against the pre-fix scripts.
- **`every JSON body the Worker reads is bounded on the stream`** (5476) drives the real `readJson`/
  `readJsonLenient` against a `ReadableStream` that never ends and counts pulled chunks and whether
  `cancel()` was called — it would fail by *timeout*, not by a false green, if a regression made the
  reader drain-then-measure again.
- **`the release-shaped operator writes demand the password, and the edits do not`** (5554) is shape-
  based (it slices function bodies out of three Worker files and regexes for `proven(`/`assertPassword(`),
  but it explicitly says so and names its own weaker-than-`test:auth` status; it is also gated in both
  directions (the six releases must ask, the five edits must not), which is the harder property to keep
  vacuously true.

None of the above showed a logic bug (inverted condition, off-by-one, dead code, tautological
assertion, or a check registered behind an always-false guard) on inspection.

## Finding 1 — The "Could NOT be run on this machine" list is silently dropped whenever any check fails

**File/line**: `scripts/check.ts`, the report section, lines 5940–5956:

```ts
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.name.padEnd(46)} ${r.detail}`);
}
console.log("");
if (failed.length === 0) {
  console.log(`${results.length} checks passed${FAST ? " (fast — duel simulation skipped)" : ""}.`);
  console.log("Still needs a person:");
  for (const u of UNCHECKABLE) console.log(`  · ${u}`);
  if (SKIPPED.length > 0) {
    console.log("Could NOT be run on this machine:");
    for (const sk of SKIPPED) console.log(`  · ${sk}`);
  }
} else {
  console.log(`${failed.length} of ${results.length} checks FAILED.`);
  process.exitCode = 1;
}
```

**Mechanism**: `SKIPPED` is the array the file's own top-of-file comment (line ~133) singles out as
the fix for exactly this class of problem — *"A gate that quietly passes when it could not run is the
2026-09-03 lesson wearing a different hat, so anything landing here is NAMED in the report instead of
disappearing."* Three checks can push onto it: the Windows path-resolver gate when `pwsh` is absent
(5340), and the two desktop-parity gates when `../debian-desktop` (or `../debian`) is not checked out
beside the repo (5819, 5891). But the `if (SKIPPED.length > 0)` print is nested **inside** the
`failed.length === 0` branch. The moment *any* one of the 77 checks fails — for any reason, on any
machine, unrelated to what was skipped — the `else` branch runs instead, and `SKIPPED` is never
printed, however many entries it holds.

**Concrete impact**: on a machine without `pwsh` and without the desktop sibling repo checked out
(both realistic: a Linux CI runner with no PowerShell, or any checkout of `vessel-main` on its own,
since `../debian-desktop` is a separate repository per the 2026-09-14 split), a broken build produces
output like:

```
FAIL  typecheck                                     ...
ok    the Windows script resolves EVERY path component, not just the leaf  NOT RUN — pwsh absent, ...
ok    the two LOOK_FILES copies agree                NOT RUN — neither ../debian-desktop nor ...
...
1 of 77 checks FAILED.
```

The individual `ok  ... NOT RUN — ...` lines are still visible per-check (good — the per-line loop at
5941 always runs), but the **summary banner** that CLAUDE.md's own review criteria for this file treats
as load-bearing ("named in the report instead of disappearing") is gone precisely when a developer is
staring at a failing suite and most needs a reminder that three of the passing-looking lines above
didn't actually run anything. This is not a false green on any individual check — the per-line `NOT
RUN` text is unaffected — but it *is* the specific "history/framing disappears when it's least
convenient" failure mode this file's introduction was written to prevent, and it silently regresses to
that on every failing run rather than only when everything else is fine.

**Severity**: Low. No check's pass/fail result is wrong; only the summary framing is lost, and only on
runs that are already red.

**Suggested improvement** (not implemented, read-only pass): print the `SKIPPED` block unconditionally
after the per-line loop, or in both branches of the `if`.

## Finding 2 — `checkAsync` has no synchronous-exception safety; `check` does

**File/line**: `scripts/check.ts`, lines 138–175 (the `check`/`checkAsync` definitions).

**Mechanism**: `check` wraps the call in a synchronous `try`/`catch`:

```ts
const check = (name: string, fn: () => string) => {
  try {
    results.push({ name, ok: true, detail: fn() });
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message });
  }
};
```

Any exception `fn()` throws — for any reason, synchronous by construction since `fn` returns `string`
— is caught, recorded as a normal failing result, and the loop over the remaining 76 checks continues
uninterrupted. `checkAsync` does not have the equivalent guarantee:

```ts
const checkAsync = (name: string, fn: () => Promise<string>, timeoutMs = 5_000) => {
  const slot: Result = { name, ok: false, detail: "did not settle" };
  results.push(slot);
  const timeout = new Promise<string>((_, reject) => ...);
  pending.push(
    Promise.race([fn(), timeout]).then(
      (detail) => { slot.ok = true; slot.detail = detail; },
      (error: Error) => { slot.ok = false; slot.detail = error.message; },
    ),
  );
};
```

`fn()` is invoked directly as part of building the `[fn(), timeout]` array literal, **before**
`Promise.race` or `.then` are reached. If `fn` throws *synchronously* — i.e. before it has constructed
and returned a `Promise` — that throw happens on `checkAsync`'s own call stack, outside any `try`, and
propagates straight out of `checkAsync`, out of the top-level module script, and crashes the whole
`node` process. Every check registered after that `checkAsync` call in file order never runs, and
nothing is printed: not a `FAIL` line for the crashed check, not the `ok`/`FAIL` lines for anything
after it, not the final summary, not `UNCHECKABLE`, not `SKIPPED`. This is the exact class of runner
bug the audit brief asks about ("an exception inside one check aborting the whole run") — it just does
not currently trigger, because:

1. JavaScript's `async` keyword guarantees that a throw *inside* an `async function`'s body — even
   before its first `await` — is automatically converted into a rejected `Promise` rather than a
   synchronous throw to the caller. The sole current call site (line 5476) is declared
   `checkAsync("...", async () => { ... })`, so it is safe today.
2. There is exactly one `checkAsync` call in the entire file, so the blast radius of the gap is
   currently zero.

But the type signature `fn: () => Promise<string>` does not *require* `async`, and does not document
the requirement — a future gate written as `checkAsync("x", () => someSyncSetup().then(...))`, where
`someSyncSetup()` can throw before ever returning a promise (a very ordinary shape — e.g. a `readFileSync`
or `execFileSync` call made eagerly before the `.then`), would silently reintroduce exactly this
failure mode, and nothing in the file's structure would catch it in review: it typechecks, and it would
pass on any run where the synchronous part happens not to throw.

**Concrete impact**: if it is ever triggered, the failure mode is worse than a normal `FAIL` line — it
is the *entire suite* not reporting anything past that point, with a raw Node stack trace instead of
the file's own report format, on `predeploy`. That is a harder failure for whoever is running `npm run
deploy` under time pressure to diagnose than a plain failing check, and it defeats the file's stated
purpose ("does the thing it claims to do actually happen" — including "does the harness itself keep
running").

**Severity**: Medium (latent — zero current exposure, but a structural gap in the one piece of the
harness that is supposed to be more resilient than an ordinary check, not less).

**Suggested improvement** (not implemented): wrap `fn()`'s invocation in `checkAsync` in a
`Promise.resolve().then(fn)` (or `try`/catch around the call before entering `Promise.race`) so a
synchronous throw is captured the same way `check`'s is, regardless of whether `fn` remembers to be
`async`.

## Finding 3 — Some navigation/reachability gates verify a specific code idiom by regex rather than the behaviour their names claim

**File/line**: `scripts/check.ts`, `every page is reachable off the desk`, lines 3258–3319, specifically:

```ts
const header = readFileSync("src/components/Header.tsx", "utf8");
const palette = readFileSync("src/components/CommandPalette.tsx", "utf8");

// 1. The palette offers both navs, and with an empty query it lists them all.
must(
  /for \(const entry of \[\.\.\.NAV, \.\.\.FOOTER_NAV\]\)/.test(palette),
  "the palette no longer enumerates NAV + FOOTER_NAV — a page can be unreachable off the desk",
);
must(
  /:\s*commands;/.test(palette),
  "the palette no longer lists everything on an empty query, so it cannot be browsed by touch",
);
```

**Mechanism**: this check's own name ("every page is reachable off the desk") and its assertion
messages ("a page can be unreachable off the desk", "it cannot be browsed by touch") describe a
*behavioural* guarantee — that a visitor with the palette open and an empty search box sees every page.
What is actually tested is that the source file contains the literal substring `for (const entry of
[...NAV, ...FOOTER_NAV])` and, separately, that some ternary or expression elsewhere in the file ends
in the exact token sequence `: commands;`. Neither `CommandPalette` nor `matches`/`commands` is
imported or rendered anywhere in this file; nothing here instantiates the component, opens it, or reads
back what an empty-string query actually returns. (Cross-checked against the live source:
`src/components/CommandPalette.tsx` lines 249–252, `const needle = query.trim().toLowerCase(); const
matches = needle ? commands.filter(...) : commands;` — the regex does match the real, currently-correct
code, so this is not a false failure today.)

The regex is reasonably tightly anchored (it requires the bare identifier `commands` immediately
followed by `;`, which a plausible rewrite like `: commands.slice(0, 20);` would *not* match — so an
accidental behavioural regression here is more likely to produce a loud false-fail than a silent false-
pass), which keeps this at low practical risk. But it is still the textbook shape-vs-behaviour gap
CLAUDE.md names as the standing risk for this whole file: a rewrite that keeps an unreachable/dead
branch containing `... : commands;` while the *live* branch that actually executes on an empty query
returns something narrower (e.g. a rewrite that introduces an early `if (!open) return [];` above the
ternary, or restructures the empty-query case to `matches.length ? matches : someOtherFallback`, while
an unrelated, never-taken branch elsewhere still contains the literal text `: commands;`) would keep
this specific `must()` green while the actual reachability guarantee the check exists to protect had
broken. The same file's own guardrail/station gates (Findings section above, "Verified sound") were
rewritten from exactly this predicate-only shape into wrapper-driving gates after the 2026-08-29
incident recorded in CLAUDE.md; this check was not brought forward the same way for its two source-text
assertions (items 1–2 of the four it makes — items 3 and 4, the band-gating check and the `OFF_NAV`/
`PATHS` completeness check, are genuinely enumerative over real imported data and are sound).

The sibling check `the wordmark and clock pointer routes still fire` (4543) has the same shape for its
tap-threshold assertions — it extracts numeric literals with `header.match(/adminTaps\.current >= (\d+)/)`
and `header.match(/doorTaps\.current >= (\d+)/)` rather than simulating clicks on the rendered header —
though inspection of the current `onMarkTap`/`onLogoTap` implementation (`src/components/Header.tsx`
lines 81–121) did not turn up an actual behavioural bug the shape check is missing today (the counters,
their `setTimeout` resets and the `stopPropagation` guard all read correctly against what the comments
claim).

**Concrete impact**: none currently (both regexes match correct, currently-shipped code, and both are
narrow enough that most plausible rewrites would fail loudly rather than pass silently). The risk is
prospective: a future refactor of `CommandPalette`'s filtering logic that preserves the literal text
`: commands;` somewhere in the file while changing what actually renders on an empty query would ship
with this check green.

**Severity**: Low.

**Suggested improvement** (not implemented): drive `CommandPalette`'s command-list logic directly (it
does not require a full render — the `commands`/`matches` derivation could be extracted and unit-tested
the way `edgeState` and `duelCamera` already are in this file) rather than regex-matching the source for
the two idioms above.

## Finding 4 — "the two LOOK_FILES copies agree": the desktop-repo-absent path is recorded as `ok`, not as skipped, at the level anything downstream of `check()` can see

*(Requested adversarial re-read, 2026-09-14: the check's own author flagged this path as the exact
shape CLAUDE.md warns about and asked for an explicit verdict.)*

**File/line**: `scripts/check.ts`, lines 5804–5842, and the `check`/report machinery at lines 138–144
and 5940–5956.

**Mechanism**: `DESKTOP_REPO_CANDIDATES`/`DESKTOP_REPO`/`desktopCheckedOut` (5804–5808) correctly
resolve the cross-repo path with a two-name fallback (`../debian-desktop`, then the pre-rename
`../debian`), and the check itself is:

```ts
check("the two LOOK_FILES copies agree", () => {
  if (!desktopCheckedOut) {
    SKIPPED.push(`the LOOK_FILES parity check — ${DESKTOP_ABSENT}`);
    return `NOT RUN — ${DESKTOP_ABSENT}, named under 'could not be run' below`;
  }
  const slice = (file: string) => { ... };
  const builder = slice("scripts/plasma-dark-setup.sh");
  const switcher = slice(`${DESKTOP_REPO}/look-switcher.sh`);
  must(builder.length >= 8, ...);
  must(builder.join("\n") === switcher.join("\n"), ...);
  return `${builder.length} files, identical in both repositories`;
});
```

`check(name, fn)` (line 138) is:

```ts
const check = (name: string, fn: () => string) => {
  try {
    results.push({ name, ok: true, detail: fn() });
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message });
  }
};
```

`ok` is set to `true` whenever `fn()` returns *without throwing* — and the desktop-absent branch
returns a plain string, it does not throw. So when `../debian-desktop` is not checked out, **zero
comparison ever runs** (no `slice`, no `must`, no byte of either file is read), and the recorded result
is `{ name: "the two LOOK_FILES copies agree", ok: true, detail: "NOT RUN — neither ../debian-desktop
nor ../debian is checked out beside this repo, named under 'could not be run' below" }`. In the per-line
report loop (5941–5943) this prints as:

```
ok    the two LOOK_FILES copies agree                NOT RUN — neither ../debian-desktop nor ../debian is checked out beside this repo, ...
```

`SKIPPED.push(...)` at the top of the branch is the file's own documented mitigation — the intent is
that this gets named a second time, unmistakably, under "Could NOT be run on this machine" at the very
end of the report. But (a) that only happens when `failed.length === 0` (Finding 1 above — if anything
else in the same run fails, this second mention is suppressed entirely), and (b) even when it does
print, the *first* mention — the one on this check's own line, with an `ok` prefix — is still there and
still reads as a pass to anything that only looks at the `ok `/`FAIL` column. This is true of a human
skimming 77 lines for the word `FAIL`, and it is true of any tooling built on top of this output that
counts "ok" lines or greps for the check's name plus `ok` (a CI dashboard summarising "78/78 ok", a
pre-commit hook that greps for `^FAIL`, a future wrapper script) — none of them see anything other than
a ordinary pass. The word "NOT RUN" is real, present, and honestly worded, but it is sitting in the
*detail* column of a line whose *status* column says the opposite of what happened.

**Concrete impact**: in the ordinary case (`npm run check` run from inside `vessel-main` alone, with no
sibling checkout — which is the default state of a fresh clone of this public repository, since
`../debian-desktop` is a separate, not-yet-created repo for most checkouts) this check contributes
"ok" to the passing count while verifying nothing about LOOK_FILES parity at all. If the two copies of
`LOOK_FILES` (the array `scripts/plasma-dark-setup.sh` builds from and the one `look-switcher.sh` in
the sibling repo restores from) drift on a machine/session that never has the sibling checked out, nothing
here would ever say so — the log would read as 100% green indefinitely. This is exactly the class of bug
this project has already been bitten by twice for unrelated gates (the blocklist-array gate and the
passkey-replay design note, both cited in `CLAUDE.md`): a gate that is "true" for the wrong reason.

**Severity**: Medium. Not a false pass about the *application* — it is a false pass about *test
coverage itself*, on a cross-repo invariant with a real, documented failure mode ("a look saved by one
restores incompletely under the other... you find out by looking at a screen that has no monitor on it
and is usually blanked" — the check's own comment at 5811–5816). The environment this pass ran in
happened to have `../debian-desktop` checked out, so the baseline run (`npm run check:fast`, see Scope)
shows this check doing real work ("8 files, identical in both repositories") — but that is a property
of this one machine's checkout, not of the check.

**Suggested improvement** (not implemented): report a check's status as something other than `ok` when
it explicitly declares itself skipped — e.g. have `check`/the `Result` type carry a third state
(`"skipped"`) distinct from `ok`/`FAIL`, printed with its own prefix (`SKIP` rather than `ok `), so the
per-line status column is never wrong about what happened even before anyone reads the final summary.

## Finding 5 — "the desktop looks are one closed set": the same fallback shape, but genuinely partial rather than total, and the report still can't tell the difference

*(Requested adversarial re-read, 2026-09-14, same author flag as Finding 4 — documented separately
because the two gates are subtly different in how much they actually verify when the sibling repo is
absent.)*

**File/line**: `scripts/check.ts`, lines 5854–5901.

**Mechanism**: this check does **not** early-return at the top the way the LOOK_FILES check does. It
always reads `scripts/plasma-dark-setup.sh` and, unconditionally, runs three real, in-repo assertions
first: that the `case "${LOOK}" in` validator's arms parse to at least 18 accepted look names (5854–5866),
that the `--look must be one of: ...` error message names exactly the same set as the validator
(5868–5876), and that the accent table (`if [ "${ACCENT_SET}" -eq 0 ]...`) never names a look outside
the validator's set (5878–5888). Only *after* all of that does it branch:

```ts
if (!desktopCheckedOut) {
  SKIPPED.push(`the look previews — ${DESKTOP_ABSENT}`);
  return `${accepted.size} looks, ${accented.size} accents agree; previews NOT checked (${DESKTOP_ABSENT})`;
}
const previews = new Set(
  readdirSync(`${DESKTOP_REPO}/previews`)
    .filter((f) => /-\d+\.png$/.test(f))
    .map((f) => f.replace(/-\d+\.png$/, "")),
);
const orphans = [...previews].filter((l) => !accepted.has(l));
```

So when the sibling is absent, this check is genuinely a **partial** pass: three of its four stated
cross-checks (validator/message/accent-table agreement, all three in-repo) really ran and really
proved something, and only the fourth (do the sibling repo's preview screenshots name the same closed
set) is skipped. The returned detail string says so explicitly and in the same breath as the real
result — `"18 looks, 17 accents agree; previews NOT checked (...)"`  — which is materially more honest
than Finding 4's `"NOT RUN — ..."`, because a reader does not have to notice an omission, the sentence
states one.

That said, the **status-column problem is identical to Finding 4's**: this still records as plain `ok`
regardless of whether the previews half ran, so nothing distinguishes "fully verified, all four
sub-checks" from "three of four sub-checks" at the level the `ok`/`FAIL` prefix communicates — the two
states are only distinguishable by reading the detail text, which is exactly the failure mode Finding 1
compounds (the `SKIPPED` line that would otherwise flag it a second time disappears the moment any
other check in the run fails).

**Concrete impact**: lower than Finding 4's, because most of the invariant this check's name promises
("the desktop looks are one closed set") is actually enforced whether or not the sibling is present —
a look added to the validator but not the accent table, or a validator/error-message mismatch, is
caught either way. Only the narrower "and the sibling's preview screenshots exist for exactly this set"
sub-claim silently stops being checked when the sibling is absent, which is a real but smaller gap than
Finding 4's "nothing at all was compared."

**Severity**: Low (the check does most of its job unconditionally; only one of its four sub-assertions
is what goes dark, and it says so in its own returned text — unlike Finding 4 this is a case where the
*information* to notice the gap is right there in the printed line, just not distinguished by status).

**Suggested improvement** (not implemented): same as Finding 4 — a third `Result` status distinct from
`ok`, so a partially-verified check is visually distinct from a fully-verified one without requiring
the reader to parse the detail sentence.

## Finding 6 — "the browsing tab pins the agent key": the pin-writer allow-list is a substring scan and is blind to aliasing

*(Requested adversarial re-read, 2026-09-14: the check's own author already identified this and judged
it an acceptable, proportionate gap; asked for an independent read.)*

**File/line**: `scripts/check.ts`, lines 5702–5720, inside `the browsing tab pins the agent key: first
use pins, a change is refused before signalling`.

**Mechanism**:

```ts
const PIN_WRITERS = ["src/share/browse.ts", "src/components/SharePage.tsx"];
const writers: string[] = [];
const walkSrc = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkSrc(path);
    else if (/\.(ts|tsx)$/.test(entry.name) && readFileSync(path, "utf8").includes("shareStore.savePin("))
      writers.push(path.split("\\").join("/"));
  }
};
walkSrc("src");
const strayWriters = writers.filter((f) => !PIN_WRITERS.includes(f));
must(
  strayWriters.length === 0,
  `${strayWriters.join(", ")} writes an agent-key pin — only ${PIN_WRITERS.join(" and ")} may, and only after the key is proven`,
);
```

This is a raw `String.includes` scan for the eleven-character-plus-paren literal `shareStore.savePin(`
over every `.ts`/`.tsx` file under `src/`. It is a real, if narrow, improvement over doing nothing —
this exact security invariant (a pin may only be written after a key has been cryptographically
verified — see `CLAUDE.md`'s "Pin after verification, never before — a pin on an unverified key pins
the impostor") had a live, shipped bug in `MachinesPage.tsx` before 2026-09-14 (the re-key button wrote
the offered, unverified key straight to the pin store), which is exactly the class of regression this
allow-list exists to catch a second occurrence of.

But the mechanism is a substring match on the literal call expression, and it is straightforwardly
defeated by anything that does not spell the call that way in the offending file, none of which require
malicious intent — an ordinary refactor is enough:

- **A destructured or aliased reference**: `const { savePin } = shareStore;` elsewhere in the file,
  followed by `savePin(machine.id, key)`, contains neither `shareStore.savePin(` nor any string this
  scan looks for.
- **A re-exported wrapper in a third, non-allow-listed file**: `export const pinAgentKey =
  shareStore.savePin;` in, say, `src/share/pins.ts`, followed by every real call site elsewhere calling
  `pinAgentKey(...)`. The wrapper file *does* contain the literal substring (so it would itself be
  flagged as a "stray writer" and the check would fail) — but only for as long as the wrapper is
  written as a direct assignment; `export function pinAgentKey(m, k) { return shareStore["save" + "Pin"](m, k); }`
  or any dynamic-property-access form (`shareStore["savePin"](...)`, `(shareStore as any).savePin(...)`
  with a rebound name) would not.
- **The call passed by reference rather than invoked in place**: `onAccept={shareStore.savePin}` (an
  event-handler prop, or any higher-order function taking the method as a value) contains
  `shareStore.savePin` with no trailing `(` — the very case the security incident this gate exists for
  is exactly this shape of indirection (a UI action deciding to pin, one level removed from the pin
  call itself) — and would not match `.includes("shareStore.savePin(")` at all, in *any* file,
  including the two allow-listed ones, though in practice the allow-listed files are independently
  verified for direct calls via the earlier `indexOf`-based assertions in the same check body, which is
  what keeps the current, real implementation covered.

Cross-referenced against the same file: this is not an isolated technique. The near-identical pattern
appears at line 4338–4353 (`a page's look override reaches the page, and only that page`'s
"stored appearance dials read outside the config layer" scan, `DIALS.test(src)` over an allow-listed
set of directories) and is the same shape of allow-list-by-substring-scan, with the same blind spot
(`const cfg = config; cfg.pal` would not match `/\bconfig\.(pal|...)\b/`). This is a systemic technique
in this checker for "did X leak outside its intended surface" invariants, not a one-off shortcut.

**Independent judgement, as asked**: the author's own call — "acceptable, the realistic regression is
someone copying the obvious line" — is a reasonable *engineering* trade-off given what this file can
and cannot execute (there is no import-graph or type-level "who can reach this exported binding"
analysis available inside a Node script reading `.ts` source as text, short of invoking the TypeScript
compiler API to build a real reference graph, which nothing else in this file does either). It is not,
however, a *complete* enforcement of the stated invariant ("only `browse.ts` and `SharePage.tsx` may
[pin], and only after the key is proven"): the true invariant is about which code paths can reach
`shareStore`'s underlying storage write, and this check verifies a proxy for that (which files contain
one specific spelling of one specific call) rather than the thing itself. Given that this is the exact
security property a prior real regression violated, and that the fix's own gate is what stands between
"caught at edit time" and "caught only by `test:auth` driving a live re-key end to end" (which the
check's own comment says it cannot do here — "the wiring... needs a WebSocket and an RTCPeerConnection,
which this process does not have"), the gap is worth naming rather than waving through, even though it
does not currently correspond to any live bug (both current pin-writers are, in fact, the two literal,
non-aliased call sites the scan expects).

**Severity**: Low–Medium. No live bug — both existing call sites are written in the exact shape the
scan looks for, so today's result (`2 permitted pin writers`) is correct. The risk is entirely
prospective: a plausible, non-malicious refactor (extracting a shared helper, or passing the pin
function as a callback prop, both ordinary React/TS patterns) would silently restore the pre-2026-09-14
gap for a *new* code path while this check keeps reporting exactly the same "2 permitted pin writers,
page holds no pin of its own" it does today.

**Suggested improvement** (not implemented): tighten the scan to also flag any `shareStore` member
access without an immediately-following call (to catch by-reference passing), and/or flag any local
binding whose initialiser is `shareStore.savePin` (to catch the destructure/alias case) — neither
closes the gap completely, but each narrows it, and either is proportionate to what a text-based script
can realistically do without pulling in the TypeScript compiler API.

## Summary

Read in full: the runner/report machinery and all 77 registered checks (66 `check(...)`, 11
`if (!FAST) check(...)`, 1 `checkAsync(...)`). The great majority — essentially the entire duel section
(22 checks), the guardrail/station/grain resolution section, the per-page look-override section, the
QR section, and the two execution-driven filesystem/PowerShell gates — are genuinely behaviour-driven
in the way CLAUDE.md's own standard demands ("drive the function, read what it emits, and check the fix
by breaking it first"), and several explicitly carry the scar tissue of having been rewritten from a
predicate-only shape into a wrapper-driving one after a real production incident. No inverted
conditions, off-by-one errors, self-comparisons, dead code after a `return`, or checks gated behind an
always-false condition were found anywhere in the file.

Six findings, all in the harness's own edges rather than in the well-trodden duel/guardrail core, three
of them (4–6) from an explicit adversarial re-read of the newest gates in the file at the check-author's
own request:

1. **The "Could NOT be run on this machine" (`SKIPPED`) banner is never printed on a failing run** —
   it is nested inside the `failed.length === 0` branch of the final report, so the one piece of
   information the file's own philosophy insists must never silently disappear does exactly that,
   the moment anything else is red (Low).
2. **`checkAsync` has no synchronous-exception safety**, unlike `check` — a future async gate that
   forgets the `async` keyword, or does synchronous work that can throw before its first `await`, would
   crash the entire suite with a raw stack trace instead of a `FAIL` line, silently skipping every
   check registered after it. Zero current exposure (the sole call site is safe), but the gap is
   structural (Medium, latent).
3. **`every page is reachable off the desk`'s two `CommandPalette`-related assertions are regex-on-
   source rather than driven**, despite the check's name and messages describing a behavioural
   guarantee ("reachable", "browsed by touch") — a pattern this file elsewhere fixed for the
   guardrail/station resolvers after a real incident, but did not fix here. The regexes are narrow
   enough that this is low practical risk today (Low).
4. **`the two LOOK_FILES copies agree` is recorded as a plain `ok` when the sibling desktop repo is
   absent, having compared zero bytes of either file** — the `SKIPPED` array is the only place this is
   named as anything other than a pass, and (per Finding 1) that naming disappears whenever anything
   else in the run fails, leaving only an `ok`-prefixed line whose detail text says "NOT RUN" as the
   sole surviving signal (Medium — confirmed via adversarial re-read at the author's request).
5. **`the desktop looks are one closed set` has the identical fallback shape, but is only partially
   dark when the sibling is absent** — three of its four sub-checks (validator/message/accent-table
   agreement) run unconditionally and for real; only the fourth (preview-screenshot parity) is skipped,
   and the returned text says so in the same sentence as the real result, which is materially more
   honest than Finding 4's. The `ok`-vs-partial distinction is still invisible at the status-column
   level (Low — confirmed via adversarial re-read at the author's request).
6. **The agent-key pin-writer allow-list (`the browsing tab pins the agent key`) is a raw substring
   scan for one literal call spelling (`shareStore.savePin(`) and is blind to aliasing** — a
   destructured binding, a re-exported wrapper using dynamic property access, or the function passed by
   reference to a third file would all evade it while the check keeps reporting exactly today's "2
   permitted pin writers." No live bug (both current call sites match the expected shape); the gap is
   prospective, on a security-relevant invariant that has already had one real regression in this exact
   area (Low–Medium — confirmed via adversarial re-read at the author's request; the same
   substring/regex-allow-list technique also appears at line 4338–4353 for a different invariant and
   shares the same blind spot).
