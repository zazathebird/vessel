# Pass 1 — the duel engine

Scope: `src/fx/duel.ts`, `src/fx/fighters.ts`, `src/data/duelSettings.ts`,
`src/data/stations.ts`, `src/components/DuelOrnament.tsx`,
`src/components/DuelBench.tsx`, `src/components/DuelSettingsEditor.tsx`,
`scripts/duel-shot.mjs`, `scripts/duel-bench.mjs`,
`scripts/duel-bench.template.html`. Read in full. `handoff_duel_engine/` not
audited (reference only). Read-only — nothing was fixed.

## Findings

### 1. `scripts/duel-bench.template.html:647` — frame delta floored at 0.2, the exact regression the codebase already found and fixed everywhere else

```js
var elapsed = Math.min(3, Math.max(0.2, (now - last) / (1000 / 60)));
```

Every other duel host floors at 0, with an explicit comment recording why:

- `src/components/DuelOrnament.tsx:355` — `Math.min(3, Math.max(0, (now - last) / (1000 / 60)))`
- `src/components/DuelBench.tsx:189` — same, floor 0
- `src/components/DuelSettingsEditor.tsx:214` — same, floor 0

CLAUDE.md ("Physics and rendering") documents this exact bug class: *"A frame
delta is floored at 0, never above it... The floor was 0.2 and undocumented,
and it reintroduced the very fault the clamp exists to prevent — 0.2 is a
300Hz frame, so a faster display had its real delta rounded up and a 500Hz
panel ran 1.67× fast."* `scripts/check.ts`'s gate ("every frame clamp floors
at zero...") greps exactly four files for this pattern:

```js
const hosts = [
  "src/fx/FxCanvas.tsx",
  "src/components/DuelOrnament.tsx",
  "src/components/DuelBench.tsx",
  "src/components/DuelSettingsEditor.tsx",
];
```

`scripts/duel-bench.template.html` is not in that list, and `grep -n
"duel-bench" scripts/check.ts` returns zero matches — this file has no gate
coverage of any kind. `duel-bench.template.html` is the standalone,
non-headless HTML page `scripts/duel-bench.mjs` builds specifically so the
client can watch the *real* engine at *real* speed on his own machine and
judge tempo ("does the fight read") — the one thing a still image
(`duel-shot.mjs`) cannot answer. On any display faster than 300Hz (the file
`check.ts` itself notes "480 and 540Hz displays ship"), this specific review
tool runs the fight up to ~1.67× too fast, which directly corrupts the one
judgment ("is the pacing right") it exists to support.

**Confirmable from source alone.** Not confirmable by running `npm run
check` — that's the point; the gate cannot see this file. A later pass with
`duel-bench.mjs` running in a real, non-headless browser (or a spoofed high
refresh rate) would demonstrate the fast-forward directly.

**Fix shape** (not applied — read-only pass): change the `0.2` to `0` at
line 647, and add `scripts/duel-bench.template.html` to the gate's `hosts`
array in `scripts/check.ts`. Note the gate as written greps the literal
component files, not generated output, so the template's raw source (not the
bundled `duel-bench.html`) is what a fifth entry should point at.

### 2. `DuelBench.tsx` and `duel-bench.template.html` preview-size presets are stale against the real (2026-08-30) slot widths

`src/components/DuelBench.tsx:48-52`:
```js
const SIZES = [
  { px: 200, label: "phone" },
  { px: 320, label: "desk" },
  { px: 520, label: "large" },
] as const;
```

`scripts/duel-bench.template.html:504-519`:
```js
seg(document.getElementById("sizes"), [200, 360, 700], ...,
  function (v) { return v === 200 ? "phone" : v === 360 ? "desk" : "full"; }, ...);
...
displayPx + "px — roughly the hero slot on " +
  (displayPx === 200 ? "a phone" : "a desktop") + "."
```

Both benches label a 200px box "phone". The real slot, per
`src/styles/chrome.css:1004-1031` and confirmed already-fixed in
`scripts/duel-shot.mjs`'s own comment (`"widened to min(72vw,300) on
2026-08-28... 281 on a 390px phone"`), is **281px on a phone**, and tablet is
`min(52vw,340px)` (292px at 561px width, not the desk-ish 320/360 these
benches use for "desk"). `duel-shot.mjs`'s `scale` mode was explicitly
corrected to use the real `[281, 'phone'], [240, 'tablet'], [340, 'desk']`
triple with a comment explaining exactly this trap — that correction was
never propagated to `DuelBench.tsx` or `duel-bench.template.html`.

This is lower severity than finding 1: it's a labelling/sizing convenience
for a human reviewer, not a simulation error, and `DuelBench.tsx`'s canvas
buffer is still the correct fixed 700×700 (only the CSS display box is
undersized). But `DuelBench.tsx`'s own doc comment claims *"at the size the
hero slot uses, so what is judged here is what visitors get"* — and for the
phone case, what's judged is a box about 30% narrower than what a visitor on
a phone actually gets, which is exactly the kind of gap `NEVER_MEET`'s
"verified by rendering the pair at the real 281px phone slot" methodology
exists to close.

**Confirmable from source alone** (arithmetic on the CSS tokens). No gate
covers it, and none is likely warranted given the target's own docs
(`duel-shot.mjs`) also don't test this, only fix it in one tool.

### 3. Everything else in `duel.ts` checked against its CLAUDE.md description and found consistent with the current code

For each of the following, I read the actual logic (not just the comment)
and confirm the code matches the documented invariant, as of this commit:

- **`advanceDuel`** (`duel.ts:4289`) drops a non-finite delta rather than
  clamping (`Number.isFinite(frames) ? Math.max(0, frames) : 0`), and caps
  the accumulator at 4 (`Math.min(4, ...)`), matching "a stall can never
  teleport a match."
- **`runDirector`** (`duel.ts:3465`) is called from `step()` *below* the
  `hitStop` early return (line 3966, after the `if (st.hitStop > 0) { ...
  return; }` block at line 3942), matching "the director runs BELOW the
  hit-stop early return."
- **Hit-flash decay** (`duel.ts:3997-3998`) happens in `step()`, above the
  fairness coin (`Math.random() < 0.5` at line 4000) and outside
  `stepFighter`, matching the documented fix for the 48.7%-lost-flash bug.
- **Frame-delta flooring** in the three React components is 0, not 0.2 (see
  finding 1 for the one file where this is *not* true).
- **`the-lock` module** (`duel.ts:2340-2364`) starts the lock exactly one
  frame after the block resolves (`lockAt = lands(opener, 0) + 1`), and
  `stepLock` (`duel.ts:3780`) closes separation to `LOCK_SEP` (92 units) via
  a signed proportional correction, not a hardcoded snap.
- **`carryWindow`** (`duel.ts:1119`) derives the tumble/roll window from the
  move's own impulse (`2·vy/g` for a `tumble`, a `log`-based settle time for
  a `roll`), not a typed constant.
- **Carry-branch timing** in `drawFighter`'s crouch branch
  (`duel.ts:4653-4677`) derives its period from `MOVES[f.move].frames`
  (the *current* move's own frame count), not a hardcoded `MOVES.duck.frames`
  — confirmed both `duck` (26 frames) and `sweep_low` (32 frames) each use
  their own count via `f.mf / MOVES[f.move].frames`.
- **`duelFocus`** (`duel.ts:5372`) reports a rising fighter's apex
  (`f.y - vy²/2g` when `vy<0`), not current height, and reports rotated-body
  half-span via `w·|cosθ| + h·|sinθ|` rather than a fixed `BODY_W/2`, with a
  per-costume `headroom`-derived clearance (`Math.max(26,
  FIGHTERS[f.style].headroom + 16)`), matching all the documented fixes.
- **Health-bar placement** (`duel.ts:5332-5343`) uses
  `Math.min(Math.max(34, headroom+8), Math.max(26, headroom+16))` — the
  exact formula CLAUDE.md gives, clamped inside the camera's own frame box.
- **`duelCamera`** (`DuelOrnament.tsx:164`) — asymmetric zoom confirmed
  (`CAM_ZOOM_IN = 0.03`, `CAM_ZOOM_OUT = 0.13`, `0.34` for a death pull-back),
  the arena clamp's "never cut the subject in half" override
  (`DuelOrnament.tsx:267-278`) is present and reads `st.shake.x` into the
  test, and `zoom` (Size) is folded in *before* `duelCamera`'s own fit clamp
  (`want = z>=1 ? min(max(base,base*z), max(base,fit)) : base*z`), never
  multiplied onto the output afterward, in all three call sites
  (`DuelOrnament.tsx:376`, `DuelBench.tsx:137-144`,
  `DuelSettingsEditor.tsx:246`).
- **`DuelState.tuning`** defaults to `DUEL_TUNING` by reference
  (`createDuel`, `duel.ts:385`) and each of the three React hosts assigns
  `st.tuning = <page/site-resolved value>.tuning` per frame
  (`DuelOrnament.tsx:364`, `DuelBench.tsx:113/208`,
  `DuelSettingsEditor.tsx:230`) rather than writing the module global —
  matches the 2026-08-31 fix. `duel-bench.template.html` never assigns
  `st.tuning` at all, but that's consistent with it having no tuning UI (it
  runs at whatever `DUEL_TUNING`'s module default is inside its own isolated
  esbuild bundle, i.e. `{1,1,1,1}`) — not flagged as a bug.
- **`buildSequence`'s signed rest-slack** (`duel.ts:3271-3275`): `slack =
  built.length - end; length = slack > 0 ? round(end + slack*knob(rest)) :
  built.length` — confirmed the floor only applies when slack is positive,
  so `disengage` and `pushed`'s deliberately-negative slack survives
  untouched at every `rest` setting, matching the documented 11-day-bug fix.
- **`chooseSequence`'s zero-weight pool** (`duel.ts:3400-3427`): the
  fallback for `total === 0` is `pick = pool[Math.floor(Math.random() *
  pool.length)]` computed *before* the `if (total > 0)` weighted-pick
  overwrite — i.e. even random selection over the (non-empty) pool, not the
  old `|| TOTAL_WEIGHT` bug. `pool.length` can never be 0 by this point
  (falls through to `MODULES` if empty), so no divide-by-zero/`undefined`
  risk.
- **`applyDuelTuning`** (`duel.ts:3215`) uses `Object.assign(DUEL_TUNING,
  t)` (mutates in place) rather than replacing the object, matching "so
  anything holding the object... keeps seeing live values."
- **`resolveDuel`** (`duelSettings.ts:351-359`) does a two-level partial
  merge (`{...site, ...over, tuning: {...site.tuning, ...over.tuning}}`),
  confirmed it can express "this page changes only Patience."
- **`validDuelPages`** (`duelSettings.ts:288-348`) walks `Object.keys(given)`
  (own enumerable keys of the *input*, not `full`) and checks `own(full,
  key)` / `own(full.tuning, key)` via `Object.prototype.hasOwnProperty.call`
  — confirmed neither loop uses `key in x`, so the `constructor`/`__proto__`
  prototype-pollution class is closed at both levels (site-object level and
  per-page level). Also confirmed it drops (rather than keeps-at-default) a
  refused key via `sameSetting`'s identity-with-input test.
- **`allowFor`** (`duelSettings.ts:370-378`) — a restriction that would empty
  a side falls back to `all` (the whole roster for that pool), never to an
  empty array; confirmed by the `kept.length > 0 ? kept : all` line.
- **`rollPairing`** (`fighters.ts:2388-2430`) re-rolls (never filters) on a
  `NEVER_MEET` hit, bounded at 8 attempts, and rolls the *side* placement
  independently (`rng() < 0.5 ? [g,e] : [e,g]`) — matches "the only thing
  telling you who is who is the costume."
- **`NEVER_MEET`** (`fighters.ts:2356-2360`) has exactly the three
  documented pairs (`gunslinger↔ringmaster`, `sentinel↔executioner`,
  `executioner↔viking`); `forbidden()` checks both orderings.
- **`ROSTER_GOOD`/`ROSTER_EVIL`** (`fighters.ts:2262-2267`) are filtered live
  from `FIGHTERS[].side`, not hand-listed; `DUEL_POOLS.duel` and
  `.duelholy` both point at the same two derived arrays (both pools are the
  whole roster, matching the 2026-08-27 decision).
- **Roster size / blade colours**: exactly 24 `FighterStyle` entries, 12
  with `side: "good"` / 12 `"evil"`; `BLADE_COLORS` gives all 12 evil
  fighters the single surviving red `#ff3b30` (the 2026-08-31 unification)
  and the good side a mix of `#3d9bff` / `#37d67a`.
- **`headroom`**: all 24 `FighterKind` entries declare one (grepped
  `headroom:` — 24 matches outside the interface declaration). Spot-checked
  the four values CLAUDE.md cites by name — gladiator `34`
  (`fighters.ts:1130`), witch `31` (`fighters.ts:1541`), anubis `30`
  (`fighters.ts:2093`), ringmaster `30` (`fighters.ts:2175`) — all match
  exactly, including the file's own comment restating them at
  `fighters.ts:2090-2091`.
- **`Stance`** (`fighters.ts:284-298`, consumed at `duel.ts:4801-4803` and
  `duel.ts:5029-5061`) only ever feeds `hipY` (via `settle`) and the two
  `footFor()` foot positions (via `spread`/`heel`) — no stance field reaches
  the shoulder line, the blade grip, or anything `bladeLocal`/`bladeGap`
  depend on. Matches "moves the hips and the feet only."
- **No real names**: scanned every `label` string in `FIGHTERS` (`"The
  Hermit"`, `"The Apprentice"`, `"The Mask"`, `"The Devil"`, `"The
  Gladiator"`, `"The Witch"`, `"The Anubis"`, `"The Ringmaster"`, etc.) — all
  are generic archetype/folklore labels, none is a specific copyrighted
  character name.
- **`DUEL_BANDS.rim` upper default** (`duelSettings.ts:118` / `duel.ts:716`)
  — both `DEFAULT_DUEL_SETTINGS.rim` and `duel.ts`'s `DEFAULT_RIM` are `1.7`,
  matching the comment's claim that they're kept in sync by hand (a gate
  would need to exist to guarantee this stays true, but it's correct today).

## Not confirmable from source alone — flagged for a bench/shot pass

- **Finding 1's actual on-screen effect** (does the fight visibly run fast
  on a high-refresh display) needs `scripts/duel-bench.mjs` opened in a
  browser reporting >300Hz, or a monkeypatched `performance.now()`/rAF timer
  in that page, to observe directly rather than infer from the arithmetic.
- Whether the `NEVER_MEET` pairs are still sufficient (any *new* look-alike
  pair introduced since 2026-08-30) is a visual-costume judgment, explicitly
  out of scope for this pass (data-level review only) and covered by the
  `duel-costumes` skill / a contact-sheet pass instead.
- I did not attempt to re-run `npm run check`'s 360,000-frame / 280,000-
  sequence simulation myself; I verified the *logic* the gate is described
  as protecting matches the code, not that the gate currently passes.

## Not in scope, noted only

- `src/data/ornaments.ts`, `src/data/catalog.ts`, `src/data/guardrails.ts`
  carry the `operatorOnly`/`hidden`/`roam`-exclusion machinery for the duel
  ornament and are cross-referenced by `stations.ts`
  (`ROAM_EXCLUDES`/`effectiveStation`), but belong to the per-page-appearance
  slice, not this one — not audited here beyond confirming `stations.ts`
  itself (read in full, clean; see above).
