# Pass 2 — FX effects/canvas/perf and the setup scripts

Scope reviewed in full: `src/fx/FxCanvas.tsx`, `src/fx/effects.ts` (all sixteen non-duel
background effects plus the `duelling()` wrapper and `drawFx`), `src/fx/perf.ts`,
`src/fx/motion.ts`, `scripts/windows-share-setup.ps1`, `scripts/macos-share-setup.sh`,
`scripts/linux-share-setup.sh`, `scripts/setup-bundle.sh`. Skimmed `src/data/catalog.ts`
(`FX`/`PICKABLE_FX`/`ROLLABLE_FX`/`hidden`/`operatorOnly`) only far enough to confirm
pass 1's config-architecture pass already covers it in depth — not re-audited beyond a
grep-level sanity check, since duplicating that pass adds nothing. Read `.audit/pass1-*.md`
first as a style/rigor template and to avoid re-filing what those four passes already found;
none of them touch this pass's files.

Where source-only reading left a question answerable by actually running code, I ran it
rather than trusting the comment, per this codebase's own "a gate that reads the source is
testing the source's shape, not its behaviour" doctrine:

- Built `scripts/setup-bundle.sh` into a scratch directory (twice, to exercise its
  allowlist-delete guard against a real non-marked directory) — confirmed the BOM/CRLF
  assertions pass against the current `windows-share-setup.ps1`/`launch.bat`, the checksums
  are genuinely SHA-256 over the shipped bytes, and the delete-guard refuses a real directory
  that lacks its marker file.
- Ran `windows-share-setup.ps1`'s parser (`[Parser]::ParseFile`) to confirm it is syntactically
  valid PowerShell, and, after dot-sourcing the file's function definitions (with the trailing
  `Main` invocation stripped) under `pwsh` on Linux: exercised `ConvertTo-JsonString` against an
  emoji + variation selector + zero-width space (confirmed no `\b`-style mis-escape, i.e. the
  2026 fix for the `switch`-on-code-point bug is actually in the shipped file, not just
  described); exercised the `-BrowserProfile` regex against injection-shaped strings
  (`--no-sandbox`, a value carrying a backtick/quote) and confirmed all are rejected before
  ever reaching `Register-LoginTask`'s argument string; and reproduced the documented
  `Set-StrictMode -Version 2.0` / single-element-array-unwrap trap directly (an unwrapped
  `if/else` scalarises a one-element array and `.Count` throws; the shipped `@(if (...) {...}
  else {...})` does not). `bash -n` on both Unix scripts and `setup-bundle.sh`: clean.
  `Test-ShareableFolder`'s per-component junction walk could not be meaningfully exercised
  under `pwsh` on Linux — it splits on `\`, which does not occur in a POSIX path, so a
  same-platform test only proves the split is a no-op on Linux, not that it works on Windows.
  Read closely instead (see "Verified correct").

## Verified correct

- **The adaptive-resolution tier system** (`FxCanvas.tsx`): buffer sizing (`fit()`) uses
  `min(devicePixelRatio, MAX_DPR, MAX_EDGE/max(w,h)) * quality.current`, matching the documented
  ceiling reasoning; the per-frame `ctx.setTransform(scale,0,0,scale,0,0)` is applied
  unconditionally before every effect runs (confirmed it is not skipped on any path, so a missed
  `ctx.restore()` inside an effect cannot mirror the site permanently — this is what makes
  `rain`'s `ctx.scale(-1,1)` safe); the frame-delta clamp is `Math.min(3, Math.max(0, ...))` —
  floor 0, not 0.2, matching the fix pass 1's duel review found already applied to the three
  duel hosts (`FxCanvas.tsx` is the fourth host in that same class of bug, and it is clean here
  too); sampling is gated on `drewLast && frameMs > 4 && frameMs < 200` and only accumulated
  after the draw, so a hidden tab, first paint, or a calm frame cannot pollute the window;
  demotion needs only 20 samples (~1/3s) while promotion needs 150 plus a 300-frame settle,
  matching the documented asymmetry; `mayPromote` is a one-shot per session and is cleared by
  *any* demotion, and `ceiling` is only tightened when the demotion follows a promotion within
  900 frames — both match the "measured beats guessed, once" design; the promotion headroom
  test scales `work` by `(TIERS[tier-1]/TIERS[tier])**2` (the correct area-scaling factor for a
  resolution change) against a fixed 16.7ms budget rather than against the achieved `avg`,
  matching the documented "backwards, most permissive when it should be strictest" fix.
- **`quality` reaching only the two draw-call-bound effects** — `rain` (`size =
  round(RAIN_CELL/quality)`) and `plasma` (`cell = round(.../quality)`) are the only two effects
  in `EFFECTS` that read `quality` at all (grepped); every other effect ignores it, matching "a
  particle field really is fill-bound and the buffer change is the whole fix."
- **Particle-field reseed discipline** (`field()`): the guard tests *both* the 35%-relative-area
  change and the 35%-relative-aspect change independently (not folded into one test), which is
  what makes a same-area device rotation (390×844 → 844×390) trigger a rebuild even though the
  product is identical — traced this by hand against the documented phone-rotation failure mode
  and it holds. `bokehSorted` is compared against `cache.partsBox` by object identity (not a
  value comparison), which is what makes a resize re-sort while a steady state does not (`field()`
  only ever replaces `partsBox` with a new object on an actual rebuild).
- **Every effect that caches geometry re-validates it against the current box, not only
  `vessels`** (the one CLAUDE.md names): `vessels`' tree cache checks `cache.tree.w !== w ||
  cache.tree.h !== h` and rebuilds (preserving the `pool` and `t0` so the tree re-fits rather
  than regrowing or drifting); `rain`'s column cache checks `cache.rain.columns !== columns ||
  cache.rain.rows !== rows`, and since both are derived from `w`/`h`/`size` (and `size` itself
  depends on `quality`), a quality-tier change alone correctly invalidates it too, not just a
  resize; `scan`'s `scanSphere` cache checks `sphere.w !== w || sphere.h !== h || sphere.key !==
  key` where `key` embeds `dScale`, so a tier change (which moves `dScale` without moving `w`/`h`)
  also invalidates it correctly; `plasma`'s ramp/bucket cache is keyed only on the three accent
  colours and the grid itself is fully recomputed every frame (nothing geometric survives between
  frames to go stale). `flow`'s particle cache (`cache.flow`) is built once and *never*
  revalidated against the box at all — but its stored fields are normalised (`u` 0–1 along the
  lane, a lane index, an offset) and every pixel position is computed fresh from the *current*
  `w`/`h` at draw time (`laneY(x, l)` uses the live `w`/`h` closure), so there is no absolute
  coordinate to go stale and no resize bug results. This is the one effect besides `vessels` that
  needed checking for the class of bug CLAUDE.md names, and it is clean by construction rather
  than by an explicit resize check.
- **`--line` never appears as a canvas `fillStyle`/`strokeStyle` in any of the sixteen background
  effects.** Grepped every `.line` occurrence that isn't `lineWidth`/`lineCap`/`lineJoin`/
  `lineTo`/`beginPath` in `effects.ts`: the only hit is `line: p.line` at the `drawDuel(...)` call
  inside `duelling()` (line ~2141), which is the documented, deliberate exception — the duel's own
  ground hairline, drawn inside `src/fx/duel.ts`, not a background effect reading `--line` for
  something that needs to be seen. `pressure`, `tunnel`, `telemetry` and `orbits` — the four
  effects CLAUDE.md specifically names as having had this bug — all now read `p.faint` at every
  site checked (outer pressure rings, tunnel wall, telemetry channel colours/baselines, orbit
  rings), confirmed by reading each, not just the comments beside them.
- **Telemetry's five lanes are genuinely five different waveform shapes**, not five frequencies of
  one shape: `TEL_KIND = ["sine","step","noisy","ramp","pulse"]` and `telSample()`'s switch
  implements materially different math per kind (quantised sample-and-hold for `step`; signal +
  index-hashed grain for `noisy`; a bare sawtooth for `ramp`; a duty-cycle square wave for
  `pulse`; the two-term sine remains only the `default`/`sine` case). Confirmed `telHash(n)` is
  keyed on the sample index `n` (`x`, the pixel column, passed through from the draw loop), never
  on `Math.random()` or on time — so the noisy lane's grain is static per x-position and only the
  playhead sweeping past it changes what's shown, matching "the trace must hold still between
  sweeps." Confirmed the phase functions used by `ramp`/`pulse` (`telPhase`) implement a genuine
  positive modulo (`f < 0 ? f + 1 : f` after `% 1`), and separately confirmed `scan`'s beam-contact
  timing uses `((ang - bang) % REV + REV) % REV` — real positive modulo, not the naive `%` — at
  the one other place in this file a wrapped phase feeds a threshold test.
- **`FxId`/`FxEntry` wire-format-vs-menu split** (`src/data/catalog.ts`, cross-checked against
  pass 1's config-architecture findings, which cover this file in depth and found it clean):
  `PICKABLE_FX = FX.filter(e => !e.hidden)`, `ROLLABLE_FX = PICKABLE_FX.filter(id !== "off")`,
  and the operator-only duel entries carry both `hidden`/`operatorOnly` for the documented,
  independent reasons. Not re-derived beyond this grep-level confirmation since pass 1 already
  traced it field by field.
- **`perf.ts`'s probe has both a genuine untimed warm-up round and a genuine pixel read-back, and
  they are in the right order relative to the timed rounds.** `round()` is called once (line 131)
  and `ctx.getImageData(0,0,1,1)` immediately after it (line 132), *before* `started =
  performance.now()` — so the allocation/first-upload cost is paid and discarded before timing
  starts. The two timed rounds (`ROUNDS = 2`) run inside the timed window, and a second
  `getImageData` read (line 140) sits *after* the loop and *before* `perRound` is computed —
  forcing the queued canvas work to actually complete rather than measuring enqueue time. Both
  pieces the brief asked to verify are present and correctly ordered.
- **Setup scripts: the blocklists are genuine bash arrays in the current file content**, not
  space-delimited strings — confirmed by reading the literal `BLOCK_EXACT=( ... )` /
  `BLOCK_PREFIX=( ... )` array syntax in both `macos-share-setup.sh` and `linux-share-setup.sh`,
  and confirmed every consumption site (`for bad in "${BLOCK_EXACT[@]}"`, `for bf in
  "${BLOCK_PREFIX[@]}"`) is properly quoted/array-expanded rather than word-split. No `$BLOCK_*`
  (unquoted scalar) reference exists anywhere in either file.
- **Canonicalisation happens before comparison, and happens twice on Windows** (before AND after
  the reparse walk) — read `Test-ShareableFolder` end to end: the drive-root refusal at
  `$full.Length -le 3` appears both before the walk (catching `C:\` typed directly) and after it
  (catching a junction whose *target* is a drive root, e.g. `D:`), matching the documented
  two-check design. The walk itself resolves **every** path component including the leaf (the
  `for ($i = 1; $i -lt $parts.Count; $i++)` loop's upper bound is the last index, not
  `$parts.Count - 1`), restarts from the drive root after each substitution (bounded at 32
  rounds), and fails closed (`Get-Item -ErrorAction Stop` inside the enclosing `try`, so an
  unreadable ancestor is refused, not skipped). Traced by hand rather than executed (see the
  method note above for why `pwsh` on Linux can't exercise the backslash-splitting logic
  meaningfully) and found internally consistent with the documented Windows junction chains
  (`Documents and Settings → Users`, etc.).
- **The app-data-root prefix blocking is present as prefixes, not only as the named vendor
  subdirectories**, on all three platforms: Windows' `$blockPrefix` includes
  `$env:LOCALAPPDATA`/`$env:APPDATA` themselves alongside the named vendors; macOS's
  `BLOCK_PREFIX` includes `$HOME/Library` whole; Linux's includes `$HOME/.local`,
  `$HOME/.config`, `$HOME/.cache` whole, with the vendor-specific entries (`.thunderbird`, `.var`,
  `.docker`, etc.) present underneath as the audit-trail comments describe rather than as the only
  barrier.
- **`choose_folders` is defined in every script that calls it.** Confirmed present in both
  `macos-share-setup.sh` (`osascript`-based, matching the "not run on a Mac yet" caveat CLAUDE.md
  already carries — I could not resolve that caveat from a Linux sandbox with no macOS/GUI
  available, so it stands) and `linux-share-setup.sh` (`zenity`-based, pre-existing). The Windows
  script uses a differently-named `Select-FoldersInteractively`, called from the one place it's
  used; no dangling reference anywhere.
- **stdout/stderr channel discipline** — grepped both Unix scripts for any `printf`/`echo` to
  stdout inside `choose_folders`, `note`/`good`/`warn`/`fail`/`step`: every human-facing helper
  writes to `>&2`, and the only unredirected `printf`s in either file are the final path list
  (`choose_folders`'s own `printf '%s\n' ...` return value), the setup code itself, and `--help`'s
  `sed` dump — matching "stdout carries exactly three things."
- **`-BrowserProfile`'s charset check runs before the value is ever interpolated into the
  scheduled-task argument string** — the regex check is the first thing `Main` does (right after
  `Assert-Windows`), and `Register-LoginTask` (which does the interpolation) is called much later,
  from the `-KeepRunning` branch. Verified by execution (see method note) that the regex rejects
  a quote/backtick-bearing value and an option-shaped value (`--no-sandbox`) alike.
- **`setup-bundle.sh`'s delete guard is a real allowlist, not a denylist**, and its BOM/CRLF
  assertions are `assert-never-repair`, matching the doc: ran the script twice against the same
  output directory (second run succeeds because of the marker file) and once against a real,
  unmarked directory with content in it (refused, content left untouched) — all as documented.

## Finding 1 — `perf.ts`'s own comment claims the probe "can only ever start things two tiers down"; the code's thresholds allow three

**File/line**: `src/fx/perf.ts:29` (`TIERS`), `:147` (the claim), `:159-162` (the thresholds).

**Mechanism**:

```ts
export const TIERS = [1, 0.8, 0.62, 0.5, 0.38, 0.28];   // line 29
...
 * **The probe can only ever start things two tiers down.**                  // line 147
...
    if (perRound < 1.6) return TIERS[0];   // best — 0 tiers down
    if (perRound < 3.2) return TIERS[1];   // 1 tier down
    if (perRound < 6) return TIERS[2];     // 2 tiers down
    return TIERS[3];                       // 3 tiers down
```

`probeTier()` has four possible outcomes, landing on `TIERS[0]`, `TIERS[1]`, `TIERS[2]`, or, in
the `else` branch, `TIERS[3]`. The worst case the function can return is `TIERS[3]` (0.5), which
is **three** steps down from the best tier `TIERS[0]` (1), not two. The paragraph this sits inside
goes on to reason about the consequence of this exact number — "the cost of it guessing too low is
a persistently soft canvas that takes several seconds to climb back" — and the same "two tiers
down" phrase is repeated verbatim in `CLAUDE.md`'s "Implementation traps" section as a load-bearing
fact about the probe's worst case, which is exactly the kind of claim that file says a future
reader could plausibly "fix" the surrounding reasoning around rather than re-derive from the
thresholds.

This is not a runtime bug — `TIERS[3]` is a valid, in-bounds tier and `FxCanvas`'s continuous
adaptive sampler will promote away from it exactly as it would from `TIERS[2]`, just doing 40%
more work per promotion step (0.62/0.5 vs 0.8/0.62 — a smaller relative jump means one more
promotion attempt could be needed before the tier's own one-shot-per-session `mayPromote` budget
is spent, per the "the probe deserves exactly one chance to be wrong" design in `FxCanvas.tsx`).

**Concrete impact**: A machine or browser context that happens to be software-rendering at probe
time (an automation host, a machine mid-wake, per the file's own examples) can be started at
`TIERS[3]` (0.5× resolution) rather than the `TIERS[2]` (0.62×) the design narrative believes is
the floor. Since `mayPromote` only ever attempts a single promotion per session and clears
permanently on any real demotion, a session that starts at `TIERS[3]` and is in fact capable of
`TIERS[0]` needs the continuous sampler's slow climb (150 samples + 300-frame settle per step, one
step at a time) to recover three tiers instead of two, with the same single-attempt ceiling logic
applying at each step. The effect is a modestly slower worst-case recovery than the design
narrative accounts for, not a stuck or incorrect tier — but the comment's number, which
`CLAUDE.md` also states as fact, does not match the code it is describing.

**Severity**: Low (documentation/comment-vs-code mismatch; no incorrect rendering or stuck state
results, only a slightly understated worst case in the design rationale).

**Suggested check** (not implemented, per instructions): a unit test asserting
`probeTier()`'s codomain is `{TIERS[0], TIERS[1], TIERS[2]}` (i.e., actually enforcing "two tiers
down") would fail against the current thresholds and force either the comment or the `< 6`/`else`
branch to be corrected to match the other.

## Finding 2 — macOS/Linux setup-code label truncation counts Unicode codepoints, not UTF-16 units, so a label with many non-BMP characters can silently exceed the decoder's stated limit despite passing the script's own 40-character check

**File/line**: `scripts/macos-share-setup.sh:656` and `scripts/linux-share-setup.sh:581`
(identical line in both): `label="${label:0:40}"`. The adjacent comment (present verbatim in both
files) reads:

```sh
# Bash substring, not `cut -c`: GNU cut counts BYTES and can sever a UTF-8
# pair mid-character, while BSD cut counts characters and can exceed the
# decoder's 40 UTF-16 units on astral characters. This is identical on both
# platforms and on bash 3.2.
```

**Mechanism**: Bash's `${var:0:N}` substring operator counts *Unicode codepoints* under a UTF-8
locale (confirmed by execution — see method note), which is one unit per codepoint regardless of
plane. The comment explicitly names the risk this creates — "can exceed the decoder's 40 UTF-16
units on astral characters" — but the fix actually applied only makes the codepoint-counting
behaviour consistent between GNU and BSD userlands (the alternative rejected, `cut -c`, differs
between the two); it does not address the astral-character overflow the same comment names. A
"astral" (non-BMP) character — most emoji outside the original set, many CJK Extension B+
ideographs, mathematical alphanumeric symbols — is one codepoint but encodes as **two** UTF-16
code units in a JavaScript/TypeScript string's `.length`, which is presumably what the site's
decoder measures (the comment's own "40 UTF-16 units" phrasing implies this; the decoder itself is
outside this pass's file list and was not independently read to confirm the exact limit).

Verified empirically (see method note above): a label consisting of 25 emoji characters (all
outside the Basic Multilingual Plane) is **25 codepoints** — under the 40-codepoint bash limit, so
`${label:0:40}` does not truncate it at all — but measures as **50 UTF-16 units** when encoded the
way a JS engine would count `.length`. Any label with more than 20 non-BMP characters reproduces
this regardless of whether truncation actually engages.

By contrast, the **Windows** script's equivalent check (`if ($label.Length -gt 40) {
$label.Substring(0, 40) }`) is not subject to this: .NET's `string.Length` already counts UTF-16
code units, so the Windows path enforces the same unit the (presumed) decoder measures, while the
two POSIX scripts enforce a different, looser unit for exactly the character class the comment
names.

**Concrete impact**: A customer sharing a folder they have personally named with a run of emoji
(not a contrived scenario — people do this) gets a setup code whose `l` (label) field, per
`CLAUDE.md`'s stated decoder doctrine ("`decodeSetupCode` refuses; it never repairs" / "duplicate
labels are refused" / labels are checked for length among other things), may be refused outright
by the website's decoder despite the *script* reporting success and printing/copying a code that
looks well-formed. Per the refuse-never-repair design, this is not a partial failure the customer
can work around from the checklist — the whole code fails to decode, and per `CLAUDE.md`'s own
observed failure mode for this class of bug ("They would find out while away from that machine"),
the customer discovers this only when pasting the code into the website, with no diagnostic from
the script that produced it.

**Severity**: Low (narrow trigger — requires a folder name with more astral-plane characters than
is common — but concretely reachable, silent from the script's own output, and the comment beside
the code shows the author was aware of exactly this shape of problem without the applied fix
actually closing it).

**Suggested check** (not implemented): a script-level assertion (or the `check.ts`-style
"drive the actual function" doctrine applied to a small Node/bash harness) that encodes a label
with a deliberately astral-heavy string, runs it through the shipped `json_string`/truncation
logic, and asserts the resulting label's UTF-16 length is `<= 40` — this would fail against the
current `${label:0:40}` and demonstrate the gap the comment already names but does not close.
Alternatively, truncating by iterating codepoints and summing `1 + (codepoint > 0xFFFF ? 1 : 0)`
against the 40 budget (mirroring what `.NET`/JS actually count) would fix it without depending on
`cut`.

## Not independently verified

- **Whether the site's decoder (`decodeSetupCode`, not in this pass's file list) actually enforces
  a 40-UTF-16-unit label cap**, and what its refusal behaviour looks like for an over-length label
  specifically. Finding 2 relies on the setup scripts' own comment for this claim rather than
  reading the decoder directly, since it is outside this pass's assigned scope (`src/fx/*` and the
  four setup/bundle scripts). Whoever owns `src/share/*`/the setup-code decoder should confirm the
  exact limit and refusal shape.
- **`Test-ShareableFolder`'s junction-walk correctness on real Windows** — read closely and found
  internally consistent (see "Verified correct"), but not executed, because `pwsh` on Linux uses
  `/`-separated paths and the walk's `-split '\\'` is Windows-path-specific by design; a same-OS
  test only proves the split is inert on this platform, not that it is correct on the one it's
  written for. This mirrors pass 1's own "not confirmable from source alone" caveat for the duel
  bench's real-refresh-rate behaviour — it wants either a Windows host or a monkeypatched
  `[System.IO.Path]` under `pwsh` that fakes backslash semantics.
- **`macos-share-setup.sh`'s `choose_folders`, end to end on a real Mac** — CLAUDE.md already
  flags this as untested since its 2026-09-03 fix; this pass adds nothing new here beyond
  confirming the function now exists and its stdout/stderr split matches the Linux copy's
  structure (there is no macOS environment available to this sandbox to go further).

## Summary

Two confirmed findings, both low severity and neither a live rendering/security bug:

1. `src/fx/perf.ts`'s own comment ("can only ever start things two tiers down"), echoed verbatim
   in `CLAUDE.md`, understates the probe's actual worst case — the thresholds allow landing on
   `TIERS[3]`, three tiers down, not two. Cosmetic to the design narrative; no incorrect behaviour
   results, only a slightly pessimistic recovery-time expectation.
2. The macOS and Linux setup scripts truncate folder-derived labels by Unicode codepoint count
   (`${label:0:40}`), while the decoder they feed is understood (per the scripts' own comment) to
   measure UTF-16 units — so a label containing more than ~20 non-BMP characters (many emoji, some
   CJK Extension ideographs) can silently exceed the real limit and be refused by the website with
   no diagnostic from the script. The Windows script does not have this gap, since `.NET`'s
   `string.Length` already counts the same unit. Verified by direct execution, not just by reading
   the comment that names the risk.

Everything else this pass was asked to re-derive from `CLAUDE.md` — the adaptive-resolution tier
system's promote/demote asymmetry and its measurement basis, particle-field area+aspect reseed
discipline, per-effect resize handling (checked beyond the one example CLAUDE.md names), the
`--line`-never-a-stroke rule across all sixteen effects, telemetry's five genuinely distinct
waveform shapes and its positive-modulo phase math, noise hashed from sample index rather than
`Math.random`, the FX/PICKABLE_FX wire-format-vs-menu split, the perf probe's warm-up round and
pixel read-back and their ordering, the setup scripts' array-based (not string-based) blocklists,
canonicalise-before-compare with the per-component Windows junction walk, app-data-root prefix
blocking, `choose_folders` existing in every script that calls it, stdout/stderr channel
discipline, the `-BrowserProfile` charset gate's ordering relative to its use, the `@()`
array-unroll fix, and the JSON escaper's branch-on-code-point fix — was independently re-derived
from the current source (and, where practical, exercised by execution rather than only read) and
found to match what `CLAUDE.md` claims. No rendering bug, no cache-staleness bug beyond what is
already documented, and no injection/traversal hole was found in either the FX code or the setup
scripts.
