# Decisions

Dated history. `CLAUDE.md` says what is true *now*; this file says what was decided, when, and
why — including the bugs that produced the decisions, because a bug nobody wrote down is a bug
somebody re-introduces.

Newest first. Nothing here is deleted when it is superseded; the superseding entry is added above
it and says so.

`design/SPEC-ACCOUNTS.md` §12 is the *other* decision log, and it stays where it is: it records
what was chosen over what for the accounts design, with a "revisit if" on every rejection. This
file records what happened to the codebase.

---

## 2026-09-02 (night) — per-page appearance, built

The 2026-08-27 agreement ("every dial on all seventeen pages", client) built end to end. The gate
goes **67 → 69**, both new gates break-verified three ways (unmerged seam, App handed the stored
config, validator repairing), and the loop was driven in a real signed-in browser against the
local Worker: an override set on `/about` recoloured it live with the toast saying *"Solarpunk, on
about only"*, home stayed on the site's palette, the override survived navigation both ways,
published as `{"about":{"pal":5}}`, cold-loaded through the injected head in the right colour with
no bleed, and *clear — follow the site* put it back and republished clean.

The decisions, recorded in `CLAUDE.md`'s new *Per-page appearance* section: `lookPages` is
`duelPages` for the look (sparse, partial, refused-not-repaired); `applyLook` is the one seam and
`look` on the context is the one answer, with a source-scan gate keeping components off `config`'s
appearance dials; the panel's "this page" scope is the page behind the drawer, because the live
preview *is* the page; a pinned ornament beats the per-load roll; share codes stay a picture of
the look and carry none of it; `MAX_CONFIG_BYTES` 8,000 → 12,000 for the second growing key.

Two things worth knowing that are not invariants: the randomiser keeps rolling the *base* under a
pinned dial (pinning is the point — the operator sees the override note in the panel, not a broken
roll), and the eleven-dial list deliberately excludes `calm`/`sound` (the visitor's), `mode`/
`scope` (the site's behaviour) and the duel (it has its own map).

## 2026-09-02 (later) — three phase-S hardening items, closed

TODO 2026-08-27 items 2, 5 and 6, none needing the client. The gate goes **66 → 67**.

- **Both encoding requirements were live regressions when checked**: the repo `.ps1` had **no BOM**
  and `launch.bat` carried two em dashes over **LF-only** endings — exactly the mojibake-at-the-
  customer failures the TODO predicted. Fixed (BOM added; the `.bat` is ASCII + CRLF, the em
  dashes now plain hyphens), `setup-bundle.sh` refuses to bundle on any of the three faults, and a
  new check-suite gate catches them at *edit* time, where `check:fast` runs, rather than on the
  rare day somebody publishes. Bundle refusals and the gate both break-verified.
- **`--undo` restores the sleep setting and removes `setup-code.txt`** in both shell scripts. The
  pre-setup value is recorded on the *first* change only (a re-run must not overwrite the real
  value with our own), lives outside `$SHARE_ROOT` (undo empties that), and is restored on undo —
  macOS re-asks for the password and keeps the saved value for a retry if refused, and a value
  that is not a plain number is refused rather than handed to `pmset`. Linux undo exercised end to
  end in a scratch root: link gone, target untouched, code file gone, setting restored.
- **The shell `json_string` strips control characters** instead of escaping them — the decoder
  refuses a label carrying one either way, so escaping only moved the refusal to the paste box,
  after the links were made. The PowerShell escaper deliberately still escapes: Win32 forbids
  control characters in file and computer names, so its branch is unreachable there, and the
  check suite greps that script's exact template.

## 2026-09-02 — the guardrail notice judged by eye, and two small closures

`TODO` items 3 and 4 from the 2026-08-31 list. The gate stays at **66 green**.

**The notice was driven signed in, in all three states** — untripped ("Guardrails — 0 / Nothing
tripped."), tripped with both row kinds at once (Peat + grain resolving, Ledger + Plasma warning),
and in calm. A fresh local operator (`guardop`, local D1 only) was minted for it, since `duelop`'s
TOTP secret was never kept — the fixture script is rerunnable under `OP_HANDLE` for exactly this.
The verdict: the ordering (warning above Publish), the "Warnings, not refusals" preamble, the
count in the heading and the resolved rows' coda all read as designed and ship as they are. Two
observations, one change:

- **The resolved marker was `·` and is `✓`.** A middot opening a paragraph reads as stray
  punctuation; a check mark says "already handled", which is the row's whole message. It stays
  `--muted` and `aria-hidden` — the coda sentence carries the meaning for a screen reader.
- **The ▲ on Peat is quiet, and that is Peat's recorded weakness, not the component's** — danger
  text on Peat measures 4.25:1, one of the three palettes CLAUDE.md already names as failing on
  danger. The marker is `var(--a3)` by construction (inline style), so it is as loud as the
  palette allows.
- Confirmed live while there: grain chip on + Peat leaves the wrapper without `has-grain` —
  `effectiveGrain` holding in a real browser, not only in the gate.

**`CostumeCtx.lean` and `.speed` are deleted** — the documented three-file edit (`fighters.ts`,
`duel.ts`, `check.ts`). The useful finding: `speed` was dead only *as a field*. The local in
`drawFighter` drives the stride swing (`footX += sin(ph) · 13 · speed`), and deleting it with the
field failed typecheck **and** the health-bar gate ("speed is not defined") — the gate catching a
careless delete within a minute of it happening, which is the discipline working as sold. The
local stays, with a comment saying why it survived its field.

## 2026-08-31 — the rest of the defect list

The 2026-08-30 pass fixed what was reported *and reproduced*; this one clears what the three
audits found and nobody had acted on. **The gate went 62 → 66.** Every new gate was
break-verified, and two of them were rewritten because the first version proved nothing.

### `DUEL_TUNING`'s premise was false, and it had a symptom

The note on `applyDuelTuning` argued the knobs could stay a module global because they "cannot vary
within a page anyway". **`/admin` renders three duels at once** — the hero ornament, the bench, and
the settings editor's preview — and the editor's entire job is previewing *a different page's*
settings than the one it is standing on. So the tuning does vary within a page, the last host to run
its effect decided the pacing for all three, and **selecting a page target and dragging Circling,
Rest, Impact or Patience changed nothing on the one canvas built to judge them.** That is the surface
the client is meant to settle those four numbers on.

`DuelState.tuning` carries it per fight now, defaulting **to the `DUEL_TUNING` object by reference**,
so `applyDuelTuning`, `duel-shot --tune` and every gate that assigns into the global keep working
untouched. `buildSequence` takes it as a third parameter; `chooseSequence` hands it `st.tuning`. The
threading the old note rejected turned out to be four call sites, and the reason to pay for it is
that the premise it was avoiding is not true.

### A 0.2 frame floor made fast displays run a fast world

Every host clamps its delta with `Math.min(3, Math.max(0.2, …))`. The `min` is explained by the
comment beside it — *"without this, refresh rate silently doubles the speed of the rain and every
particle field"*. **The floor was undocumented and reintroduced exactly that at the other end**: 0.2
is a 300Hz frame, so on anything faster the real delta was rounded *up*, and a 500Hz panel ran the
world **1.67× fast**. 480 and 540Hz displays ship. It is the same class as the client's reported
*"they speed up at like x50 speed"*, from the opposite direction.

Nothing needed a floor: `advanceDuel` accumulates fractional frames and every effect integrates
`t += dt`, so a small delta is a small step and two callbacks in the same millisecond correctly move
nothing. Measured after: 6,000 tenths advance the world 599 frames against 600 whole frames' 600 —
one frame of binary rounding, against the doubling a floor produced. Floored at 0 in all four hosts.

### A pinned pairing was never checked for alignment

`pin` bypasses `rollPairing`, so it is the one route into the engine that `ROSTER_GOOD` /
`ROSTER_EVIL` do not guard — and nothing checked it. A published `["ronin", "sentinel"]` was accepted
and pinned **good against good**: both blades come out blue or green, which the alignment carve-out
cannot express; the fairness coin means nothing because a viewer cannot tell which side is which; and
`duel: a pooled fight rotates its fighters` asserts it never happens. Refused whole, like every other
field here — swapping one fighter for a legal opponent would be the repair this file exists not to
do. Gated over all 576 orderings: 144 cross-side kept, 288 same-side refused.

### `circling: 0` picked deterministically

The low end of a published slider means "never pick a module that contains no blow". If the pool ever
consists only of blowless modules, every weight is `weight * 0` and the total is 0 — and the fallback
was `|| TOTAL_WEIGHT`, the sum over the **whole** module list, which no filtered pool can subtract its
way through. So the loop never broke and the pick was `pool[0]` every time: not a crash, a silently
fixed choice at the one setting whose purpose is to change what comes up. A zero-weight pool is
picked from evenly now.

**The corner is not reachable through the director today** and the gate says so instead of pretending
otherwise: it needs `circling: 0` *and* a pool whose every survivor is blowless, and the anti-stall
rail filters to `hits` first. A behavioural test of it could only ever pass, which is not a test, so
that half is asserted at the source and the reasoning is in the gate.

### Smaller, and all of them the same kind of thing

- **`buildSequence` dropped `b.quick`** when deriving the last move's end, overstating a quick beat by
  its own windup — the one thing `quick` exists to remove. No module is affected today (0 of 700,000
  builds has a quick beat as its last-ending one), so it is gated from a module built inside the gate:
  a check that can only pass is not a check.
- **`DEFAULT_DUEL_SETTINGS` is frozen.** `DEFAULT_CONFIG.duel` hands out that exact object and
  `persistence.ts`'s no-published-config branch spreads it shallowly, so it is what every
  un-published visitor's config points at. Nothing mutates it today; frozen, the day something does
  is a `TypeError` on the line that does it rather than one visitor's edit silently becoming every
  later visitor's default.
- **`DuelState.prev` was written by the background effect and read by nothing.** Its declaration
  claimed it was "kept for the background effect's delta", and the delta is `dt`, handed in. It was
  left behind by the fix that stopped the duel deriving its own timestep from the effect clock —
  a stale second copy of a number the fight no longer runs on.
- **The published-key gate asked about two keys.** It looked up `duel` and `duelPages` by name, which
  is a gate for whatever field was being added the day it was written; every key added since was
  ungated by the same reasoning. The two lists are compared whole now, in both directions.
  `MAX_CONFIG_BYTES` is gated too — that it is 8,000, that it throws, and that nothing truncates to
  it.
- **The director's clock advances before it dispatches**, so beats at `at: 0` and `at: 1` fire on the
  same frame. Unreachable today and left alone deliberately: moving the increment would shift every
  beat in the pool by one against the move table, re-basing 280,000 sequences of gated arithmetic to
  buy an offset nothing uses. Written down instead, with the instruction to use `at: 2`, and with the
  real contact mapping (`lands(move, at) - 1`) recorded for the first time — the suite asserts it in
  beat space, where the offset does not exist.

### Two gates that passed while the fix was reverted, again

Worth recording that this keeps happening and what the tell is. The `circling: 0` half first asserted
that many modules still get picked, which is true whether or not the corner is fixed — it was
measuring the general case and calling it the corner. The quick-beat half first built a module that
rolled *short*, which takes the negative-slack path and never consults `ends` at all, so both cases
returned the same number for a reason that had nothing to do with the fix. **Both were caught by
breaking the fix and watching nothing happen**, which is the only reason to do it.

---

## 2026-08-30 — the fights, gone over end to end

The brief was *"make sure that the fights are done"*, with a standing instruction to look for
bugs and graphical faults rather than to build anything. What came back was eleven defects, four
of which were **a control that appears to work while the thing it names does not move** — the
most expensive shape a bug can have here, because nothing throws, nothing logs, and the person
who finds out is the client looking at his own site.

The gate went **52 → 62**. Every new gate was verified by breaking the fix and watching it fail;
two of them were rewritten because the first version did *not* fail, which is recorded below
because it is the more useful half.

### The environment could not run its own tooling, and that is why some of this was never found

`node_modules` had **three empty native-binary directories** — `@cloudflare/workerd-linux-64`,
`wrangler`'s nested `@esbuild/linux-x64`, and the top-level `@esbuild/linux-x64`. So
`npm run dev:worker` could not start, `npm run build` could not run, and therefore **no operator
surface had ever been driven in a browser here**: `/admin` needs a session, a session needs the
Worker, and the Worker needs `workerd`. `npm run check` never noticed because it runs under
`tsx`/esbuild's JS API rather than the binary. Restored by fetching the three tarballs directly.
`TODO.md` item 1 had been open since 2026-08-28 saying *"nobody has clicked it"*; this is why.

### `rest: 1` was not arithmetic identity, and had not been since the knobs landed

`CLAUDE.md`: *"Every default is 1 and 1 must stay arithmetic identity."* It is the rule that lets
360,000 stepped frames and 280,000 generated sequences keep passing with a publishable multiplier
in front of them. Three of the four knobs held.

`buildSequence` clamped the slack at zero and floored the result at the last move's end:

    const slack = Math.max(0, built.length - end);
    const length = Math.max(end, Math.round(end + slack * knob(DUEL_TUNING.rest, 0, 4)));

which reproduces `built.length` only when `built.length >= end`. **Four modules deliberately roll
a length shorter than their last move's own end.** `disengage` rolls
`ends("circle", away) - r.i(10, 26)` because its trailing circle is a drift and nobody can see a
drift end early; `pushed` does the same at `- r.i(2, 14)`. Measured over 20,000 builds each, the
floor added back a mean of **18.07 and 8.04 frames** — the subtraction *entirely* undone, on
**100%** of builds. `swept-down` lost 23.5% of its rolls, `held-and-struck` 1.3%. Across the pool,
**6.4% of every build** got a length its module never asked for.

The slack is signed now. Positive slack is rest and scales; **negative slack is a deliberate cut
and is not rest at all**, so it survives at every setting. Measured after: 700,000 builds, **zero**
differences at `rest: 1`; at `rest: 0`, 63,622 of 70,000 shortened and every one still contains its
own last move.

### The health bar was drawn through the costumes, and had been drawn outside the frame for six of them

The bar sat at a flat `f.y - 34`. It is four units tall, so it occupies `[y-34, y-30]`, and **four
costumes reach into that band**: the gladiator's crest at 34, the witch's hat at 31, the anubis's
ears and the ringmaster's stovepipe at 30. Rendered at the real 281px phone slot and the 340px desk
slot, the red bar is drawn *through* the top hat's crown — where it stops reading as a readout at
all and becomes a band on the hat — and across the prophet's halo.

`duelFocus` had solved exactly this for the camera on 2026-08-19 (*"clearance is per costume,
because the costumes are not the same height"*) and the bar was never told. Worse, the older half:
the camera frames to `max(26, headroom + 16)`, so a flat 34 was **already outside the frame for
every costume below 18 of headroom** — the hermit and the executioner at 17, the apprentice, the
golem and the viking at 16 — by one to two units on a bar four units tall. Nobody had looked,
because the camera gate asserts about bodies and `duelFocus` has never been told the readout
exists. It is `min(max(34, headroom + 8), max(26, headroom + 16))` now: clear of the costume, and
inside the box the camera is actually fitting.

**The gate for this was written twice, and the first one was worthless.** It restated the formula
from `headroom` and asserted on its own arithmetic; reverting the renderer to the flat 34 left it
green. That is the mistake `DUEL_TABLES`' own comment names — *a checker holding its own copy only
ever confirms its own copy*. It drives `drawDuel` through a recording context now and reads the
rectangle the renderer emits, attributing it to a fighter **arithmetically** rather than by nearest
x: the two cross during a `pass`, and a fighter at the top of a somersault is 80 world units above
the other, so proximity misreads and reports a wild offset against the wrong costume. `BODY_W` is
exported for that attribution, for the same reason `BODY_H` already was.

### Size published to every visitor and moved nothing

`zoom` was declared, banded, validated, published — and multiplied in exactly one place in the
codebase: `DuelSettingsEditor`'s preview canvas, which only the operator sees. `DuelOrnament` drew
at `shot.scale`. So the slider worked where it was dragged and the site ignored it. Same class as
the downloads editor's `price` vs `priceCents`, arriving through a third door.

**Copying the multiplication into the ornament would have been the other half of the bug.** Applied
after the fit, a Size above 1 voids the guarantee `duel: the ornament camera never cuts a fighter
off` exists to prove. The client chose *bounded request* from three options: Size enters
`duelCamera` and is capped at the fit, so a wide pose stops getting bigger rather than losing a
head, and it may always pull out — deliberately under `CAM_MIN`, because that floor exists to stop
the fight shrinking to nothing *by accident* and a Size dragged to 0.6 is not an accident. One
clamp, and all three hosts go through it, so the preview and the page agree by construction.
Measured: 60,000 frames at 0.6/1/1.6, none clipped, 1.6 larger on ~40% of them (the rest is where
the fit binds, which is the knob being bounded rather than the knob being inert).

**That gate was also written twice.** The first drove `duelCamera` directly, so it stayed green
when the ornament stopped passing the argument — the very bug. It reads the three call sites now.
The second version *still* passed, because the regex matched `export function duelCamera(`, whose
own signature carries `zoom = 1`; it is anchored on the assignment.

### A per-page override was not partial to the knob

Reproduced signed in, which is the only place it was visible: set Patience on `/work`, then move
the site's Circling from 1.00 to 2.50, and `/work` stays at 1.00 — while the editor's own summary
says *"work sets 1 of its own: tuning"*.

`DuelPageSettings` was `Partial<DuelSettings>`, whose `tuning` is the whole four-knob object, so
the editor could not express "this page disagrees about Patience" and wrote all four at their
resolved values. That is the *"sixteen of them would silently go stale"* failure the sparse map
exists to prevent, one level down, inside the one field that is itself an object. `DuelOverride`
makes `tuning` partial; the editor writes one knob; the summary names the knob.

The old gate could not see it — it only ever exercised `{ bars: false }`, which is a scalar.

### `validDuelPages` repaired where the file promises it refuses

It validated the whole object and kept every key *present in the input*, taking its value from the
validated result. `validDuelSettings` answers a refusal by leaving the field at the global default,
which is right for the site object and precisely wrong for an override: the refusal became a
**working** override pinned to the default. `{ work: { zoom: 99 } }` became `{ work: { zoom: 1 } }`,
so a site at 1.4 rendered `/work` at 1.0 with nothing reporting anything. `{ work: { good: [] } }`
was worse — an emptying allow-list is refused, and the refusal became an explicit `good: null`
cancelling the site's roster restriction on that page.

A key is dropped now unless what came in survived validation **as itself**, which is what the test
has to be: from outside, a refused field and a field that legitimately equals the default are
indistinguishable. A partly-salvaged list counts as refused — `["ronin", "nonsense"]` is not a
shorter allow-list, it is a list the sender got wrong.

### The operator's own dice could never roll him a duel

`shuffle` and `setMode` both call `roll(config, isOperator)` with stable dependency lists, so both
callbacks are built once — on the first render, where `isOperator` is still false because the
session probe has not settled. The file's own note on `live` explains this for the three roll sites
that read `live.current.isOperator`; these two were missed. It fails *safe*, which is why nothing
reported it, and it means the shuffle button and the mode picker could never hand the operator a
duel from either catalogue — the thing `rollableOrnaments(true)` was built for.

### The crouch ran on another move's clock

`drawFighter` branches on `Move.carry` correctly and then one branch named a move id for its
timing: `MOVES.duck.frames`. Two moves declare `carry: "crouch"` — `duck` at 26 frames and
`sweep_low` at 32 — so the longer one peaked at `mf 13` when its blade only arrives at the low line
at `contact: 16` and holds there through 25, then stood the body fully upright for frames 26–32
with the blade still down.

Gated as the general form rather than as that divisor, because the fault is the shape: any carry
shared by two moves of different lengths has it. The gate found that **`flatten` and `tumble` are
also shared by moves of different lengths**, so the same bug had two more places to appear.

### A match reset is a cut, and five fields were showing through it

`clash` is the one with a symptom: a cooldown of up to 30 frames, so a match ending just after a
blade-on-blade cross opened the next one unable to spark for half a second, and the first exchange
of the new fight was silently the flattest one in it. `hitStop`, `shake`, `sparks` and `scorch` went
with it. `dir.pressure` is deliberately *not* asserted at zero by the new gate: the reset sets it to
0 and `runDirector` runs later in the same `step`, choosing the new match's opening sequence and
counting it, so 1 on the turnover frame is the rail working.

### A non-finite delta killed the fight permanently

`Math.max(0, NaN)` is `NaN`, so one bad frame count makes `st.acc` `NaN` for ever — `Math.floor(NaN)`
is `NaN`, `NaN > 0` is false, `acc -= NaN` keeps it `NaN`. Every later call is a silent no-op and the
fight never restarts short of a remount. The hosts' clamps do not catch it either:
`Math.min(3, Math.max(0.2, NaN))` is also `NaN`, and every host of this engine writes that line
against a `performance.now()` delta. Rare to reach; total, silent and unrecoverable when reached.

### The duel was bigger on a phone than on a tablet

The 2026-08-28 pass widened the duels' phone slot to `min(72vw, 300px)` and left the tablet on the
shared `min(34vw, 240px)`. So the duel rendered **281px on a 390px phone and 240px on a tablet** —
and the tablet band starts at 561px, where 34vw is **190px**, which is exactly the slot that pass
describes as rendering the pair at about 60px and calls below the size the costumes were authored
for. The band between the two fixed bands was the one still showing the fault. Tablet is
`min(52vw, 340px)` now, on the phone rule's own reasoning: no visitor can be shown a duel, so a
wider hero costs only the person who gets the benefit.

Found because `scripts/duel-shot.mjs` was still hard-coding **190** as "phone" — the pre-2026-08-28
number. The tool that exists to answer *"do any two read alike on a phone"* was answering it at two
thirds of the size the client actually sees, which is the direction that quietly invents work. It
renders 281 / 240 / 340 now, and its contact sheet's phone cell went 190 → 300.

### Two fighters read as one, and `NEVER_MEET` was empty

`TODO.md` item 0 — *"do any two read as the same fighter?"* — answered by rendering the roster at
the corrected phone size and then rendering the candidate pairs in a real 281px slot. **The nearest
pair is not the one the TODO predicted.** It guessed executioner/sentinel; the worst is
**gunslinger (good) / ringmaster (evil)**, which are both a brim, a boxy crown and a long coat, and
whose `back` hooks are node-for-node the same path differing by 1–7 units and a hem 7 units higher.
The only real separator is crown height, 10 against 19 units. They are on opposite sides, so they do
get drawn together.

The client chose `NEVER_MEET` over redrawing, which is what the mechanism was built for and what
`fighters.ts` says to do. Three pairs are in it: gunslinger/ringmaster, sentinel/executioner (the
only two cross-side heavies with no cloth at all, both with a single solid rectangle for a head at
22×30 and 25×28), and executioner/viking (the closest cross-side pair by proportion signature,
separated only by the shield).

### The guardrail layer: two rules recorded as closed that never reached the page

`CLAUDE.md` deviation 1 records, as of 2026-08-28, that two of the seventeen guardrails resolve at
render. `resolve()` had **zero callers in `src/`** — only `scripts/check.ts`. `theme.ts` imported
`effectiveStation` alone and built `has-grain` from raw `config.grain`, so **grain rendered on Peat,
Oxide, Terracotta Night and Deco Gold**: a 14% `--fg` overlay across every word on the four
lowest-contrast palettes, reachable by publish, by share code and from stored config. Only the dice
were gated. The gate's own comment asserted it drove the page and then tested the resolver in
isolation.

`matched()` had no caller at all, so of the seventeen rules, fifteen that are meant to *warn* did
not: every rule carries a mandatory, gated `note` that nothing rendered. The panel prints them now,
with the resolved ones marked as already handled and nothing disabled — a rule that is the client's
taste stays his to overrule, and the point is only that he is told.

**`effectiveStation` reads the resolved ornament now** (TODO item 6, which asked for a decision:
*the station follows what is DRAWN, not what is stored*, because a station is where the ornament
is). Both directions were live. Signed in with a stored sonar and station `roam`, the operator's
per-load roll draws a duel about every other load, the resolver was handed `"sonar"` and returned
`roam` — so the duel faded to 12% and re-acquired three times a revolution, which is the pairing
`GUARDRAILS` refuses and which the client originally reported. And in the other direction, a
published `duel` + `roam` resolves to sonar for a signed-out visitor while the resolver still saw
`"duel"` and emitted `hold`, so the operator published Roam and every visitor got Hold.


## 2026-08-29 — the orbits were missing from Orbits, and `--line` has now been the bug three times

Taken on the client's *"your call"* after the telemetry rebuild, on the last effect the measurements
still put at the bottom.

**The reported problem was composition and the real one was a token.** `orbits` was noted as using
about 30% of the canvas. It does better than that — the seventh ring already reached roughly three
quarters of the frame's width — and the thing actually wrong was that **the outer four rings were
not being drawn at all**. They were stroked in `--line` at `0.62 - i * 0.06`, so 0.32 alpha and
below, and `--line` is the hairline *border* token at 1.22–1.61:1. That is most of the ellipse area
in the frame, which is why the effect read as dots and arcs floating in space rather than as an
orrery.

The recession is now carried by **alpha alone**, over one token. Asking a colour to be two
brightnesses at once is what hid them: the switch to `--line` on the outer rings was *stating* depth
and *destroying* the shape it was stating it about.

**This is the third instance of the same mistake**, and it is worth naming as a class rather than as
three bugs: the sonar's channel colours (2026-08-17), `telemetry`'s lane baselines (earlier today)
and these rings. The accessibility notes have said since the beginning that `--line` is not a
contrast-bearing colour; what was missing is that on canvas it does not read as *faint*, it reads as
**absent**. `CLAUDE.md` carries it as a rule now, and a sweep of `src/fx/effects.ts` found no fourth
instance — the one remaining canvas use is the duel's ground line, which is a hairline on purpose.

Two composition changes went with it, both modest: the tilt 0.34 → 0.42, because at 0.34 the system
was squashed into a band across the upper half and left the bottom third of a full-bleed background
empty; and the base radius 0.062 → 0.070, because a background should fill the frame it is the
background of. Neither goes near face-on, which would lose the depth the near/far body ordering is
built on.

Measured on Xerox: peak **14 → 17**, coverage 1.8% → 2.9%; on Nebula it reaches 24. It stays quiet
deliberately — it sits behind body copy — and the fix was never about loudness. It was that the
orbits were missing.

`npm run check` is **52 green**, unchanged: a rendering change, and visibility cannot be gated.

---

## 2026-08-29 — the sine-band family, and what actually separates three effects

The 2026-08-28 entry left `flow`, `telemetry` and `aurora` as three effects doing one job — three
sets of horizontal wavy lines, told apart mainly by which one had a playhead — and `TODO.md` filed it
as a design question rather than a bug. The client said to go ahead and fix it.

### Frequency is not character

`telemetry` was never badly built. The trace is written by a travelling playhead rather than
scrolling on its own; there is a hard discontinuity at the head with the previous sweep still
standing ahead of it; a phosphor-decay gradient runs back along the lane; there is tick furniture and
a per-lane baseline. None of that was the problem.

**The problem was that all five lanes carried the same two-term sine at five different frequencies.**
A scope showing five smooth sines is not showing five things, it is showing one thing five times —
and a smooth wave is exactly what `flow` and `aurora` already are, which is what kept the three of
them in a family.

**The fix is shape, not brightness.** Each lane now carries a different signal *character*, which is
what actually distinguishes one channel of a real instrument from the next and what a decorative wave
never has:

- analogue sine, unchanged;
- **sample-and-hold steps**, quantised in *both* axes, which no smooth wave can imitate;
- **a noisy sensor** — signal plus grain;
- **a sawtooth with a hard reset**, the one shape that is obviously not symmetric, so it reads at a
  glance even small;
- **a pulse train**, its duty cycle drifting on a slow sine so it is not a metronome.

No other effect on the site has a square wave or a staircase. Verified by capture on Xerox: the three
now read as three different things — `flow` is a current carrying particles, `aurora` is a glow
field, `telemetry` is an instrument panel.

### Two rules that came out of building it

- **Noise in a trace is hashed from the sample index, never `Math.random`.** Random per frame makes
  the lane *boil* — every pixel resamples every frame — which undoes the one thing the playhead
  exists for, namely that the trace holds still between sweeps and changes only as the head rewrites
  it. This is the same rule the duel costumes already record for `spray`'s wobble.
- **A phase used as `x % 1` needs a positive modulo.** `%` keeps the sign of its left operand, and
  telemetry's trace time is genuinely negative for the first few seconds of a page load: `t` starts
  at zero and each sample subtracts up to one whole playhead period. A negative phase sent the
  sawtooth to −3 and inverted the pulse — both lanes overshooting their own amplitude — and then
  quietly corrected itself about eight seconds in. **That is the kind of fault nobody reproduces,
  because by the time you look at it, it has stopped happening.** Caught by reasoning about the sign,
  then verified by rendering at frame 20, where the overshoot would have shown and does not.

### It was also too dim, and that is a separate fix

The standing sweep was `1A` (26/255) under a `globalAlpha` of 0.62, so the trace body sat at **0.063
alpha** and only the writing head was ever visible. **The gradient's *shape* is unchanged** — full
brightness at the writing edge, a hard drop immediately ahead of it — because that shape is the
entire visual signature of an oscilloscope. Only the levels moved: body `1A` → `40`, the band ahead
of the head `22` → `4D`, `globalAlpha` 0.62 → 0.82.

Two pieces of furniture were below the floor they were meant to establish, and got the same treatment
the *channel* colours had already had on 2026-08-17:

- **the ticks**, 0.16 → 0.34 — at 0.16 they read as dirt rather than as a scale;
- **the lane baselines moved from `--line` to `--faint`.** `--line` is the hairline border token and
  measures about 1.2:1, so a zero line drawn in it at 0.4 alpha was a rule nobody could see — and a
  scope with no zero lines is five squiggles.

Measured on Xerox: peak **16 → 23**, coverage **1.7% → 4.3%**. **`telemetry` is no longer the weakest
effect in the set**, which retires that line in the entry below.

`npm run check` is **52 green**, unchanged — this is a rendering change and visibility cannot be
gated, for the reason the entry below records: there is no rasteriser, so the numbers above are the
baseline to compare against and not an assertion.

---

## 2026-08-28 — the mobile menu, and four visual fixes

### The report was not the bug: *"the downloads page isnt showing in the menu in mobile"*

Asked whether he wanted Downloads added to the header nav, or whether the real complaint was that the
footer links are hard to find on a phone, he confirmed **the latter**.

**Measured, not guessed.** On a 390×844 phone the header nav is a horizontal scroller showing about
four and a half of its seven pills, and `.v-footer` sits at **y = 2873 in an 844px viewport** — the
five `FOOTER_NAV` pages (Now, Changelog, Setup, Scams, Downloads) and the permanent sign-in link are
all roughly 2,000px below the fold. **The chrome itself is correct**: `.v-chrome` is 844px, the
document does not scroll, and `.v-stage` scrolls internally at scrollHeight 2861. The footer is
simply the last thing inside the scrolling stage.

**The fix is one word.** The palette chip shown on non-desk bands said `cmd` — the thing a developer
types, which tells a visitor on a phone nothing. It says **`menu`** now. The palette was already the
answer: it offers `[...NAV, ...FOOTER_NAV]` and lists every entry on an empty query, so Downloads has
always been one tap and a scroll away. What was missing was any reason to tap.

**Renaming beat adding a pill, and that is the load-bearing part.** `NAV` is what
`useOperatorRoutes` cycles with the arrow keys and what Radial's orbit renders, so an eighth pill
changes paging and the dial for everybody — and it would land sixth or later in a scroller that
already hides its tail, which is the problem rather than a fix.

Verified in a browser at 390×844: the chip reads `menu`, tapping it opens the palette, and the list
contains "go — Downloads".

**The new gate is *"every page is reachable off the desk"***, and it asserts the things that must
hold together and are each invisible alone: that the palette enumerates both navs; that it still
lists everything on an empty query, so it can be browsed by touch rather than typed at; that the chip
is band-gated to non-desk; that the chip says `menu`; and that every page in `PATHS` is offered by
one of the two navs except a named `OFF_NAV` list (`notfound`, `signup`, `signin`, `admin`,
`machines`, `share` — each unlinked by an existing decision). **Verified by breaking it twice** —
reverting the chip to `cmd`, and removing Downloads from `FOOTER_NAV`.

### Plasma and Pressure were near-invisible, and this cannot be gated

A capture pass over all sixteen effects on three palettes, scored on peak brightness (99th-percentile
channel distance from the palette's background) and coverage.

- **Plasma** — ramp ceiling `* 0.32` → `* 0.62`. It topped out at 0.21 alpha, very nearly a flat
  black rectangle on Xerox, while being the second most expensive effect in the set. Peak **22 → 42**,
  coverage **50% → 65%**, now level with Matrix rain. **The floor stays at 0.35** — below it no dot is
  drawn at all, which is what keeps its cost down — so only the ceiling moved. It is deliberately
  still short of the loud effects, because it sits behind body copy.
- **Pressure** — alpha `* 0.3` → `* 0.52`, and the thin rings 0.9px → 1.4px, **because a sub-pixel
  line is antialiased into a fraction of the alpha it asked for and so loses twice over**. Peak
  **16 → 27**, coverage **3.2% → 5.7%**.

**This cannot be gated, and that is the part worth recording.** `npm run check` has no rasteriser —
its effect coverage is a recording-context stub — so *"is this effect actually visible"* is measured
offline with `scripts/fx-shot.mjs` and a peak/coverage script, never asserted. **The numbers above
are the baseline to compare against**, and they are written down here because there is nowhere else
they can live.

### A reported finding that measurement contradicted — and the first metric contradicted the measurement

Bokeh and Constellation were reported weak on Xerox by eye. They are not. **Bokeh peaks at 54 over a
third of the frame**, and **Constellation lights only 0.4% of the frame but hits 51 where it does** —
it is sparse, not dim, and sparse is a design choice rather than a defect.

**Choosing the metric was the harder half.** The first one tried — mean channel distance over the
whole frame — ranked Constellation *last*, precisely because it conflates "a large area slightly
different from the background" with "a small area very bright". It took peak-plus-coverage to see it.
**Telemetry, at peak 16, is now the weakest effect in the set.**

### `duelholy` is withdrawn as an effect too

`hidden: true` on the FX entry — the same collapse that took the matching *ornament* on 2026-08-27,
arriving a day late. `DUEL_POOLS` hands both entries `ROSTER_GOOD`/`ROSTER_EVIL` verbatim, so they
draw from an identical distribution and produce byte-identical frames under a seeded RNG. **Never
deleted**: index 13 is a share-code wire format, and a code naming it still resolves.

**It tripped the previous day's own gate**, which asserted the operator could roll every
`operatorOnly` effect — false, because `hidden` removes an entry from the dice for everybody,
operator included. **That gate had already made the identical wrong assumption about the ornament
half a day earlier** (recorded in the entry below as its own first bug). It now derives the rollable
set as `operatorOnly && !hidden` in both catalogues.

### Two phone-size fixes

- **Sonar's contact blips** — floor `max(5px, 2.2%)` → `max(7px, 2.2%)`. At the phone's ~172px slot
  the percentage yields 3.8px, so **the floor is the entire small-screen behaviour**. At 5px the blips
  were the one part of the sonar that did not survive a phone: the smallest thing on the scope, lit
  only for the moment the beam crosses their bearing. 7px binds only below a 318px slot, so desk and
  Radial are untouched by construction.
- **The duels get a wider phone slot, and only the duels** — `min(72vw, 300px)` against every other
  ornament's 44vw, taking the pair from ~60px to a measured **281px slot (~98px figures)**. **The
  camera could not do this**: `duelCamera` already frames as tightly as it safely can, and its own
  note records that at this size `CAM_MIN` is what clips a fallen fighter, so zooming crops rather
  than enlarges. Widening the slot for every ornament would push the phone headline and primary CTA
  down **to fix an ornament no visitor can see**, the duels being operator-only — so the cost lands
  only on the person who gets the benefit. The rule carries `:not(.layout-radial)`, by the convention
  every station rule follows.

`npm run check` is **52 green**, up from 51.

---

## 2026-08-28 — the duels become operator-only, and roll fresh for the operator

**The client's words, and they are the decision:** *"lets make it so that the lightsaber duels are
off by default, until unlocked by me. and once i log in, they are random. lets keep it as a feature
for just me unless i otherwise say so."* Asked to disambiguate *random*, he chose **random ornament
and random fighters**; asked how far *the duels* reached, he chose **the full-screen background
effects as well as the hero ornament**. Every duel, not just the small one.

### The lock

A new `operatorOnly` flag on both catalogues — `src/data/ornaments.ts` (`duel`, `duelholy`) and
`FxEntry` in `src/data/catalog.ts` (`duel` at index 12, `duelholy` at 13).

**It is a different axis from `hidden`, and both duels now carry both flags for unrelated reasons.**
`hidden` is about *the picker*: `duelholy` was withdrawn from every menu on 2026-08-27 when both
duels started drawing from the whole roster and the two entries became the same fight.
`operatorOnly` is about *the page*. Read them as picker versus page; neither implies the other.

**Enforced where the thing is drawn, never at the storage end.** A published config or a share code
naming a duel still resolves to a duel; it simply renders as `DEFAULT_ORNAMENT` or the new
`FALLBACK_FX` (`vessels`) for anybody who is not signed in. Enforcing at storage would mean the
operator's published config silently rewriting itself — he would lose the setting by viewing his own
site logged out, which is the one thing he does constantly.

Four helpers carry it: `visibleOrnament(id, isOperator)`, `visibleFx(id, isOperator)`,
`rollableOrnaments(isOperator)` and `rollableFx(isOperator)`.

**`roll()` in `src/config/randomiser.ts` gained an `isOperator` parameter defaulting to `false`, and
the default is the point.** A caller that has not thought about who is looking gets the pool that is
safe to show anybody. There are four ways a config arrives — published, share code, storage, dice —
and the dice are the route nobody checks: before this, `ROLLABLE_ORNAMENTS` and `ROLLABLE_FX` had no
gate on them at all.

Resolution happens **once, in `ConfigContext`**, which now exposes `ornament` and `fx` beside the
existing adapted `layout` — the same precedent, for the same reason. `Ornament.tsx` and
`FxCanvas.tsx` read those, not `config`.

### The operator's per-load roll

Signed in, the hero ornament rolls fresh on every page load from the operator's own pool. Signed
out, it is whatever was published.

- **It is component state, never a patch to `config`.** A roll written into config is a roll that
  gets published the next time he presses Publish for an unrelated reason, and the dice would
  quietly become the site. Same doctrine as the adapted layout: what he stored is what he stored.
- **It cannot live in the existing mount-only boot roll**, because `isOperator` is false until the
  session probe settles — a roll placed there would always see a signed-out viewer and never fire.
  It is keyed on `isOperator` instead, which also makes it re-roll on sign-in rather than only on
  reload.
- **The pick happens outside the state updater.** `Math.random` is impure and StrictMode
  double-invokes updaters; `shuffle` and `setMode` already record this rule.
- **It yields the moment he picks an ornament himself** — `update` clears it when the patch carries
  `ornament`. Without that the panel would appear broken to the only person who can use it: he picks
  Sonar, the rolled duel still renders, and nothing on the screen explains why.
- **The operator's pool is the duel and sonar**, which is `ROLLABLE_ORNAMENTS` as it already stood.
  **The four withdrawn circles — lens, valve, aperture, orrery — were deliberately not re-added.**
  He called them lame and had them withdrawn on 2026-08-17, and quietly putting them back into his
  own dice restores rejected work by the back door. If he wants them again that is a decision, not a
  side effect.
- **`visibleFx` carries no roll.** He asked for a random *ornament*; a background effect changing
  under the page on every load is a different request, and it can be asked for.

### The gate

One new one — *"no duel can reach a visitor, by any route"*. It asserts that the operator-only set
is exactly `duel,duelholy` in both catalogues (pinned, so withdrawing the lock is a deliberate
edit); that a visitor's dice pool contains neither and the operator's contains `duel`; that neither
pool is empty; that the render resolvers substitute for a visitor and pass through for the operator;
that every non-locked entry is untouched in both directions; that `DEFAULT_ORNAMENT` and
`FALLBACK_FX` are not themselves locked, or the substitution is a loop; that both catalogue lengths
are unchanged, since the wire format is untouched; and that 4,000 visitor rolls produce no duel.
**Verified by breaking it twice** — making the resolver stop resolving, and making the dice keep the
wide pool. Each failed with the right message.

**The gate's own first bug is worth recording**, because it is the picker/page distinction failing
in the place that exists to hold it: it initially asserted the operator could roll `duelholy`. He
cannot. `duelholy` is `hidden`, and a withdrawn entry is out of the dice for everybody, operator
included.

### Verified in a real browser, not only gated

- **Signed out**, with `ornament: "duel"` and `fx: "duel"` seeded into stored config, four
  combinations were loaded in headless Chrome. Every one rendered `v-ornament is-sonar` and no
  `.v-duelfight` canvas.
- **Signed in** — by temporarily forcing `isOperator` true, then reverting, the revert confirmed
  clean — 14 loads with `ornament: "sonar"` stored gave **8 sonar and 6 duel**, and the stored config
  still read `sonar` afterwards. That is both halves at once: the roll varies, and it never writes to
  config.

### One known edge, and it is not a bug

`theme.ts` feeds `config.ornament` to `effectiveStation`, not the resolved one. So an operator who
publishes a duel with station `roam` gives visitors station `hold` even though what they see is
sonar, which `roam` would have allowed. It errs conservative rather than wrong, and the whole of the
cost is cosmetic. Recorded in `TODO.md` rather than fixed.

`npm run check` is **51 green**, up from 50.

---

## 2026-08-28 — a share code is a picture, not a document, so it does not carry the duel

**Closes the one item the entry below left open**, and closes it the other way from how it was
posed. It went out as *"ask him whether the duel settings should travel in a share code"*; he handed
the call back — *"your call on what to do then if there is a conflict"* — and on inspection it was
never his kind of question. Whether the duel is the same fight for everybody was a product decision
and was his. How a wire format is shaped is not.

**The decision: `Config.duel` and `Config.duelPages` do not appear in a share code, and the type that
would have to carry them stays a `Pick`.**

**A share code is a picture of the look; these are a document.** Every field in a code is an index
into a fixed catalogue or a bit in one integer — seven hyphen-separated base-36 fields, thirteen
characters for a full one. `duelPages` is a sparse map keyed by page, each entry partial, two of its
fields variable-length lists of fighter ids. Fully specified it is about 6.8KB. Base-36'd, that is
not a code anybody pastes; it is an attachment.

**The compromise is the thing to refuse, and that is the whole of the reasoning.** The obvious middle
— encode the site-level settings, drop the per-page map — produces a code that parses cleanly, reads
as complete, and silently omits part of what the sender was looking at. The recipient sees a
different site and nothing tells them why. That is the identical failure `decodeSetupCode` was built
to refuse (*"a half-decoded plan renders as a complete checklist, the person ticks every row, and a
folder they asked to share is silently absent"*), and there is no reason it is acceptable here and
unacceptable there. **Half a picture is worse than no picture, because no picture is obvious.**

**And it buys little.** Site config already distributes these — per page, validated field by field,
with a publish button and a byte ceiling that fails loudly. The only gap a code would close is
carrying *unpublished* duel settings between two of the operator's own browsers.

**What made the decision safe was already true, and is now gated.** `SharedConfig` is a `Pick` and a
decoded code is applied with `update(shared)` — a patch — so pasting a setup keeps whatever duel
settings the operator already had. Nothing announced that; widening the type would have broken it
with nothing to indicate it, and a share code is the worst wire format to get wrong because a wrong
one is a *working* code pointing at the wrong thing. The new gate — *a share code carries the look
and never the duel* — asserts the encoder still emits seven plain base-36 fields, that a decoded code
carries neither key, and that applying one leaves a pinned pairing, the pacing and a page override
intact while still doing its actual job. **Verified by widening `SharedConfig` to include `duel` and
having the decoder return a real value**: it typechecks, and the gate alone fails.

**Reopen only if he asks for a look he can hand somebody that carries the duel with it.** The answer
then is a second format with its own prefix, not a widened first one — the same shape as the setup
code's `VS1.`/`VS2.`, which is a different format and not this one.

50 gates, up from 49.

---

## 2026-08-28 — the duel becomes a published setting, and the rule forbidding it is reversed

**Reverses the `DUEL_TUNING` decision recorded below** (*the duel was being improved by people who
could not watch it*), which stays exactly as written: the four knobs were a bench surface that
afternoon and are a published field by the evening.

**The rule that was reversed, and its reason.** `DUEL_TUNING`'s four pacing multipliers —
`circling`, `rest`, `impact`, `patience` — were deliberately kept out of `Config`: not published,
not in a share code, not persisted, on the reasoning that **"a duel that is a different fight per
visitor is one nobody can review, because no two people are discussing the same fight."** The
operator turned a knob, watched, and typed the winning value in as a constant.

**The client asked for the opposite, and his words are the record.** He asked for a duel
customisation tool covering *"each page, site, and every other possible thing"*. Offered the choice
between operator-only and published to everyone, he declined both as put to him and wrote: **"with
options for everyone also. i want complete options for the duels for everyone n djust for mysef"** —
quoted with its typos, because the quote is the decision. Both halves are honoured: the settings
publish to every visitor, **and** the operator can drive them live without publishing.

**The risk the old rule named has not gone away — it has moved.** It is no longer "nobody agreed to
this fight"; it is "the fight a visitor sees is whatever was published, so a bad value reaches
everyone at once". That is the exposure every other published appearance field already carries, and
it has an answer already in force for them: validation field by field that **refuses rather than
repairs**.

### The shape

`src/data/duelSettings.ts` is new and holds the whole of it — the `DuelSettings` type,
`DEFAULT_DUEL_SETTINGS`, `validDuelSettings`, `validDuelPages`, `resolveDuel`, `allowFor`, and
`DUEL_BANDS`, one table of knob bands so the editor, the validator and the gate cannot disagree
about what a legal value is. `Config` gains two fields: `duel`, the site default, and `duelPages`, a
**sparse map of partial overrides** keyed by page, which `resolveDuel` merges onto the default.

**Partial, not a full copy per page, and that is the load-bearing choice.** Seventeen full copies
means sixteen of them silently going stale the next time the site default moves. A page that says
nothing about `zoom` keeps tracking the default.

Covered: a pinned pairing or a roll from the pool; per-side roster allow-lists; the four pacing
knobs; carve width (`rim`), figure size (`zoom`), health bars and frame kick.

- **A null allow-list means "the whole side" and is not the same as listing all twelve.** A null
  keeps up with the roster; a full list silently stops including anything added after it was
  written, which is precisely how four of the original eight costumes became unreachable.
- **An allow-list that would empty a side is refused** and falls back to the whole side. An ornament
  that draws no fighter is indistinguishable from a broken page.
- **The restriction rides on `DuelState.allow` rather than being passed to the roll.** The re-roll
  happens inside `advanceDuel` at a match boundary, where the caller is a rAF loop that has long
  forgotten its configuration — and a restriction honoured only on the opening match comes back as
  *"it ignores my settings after a minute"*.
- **The four knobs stayed a module-level global** (`applyDuelTuning`) rather than moving onto
  `DuelState`, because they are read from `buildSequence`, which is handed a module and an rng and no
  state at all. One page renders at a time, and both homes of the duel on it want the same answer.
- The resolved settings reach the background effect through a new `duel` field on the `Frame`
  contract. Every other effect ignores it, exactly as they ignore `quality`.

### Two surfaces, deliberately

`DuelSettingsEditor` is the **published** half. `DuelBench` is the **unpublished** half — play, step,
speed, preview size and palette, which are ways of *looking* and are saved nowhere. **The four knobs
moved from the bench to the editor**, because a knob that publishes cannot also be a knob that does
not. There is one publish button for the whole appearance, in the site-config panel, and no second
one on the editor: two publish routes for one config is two things that can disagree about what is
live.

### `MAX_CONFIG_BYTES`, 2,000 → 8,000

The published config is injected into the head of every page. Everything in it before this was
indices, ids and booleans — a couple of hundred bytes — so the old ceiling was theoretical.
`duelPages` is a map, and **the first published key that can grow without anybody editing the file
it lives in.** One fully-specified page override with both twelve-id allow-lists spelled out is
~400 bytes, so seventeen of them is ~6.8KB; that is the pathological case and not the expected one.
A realistic override — a pinned pairing and the four knobs — is ~120 bytes, so seventeen pages is
~2KB. **8,000 covers the realistic case and still refuses the pathological one.**

**It fails loudly and must keep doing so.** Truncating would inject a half-object that `loadConfig`
would then correctly refuse field by field, and the operator would watch his settings silently not
apply with nothing anywhere to explain it. The refusal now names both byte counts and says that a
per-page override is the thing to clear.

### The gate

One new one — *"the duel settings publish, refuse rubbish, and default to a no-op"* — asserting that
every default is arithmetic identity with the shipped engine (all four knobs at 1, `rim` equal to the
engine's `DEFAULT_RIM`); that **both** `PUBLISHED_KEYS` lists carry both keys, the client's and the
Worker's being separate arrays where either one missing a key drops the value silently on publish;
that 14 malformed payloads are all refused; that an override stays partial and does not leak onto
another page; that `allowFor` never empties a side; and that a roster restriction still holds after
six match resets over 200,000 simulated frames. **Verified by breaking it twice** — deleting
`duelPages` from the Worker's list, and widening a partial override into a full copy. Both failed the
gate.

`npm run check` is **49 green**, up from 48.

### What is not done, and it is two things

- **Share codes carry none of this.** A share code is seven hyphen-separated base-36 fields, and a
  per-page map of fighter lists cannot be packed into one without a new wire format — the
  share-code equivalent of a `VS2.` bump. The settings publish through site config instead. **This
  was flagged to the client and is awaiting a decision, not forgotten.**
- **The editor has not been driven in a browser.** It is an operator surface behind a signed-in
  session, which is one of the things `npm run check` says out loud that it cannot verify. Nobody
  has clicked it yet.

---

## 2026-08-28 — the carve, and the roster back down to twenty-four

**Supersedes the entry below it** (*the roster goes to forty*), which stays exactly as written: forty
was built, and this is what happened to it later the same day.

**The fault, and it is not a costume fault.** The roster read flat. Forty archetypes on the contact
sheet were forty *wire diagrams* — every bone a constant-width stroke, the torso two stroked ribcage
edges beside a spine line, and every mark laid over every other mark with nothing between them, so a
helmet did not stop where the skull started and a near leg did not cross in front of a far one. That
is a **renderer** problem, and no number of costumes could fix it — which is what thirty-two of them
had just been spent trying to do.

**Two changes, and the second is the one with a name.**

1. **The body is a mass.** Every bone is a tapered capsule, wide at the root and narrow at the tip,
   two per limb so the elbow and the knee are visible joints. The torso is a shape between the
   shoulders and the hips, and `prop.build` now sets how wide that mass is at chest, waist and hips
   rather than stroking two ribcage edges. Feet are a short capsule each. Draw order is back leg →
   torso → shoulders → neck → head → front leg → off arm → sword arm, **and that order is the depth**.
2. **Every shape carries its own edge — the carve.** Each mark is laid down twice: first in the
   palette's **background role** at a wider line, then in ink. The second tone is a role (`bg`), never
   a literal, so it cross-fades with the 0.9s bleed and holds on all 25 palettes; on the pale ones the
   carve reads as a light gap rather than a dark rim, which is the same information either way.
   `CostumeCtx` gained `paper` and `rim`; `DuelView` gained `paper` (required) and `rim` (optional,
   defaulting to the exported `DEFAULT_RIM = 1.7`). **`rim: 0` switches the carve off and is the
   rollback** — and is the right value for any surface drawing the duel over an image rather than
   over a palette.

`solid()` gained a clipped inner shadow — paper, alpha 0.34× the fill, offset up and left — so a
helmet has a top and an underside. **It is clipped to the mark**, which is what stops it becoming the
2026-08-14 slab. A new `strokeInk()` carves stroked marks the same way. **Two strokes in the file are
deliberately left uncarved**: the prophet's two halo rings, because they are drawn in the blade
colour. They are light, not cloth, and a background-coloured rim around a glow is a hole punched in
the thing that is meant to be glowing.

**Then the roster was cut from forty to twenty-four, twelve a side.** Sixteen kept unchanged, eight
added — The Prophet, The Luchador, The Astronaut, The Gunslinger and The Viking on the good side, The
Pharaoh, The Anubis and The Ringmaster on the evil one — and **twenty-four deleted**. Every deletion
was one of two things: a second copy of a stronger silhouette (three brimmed hats, four blocks for a
head, two capes to the floor), or a costume whose whole read was interior detail — a sash, a bead
loop, a bandage, a bird. **Interior detail is the first thing to go at 61px**, which is the size this
renders at, so on the phone those costumes were never doing the work their descriptions claimed.

The derived counts move with it: **144 pairs per pool and 288 rolled orderings**, against 400 and
1,600 at twenty a side, and a per-fighter appearance rate of **~8.3%** within a side against ~5% at
forty. The pools are still derived from `FIGHTERS[].side` and `NEVER_MEET` is still empty. The
nearest confusable pair on the sheet is **executioner** (flat, soft, square) against **sentinel**
(tall, hard, square) — opposite sides, so they *can* meet, and they are the pair to watch first.

**Headroom, corrected on the new costumes.** Two under-declared their reach (anubis 28→30, luchador
24→26) and four over-declared it and cost camera on every frame (pharaoh 22→18, viking 20→17,
gunslinger 24→21, astronaut 22→20). **Under-declaring is the failure that matters**: `duelFocus`
reserves `headroom + 16`, so a tip gets cropped rather than the camera pulling back. Nothing on the
roster exceeds the 34-unit sideways limit — the viking's shield is the widest at 31.7, and it is a
fixed shape on the off hand rather than something that trails, so it does not grow with travel.

**Cost, measured rather than inferred.** Timed in headless Chrome with `--disable-gpu` (software
rasteriser), at the ornament's real 700×700, 3,000 frames per condition, run twice and averaged:
**0.097 ms/frame with the carve off, 0.172 ms/frame with it on.** A **1.77×** multiplier on the
duel's own draw, and about **1% of a 60fps frame budget**. Software-rasterised, so a real GPU is the
favourable direction.

**Gates.** `npm run check` is 48 green. Two changes in `check.ts`: the recording context gained a
`clip()` stub, because `solid()`'s inner shadow calls it, and the `CostumeCtx` stub now carries
`paper` and the real `DEFAULT_RIM` — so the gate drives the carved path rather than the `rim: 0`
branch. **A new assertion joins *catalogues match the documented counts*: the roster is 24, and the
split is exactly 12/12.** The count has been documented for as long as the roster has existed and was
never asserted, which is how it could have changed with the suite green. **The per-side half is the
one that matters**, because `ROSTER_GOOD` / `ROSTER_EVIL` are derived from `side`, so a costume added
with the wrong alignment silently skews every pairing roll rather than failing. **Verified by
breaking it: flipping the viking to evil failed both this gate and the existing blade-colour gate.**

One fixture moved with the roster. `check.ts`'s fairness gate named `haloed` and now names `maned`,
and `scripts/duel-shot.mjs`'s four `['haloed','horned']` pairings are `['prophet','horned']` — the
prophet carries the halo now, so the *holy* strip keeps its meaning.

**Not verified here, and it is the usual one, plus one that is new.** Whether twenty-four fighters
read *in motion* at phone size in a real browser — `duel-bench` on `/admin` is where that is
answered. And whether the carve holds on the **pale** palettes, `xerox` and `peat`, where it is a
light gap rather than a dark rim. That specific case has not been looked at in a browser.

---

## 2026-08-28 — the roster goes to forty, and three ways a costume fails at 61px

**What was asked for and what was built.** The client asked for twenty fighters a side and for named
characters — Homer, Rick, Shrek, Jason, Freddy. The names stay refused, for the reason recorded in
the entry below this one and in `src/fx/fighters.ts`: it is his own 2026-08-14 rule, and separately
this engine draws a silhouette plus one signature shape and cannot draw the *face* those characters
are recognised by. **The count was met in full**: eight costumes became **forty, twenty a side**, all
archetypes — folklore and the trades, both of which were designed as outlines.

Built in **eight tranches of four**, with the contact sheet read between each, because the only
question that matters about a costume is whether it tells apart *in a row* and that cannot be asked
of one fighter. `scripts/duel-shot.mjs sheet` gained `--only a,b,c` and `--px N` for it.

**Three failures showed up repeatedly, each caught on the sheet and invisible in a single duel.**

1. **Two shapes on one head merge into a third shape neither of them is, unless there is a gap.**
   The plague doctor's beak left the brow, ran under its own brim with nothing between them, and the
   fighter had *no beak at all* — it read as a boater. The falconer's bird faced forward and its beak
   ran at the fighter's own skull: one two-headed silhouette. The valkyrie's two wings sat four units
   apart and composited into a single flap, so the helm read as a cap with an ear. **Every one was
   fixed by moving a shape, and none by making one bigger** — the beak dropped to the jaw, the bird
   turned round, the wings were pulled apart in depth as well as height.
2. **A proportion has to be pushed past what looks right in the source.** The gladiator's crest
   cleared its dome by eight units and read as a bump on a helmet — indistinguishable from The Mask,
   the one fighter it must not resemble. The reaper's skull had a cranium of `r+1` over a jaw of
   `r-4` and read as an egg. At the ~61px the ornament renders on a phone, **two rig units is one
   pixel**; the crest went to seventeen and the pinch to half the cranium's width.
3. **Interior detail is not a costume; the outline is.** The monk had a kesa at cloth alpha and a
   bead loop, obeyed every rule in the file, and on the full contact sheet was the one figure that
   read as an *undressed rig*. What fixed it was a rolled fold of cloth at the shoulder — a mark, so
   the gate allows it solid — that puts a bump on the silhouette where every other fighter has a
   helmet. This is the 2026-08-19 wire-diagram finding arriving at a costume that was doing nothing
   wrong: the fill rule bounds what may be solid and says nothing about where the recognition lives.

**The pools are now derived, not written down.** `ROSTER_GOOD` / `ROSTER_EVIL` filter `FIGHTERS` on
the `side` field the blade-colour carve-out is already checked against. Two hand-written lists that
had to agree with the roster is *precisely* how four of the original eight became unreachable for
every visitor (see 2026-08-27), and at twenty a side that mistake is forty ids to keep in sync.

**Two gates broke on the way, both because they had constants sized for eight.**

- **The pairing-coverage assertion ran a fixed 4,000 rolls**, which covered 32 orderings comfortably
  and 1,600 not at all. It now scales as `good × evil × 40`.
- **And it was seeded by a linear congruential generator.** Even at 32,000 rolls six of the 1,600
  orderings never came up: successive LCG values lie on a lattice, and `rollPairing` draws *three* in
  a row — good fighter, evil fighter, side coin — so whole triples are unreachable. Swapped for
  mulberry32: same one line of arithmetic, same reproducibility, no structure. **This is a gate that
  was quietly weaker than it read for as long as it has existed**; it only failed once the space got
  big enough for the lattice to show.

**A third gate was fixed before it could bite.** `NEVER_MEET` is documented in `CLAUDE.md` as the
mechanism that replaced the old pool split — and the coverage assertion computed `wanted` as
`good × evil × 2` with no allowance for it, so the first person to answer a *"these two look alike"*
report would have got `1598 of 1600 pairings rolled`: a message about coverage, for a deliberate
exclusion, at the exact moment they were not thinking about the harness. It now subtracts the
forbidden pairs, **verified by adding an entry and watching the expected total drop to 1,596.** The
list itself stays empty: no cross-side pair on the finished sheet reads alike enough to spend
variety on.

**Cost.** +22.5KB raw, **+4.3KB gzipped**, for thirty-two costumes. `npm run check` is 48 green and
the duel's 360,000 stepped frames and 280,000 generated sequences are unchanged — costumes are
render-only and touch nothing the simulation reads.

**Not verified here, and it is the usual one:** whether forty fighters *read* in motion, and whether
any two of them are confusable at phone size in a real browser. The sheets say they are distinct at
desk size in a headless render. `duel-bench` on `/admin` is where that question gets answered.

---

## 2026-08-28 — a guardrail that only constrains the dice is not a guardrail

**The fault.** `isAllowed` had exactly two callers: the randomiser and `npm run check`. A roll is
one of four ways a config arrives at the page — the other three are the operator panel's publish, a
pasted share code, and stored config, and all three walked straight past all seventeen rules. This
had already cost nine days of production with `duelholy` + `roam` shipped, the client reporting his
fighters fading, and the suite green throughout, **because the gate asserted the predicate rather
than the page**. That was fixed for one rule on 2026-08-27 (`effectiveStation`). This is the other
sixteen.

**What was decided, and it is a split rather than a blanket.** Enforcing all seventeen at render
was rejected. Fifteen of them are matters of taste the client set down — *"Magazine may not use
Matrix rain"* — and silently substituting a value the operator deliberately chose is its own bad
surprise, in a direction nobody agreed. Worse, for the layout×effect family there is no obvious
answer to *which side yields*: the operator picked both.

So a rule is **resolved at render** when it is an accessibility floor *and* the direction of yield
is obvious, and **surfaced to the operator** otherwise. Two qualify:

- `effectiveStation` — the station yields, never the ornament (2026-08-27).
- `effectiveGrain` — the grain yields, never the palette. Grain is a 14% `mix-blend-mode: overlay`
  sheet of `--fg` across the entire page including body copy, on the four palettes with the least
  room for it. The palette is the look — it is what the 0.9s bleed exists for and what every token
  derives from — and grain is already the first thing calm drops. Substituting the palette to keep
  the texture would throw away the thing being defended to satisfy the rule defending it.

The other fifteen gained a **required `note`**, so the panel can print what is being overruled. The
operator may still publish them; what he could not do before is do it *knowingly*.

**Three smaller things fell out of it.** The grain rule moved from a special case inside
`isAllowed` into `GUARDRAILS` — as a special case it could not be *named*, so no enumeration of the
rules could ever include it, which is exactly the shape of bug this file exists to record.
`combinationOf` became the one constructor of a `Combination`, because two constructors is how the
ornament came to be rolled for months and never checked. And both new gates drive `resolve()`
rather than `isAllowed`, on the 2026-08-27 lesson.

---

## 2026-08-28 — the duel was being improved by people who could not watch it

**The fault, and it is a process one.** `requestAnimationFrame` parks in this environment (the tab
reports `document.hidden`), so every improvement to the duel across three sessions was made one
still frame at a time through `scripts/duel-shot.mjs`. The client is the only person who has ever
watched it move, and his report — *"the battles are still lacking"* — could not be acted on,
because "lacking" is a statement about tempo and a still has no tempo.

He asked whether to rebuild the engine, hand it to another model, or take it to Claude Design. All
three were declined, and the reasoning is worth keeping: Claude Design produces static artboards
and cannot produce choreography, physics or a camera; a different model faces the identical
constraint; and the engine is 5,123 lines with 35 chained modules, derived reaction frames, a
fairness coin, hit-stop, an asymmetric camera and a spark model, under gates that drive 360,000
stepped frames and 280,000 generated sequences. **The model was never the bottleneck. The feedback
loop was.**

**What was built.** `scripts/duel-bench.mjs` emits one self-contained HTML file carrying the real
`duel.ts` and the real `duelCamera` — imported, never re-derived, for the reason `duelCamera` is
exported and pure in the first place: a bench with its own camera only ever confirms its own
camera. `src/components/DuelBench.tsx` puts the same surface on `/admin` for **+18KB**, since the
engine is already in the bundle for the hero ornament.

**What it immediately found.** Measured over 200 complete matches: median match **50.8s**, **62% of
frames neutral**, 12% striking, **1.9% in hit-stop**, and **30.6% of module picks contain no blow at
all** — with `close-in`, the heaviest module in the pool at weight 22, being *pure walking*. All 35
modules do run, so the fight is not repeating itself. **The problem is density, not variety**, which
is a different fix from the one three sessions of work had been aiming at.

**`DUEL_TUNING`, and the line drawn around it.** Four multipliers — `circling`, `rest`, `impact`,
`patience` — turned live from the bench. It was deliberately **not** put in `Config`: not published,
not in a share code, not persisted. A duel that is a different fight per visitor is one nobody can
review, because no two people would be discussing the same fight. The knobs are for finding a
number; the number gets typed in as a constant. Every default is 1 and 1 is arithmetic identity —
each knob multiplies a value the fight already rolls rather than replacing one — which is why every
duel gate passed unchanged, and a default that merely *looked* neutral would have moved all of them
at once.

`rest` scales only the slack past the last move's *end*, re-derived from the move table with that
end as a floor. Scaling the moves themselves would slide contacts out from under the beats that
answer them, which is the "proximity is not contact" class of bug that has cost this effect the
most.

---

## 2026-08-28 — the roster stays archetypes, and the reason is the client's own

The client asked repeatedly for the duel roster to be named characters — Homer, Ned, Rick, Morty,
Shrek, Farquaad, Jason, Freddy, Michael — at 20 a side, and proposed *"somewhat similar and
recognizable"* as a way to avoid copyright. It is not one: substantial similarity is the test, and
aiming for recognisable is evidence of intent rather than a defence.

But the decisive fact is that **he already made this call himself**, on 2026-08-14, and it is quoted
at the top of `src/fx/fighters.ts`: *"do not name them on pages that are not accessible only by me,
to avoid any copyright or legal bullshit."* The plan at the time permitted real names on
operator-gated surfaces; they were rejected outright instead, because a name sits in the public
bundle even when nothing renders it.

**Two things worth recording so this is not relitigated from scratch.** First,
`handoff_duel_engine/duel-cycle-v2.html` still contains all 29 named costumes and has never been
deleted or modified — when the question is *"what happened to the engine"*, the answer is nothing.
Second, and this is the argument that actually persuades: **the named characters would not read in
this medium anyway.** The engine draws a silhouette plus one signature shape at ~200px and cannot
draw face detail at all, and Jason, Michael and Freddy are recognised by *face* — a mask texture, a
burn scar, a jumper stripe. Folklore figures were designed as silhouettes and are free: The Reaper,
The Plague Doctor, The Headless Rider, The Count, The Nosferatu (1922, public domain), The Djinn,
The Outlaw.

---

## 2026-08-27 — The sharing build: phase S (setup scripts), and two findings about shipped code

The client asked for the thing the site was always for — choose files on your computer, share them,
reach them from anywhere. Phase 2 has done that since 2026-08-14 and almost nobody can set it up, so
the work was designed as four phases in `design/SPEC-SHARING.md` (a **draft**, awaiting sign-off) and
the first was built.

### The constraint the whole design turns on

**A script cannot hand a browser a folder.** `showDirectoryPicker()` requires a human gesture. That is
not an obstacle to route around: it is the reason this feature exists with no installer and no
code-signing certificate, and it is why a path bug in our code cannot reach the whole disk. So the
scripts do everything *around* the click, and the target is **one click, once, forever** — not zero.
Zero clicks is a native agent, which is phase N and costs an OV certificate (~$300–500/yr) plus a
second implementation of the fingerprint trust model.

### The setup code is deliberately not an API call

The obvious design — the script POSTs its folder list to an authenticated endpoint — would mean a
downloaded script holding a credential, and a new write route to defend, on the one artefact `/scams`
tells people to be suspicious of. Instead the script prints `VS1.<base64url JSON>`, copies it to the
clipboard and writes it to a file; `/share` decodes it into a checklist.

**The code carries no authority.** It is a list of names: it grants nothing, opens nothing, and the
worst a hostile one can do is *suggest* a folder the person must then pick themselves from the real
picker. **Phase S therefore adds no server surface at all** — no table, no route, no credential —
which is why it could be built without a security review.

`ConvertTo-Json` is not used, and that is not fussiness: Windows PowerShell 5.1 turns a one-element
array into a bare object, so somebody sharing exactly one folder would have produced a code the site
refuses, and it would have worked perfectly for everyone testing with two.

### The junction question, and why the answer is recorded as unproven

Whether Chrome traverses a Windows junction or a POSIX symlink out of a picked folder decides whether
the one-pick "share everything" path exists. **Read out of the Chromium source: it traverses.**
`FileSystemAccessDirectoryHandleImpl::DidReadDirectory` runs the sensitive-path check on files only,
and Chromium's own unit test asserts the directory exemption in as many words. Verified on the
shipping branch with both feature flags compiled on.

**It is still filed as unverified, because nobody watched it happen.** Two attempts to measure it here
failed — the picker is a native dialog this environment cannot drive; a fake XDG portal answered a
directory request but the walk output was never captured before the browser was torn down. Chromium
tests junctions nowhere at all. This project's standing rule is that "verified" and "could not be
observed here" are different claims, so the scripts offer the fast path as *"worth a try first"*, the
checklist underneath does not depend on it, and the download page may not promise it.

### Two findings that outrank it, both about code that already shipped

**1. `entries()` silently returns a subset, and has since Chrome M132 (stable January 2025).** A file
whose *resolved* path is blocked is omitted from a directory listing and the call still reports
success — no exception, no signal to the page. **The phase-2 explorer inherits this today**: a
customer can open a shared folder and simply not see a file, with nothing anywhere saying so. Chrome
published nothing about the change; the only outside record is a 2023 bug report from a developer
whose 3,000 files came back as "far fewer than 3,000". The explorer must never present a listing as
provably complete.

**2. The share-root-of-links pattern is the shape of a known blocklist bypass** (crbug 40061477, a
$1,000 VRP, fixed only for the file leg). Home, Desktop, Documents and Downloads are blocked as *"you
may not pick this"* rather than *"you may not read this"*, so a link to one of them **inside** a
picked folder reads it. All three scripts refuse to link the home folder, the system root and the
drive roots — **those lists are a security control, not a tidiness check**, and relaxing one to be
helpful re-opens it. Chrome's own position is that evading the blocklist is not a security bug, so
nothing here may lean on it as a boundary.

### What was verified by running it, and what was not

Run on Linux, which is the only platform reachable from here: the script end to end; **its output fed
through the real `decodeSetupCode`**, accents intact, which is the cross-language check that matters;
`--undo` proven to remove links and not their targets (a file inside a linked folder survived); and
`--undo` proven to refuse a share folder without its marker file, so pointing it at somebody's real
`~/Shared` does nothing.

**Never run: the Windows and macOS scripts.** They cannot be, from here. Both follow the Linux one's
shape, and that is an argument rather than a test.

### The gate, and two defects it did not catch

`npm run check` gained a setup-code gate — round trip, twenty-one malformed shapes refused (sixteen at
first; five more when the decoder learned to refuse deceptive labels), and a grep of
the PowerShell encoder for its exact JSON template and base64url transformation, so editing one side
of a two-language wire format alone fails the suite. Verified by breaking it deliberately.

**A claim audit then found two things in this session's own work that no gate could have caught.** All
three scripts told the user to click a *"Share them all at once"* button that does not exist in
`SharePage.tsx`; and `setup-bundle.sh` claimed its `.txt` copies open in the browser, when
`worker/downloads.ts` sets `content-disposition: attachment` and `octet-stream` unconditionally and
deliberately. The second is the exact failure the audit exists for: **a plausible sentence, sourced
from a comment in this repository, that the code contradicts.** Both fixed.

### The duel: three faults, and a guardrail that only ever constrained the dice

Reported together — fighters "grey out and then come back to full white and in focus", "only a couple
characters get chosen ever", and the randomiser "always stays stuck on one".

**1. The greying was published config, not a renderer bug.** `ornament: duelholy` + `station: roam`.
Roam fades `.v-ornament` 1 → 0.12 and back three times per 14.4s cycle and shifts it ±84px during the
hold. `guardrails.ts` has forbidden that pairing since 2026-08-18 — *"a roaming duel is a duel you
cannot follow"* — and it shipped anyway, because **`isAllowed` has two callers: the randomiser and
the check suite.** A roll is one of four ways a config arrives; publish, share codes and stored config
walked straight past. Ruled out by measurement rather than argument: the hit flash never runs longer
than 6 frames and makes bodies *brighter*, and the adaptive tier cannot reach the ornament, which
draws into a fixed 700px buffer.

Fixed with `effectiveStation()` in `src/data/stations.ts`, read by `theme.ts` where the wrapper class
is built — the point all four config paths converge, which is the doctrine `Ornament.tsx` already
records for this rule's sibling. **The station yields, never the ornament**: the operator chose the
duel deliberately and the guardrail exists to protect it.

**And the gate that was green throughout is the lesson.** `check.ts` already asserted
`isAllowed({ornament:"duelholy", station:"roam"})` was false — and it was, while production shipped
exactly that. **The old gate tested the predicate, not the page.** The replacement drives the
resolver over every ornament × station pair, and additionally fails if the resolver stops substituting
anything at all — a disabled resolver would pass every other assertion.

**2. Four of the eight fighters were unreachable.** Each duel was locked to two good and two evil, and
the ornament id *is* the pool key, so the visible half of the roster was fixed for every visitor.
Measured before: 4 of 28 pairs, 72.7% of match resets returning a fighter from the previous match,
23.9% returning the identical pair. Measured after merging: **8 of 8 fighters, 16 pairs, per-fighter
appearance ~12.5% each, back-to-back repeats down from 23.9% to 5.9%.**

The split had a real reason — the roster comment says confusable fighters were kept apart — so it is
replaced by `NEVER_MEET`, an exclusion list honoured by `rollPairing` with a bounded re-roll, rather
than by a blunt instrument costing four costumes. `duelholy` is withdrawn via `hidden` rather than
deleted, so every stored config and share code naming it still resolves. **The old cross-pool gate
was inverted rather than dropped**: every fighter must now be reachable from *every* pool, which is
the assertion that would have caught this.

**3. `mode: "page"` never rolled on a page load.** It rolled only inside `go()`'s commit, an in-app
click — so reload, typed URL, bookmark, external link and back/forward all rendered the published look
verbatim. "Per page" was not treating a page *load* as a page *arrival*, which is the only way anyone
reads the label. Now rolls on mount and on `popstate` as well.

**The second half was the palette swatch**, the only look control that wrote `mode`, silently setting
`static`. Its stated reason was sound as far as it went — pick a colour under a randomiser and the
next roll overwrites it — but layout, background, ornament, station and typography all write only
their own field, so choosing a colour quietly turned the randomiser off and `publish` sent that.
**Silently changing a setting the operator did not touch is worse than the overwrite it avoided**, so
the swatch now leaves `mode` alone and says *"the randomiser will roll over this"*.

### The security pass, and what it found in this session's own work

Three reviews. Every finding below was demonstrated by execution.

**The blocklist was the only barrier and had four holes.** Because a link to a blocked directory
*inside* a picked folder is read normally by Chrome (crbug 40061477), and the scripts recommend
picking the share root, nothing downstream catches a miss — yet the comments described the lists as an
echo of what Chrome would refuse. That framing is what left them with: exact string equality on the
raw path (`//home/user`, `/home/./user`, `/home/user//`, `/home/user/../user` all passed); no symlink
resolution anywhere; **the parent of every profile absent from every list** (`/home`, `/Users`,
`C:\Users` — "type `C:\Users` in the box" hands over every account, and the share root lives inside
it, so the junction was recursive); and `$HOME` blocked while `~/.ssh`, `~/.gnupg`, `~/.config` and
`~/Library` were not — precisely the paths Chrome blocks with block-all-children semantics, so **the
script was opening what Chrome deliberately closed.** Windows additionally fell to 8.3 short names,
device paths and unresolved junctions.

Now: canonicalise then compare, **fail closed** when a path cannot be resolved, prefix matching, case
folding on Darwin, and a recursion guard. `cd -P`/`pwd -P` rather than `readlink -f`, which BSD lacks;
a bounded `.Target` walk on Windows rather than `ResolveLinkTarget`, which PowerShell 5.1 lacks.
**One hole was only found by testing**: bash's `pwd -P` preserves a leading `//`, so `//home/user`
canonicalised to itself and compared unequal. No amount of reading would have caught that.

**Three defects in code written this same session**, each with the same shape — works in the common
case, breaks in the first real one:

- **Choosing exactly one folder crashed the Windows script.** A one-element array unrolls on return
  and `Set-StrictMode -Version 2.0` suppresses the scalar `.Count` shim. It worked with two.
- **The PowerShell JSON escaper corrupted emoji and zero-width characters.** `switch` compares
  linguistically, so every zero-collation-weight character compared equal to the first zero-weight
  clause and was emitted as `\b`. "Photos ❤️" produced a code the site refused *after* the links were
  made. Now branches on the integer code point.
- **The shell scripts printed their interface to stdout while the caller captured stdout as the folder
  list.** Every interactive run told the customer their folders did not exist; a headless Linux box
  shared nothing at all.

**The decoder now refuses deceptive labels.** Bidi overrides, zero-width characters and duplicate
labels are rejected: the label is written to the account and shown to everyone the folder is later
shared with, so one that *renders* as something other than what it stores is the whole attack — as are
two rows rendering identically where only one ticks off.

**Kept, because it is the honest reading:** of the three `/scams` mitigations, only *"hang up and ring
back on a number you looked up yourself"* engages a phone scam. The published source serves someone
who can audit 750 lines of PowerShell, who is not the person at risk, and the SHA-256 is served from
the same page over the same connection as the file it describes. Every one of those signals is free
for a scammer to clone.

**Left open and recorded:** `isAllowed` still constrains only the dice. One rule is now enforced at
render; sixteen remain violable by hand from the panel, including `grain` on a `LOW_CONTRAST` palette,
which is a WCAG regression publishable to every visitor at once.

### Also decided

- **`DownloadPlatform` gained `macos`**, appended and never inserted. `.dmg` and `.pkg` map to it;
  **`.sh` deliberately stays under `script`**, because a shell script is not a macOS thing and mapping
  it would put a confident wrong label on every Linux upload.
- **Per-page appearance was agreed** (client) — every dial, all seventeen pages, after phase S. The
  transition was delegated and decided as **bleed the colour, snap the structure**: the 0.9s palette
  bleed is the site's signature and worth keeping across navigation, but a layout or typeface changing
  *during* a colour fade reflows text mid-transition and collides with the `.v-block` entrance stagger
  that already runs on every page change.
- **The randomiser stays on** (client: *"keep it rolling, and ill change whenever i feel like it"*), so
  per-page overrides must compose with `mode: "visit"` rather than assume a static base.
- **A reported "white page" was chased and was not the site.** It was an unstyled probe fixture on a
  local port. Recorded so it is not re-investigated: all 25 palettes are dark, `base.css:19` paints
  `#0b0a1f` before the tokens mount, and the stylesheet is render-blocking.

---

## 2026-08-26 (evening) — Rounds 4 and 5 of the copy review; and Tailscale comes off `/setup`

The copy overhaul ran three rounds and stopped at a session limit. Round 4 (voice consistency
across the seventeen pages) and round 5 (a cold read of the two safety pages) ran now.

### The method, which is the transferable part

Round 5 was run as **two cold readers given the page text and nothing else** — no `CLAUDE.md`,
no repo, no history — and told to read as the people the pages are actually for: somebody on
the phone to a scammer as they read, the adult child deciding whether to forward the link,
somebody who has already paid, and a non-technical customer about to install remote-access
software because a stranger told them to.

That framing found two defects that four in-context passes had not, and the reason is
structural: **an in-context reader knows what the page meant.** A cold reader only knows what
it says.

Both cold readers also produced confident false claims. One insisted
`reportcyberandfraud.canada.ca` was wrong or dead; it answers 200, and the CAFC and OPP
numbers check out. **Every factual claim was verified before being acted on**, and that
verification is not optional — a cold read is a source of hypotheses, not of findings.

### Tailscale is removed from `/setup`, reversing 2026-08-14

The entry below says Quick Assist leads and **"Tailscale is the *standing* option"** for
machines the operator is in repeatedly. It also, correctly, says Tailscale is not screen
sharing. Two things retired it.

**The steps did not work.** *"Sign in with your Google, Microsoft or Apple account"* puts the
machine on **the customer's own tailnet**, which the operator is not on, and *"tell me the
name it gives the machine"* is meaningless across tailnets — there is no lookup by name from
outside one. A customer who followed all five steps ended up with Tailscale installed, signed
in, and connected to nothing. Fixing it needs either an admin-console device share (far beyond
this page's reader) or customers joining the operator's own tailnet — which puts strangers'
machines on one network whose **default ACLs let every device reach every other**, and whose
free plan is capped on *users*, the small number. Neither belongs on a page written for
somebody who is nervous about installing anything at all.

**And it was never needed.** The entry below states the operator's own model: what he can see
is *"the screen, while you watch, **never unattended**."* Unattended reach is the whole of what
Tailscale buys. The page was paying for it with an account signup, a second program it never
named, and a permanent way into a customer's machine — for a capability the operator had
already decided not to use. What it saved a repeat customer was **one code exchange, on a call
they placed anyway.**

The replacement block says so, and says it as the advantage it is rather than as a limitation:
*"a permanent way into your machine is worth something to me about twice a year, and worth a
great deal to whoever finds it."* That is the same argument `/scams` makes, pointed at his own
tooling, which is the strongest position the page can take.

**If unattended access is ever genuinely wanted**, the answer is a purpose-built remote-support
tool he *hosts himself* — RustDesk or MeshCentral on the ThinkCentre — not a mesh VPN plus a
screen program. One install for the customer, one thing to explain, one uninstall, and no
third party's relay in the middle, which is the same reasoning that made the downloads bucket
private and the fonts self-hosted. **It is in `TODO.md` and it is blocked on that machine
actually existing** — `scripts/thinkcentre-setup.sh` has still never run on real hardware.

### The other claims that came off `/setup`

- **"Screen sharing across it still asks you first"** — a promise Tailscale does not make.
  Gone with the block.
- **"every one of these asks you to allow it before it shows me anything"** welded a claim
  about *software* to *"I will not set any of them up to connect without asking"*, an honest
  personal promise which is the half doing the work. Presenting the undertaking as a property
  of the tools removed the reader's ability to check it, and handed a scammer the line *"don't
  worry, it always asks you first."* The promise survived, and now carries a test the reader
  can apply: *"if a screen ever gets shared without you agreeing to it right then, it was not
  me."*
- **"it stops existing the moment you close the window"** was false — the session ends, the app
  stays installed. A reassurance built on a wrong fact, which is the worst kind on this page.
- **"already on your machine"** is true of Windows 11 and often not of Windows 10, where Quick
  Assist comes from the Store. Microsoft retired the in-box app in 2022, and the commonest
  stall on the page had no answer on it.
- **The page's own scam rule fired on the page's own workflow.** The customer emails; then *he*
  rings *them* and reads out a code — which is the scam script, and Microsoft has documented
  criminals running Quick Assist exactly that way. The one rule the reader is meant to apply
  under pressure went off on the legitimate repair. The callback settles it, and now appears at
  each of the three moments it gets tested.
- **Added:** *"I will never ask you for a password"* (the page had the gift-card equivalent and
  not this one, while telling somebody to sign in to a Google account); the Windows prompt only
  the customer can click; a warning before the mouse is taken; and a **"when we're done"**
  block, which did not exist — including *don't type a password or open your banking while I am
  looking*, the most valuable line that was missing.

### `/scams`: one wrong absolute, and four emergency instructions in the tail

**"None of that survives a reload. Not one pixel of it."** is right about the screen-editing
refund scam and wrong about the variant where the scammer moves the victim's **own** money
between the victim's **own** accounts. That survives a reload *and* survives checking on a
second device. A reader who tested it as instructed concluded the overpayment was genuine and
sent it — the exact outcome the block exists to prevent, and the absolutism is what made it
dangerous rather than merely incomplete. The technique stays; the block now names the variant
and lands on the rule that holds either way: *you do not send money to somebody who rang you,
whatever the screen says.*

**Everything actionable-right-now moved to the front.** The emergency block was third, behind
the lede and two CTAs; the pop-up close sequence was block 20 and the refresh counter-move
block 19, both live defences filed with the reference material — on a page whose eyebrow,
*"read this before you call anyone"*, is addressed to somebody staring at a pop-up. Block count
unchanged at 33.

**The bank call was bullet six of six, below "shut the computer down"**, on the only list a
panicking reader finishes, while the page itself says money can be stopped in the first hours
and almost never after. It is second now. 911-if-somebody-is-at-the-door joined it (it was in
block 31, seventeen blocks after cash-by-courier is first named), as did changing the email
password from a different device, which was nowhere.

**The site said no legitimate company ever asks for an e-transfer, then asked for one.**
*"There is no exception to any of these… not ever"* listed wire and e-transfer, while
`/downloads` says *"send an e-transfer and a code comes back"*. The bullet is split: gift cards,
crypto and courier cash stay absolute, because that absolute earns its keep; wire and
e-transfer take the *"to somebody who contacted you first"* scoping the remote-access bullet
above them already carried.

**A password change does not evict anyone from an email account.** Forwarding rules, added
recovery addresses and added recovery phone numbers all survive it, and are the standard
persistence trick after a screen share. Now covered, with signing out other devices and turning
on two-step. A **credit-file fraud alert** with Equifax and TransUnion was missing from the
page entirely.

**The shame surface, on the page whose own thesis is that shame is the mechanism.** The lede
sorted the reader into a demographic before helping them. The block meant to absolve opened
with *"People assume victims are gullible"* — a scanner reads headings and first lines, so the
accusation arrived and the rebuttal did not. And *"if you have **actually** lost money"*
divided readers into real victims and fussers. The **recovery trio ran least-bad → worst**, so
the reader in the most trouble travelled furthest; it is triage order now.

**Three instructions nobody could follow.** *"Switch off the Wi-Fi"* pointed at a setting
**inside the machine the attacker is driving** — it names the router now, and says what a
router is. Ctrl+W throws a "Leave site?" box on these pages, so the reader pressed the keys,
saw a dialog and concluded it had failed. And Task Manager is a bad place to put a panicking
person, so the blunt fallback the emergency block already uses (hold the power button in) is
offered after it.

### Round 4: the voice is holding

Its mechanics are consistent page to page — short declaratives, concrete numbers over
categories, first-person singular, the negative-construction pitch, and a block's last sentence
carrying a turn that points **outward**. The 2026-08-26 reversal held: **there is no
self-deprecation left to find.** `contact` and the pricing block are the plainest copy on the
site, which reads as judgment being exercised rather than as drift.

What drifted: **`/downloads` still carried the promise `TODO.md` recorded as cut** — *"pay
once"* survived the claim audit's rewrite, which is the shape `CLAUDE.md` warns about by name,
a retired promise rebuilt without its words. `guestbook` was the last content page whose eyebrow
named nothing. **"the bench" survived in four places** after the bench turned out to be
aspirational. The years read four different ways across six surfaces; they now all read *"over
twenty years"*, his own 2026-08-14 correction, so the number he eventually gives is one phrase
to change. `changelog`'s snippet was its own lede reworded — and the gate caught the
replacement at 159 characters, which is the gate doing its job. `/gallery`'s drive-shelf alt
gave a screen-reader user a count contradicting its heading, and its empty video slot was
captioned "muted loop" for a block about a *noise*.

---

## 2026-08-26 — Every word on the site, rewritten; and what a claim audit found in it

Same day as the snippet fix below, and it started from it. With the search result
finally quoting the right tag, the copy it was quoting turned out to be the
problem, and the client asked for the whole site's text.

### What the client asked for, in order

1. *"i think a better tagline is in order… i am fine keeping it sarcastic or
   satirical."*
2. *"go nuts on making jokes actual jokes, and no pandering to anyone
   whatsoever"* — with profanity and non-PC material explicitly approved.
3. Then, mid-pass: **"get rid of ANYTHING and EVERYTHING that involves putting me
   down, saying its just one person and emphasizing that."** *"just sounds bad…
   make other jokes instead… either use other wording, descriptions, or just
   leave it short and sweet."*

**Point 3 reverses a standing product decision.** `CLAUDE.md` had recorded *"the
self-deprecating copy is the point; rewriting it toward 'professional' is the
actual failure"* since the handoff. That entry is now marked REVERSED in place
rather than deleted, because the old rule is exactly the kind a future reader
restores as a fix. First-person "I" stays; what left is smallness as the pitch
("one guy", "no shopfront", "no company, no chain", "nobody to transfer you to")
and every joke at the operator's expense. The replacement is **not** corporate
voice — the jokes stayed and turned outward: chains and their depots, Microsoft,
subscription software, scammers, the machines.

### The pass itself

Seventeen pages plus the interface furniture, run as parallel agents against one
brief, applied by hand. `src/data/snippets.ts` was written first (see the entry
below) and rewritten twice as the brief changed. Of the ~731 user-visible strings
outside the page copy, **112 were joke-eligible, 331 must stay plain** (auth
errors, the unsigned-program notice, payment wording, the whole remote-access
interface, the reduced-motion greeting) **and 288 are operator-only.** Twelve of
the twenty-eight interface strings actually reviewed came back KEEP — the
self-deprecation was concentrated in five places, not spread everywhere.

Two bugs fell out of that inventory rather than out of the voice work: the
command palette's placeholder offered *"pages, setups, looks"* to signed-out
visitors, and setups and looks only exist inside the signed-in and operator
branches; and the greeting's toast said *"off it goes"* when motion had been
turned **on**, in the one branch read by somebody managing vertigo or migraine.

### The claim audit, which is the part worth reading

A rewrite by anyone who is not the subject-matter expert invents things, and the
invention reads *better* than the truth because it was chosen for rhythm. So a
pass was run with a purpose-written `claim-audit` skill, over every assertion in
`pages.ts` and `snippets.ts`, using `git diff` to separate **invented by this
session** from **inherited**. It returned **38 findings — 24 invented, 12
inherited, 10 of them touching money, safety or privacy.** The ten that mattered:

- **"Free diagnosis", rebuilt without the words, on three surfaces.** home's lede
  ("I tell you what's wrong and what it will cost, and then I fix it"), the new
  "the process" block, and a home snippet all promised the *fault* established
  before payment — three blocks above the rate block, which says the opposite,
  and in a search snippet read with no rate block anywhere near it. All three
  were written this session.
- **"Microsoft does not know your name"** — false for anyone signed into a
  Microsoft account, i.e. most Windows users, in the one front-page paragraph
  that can stop somebody losing money. `/scams` had the careful version all
  along: *"a warning on a web page cannot know your name."*
- **"I have seen what is on your computer"** — written as reassurance, reads as an
  admission of browsing customers' files. Replaced at the client's own direction
  with *"If you are worried about privacy: I have seen enough by accident to have
  no interest in going near anybody's files"*, and **his own sharper version went
  into the search rotation** near-verbatim.
- **Two wordings of one term of business** — home "a separate charge", contact
  "its own charge". Unified; two phrasings of one price is how an invoice becomes
  an argument.
- **`downloads` promised "pay once, nothing renews"** — a permanent commercial
  commitment the schema contradicts (`expires_at`, `max_uses`, `revoked_at`).
- **`/setup` claimed no tool on the page connects unattended.** Not true of every
  macOS path the page describes. Restated as the operator's own commitment
  instead of a property of software he does not control.
- **Equipment nobody had confirmed** — a drive imager, boot media for "every
  version of Windows", screws "sorted by length". Reverted, then rewritten again
  when the client answered: **there is no bench.** A bin of parts and two laptops.
- **`/now` was six entries of inherited fiction** — a household file server, a
  screen in transit, an intermittent fault sent home with a logger, a 486
  restoration. **It is the one page that claims to be true today**, which makes it
  the one page a customer can catch out for free. Now three entries, all real: a
  laptop with a heat fault, a laptop with a suspected dead SSD, and the parts bin.
- **`changelog` claimed "Most people open this on a phone."** There is no
  analytics anywhere in `src/` or `worker/` — the claim implies measurement the
  site refuses to do.
- **Privacy absolutes wider than the code** — share's "never sees the folder"
  (the label is a name the owner types and the server stores), contact's "nothing
  about you is stored anywhere" (`rate-limit.ts` stores an HMAC of the address).

Verified-good and left alone: the guestbook's five *quotations* are byte-identical
before and after — only the attribution lines changed, which is the rule, since a
quotation is somebody's words and an attribution is the writer's. And all eight
files in `public/photos/` really are EXIF-free (`ffd8 ffe0`, no APP1), so the
gallery's privacy claim holds.

### The gate that let it through, and the gate now

`npm run check` was **43 green with all three free-diagnosis promises in place.**
The description gate tested `/free diagnos/i`, `/pay nothing/i`, `/no fix,? no
fee/i` and `/guarantee/i` — **against the snippets and the shell only, never
against `PAGES`** — and it tested for the *words*, which was never the risk. It
now scans the page copy too, and adds `IMPLIED_FREE_DIAGNOSIS`: the fault
established *before* anything starts, which is the boundary the $150 sits on and
the shape all three took. Verified by re-introducing the bug, per the standing
discipline.

### Eight things the client still has to answer

In `TODO.md`, at the top. The safe reading renders today in every case, so
nothing is blocking; the most important is whether `/work`'s six case studies and
the guestbook's five quotes are real jobs or handoff fiction. Once the bench
turned out to be aspirational, the provenance of the page that tells a stranger
*he can do this* stopped being safe to assume.

### Skills

Four skills were written for this work and live in `~/.claude/skills/`, outside
the repo: `prose-editor`, `deadpan-comedy`, `author-voices`, `reader-psychology`,
and then `claim-audit` when the first pass showed nothing was catching invented
detail. They are machine-local, not checked in — noted here so the next session
knows they exist and why the copy is shaped the way it is.

---

## 2026-08-26 — The search snippet: two description tags, one of them advertising a claim the client killed

**Reported by the client:** *"my google search still says free diagnosis."*

It did, and the cause was not a stale index. Every route was serving **two**
`<meta name="description">` tags:

```html
<!-- index.html, static, identical on all seventeen routes -->
<meta name="description" content="Independent computer repair. One person, no shopfront, free diagnosis." />
...
<!-- appended by withPageMeta at </head> -->
<meta name="description" content="There is no product here, no newsletter, no funnel, and…" />
```

`withPageMeta` **sets** the title in place and **appends** its description. The static tag therefore
came first and won, so the per-route description this build goes to some trouble over had never been
the one quoted — and the shell's copy still carried *"free diagnosis"*, which the client killed in
the page copy on 2026-08-14 (*"i dont do free diag. a mechanic will still charge you to diagnose your
cars issues"*). One file was missed, and the one surface where a mistake is invisible to everybody
working on the site is the one no browser renders.

Two valid tags: nothing threw, nothing logged, and the site looked right from every angle anyone was
looking from.

**The fix is three parts.**

1. `withPageMeta` now removes `meta[name="description"]` before appending its own, so exactly one
   ships. The static tag **stays in `index.html`** rather than being deleted: Pages still auto-deploys
   from `main` and is the rollback, and under Pages there is no Worker and so no injected head. It
   must therefore stay true, and it must never outrank the route's.
2. Its copy no longer names a term of business at all.
3. `npm run check` gates both: exactly one description tag in the shell, exactly one injected, a
   removal handler present, and no retired claim (`free diagnosis`, `pay nothing`, `no fix no fee`,
   `guarantee`) in either the shell or any snippet.

### And the snippets themselves, rewritten

With the plumbing fixed, the description Google *would* have quoted turned out to be no better. It
was the page's `lede`, on the reasoning that importing approved copy beats a second table in the
Worker. That reasoning was right about drift and wrong about fit. Measured across all seventeen
routes, **nine of the eleven indexed ones were clamped mid-sentence at 155 characters, and every one
of them lost the useful half**:

```
contact    …or you need the photographs off a hard drive…
scams      …polite, patient and rehearsed. Here…
setup      …same fix, no driving, no afternoon…
downloads  …The rest are a few dollars — send me an…
home       …The domain was already paid for, so this exists. If you need a machine…
```

A lede is read third, after an eyebrow naming the page and a headline. A snippet arrives cold, in a
list of ten results, next to shopfronts. Home's opened with four things the site is *not* and was cut
before *"contact is one click away"*.

`src/data/snippets.ts` now holds copy written for that job — one line per route, total over `PageId`
so a new page is a type error — and carries the rules it is written to: no fee named, nothing
promised the client has not said, no city, no name, nothing that advertises the site, and every line
standing alone because a snippet is never read beside another one.

**Home rotates; three pages never do.** The pool is six deadpan lines, picked by whole days from
`Date.now()` — stable inside a crawl and inside an afternoon, different tomorrow, and reproducible,
which is the only reason a gate can test it. A rotating description is visible exactly where a head
is fetched fresh: a link unfurling in iMessage, WhatsApp, Slack or SMS.

`scams`, `setup` and `contact` are excluded by name, and that exclusion is gated. `scams` ends by
telling the reader to send it to whoever in their family answers the phone — it is the one page
written to be forwarded, and a page about fraud that describes itself differently each time it is
forwarded is arguing against itself. `setup` is read by somebody about to install remote-access
software. `contact` is the page with the job.

**Sitelinks were considered and not pursued.** Google builds those from site structure and cannot be
told what to list, and the page most worth surfacing under the result is `scams`, which is already a
home CTA in second position. A search result advertising downloadable executables from a nameless
one-man operator is the shape of the thing `/scams` teaches people to distrust.

---


## 2026-08-23 (latest) — `scripts/thinkcentre-setup.sh`, and the six bugs ten passes found

Client: *"i have the pc ready for the linux install that will run my file sharing. pls make me the
setup script. make sure EVERYTHING is included. then check for errors 10 times. make sure you leave
no security holes open."*

The x86/Debian sibling of `pi-setup.sh`. `docs/thinkcentre-sharing-host.md` was a manual guide that
said, correctly, that `pi-setup.sh` hard-refuses on this hardware; it now has a **"The script"**
section and the sections it automates are annotated. The script refuses on a Pi in turn, so the two
cannot be run on each other's hardware.

**Decisions taken while writing it, each of which could be "fixed" back into a bug:**

**Chromium is excluded from unattended-upgrades and given its own timer, and the second half is
what makes the first half safe.** On Raspberry Pi OS the exclusion is free: Chromium comes from the
Pi archive, which Debian's stock unattended-upgrades origins do not cover, so `pi-setup.sh` gets the
behaviour by doing nothing. On Debian, Chromium security updates arrive through
`${distro_codename}-security` like everything else, so the same intent needs an explicit
`Package-Blacklist` — and a blacklist on its own leaves an un-patched browser holding a handle to
somebody's files, which is a worse outcome than an unchosen restart. Hence
`vessel-chromium-update.timer`: Sundays at 04:00, `Persistent=false` (a missed week waits for the
next one rather than firing at an arbitrary moment after a boot — the entire point is that the
restart happens when the operator chose), and the kiosk is restarted **only if the package version
actually moved**.

**The kiosk unit is deliberately not systemd-hardened, and the unit file says so in a comment
addressed to whoever hardens it later.** `NoNewPrivileges`, `PrivateUsers` and a `SystemCallFilter`
all break Chromium's own sandbox, and the fix people reach for next is `--no-sandbox`, which is
strictly worse than an unhardened unit on the one machine in this design that holds a directory
handle. The security boundary that matters here is the browser sandbox, not the systemd one.

**A Chromium managed policy is the answer to autologin.** Autologin is not optional — a host that
stops sharing whenever the power flickers is not a host — but it means physical access is access to
a signed-in browser. The policy narrows that browser to the sharing host alone, with no password
manager, no browser sign-in, no profile sync (the profile *is* the pairing) and no DevTools.
`DefaultFileSystemReadGuardSetting` stays at "ask" because that prompt is the folder picker this
machine exists to answer; write access is blocked, because §8 shares read-only.

**Docker comes from `docker.io`, the user is not added to the `docker` group, and every published
port names an address.** Piping a remote script into a root shell on the machine that holds your
files is not a thing to do casually; the `docker` group is root-equivalent on a box that autologins;
and Docker's iptables rules are evaluated ahead of ufw's, so a bare `-p 53:53` is reachable from
anywhere that can route to the box regardless of default-deny.

**Ten verification passes against a mocked Debian** (fake root, fake HOME, stubbed `apt`,
`systemctl`, `loginctl`, `ufw`, `sshd`, `ss`, `ip`, `docker`) ran the script end to end and drove
every refusal, option and failure path. Six real bugs, in the order they were found:

1. **`report_storage` mis-parsed `lsblk`.** `lsblk -rn` prints an empty column as nothing at all, so
   a disk with no transport shifted every field left and the report described the wrong thing
   confidently. One field per call now.
2. **`$(cmd || echo fallback)` is wrong for systemctl.** It answers the negative cases by *printing*
   the answer and exiting non-zero — `is-enabled` prints `disabled` and exits 1, `is-active` prints
   `inactive` and exits 3 — so the fallback was appended to a perfectly good answer and every check
   of a negative state compared against a two-line string. `first_or` substitutes only on no output.
3. **The firewall was never enabled.** `ufw status | grep -q active` matches `Status: inactive`, so a
   fresh machine reported a closed firewall in its own summary and had none. It compares the word now.
4. **A hand-edited URL file reached the Chromium policy unvalidated.** The script deliberately never
   overwrites `~/.config/vessel-kiosk/url`, so the host it interpolates into a JSON *security
   control* may have been edited since it was validated — and a malformed policy file is silently
   ignored by Chromium, leaving the host open while the summary said it was locked. Re-validated on
   read-back; refuse, never repair.
5. **`--verify` always exited 0.** An `EXIT` trap whose last command fails replaces the script's exit
   status with its own, so `exit "${VERIFY_FAILED}"` was being overwritten by a successful `rm`. The
   trap captures the status and re-raises it.
6. **A silently-ineffective sshd drop-in.** In `sshd_config` the *first* value obtained wins, so a
   setting above the `Include` line beats the drop-in: the file is written, the reload succeeds, and
   nothing changes. After reloading, the script asks `sshd -T` whether the settings actually took and
   warns by name if they did not — the same "did the thing it claims to do actually happen"
   discipline as `npm run check`.

**A second and third review pass, run as independent reviewers against the finished script, found
fourteen more.** The ones that changed the design rather than a line:

- **The Chromium policy could have landed where nothing reads it.** `install_packages` supports
  Debian's `chromium` *and* a `chromium-browser` fallback, but the policy path was a constant
  pointing at `/etc/chromium/policies/managed`. On a `chromium-browser` host the lockdown would
  have been written to a directory the browser never opens, and every report the script prints
  would have said the machine was locked down. It now writes to every managed-policy directory a
  browser on the box would actually read, and names the paths it wrote.
- **`URLAllowlist: ["mcclevarty.ca"]` is wider than it looks.** In Chromium's filter format a host
  with no leading dot matches every subdomain, and a filter with no scheme matches every scheme —
  so the "this browser can reach the sharing site and nothing else" rule also admitted
  `http://anything.mcclevarty.ca`. It is `https://.mcclevarty.ca` now: the dot means this host
  exactly.
- **`--verify` could not fail on the things most likely to be wrong.** The firewall, the browser
  policy and the store were reported with `note`, which by construction never fails, so a machine
  whose firewall had been switched off since setup verified green. Those are `check`s now, plus a
  new one that asks `sshd -T` whether root login is still refused; and the opt-outs are remembered
  in `~/.config/vessel-kiosk/options` so `--verify` checks what this host is *meant* to be rather
  than failing a firewall the operator disabled on purpose.
- **The summary asserted security controls the run may have skipped.** "sshd root login off" was
  printed even when `harden_ssh` returned early; "passwords off" was printed from the *flag* rather
  than the outcome, so the exact case the safety check exists for — key-only asked for, no key
  present — announced passwords were off on a box still accepting them. Three state variables now
  carry what actually happened, and the summary reads those.
- **The root-run updater sat in a group-writable directory.** Debian ships `/usr/local/sbin` as
  `root:staff` mode 2775, and a weekly root timer executed a script there; the unit also inherited
  systemd's default PATH, which begins `/usr/local/sbin:/usr/local/bin`, while the script called
  `apt-get` unqualified. Moved to `/usr/lib/vessel-kiosk/`, PATH pinned in the unit, and the
  launcher now prefers absolute `/usr/bin` paths for the browser.
- **Nothing recovered a tab that loaded an error page.** If the site is unreachable when Chromium
  starts, it renders `ERR_` and stays there — process up, systemd satisfied, nobody sharing. The
  launcher waits for the site before starting, and `vessel-kiosk-watchdog` restarts the tab on one
  transition only: unreachable, then reachable. Deliberately *not* solved by opening the
  remote-debugging port, which would hand full control of the browser to anything on the LAN.
- **"Never idles" was only true on Xfce**, and the script explicitly supports a box that already
  runs GNOME. GNOME's lock lives inside `gnome-shell`, cannot be purged, and reads none of the four
  mechanisms that were being configured. Its idle, lock and sleep keys are now written to the
  system dconf database and locked.
- **The display manager was chosen by which package was installed** rather than by
  `/etc/X11/default-display-manager`. A box with both LightDM and gdm3 installed — routine — got a
  LightDM drop-in nothing reads, no autologin, no session, and no kiosk.
- **On Debian 13 `sshd -T` is not the authority on the listening port**, because openssh is
  socket-activated and the port comes from `ssh.socket`. Opening 22 and enabling the firewall on a
  box whose real port is elsewhere locks you out over the connection you are sitting on. The union
  of both sources is used.
- **A late failure aborted the run before the summary.** Pi-hole's three `die`s and the policy
  step's `die` on a hand-edited URL file killed the script after packages, autologin, the launcher,
  the unit and lingering were all in place — so the operator saw an error and never learned the
  machine was mostly configured. All are warnings that return now.

Also fixed and worth less: the clock step reported success unconditionally, `systemctl reload ssh`
printed "reloaded" when it had failed on a socket-activated sshd, a pending reboot (security
updates installed but not running) was invisible, re-running without `--ssh-key-only` silently
re-enabled password authentication on a host that was key-only, and the store's 0750 assumed a
per-user primary group.

**Not verified from here, and it cannot be:** the script has never run on real hardware. The mocked
run proves control flow, idempotency, exit codes and the generated files; it cannot prove that
Debian's package names, LightDM's autologin or Chromium's policy keys behave as expected on the box.

---

## 2026-08-20 — a review of the recent work: sixteen more bugs, twelve of them in code already committed

Client: *"yes, have prices as a toggle. and whatever else you can think of for a
downloads page. also please review all recent work for bugs."*

Prices were already a per-page toggle, so nothing changed there. The rest is
additions and a review of the last week's commits — the duel's phases 3 and 4,
and the downloads Worker.

### What was added

- **The upload portal fills itself in.** Picking a file derives the id, the name
  and the platform from the filename. Every field is a suggestion into an *empty*
  box and nothing already typed is overwritten, which is what makes a guess safe:
  at worst it saves nothing. **It deliberately does not guess a category** — the
  migration already argued that a confident wrong label with nothing to notice it
  by is worse than `other`, and an extension says what a file *is*, never what it
  is *for*. Gated: every suggestion must satisfy the Worker's `KEY`, or the
  operator is refused in front of the form that just filled itself in.
- **The page's own link, with a QR.** The whole feature exists so the operator can
  build a page while on the phone to the person who wants it, and the last step of
  that call is reading them a link — which until now meant retyping it out of the
  hint text. The QR reuses the encoder already gated against the ISO worked
  example, for the customer standing at the bench rather than on the telephone.
  It says out loud when the page is still a draft, because the link works
  perfectly for the signed-in operator and 404s for everybody else.
- **A search box**, on pages of eight files or more, matching the words a visitor
  can see — names, descriptions, versions, and the category and platform *labels*.
  Never the ids: searching "antimalware" and matching a row that reads "Malware
  removal" on screen is a result nobody can account for.
- **A "new" marker** for thirty days, for the returning visitor, inside the name
  rather than as a sixth fact in the manifest line.
- **A file count on each index card** — the one fact a card can add that its own
  title does not already say.

`QrCode` also had a hardcoded `aria-label` announcing every symbol as "the
authenticator secret"; it is a prop now, defaulted so the original caller is
unchanged.

### Twelve bugs in the downloads Worker

1. **A non-Latin-1 filename was a 500 on every click, for ever.** `headers.set`
   performs a WebIDL `ByteString` conversion, so one character above U+00FF
   throws — and the write-side guard checked only `["\\/\r\n]`. `Réparation.exe`
   saved cleanly, listed normally with a working button, and every download
   raised. Fixed on *both* sides and in opposite directions: the guard now refuses
   control characters, and the response carries `filename` (flattened to ASCII)
   **and** `filename*=UTF-8''…` per RFC 5987, so the accents survive rather than
   being refused.
2. **An unsatisfiable range answered `206` with `content-range: bytes
   300000-299999/300000`** — a last-byte-pos below the first, which RFC 9110
   §14.4 does not permit. `Range: bytes=300000-` against an already-complete file
   is the everyday way to produce it, from exactly the resuming download managers
   this route advertises `accept-ranges` for. **The check suite asserted that
   shape as correct** and tested only `offset + length <= size`, so it blessed the
   bug; it has a `length === 0 ⇒ 416` row now.
3. **`HEAD` on the byte route answered `404 No such endpoint.`** Download managers
   probe with `HEAD` to learn the size and whether ranges work, so the
   resumability the entire design is justified by was unavailable to the tools
   that use it.
4. **The byte route was an existence oracle.** 404 for an unknown id, 403 for a
   known one the caller could not have — unauthenticated, unthrottled, and
   covering ids on draft and `granted` pages that appear in no response the caller
   is entitled to. Ids are lowercase-kebab and named after what a file is and who
   it is for. One refusal now, thrown from all three places.
5. **A page-scoped code survived its page and resurrected on a re-created slug.**
   `download_codes.slug` has no foreign key and a slug is a re-usable
   `TEXT PRIMARY KEY`, so deleting `acme` and later creating a new page at the
   same address for a *different customer* handed every old code the new
   customer's page and every paid file on it. Deleting a page is the only
   "withdraw" control this feature has, so it now deletes the codes too — and
   `opened` re-reads the page regardless, which is the half a future delete path
   cannot forget. Proven both ways in the harness: removing the delete makes the
   old code redeem against the new page.
6. **An unscoped code read out the slug of every `granted` page.** `canRead` can
   never honour a ticket for that visibility, so including them in the "opens
   everything" list leaked their names and nothing else — and the name is the
   whole secret there. `unlisted` stays in deliberately.
7. **`mintCode` would mint a code for a `granted` page**, which redeems, reports
   the page as opened, and opens nothing — the failure the existence check beside
   it exists to prevent, with a forgotten visibility in place of a typo.
8. **The revoke handle was 32 bits, unchecked, behind an unbounded `UPDATE`.** Two
   codes sharing an 8-hex prefix meant revoking one silently revoked the other,
   with two identical-looking rows and no way to tell them apart. Sixteen
   characters now, and checked for collision at mint.
9. **`usesLeft` was read before the increment**, so two concurrent redemptions
   both told their customer one use remained when none did. `RETURNING uses`.
10. **`pageFromPath` and `subFromPath` disagreed about `/downloads/a/b`** — prefix
    match said `downloads`, the second-slash guard said `null` — so the index
    rendered at an address that is not the index, and `go()`'s early return
    (page and sub both already matching) meant nothing ever corrected the URL.
    The address bar kept the broken path for the whole visit.
11. **Every `/downloads/<anything>` was an indexable soft-404 with a
    self-canonical.** `page-meta.ts` argues at length that `notfound` is
    `UNLISTED` because the SPA fallback answers 200; the prefix route re-opened
    that without limit. Sub-pages are `noindex` and canonicalise to the index.
12. **The harness drove only happy paths.** The single-message refusal invariant —
    the thing the module's longest comment defends — the `uses < max_uses`
    last-way-in guard, revocation, `usesLeft`, ranges, `HEAD` and the oracle were
    all untested, and the cascade check could not fail (it asserted a 404 the
    route returned whether the cascade fired or not). All added; **342 → 357**.

### Four in the duel

1. **The hit flash was lost on 48.7% of blows.** The decay sat on `stepFighter`'s
   first line, which made it a casualty of the fairness coin: with the attacker
   stepped first, the victim's own step ran later in the same call and decayed
   the flash below `drawFighter`'s `flash >= 1` before anything drew. Measured at
   854 of 1,755; the renderer gate's flash count went **336 → 627** on the fix.
2. **`runDirector` ran above the hit-stop return**, so the exchange clock advanced
   while both move clocks were frozen and director-time drifted ahead of
   move-time. **20 of 2,200 reaction starts began before their cause** — the one
   bug class this effect has a rule about. The sequence gate asserts that ordering
   in beat space, where the skew cannot exist.
3. **`duelFocus` under-reported a rolling fighter by a constant** where the
   renderer tucks by a sine over the window, so the entry and exit of every roll
   told the camera the body was 24% narrower than it is drawn — 2,080 of 10,963
   turning frames, worst 11.1 units a side. The camera gate cannot see this: it
   compares the view against `duelFocus`'s own output.
4. **`spawnSparks` sheared the contact bias** with two independent multipliers
   instead of one, injecting ±27° of direction error immediately after the
   function whose purpose is to fix the direction.

Both duel fixes were gated in a new check and **each half verified by putting the
bug back**: 48.3% of blows lose their flash, and 12 reactions invert.

### What was not fixed

The `duel: fairness` gate still asserts `sigma < 3` on an unseeded run, so it
trips about once in 370 runs on correct code — and `npm run check` is `predeploy`.
Unchanged deliberately, for the reason recorded below: the tempting repair
weakens the gate, and sampling fresh randomness every run is arguably the point.

### What could not be observed

The `416` branch does not fire against local R2 — miniflare declines an
unsatisfiable range and sends the whole object, which `rangePlan` correctly reads
as "not a partial" and answers 200. That is a documented, safe path, and the 416
arithmetic is covered by the unit gate rather than by a live request. Everything
else in the list above was confirmed against a running Worker.


## 2026-08-20 — downloads: categories, prices, filters and sort, and eight bugs found on the way in

Client: *"please review the downloads page. make sure there are no bugs. I need complete control of
everything about this page from my admin panel/page. descriptions/prices, categories, filters, sort
by, with an icon for each category. please anticipate all types of software so I have a list to
choose from when uploading to cloudflare bucket… or just have an upload portal for me as well."*

The upload portal already existed (`FileManager`, 2026-08-20 earlier the same day). What did not was
any way to change a file after uploading it, and that turned out to be the theme of the review: a
lot of this feature had a working Worker route with no control wired to it.

### The reversal: prices, and why it is only half a reversal

`docs/DOWNLOADS.md` listed *"No prices on the page"* under *Things that are decisions*, on the
grounds that the site names no figures except the client's own rate on `/home`. The client has now
asked for prices. That settles it — but the reasoning was about the *site*, not about the client's
freedom to name a figure, so the reversal is scoped to preserve it: `price_cents` is stored per file
and rendered only where `download_pages.show_prices` is set, and that column defaults to **0**. Every
page that exists renders exactly as it did until the operator ticks a box. The decision moved from
being made once, here, to being made per page, by them.

Three consequences that are decisions rather than plumbing:

- **Cents, not a decimal.** 19.99 is not representable in binary floating point and a sort on it
  eventually disagrees with itself. The form takes dollars and rounds once, in `toCents`; the Worker
  **refuses** a non-integer rather than clamping, because a price silently floored to zero or
  multiplied by a hundred is discovered by a customer.
- **Zero is "no price", never "free".** They are different columns answering different questions —
  `free` is the gate, a price is a figure. So `sortFiles` puts unpriced files **last**: letting 0
  lead puts everything with no figure at the top of a price-sorted list, which reads as a page of
  free programs on the one page where things are sold. Gated.
- **A free file is sent `price: 0` whatever is stored**, resolved in `shapeFile`. Found in the
  browser: after editing a file to have a price and leaving it ticked free, the row read
  `free · $12.50` next to a working download button. Resolving it in the renderer would have been
  the obvious fix and would have been wrong — the same response feeds the sort, so the file would
  have sorted among the paid ones by a figure the page never showed. One place decides.

### Categories

Twenty-one, in `src/data/downloads.ts`, append-only, with `PICKABLE_CATEGORIES` beside them — the
`FX`/`PICKABLE_FX` split, applied a third time. Written as the shelves of a repair toolkit rather
than an app-store taxonomy, which is why *Boot & rescue media* is one and *Productivity* is not.
`categoryOf` never returns undefined: an unknown id resolves to `other`, which is honest, where
falling to index 0 would silently claim every stray row is a diagnostic tool.

`CategoryIcon.tsx` draws all twenty-one — the third answer to `SPEC.md`'s no-images rule, after the
favicon and `FileIcon`, and deliberately shaped like `FileIcon` so the two read as one family. One
ink per mark, and the ink is an accent: a category has no container, so `FileIcon`'s outline/glyph
split has nothing to split and a second colour would be pure decoration. **Every mark is one
silhouette with no interior detail**, because they render at 16–20px — the duel-costume lesson
(*at this size the edge of the shape is the whole recognition*) applied to something much smaller.
A broom was drawn for *Cleanup* first and lost its bristles at 18px; it is two sparks now.

### The filter row, and the phone measurement

Chips for categories, native selects for platform and order. The asymmetry is the point: the
category is the thing with a mark against it, so it is the one worth showing all of at once — a row
of marks is a picture of what the page holds. Two more rows of chips would bury the row that
matters.

**On a phone the chips become a select too, and that is measured.** At a real 420px in the sitelab
iframe, eight categories at the 44px touch minimum wrapped to five rows and occupied 260px — more
vertical space than the list they filter, so the page opened on its own filter with the first
program below the fold. As three selects the whole row is 162px. Rendered as one control or the
other, never both hidden by CSS: two controls for one setting is two entries in the accessibility
tree and two things to keep in step.

Also moved after first seeing it: **the row belongs below the operator's prose and directly above
the files.** Rendered above the intro it reads as a toolbar the page is wearing and pushes the one
thing on the page written by a person below a row of widgets. The free-form look keeps it at the top
because there the prose and the file groups are interleaved and there is no "below the prose".

And two things are asked of **every** file rather than of the filtered view: the unsigned-Windows
notice and the code box. A safety notice that disappears when somebody narrows to "Scripts" is a
notice with a hole in it, and a code box that vanishes under a filter is a page with no way in.

### The eight bugs

1. **`DownloadPage` carried its own copy of the layout list.** `["list","cards","sheet","blocks"]`,
   hardcoded, against the imported `PAGE_LAYOUTS` everything else uses. A fifth layout would have
   been offered by the editor, stored by the Worker, demanded of the stylesheet by `npm run check` —
   and rendered as a list by this one line. The exact second-copy bug this codebase keeps a rule
   about.
2. **A page-scoped code displayed as "everything paid".** `DownloadCodeRow` had no `slug` field
   while `listCodes` had been selecting one since sub-pages landed, so every code minted from the
   mint form on that very screen — which scopes to a page — rendered as the widest possible scope.
   On the one screen whose job is to say what a code opens. Found by reading the type against the
   SQL.
3. **There was no way to mint a file-scoped code.** `DownloadCodes` said *"mint it from that file's
   row in the downloads editor"*; no such control existed anywhere, and had not since the feature
   shipped. The Worker, the API and the ticket format all supported it. There is a **Code** button on
   each paid row now.
4. **There was no way to edit a file.** `saveFile` was written as insert-or-update and only ever
   sent inserts: changing a blurb meant re-uploading the program. The form now fills from a row and
   the picker becomes optional. Which exposed the next one.
5. **The edit would have renamed every download it touched.** `shapeFile` deliberately does not
   publish `filename`, so the only value the editor had to hand for that field was the *display*
   name — a different string, usually with no extension. Fixed in the Worker rather than by
   publishing the filename: an absent filename now means "keep the one this row has", and the
   extension rule is re-checked even when the value came from the row, because a value stored by an
   earlier laxer version is the one nobody thinks to re-validate. Verified in the browser: after
   editing name, category and price, `filename` in D1 is still `drive-check.exe` and `size_bytes` is
   unchanged.
6. **A code-gated page was not listed on `/downloads` at all.** `canList` deferred to `canRead`,
   which is false for a `code` page without a ticket — so the page that is supposed to *say it
   exists and is locked* was indistinguishable from `unlisted`, reachable only by direct link. That
   asymmetry is the whole point of having both settings: a draft and a `granted` page 404 because the
   existence of a page named after a customer is itself the secret, whereas somebody holding a code
   has to be told where to type it. **The tell was already in the file**: `listPages` computed
   `locked: !canRead(...) || …`, a branch nothing that got past `canList` could ever satisfy.
7. **`finishUpload` stamped a row usable when the object was not there.** `head` returning null wrote
   `size_bytes = 0` and set `uploaded_at` anyway — the one outcome the whole write-row-then-mark-
   usable dance exists to prevent, because the file is then offered to customers, prints its size as
   "—", and 404s on the click. It refuses now, leaving exactly the invisible-draft state a browser
   that closed mid-upload leaves.
8. **`addGrant` did not check its scopes while `mintCode` did.** A typo'd handle was refused and a
   typo'd page or file was not, so the grant appeared in the list, opened nothing, and was discovered
   by the person it was given to. Both are checked now, and **as a pair**: an item id that exists but
   sits on a different page is the interesting mistake, because `grantedFile` tests both halves of
   one row, so such a grant can never match anything at all.

### Two dead CSS tokens, and the gate that is the real outcome

`.v-dl-name`, `.v-dl-card-title`, `.v-dl-title` and `.v-dl-block-head` asked for
`var(--display-weight, 600)`. The token is `--type-display-weight`. So four of the downloads
surface's headings ignored the typeset's own display weight and rendered at a hardcoded 600 — on the
one surface added *after* the webfont work whose entire point (deviation 14) was that every heading
had been the user-agent's `bold` in all five typesets. And `.dl-sheet .v-dl-name` asked for
`var(--mono, ui-monospace, monospace)` against a token called `--font-mono`, so the layout whose name
is literally "dense and mono" was the one place on the site not using the site's mono.

**A `var()` with a fallback never fails and never logs.** It renders something plausible for ever.
That is a class of bug this codebase could not otherwise detect at all, so the fix is a gate:
`npm run check` now collects every `var(--x)` any stylesheet reads and every `--x` anything writes —
stylesheet declarations, `@property` registrations, and any TypeScript that names one, with `var()`
reads stripped from the TypeScript first so a typo in a template string cannot declare itself.

It found a third instance the moment it was written: **`--ent-ease`**, read twice in
`entrances.css` and written nowhere. Not a typo — a real per-layout knob, like `--ent-dur` and
`--ent-stagger`, that no layout has ever set. Its value was therefore the fallback curve, spelled out
identically in the base rule and again in Deck's longhands. Two copies of a curve is the shape of bug
that file already documents twice: retune one and Deck's arrival silently stops matching everything
else's, on the one layout whose entrance rule exists *because* it was already clobbered once. It is
declared once on `.has-entrances` now, and the fallbacks stay as belt and braces.

### One tooling change

`vite.config.ts` gained a dev-server proxy for `/api` to `127.0.0.1:8787`. **This is what makes an
API-backed page reviewable at the phone band at all.** The verify-site skill reaches a band by
framing `sitelab.html`, and framing only works against Vite — production and `wrangler dev` both send
`x-frame-options: DENY` from `harden()`. So before this, any page that fetches (the account pages,
`/machines`, `/share`, and `/downloads`) could be seen at desk width or not at all, and the phone
band was checked by reading CSS and hoping. `vite build` never reads `server`, so it ships nothing.

### Ten more, from a correctness review after the security one

The security review came back clean. A separate correctness pass over the same diff
found ten, and the first four are the ones worth carrying:

1. **A free file's price was destroyed by any edit at all.** `shapeFile` zeroes
   the price for a free file — correct for rendering — and the editor loaded its
   form from that same public response. So the box came up blank and the next
   save wrote the blank back. Ticking free, saving, then later fixing a typo in
   the blurb silently deleted the figure, **while the form's own hint promised
   "the figure is kept, and comes back if you untick it"**. The interface was
   lying in the one direction that costs money. `shapeFile` now sends `price`
   (rendered, zeroed when free) *and* `priceCents` (stored, raw); the editor
   reads the second. Two fields because they answer two questions.
2. **Switching pages mid-edit moved the file to the other page.** `FileManager`
   is inside a `{slug ? … : …}` ternary that stays on the same branch when the
   page select changes, so React kept the instance and `editing` with it. Press
   Save changes and `saveFile`'s `slug = excluded.slug` moved that file, keeping
   the old page's `position`. Reproduced against a production build.

   **`key={slug}` was the obvious fix and it is not the one that shipped.** It
   fixes the logic — the fiber tree comes out with exactly one instance, keyed
   correctly, reset — but React leaves the outgoing `<div>` connected to the
   document, so the operator sees **two** file managers and the stale one still
   offers to save. Verified in a production build by walking the fiber tree: the
   fragment had two children, both keyed `second`, while two `.v-dledit-files`
   nodes were `isConnected`. Both children reset on `[slug]` the ordinary way
   instead, which cannot duplicate anything — and `submit` additionally refuses a
   file that is not in the list being rendered, which is a guard no state
   confusion can get past. **Do not "simplify" this back to a key.**
3. **A failed replacement took a live file offline with nothing saying so.**
   `beginUpload` nulls `uploaded_at`, which is right for a new file and
   un-publishes an existing one; the editor showed no marker, still printing the
   *old* file's size, so the row looked entirely normal while being invisible to
   every visitor. A comment in `beginUpload` claimed the admin screen showed it —
   it could not, because `shapeFile` never sent the field. It does now.
4. **Metadata was committed before the bytes, on the replace path.** Saving the
   new filename first and then failing to upload leaves the row pointing at the
   **old bytes under the new name**, and `content-disposition` hands that name to
   the browser verbatim — a customer downloads `tool-v2.exe` and gets v1. The two
   paths now run in opposite orders, and the comment says why: a *new* file must
   have its row first, because `beginUpload` refuses an id it cannot find, while
   a *replacement* uploads first so the worst case is new bytes under the old
   name — wrong in the obvious, harmless direction.

The rest: the free-form look had no filtered-to-nothing state and its comment
cited a count line that has never existed; **Price** was offered as a sort on
pages that hide prices (and `savePage` will happily store `sort: "price"` next to
`show_prices = 0`, so `activeSort` refuses it too); the sort control was gated on
the *filter's* precondition, so a page of twelve files that are all Windows
diagnostics — exactly the page that most wants sorting — could not sort; Sheet
lost its dense row gap to the icon rule's 0-3-0 `gap`, on the layout whose whole
description is "dense and mono"; and two actions did not clear a stale error.

**And the new custom-property gate was itself too loose.** Its TypeScript scan
matched any `--token` anywhere in a `.ts`/`.tsx` file, comments included — and
this codebase discusses CSS tokens by name in prose constantly, so a typo that
happened to be mentioned in a comment would have declared itself and the gate
would have passed while claiming otherwise. It matches only writing positions
now: an object key, a `setProperty` argument, a declaration in a template
string. It still passes, which means nothing was being propped up by prose.

### One flaky gate, reported rather than changed

`duel: fairness` asserts `sigma < 3` on an **unseeded** run, so a genuinely fair
process trips it about once in every 370 runs — observed once here, at 3.21σ, on
a branch that touches nothing in `src/fx`. Three re-runs gave 1.93σ, 0.37σ and
0.46σ with the match count drifting 119/120, confirming it is unseeded.

**Left alone deliberately.** `npm run check` is `predeploy`, so this can fail a
deploy at random, and the tempting repair — loosening the threshold — would weaken
the one gate standing behind the role coin's fairness guarantee. But sampling
fresh randomness every run is arguably the point of a fairness test, and a fixed
seed would make it prove less. That is a judgement about how the duel is verified,
not about downloads, so it is written down here for whoever owns that decision.

### What was verified, and what was not

Verified in a real browser against a seeded local D1, at the desk and phone bands with calm off: the
page renders with icons, prices and the filter row in the right order; the category filter narrows
the list; sort-by-price returns `$15, $25, $40, $65` then the four unpriced files in name order; the
phone band collapses the chips and has zero horizontal overflow; the editor loads a file into the
form, saves name/category/price **without touching the bytes or the filename**, reorders with ↑/↓,
and mints a file-scoped code. That code was then redeemed against the real Worker: the file it bought
came back `unlocked` and passed `canDownload`, and a *different* paid file on the same page answered
**403** — the `ticketVisible`-versus-`ticketPages` boundary from the 2026-08-20 review, still holding
under a new set of fields.

**Not verified:** whether the twenty-one marks are the right twenty-one, and whether any of them is
ambiguous to somebody who did not draw it. That wants an eye, and specifically the client's — they
are the person who knows what is actually on the memory stick.


## 2026-08-20 — duel phase 4, part five: the blade lights the body, and a trap nothing was catching

Phase 4's last item — *"real blade lighting (offset from blade midpoint to each limb, intensity by
inverse distance) replacing the fixed-offset rim"*. There was no fixed-offset rim to replace: the
plan itself notes that our figures are stroked in the palette's `--fg` over the palette's background
and so cannot disappear into a dark arena the way the reference's filled bodies can. So the item is
the lighting on its own — a bone near the blade re-stroked in the blade's colour, additively, at an
intensity falling off with distance.

Nothing about it is authored: a guard tints the sword forearm, an overhead wind-up washes the head
and shoulder, a low sweep lights the legs from below. It is the geometry the fight already computes,
read a second time. Three departures from the brief, each for a reason:

- **Distance to the blade *segment*, not to its midpoint.** A sword here is a line light most of a
  body-height long, and measuring from its middle lights a fighter standing at the hilt while
  ignoring one standing at the tip — wrong in the bind and the thrust, the two poses where the blade
  is furthest from its owner. One extra clamp.
- **Per bone, not per limb.** A limb is two bones with a joint that can be a long way from either
  end; lighting the pair as one unit puts a shoulder at the brightness of a hand on the grip.
- **`1 / (1 + (d/R)²)`, not a linear ramp.** A linear falloff has a hard edge where it reaches zero,
  and that edge sweeps across the body as the blade moves — a travelling straight line of brightness,
  which reads as a rendering artefact rather than as light.

**Two things about it want the client's eye, and one is a rule question rather than a taste one.**
The light is drawn in the blade's colour, and the blades are the site's one literal-colour carve-out.
Deviation 9 says *"everything else in the duel scene (bodies, sparks, ground, blade cores,
health-bar tracks) still reads the live palette"* — a body now carries some of that colour, which is
what "the sword lights the person holding it" means and is also a widening of a rule the client
granted for blades specifically. It is a *wash over*, not a recolour: the ink underneath is
unchanged, and it is only ever additive. Flagged rather than assumed. The second is simply whether
the strength is right — 0.5 at contact reads clearly at both the desk and the phone slot on the
contact sheets, and that is a still.

**A fighter is lit by their own blade only, and that is a deliberate stop.** Cross-lighting at the
bind — where both blades sit between the two figures — would want the opponent's blade transformed
into this fighter's local frame, and that frame carries the `scale(facing, 1)` mirror *and* the carry
rotations for a tumble or a roll. Getting a transform chain subtly wrong is the bug class that has
cost this effect the most (the mid-air mirror; the corpse's reported width), it is invisible in a
still, and animation cannot be watched here. The gain is confined to binds. Recorded rather than
attempted.

**The gate that came out of this is worth more than the feature.** `drawDuel` now sets
`globalCompositeOperation = "lighter"` in five places, up from one, each wrapped in
`save`/`restore` — and one missed `restore` leaves the whole page compositing additively from that
frame on. `CLAUDE.md` already records the transform half of this trap (`rain`, and `FxCanvas`
re-issuing a base transform every frame) — but `FxCanvas` re-issues a *transform*, not the composite
operation, the alpha or the styles, so this half had nothing catching it and the surface for it grew
fivefold in one day. `npm run check` now drives `drawDuel` over 40,000 frames of a real fight through
a recording context — including death holds, flash frames and frames with a ground mark live — and
asserts the save stack comes back to zero and the composite operation comes back to `source-over`.
Verified by deleting one `restore`: *"drawDuel left 18 unmatched save() at frame 0"*.

**And it caught a flaky assertion of my own.** The kick gate's *settles* sub-test set a kick and
stepped 600 frames expecting zero — but `advanceDuel` runs a real fight, so a contact in those frames
legitimately re-arms it, and it failed on its second run. Deleted rather than loosened: the unbroken
run length already proves the same thing and cannot be fooled (24 frames real, **3,732** with the
zero-snap removed). A noisy test is one that gets deleted later for being noisy instead of fixed.

---

## 2026-08-20 — duel phase 4, part four: the ground remembers being hit

Phase 4's *"scorch decals cooling white → orange → dark under the fighters, capped"*. Before this the
floor was the one thing in the arena nothing ever happened to: a sword buried in it threw sparks and
left it pristine on the next frame, which is most of why a missed swing read as a whiff rather than
as a mistake with a cost.

**The plan's ramp is three literal colours and this one is not, deliberately.** Every colour here
arrives through `DuelView`, and the palette's own version of white → orange → dark is the three inks
this file already has: `core` (the brightest thing offered), `spark` (the accent that already means
impact) and `line` (what the ground itself is drawn in). Three flat ellipses cross-faded by heat,
rather than one interpolated colour — there is no interpolating between two CSS colour strings
without parsing them. The hot pass is additive so a fresh mark genuinely glows; the warm and cold
passes are not, so a cooling mark settles into the ground instead of staying a light source. A cold
mark is a faint smudge rather than a black hole, which is also the only honest answer available: this
effect draws on a transparent canvas over whatever the palette is doing and cannot darken it.

Three details are load-bearing:

- **A new mark near an existing one reheats it rather than stacking.** Two ellipses a couple of units
  apart at double alpha is a bright blob, not a scuff, and a flurry in one place would fill the cap
  with copies of itself and evict the rest of the fight's history. Reheating is also what a floor
  struck repeatedly in one place looks like.
- **A hard landing marks the ground; an ordinary one does not.** The threshold is `vy > 6`, well
  above the landing squash's `vy > 2` — every hop, roll and handspring in the pool arrests at some
  speed, so marking at the squash's threshold would leave a trail behind ordinary footwork and say
  nothing.
- **The cooling runs above both of `step`'s early returns**, for the same reason as the kick: a mark
  frozen at full heat through a two-second victory hold is a burning floor.

**It was tuned by looking, and the first values were wrong.** At `ry` 2.6 and the initial alphas the
mark was drawn correctly and was effectively invisible, competing with the fighter's own shadow
ellipse directly above it. Confirmed by boosting both temporarily to prove placement, then settled at
`ry` 4.5 with the cold pass at 42% — hot enough to read gold on the frame it lands, faint enough at
the tail to be a scuff rather than a puddle. `scripts/duel-shot.mjs` gained a `ground` strip for it,
stepping 16 frames a cell because a three-second cool sampled every frame is twelve identical cells.

**Gated** with the kick, since both are world state with the same two invariants — a ceiling and a
return to nothing — and both were verified by breaking them: dropping the spent-mark filter fails on
*"a spent ground mark is still in the list"*, and dropping the kick's zero-snap fails on *"a kick
stayed live for 3,732 frames"*. Measured over 200,000 frames the fight never holds more than **3** of
the 10 marks allowed, so the cap is headroom rather than something that bites.

---

## 2026-08-20 — duel phase 4, part three: the frame kicks, and the camera had to be told

Phase 4's *"directional shake"*. A contact displaces the whole drawn world by a few units **along the
direction the blow was travelling**, and the displacement inverts and shrinks every frame — so it is
a shake rather than a lurch, and it carries information rather than merely announcing that something
happened. That is the same argument `contactSpray` makes about the sparks, and the direction comes
from the same `swingDir` both now share, so the smear, the spray it throws and the kick it delivers
cannot disagree about which way a sword went.

Four decisions in it are worth keeping:

- **It is opt-in and the ornament is the only caller, on the same split as the health bars.** In the
  slot the fight is the subject and a jolt belongs to it; full-bleed behind body copy it would
  displace the entire backdrop under somebody reading. It is its **own flag** rather than a read of
  `bars`, because those are two decisions, and it defaults to *off* — a caller that forgets it loses
  a flourish, where the other default shakes a page under a reader.
- **The larger kick wins; kicks do not sum.** A killing blow landing on the same frame as a clash
  would otherwise stack into a lurch no single blow produces.
- **The decay runs above both early returns in `step`.** The death hold and the hit-stop each return
  early, and a kick that stopped decaying inside either would park the world off-centre for the two
  seconds of a victory hold — the one moment anybody looks at a still image of this fight.
- **The camera had to be taught about it, and that changed what the gate can promise.** `duelFocus`
  frames the two bodies and knows nothing about the offset, so at 4.5 units the kick cut a fighter
  off on **3 frames of 200,000, worst by 6px of 700**. The fix went into `duelCamera`'s existing
  *never cut the subject in half* rule, which now adds the live kick to the subject's extent — and
  because it bites only in the corner case that rule exists for, the camera does not jitter along
  with the shake in ordinary play. The honest consequence is that a kick delivered against a wall is
  damped by the camera panning to keep the pair in shot.

  **That fix removed the clipping gate's ability to bound the constant**, and the comment on
  `DUEL_SHAKE_MAX` says so: 12 now passes it as cleanly as 4.5. What is gated instead is the pair of
  invariants — a kick never exceeds the constant, and it always returns to exactly zero rather than
  leaving a residue that parks the world off-centre. Measured: live on **9.7%** of frames, worst
  4.50, longest unbroken run 24 frames. Whether 4.5 is the right number wants an eye.

---

## 2026-08-20 — duel phase 4, part two: the struck fighter flares, and the bench was lying

Phase 4's *"1–2 frame silhouette flash on the struck fighter"*. Two things had to be fixed before
the change could be *seen*, and one of them was in the tool rather than in the site.

**The flash is `spark`, not `core`, and that was found by looking.** The first version drew the
struck figure in `core` on the reasoning that it is the brightest thing the palette offers. Rendered,
it was very nearly invisible: `DuelOrnament` passes `p.fg` for **both** `ink` and `core`, so the swap
changed the alpha and nothing else. Only three colours reach this file and `spark` (`p.a2`) is the
one that already means impact — the spine glow and the force rings are drawn in it.

**Its length is derived from the hit-stop rather than chosen.** `damage` sets `flash` to exactly 1,
`stepFighter` decays it by 1/12 a frame, and `stepFighter` does not run while `hitStop` counts down —
so `flash === 1` is precisely the set of frames the world is frozen for. The flare is the hit-stop
made visible instead of a second timer that could drift out of step with it: three frames, 50ms, for
a `hit`. A first attempt used a 0.9 threshold and a comment claiming two frames; measured, it was
four, because the freeze holds the decay. The spine glow that already existed now runs only *after*
the silhouette drops, so the two are sequential — impact, then residue — rather than stacked.

**`scripts/duel-shot.mjs` gained a `hit` mode, and building it turned up a defect in the bench.**
Impact feedback is measured in single frames, so every other strip in that file — which samples every
third or seventh — steps straight over all of it. The new mode steps one frame at a time until a blow
lands, then draws with no gap at all.

Two things had to be right for it to work, and both are worth keeping:

- **The replay is seeded, not cloned.** The first version deep-copied the state a few frames before
  the event and replayed from there; `advanceDuel` rolls for the director on every step, so the
  replayed fight diverged and the blow being hunted did not happen again. `Math.random` is replaced
  with a seeded PRNG for the search *and* the draw, so the same fight runs twice.
- **`advanceDuel(st, n)` does not advance `n` frames**, and every seed-forward in that file assumed
  it did. Its accumulator is clamped to 4 so that a stall can never teleport a match — correct, and
  documented on the function — which means one bulk call steps four frames however large the
  argument. `strip(pool, 240, …)` was therefore drawing the opening guard of a fight, 240 frames'
  worth of *nothing*, every time it has ever been run; `sheet(340, 'desk-moving', 300)` was the same
  still pose as `sheet(340, 'desk', 0)`. A `run(st, n)` helper steps whole frames and every bulk call
  now goes through it. **Nothing on the site was affected** — the site passes small per-frame deltas,
  which is what the clamp is for — but a costume or a move reviewed through those strips was reviewed
  at frame four.

---

## 2026-08-20 — duel phase 4, part one: sparks leave along the contact

`docs/DUEL-ABSORB.md` phase 4's first item — *"directional sparks along the blade-contact normal
rather than radial"*. Two things were wrong and only one of them was the one written down.

**`contactSpray` is the grinder model.** Sparks off an angle grinder do not spray outward from the
contact; they run *along the surface*, the way the wheel is turning, with a smaller part bouncing
off it. So the swing — taken from `f.trail`, the same few frames of blade positions the smear is
drawn from — is decomposed against whatever was struck: the component along the surface is kept
whole, the component driving into it is reflected out at 45%. One function therefore serves a
blade, a torso and the floor, because all three are a surface and a direction of travel. A
descending cut that finishes in the ground now skitters along the ground the way the swing was
going; an overhead into a body runs down the body; a thrust, which has no tangential component at
all, reflects straight back at the thrower.

**The second bug is why the first one would not have shown.** `spawnSparks` added a hardcoded `- 2`
to every spark's `vy` — an unconditional upward kick, on every burst the site has ever drawn,
against a mean bias magnitude of about 2.5. It was very nearly half of where any shower went, so
whatever direction a burst was given, it drifted up the screen like all the others. Measured over
300,000 stepped frames, the circular spread of burst directions was **0.327** (0 = every burst flies
the same way). Giving the bursts a real direction *and leaving the kick alone* took that only to
0.566; dropping the kick to `LIFT = 0.8` takes it to **0.902**. It is kept, small, because a spark
with no lift leaves on a flat line and dies without ever arcing.

It also fixed a comment that had never been true: the blade lock's per-frame shower sets a positive
(downward) bias so the sparks *fall away from the bind*, and against a kick of 2 the net was still
upward on every draw. The lock is deliberately the one contact that does **not** use `contactSpray`
— it is a press, neither blade is travelling, so the helper would fall through to its
barely-moving default and point the shower forward off a guard.

**What was measured and what was not.** An end-to-end metric was built first — does a burst's mean
velocity pass through either blade — and it is meaningless by construction: at a real crossing the
two swords are on top of each other, so *every* direction passes through one of them, and it duly
reported the change as marginally worse (38.3% → 40.7%). The circular-spread number above is the
honest one: it says the contact now determines the shower and the old constant did. **Whether it
reads better wants an eye**, exactly like the burst's placement on 2026-08-17 before it. Alignment
of the burst with the swing is *unchanged* (0.185 → 0.183), and that is the model working as
designed rather than a null result — the spray follows the struck *surface*, not the swing.

**Gated**, and verified by breaking it: `contactSpray` is exported and driven over 528 swing ×
surface pairs, asserting the result is a unit vector and never has a negative component along the
struck surface's outward normal. Flipping the reflection's sign fails it at the first pair.

---

## 2026-08-20 — the downloads catalogue becomes a thing the operator builds

Client, the same day: *"i am going to have a few subpages in it. but i want to be able to design and
name them as i want. so please make some kind of engine that allows my admin panel to create
subpages for the downloads page. each page will be able to host files."* Then, asked how much design
control and who should see them: *"but with option in admin panel to be able to free form as well.
and please have a few different styles/layouts for the page that i can edit and publish and make
live on the site in real time"* and *"even more granularized options that i can set, for each user
on what they can see."*

### It reverses a decision this file recorded a day earlier, and that is the right call

`src/data/downloads.ts` argued that the catalogue is a TypeScript file *because* an editable table
plus an upload interface is "a second content system for a list that will have a dozen rows in it".
That is a good argument about a single flat list and it is the wrong argument about what was asked
for. The value of every part of this request is that it happens **without a deploy** — a page named,
laid out and published while the client is on the phone to the person who is about to download from
it. A deploy step is not a slower version of that; it is a different feature.

It was free to reverse **because the catalogue was empty**. Nothing had to be migrated and no id in
circulation moved. A month from now the same change costs a data migration and a careful look at
every link already handed out, which is worth knowing the next time a "this belongs in code"
decision is made about something the client will want to edit.

### What is load-bearing

**One function decides access, and every read goes through it.** `resolveAccess` resolves the three
independent routes in — operator, granted account, redeemed code — and `canRead`/`canDownload` are
the only two answers. The `file` route used to carry its own rule (free, or a ticket naming the
item), which was right when a file's only gate was its own flag and is not right now that it also
sits on a page which may be a draft, unlisted, code-gated or named to particular accounts.
`canDownload` opens by calling `canRead` on the page, so bytes cannot escape through a page the
caller was refused. Two checks that agree today are two checks that disagree after the next change.

**A draft and a `granted` page 404; a `code` page admits it exists.** Somebody holding a code has to
be told where to type it. The existence of a page named after a customer is itself the thing being
kept quiet.

**Validation moved from the check suite into the Worker, because the data moved.** The two rules
that mattered — an id is lowercase-kebab (it is an R2 object key *and* a URL value) and a filename
must have an extension (`content-disposition` hands it over verbatim) — were build-time gates over a
TypeScript array and are 400s now. What `npm run check` gates instead is the failure this feature
newly makes possible: **a layout offered in the editor with no CSS rule**, which would save fine,
render as the default, and say nothing.

**A page is HTML the site renders, never HTML the operator supplies.** The free-form look is four
kinds of block with no markup. An HTML box would be an XSS hole the first time something was pasted
in from a website, and it would let one page opt out of the palette system that keeps every surface
on this site recolouring together.

**The upload is multipart even for a small file**, and the row is written before the bytes and
marked usable after. `uploaded_at` is null in between and the page hides those rows, so an upload
that dies halfway leaves an invisible draft rather than a link that 404s at a customer. The size is
read back from the object with `head` — the old catalogue typed sizes by hand *because* the page
rendered from the bundle before any request, and that objection died with the catalogue.

### The security review found two real holes, and both were mine

`CLAUDE.md`'s standing instruction is a security review before any deploy touching `worker/`. It
earned its place twice on one change, and the interesting part is that **the property I had written
down was true and insufficient**: `resolveAccess` genuinely was the single place that decided
access. The bugs were both in the *representation inside it*, where the shape of the data quietly
threw away a distinction the rules depended on.

**A code scoped to one file opened every paid file on its page.** A file-scoped code has to open the
page its file is on — the download button lives there — so `opened()` put that page in the ticket.
But `canDownload` read the same list, so "you may look at this page" and "you may take everything on
it" were one fact. A customer who bought one program could fetch the rest by changing one query
parameter, with the ids handed to them in the page response they were entitled to. There is now a
third kind of ticket entry: `@slug` opens a page, `~slug` merely makes it readable, and only the
first reaches the bytes. This directly regressed a guarantee the code it replaced had stated out
loud — *"a ticket for one item cannot be re-pointed at another by editing the query string"* — which
is a good argument for reading what you are deleting.

**Two grants of different shapes combined into one wider grant.** Every `(page, file)` row was shred
into two independent sets with `NULL` collapsing to `"*"` in each, so an account holding a whole-page
grant on one page and a single-file grant on another had the first row's wildcard satisfy the second
row's item test — and could take every file on the private page. Two grants of different shapes for
one returning customer is the ordinary case, not a contrived one. The rows are kept as rows now and
evaluated pairwise.

Both were caught before anything shipped, both have a harness check, and **both checks were verified
by re-introducing the bugs and watching them fail** — 340 passed with 2 failures, exactly the two.

### Proven, not assumed

The harness gained 26 checks and runs against a real Worker, real D1 and real R2: a page authored,
two files uploaded through the chunked path, the **served bytes compared against the uploaded
bytes**, and each of the four visibilities asserted twice — the operator can, and a stranger with no
session and no ticket cannot. A ticket minted for one page is checked against another and refused.
`npm run test:auth` reports **342 checks, no failures.**

One of those runs failed first, informatively: the signup rate limiter refused the *rate-limiting
section's own fixture*, because this section had added two accounts to a harness whose signups were
already "sized just above" an allowance of twelve. The fix was to want fewer accounts — the new
section reuses an account an earlier section already made — rather than to widen a live anti-abuse
control so a test would pass.

## 2026-08-20 — phase 3: four ways to get out of the way, and a camera that stopped cutting people in half

`docs/DUEL-ABSORB.md` phase 3, on the client's *"keep going with the engine and the graphical
overhaul of all the characters."* Everything above answers pressure by blocking it, stepping out of
it or trading with it. Phase 3 is the fourth answer — **get out of the way with the whole body** —
and it is what the reference engine had that this one did not.

**Five moves, seven modules, and one refactor that made all of it cheap.** The renderer used to name
`spin_attack`, `flip_over` and `duck` one at a time in an `else if` chain; `Move.carry` names the
*kind* of thing the body does (`flatten`, `tumble`, `roll`, `crouch`) and `Move.spin` says how much.
So a ground roll and a back handspring cost no renderer changes at all, and — the part that matters
more — the landing gate stopped naming `flip_over` and started walking every move that declares a
turn. `carryWindow` is exported and both the renderer and the checker rotate by it, for the reason
this codebase always extracts a decision it cannot watch.

### The low sweep, and why the obvious version cannot work

`sweep_low` + `hop` is `duck` + `strike_level` upside down: an attack answered with the body rather
than the blade. The first version wound up overhead and swung down at the ankles, which is what a
sweep looks like in the head and is **unanswerable in this rig**. Measured, its tip sat at world y
165–205 on the three frames before contact — inside the jumping fighter's torso — and only then
arrived under their boots. A descending blade travels through everything between the guard and the
floor, and no jump this rig can make clears a whole descent: the body would have to leave the ground
by more than its own height.

So the blade drops into the low line **before** the distance closes, holds there, and the **lunge**
carries it through — the same division of labour `strike_level` uses at chest height, moved to the
floor. The consequence worth knowing if it is ever retuned: a blade at 1.05 rad reaches ~60 units
forward against a level blade's ~88, so a low sweep that does not travel cannot reach anybody.
`span` sizes that travel to the real gap. Measured after: 53 jumps, clearance **14 units at worst
and 39 at the contact frame**, and the gate now derives its own window from the move's table.

**What is deliberately outside the claim**, because measuring showed it is not a defect: on the way
down the tip and the rising boots cross once, so there is a frame or two where they are level. That
is a near miss, it is what jumping a sweep looks like, and it cannot be designed out.

### The camera has cut a fighter out of frame three times, by three unrelated routes

The third one shipped 2026-08-18 with the somersault and nobody saw it, because nobody could:
`drawFighter` rotates a tumbling body about its middle, so it stops being 30 units wide and becomes
51 — and `duelFocus` reported the standing width throughout. Driving the real `duelCamera` at the
component's real 700px buffer over 300,000 **seeded** frames (so every variant sees the identical
fight):

| | clipped, of turning frames | worst overhang |
|---|---|---|
| Before | **8.61%** | 84px of 700 |
| `duelFocus` reports the rotated span | 5.29% | 84px |
| …plus a faster pull-back while turning | 5.26% | 84px |
| …instead: report the widest the turn is *going* to get | 5.25% | 55px |
| **The arena clamp yields to the subject** | **0.00%** | **0px** |

**Both of the plausible fixes were wrong, and attribution is what found the real one.** Pulling back
faster is what fixed the corpse, and here it bought three frames out of 8,179. Anticipating the
turn's widest point is what `top` already does for a jumper's apex, and it bought four. Attributed,
**427 of the 430 remaining frames were the arena clamp** — a fighter tumbling into a corner with the
view held back at the stage edge. What that clamp protects is cheap (the stage has no walls, only a
ground line, so panning past it shows more of the same background); half a fighter is not. It now
yields to the subject, and clipping goes to zero — **including the death hold, which the 2026-08-17
pass left at 10.8%**.

The lesson is the one this file keeps re-learning: *fix the cause you measured, not the cause that
resembles the last one.* Both wrong answers were the right answer to a different bug.

### Seen, not assumed

`scripts/duel-shot.mjs` gained a `move` mode: it steps a real fight until the director calls for a
named module and then samples it, so what comes out is the move in the company it actually keeps.
It has no back door into the engine and should not get one. Three things were rebuilt on sight —
the roll was a rigid body tipping over until the legs tucked (the rotation was never the missing
half, the *pose* was), the turning parry went fully edge-on and vanished for six frames until `spin`
let it stop at two thirds, and the sweep is the one described above.

**Tempo did not move**: 121 matches over 360,000 frames against 120 before, fairness 0.27σ, all 35
modules reachable. The zero-damage share is 31% against 34%, still well inside the rail.

**Not taken, and flagged rather than assumed:** the brief's *thrown props* and *blasters with
deflection*. Both need a new entity in an arena that has none — the props would be set dressing this
world does not have, and no fighter on a roster of eight swordsmen carries a gun. The deflection
image is built instead out of what exists: `throw-deflected` parries a thrown blade out of the air,
which cost one guard in `resolveContact` (a hand that is not holding anything cannot bounce) and
nothing else, because `bladeWorld` already returns the flying segment.

## 2026-08-19 — the first byte out of the bucket, and every download was a 206

The client created the R2 bucket (*"i set up the cloudflare thing you requested"*), which made the
downloads page testable for the first time: it shipped the day before with an empty catalogue and a
private bucket that did not exist yet, so **not one byte had ever been served through it.**

Benched locally — a real 300,000-byte object in local R2, five code rows in local D1 covering
valid / scoped / revoked / expired / exhausted, and the built site served by `wrangler dev`. The
gate itself was right on every count: lower case and stray hyphens both normalise to the same code,
all four failure states give one identical refusal, a paid item with no ticket is a 403, a
scope-limited ticket cannot be re-pointed, the bytes come back byte-identical, and a resume from
150,000 returns exactly the tail. The unlock reads correctly in a browser at the desk band and the
phone band, and its three controls measure 44–46px, so the touch-target rule from the day before
holds here too.

**The bug was in the arithmetic underneath all of that, and it was on every download.**
`env.DOWNLOADS.get(id, { range: request.headers })` populates `object.range` **whether or not the
request carried a `Range` header** — a plain GET comes back reporting `{ offset: 0, length: size }`.
`file()` tested that field for an offset to decide the status, so a browser that had asked for
nothing received `206 Partial Content` with `content-range: bytes 0-299999/300000`. RFC 9110
§15.3.7 allows a 206 only in reply to a range request. Browsers tolerate it; download managers and
proxies are entitled not to, and the module's own comment explains at length that these are large
files going to people on the connections that made them ring the operator in the first place.

A second shape was found in the same bench and is the more dangerous of the two: **R2 may decline a
range and send the whole object.** `Range: bytes=999999999-` came back complete, and the old code
would have announced it as `bytes 0-299999/300000` — a client resuming at 40MB that believes a
`content-range` it did not ask for writes those bytes at the wrong offset, and the corruption
surfaces as a program that will not run. The suffix form (`bytes=-1000`) is a third shape, and
`R2Range` is a union in which only one of the three carries an offset at all.

**The fix is one exported pure function, `rangePlan`,** for the reason this codebase always extracts
a decision it cannot watch — `edgeState` and `duelCamera` are here for the same reason. The request
header decides whether a 206 is even possible, and a served range that is not genuinely a subset of
the object is answered as a 200, which is explicitly allowed and cannot be misread. `npm run check`
gates it as a nine-row truth table, every row of which was observed against the live local Worker
before it was written down. Verified after the change: no header → 200, a mid-file range → 206 with
the right `content-range`, a suffix range → 206, an unsatisfiable range → 200 with the whole file,
`bytes=0-` → 200, and a resume's bytes still land byte-identical.

Nothing was live to break — the catalogue is empty, so no customer has ever been handed one of these
responses. The fix is in before the first file goes up, which is the only reason this entry is a
note rather than an incident.

## 2026-08-19 — the fighters get bodies, and the no-fill rule is replaced

Client, having looked at the live site: *"ok the swordfights still arent the fixed ones. pleas
emake sure they are either all fixed and deployed, or keep going with the engine and the grpahical
overhaul of all the charcters."*

**The first half of that was checked before anything was changed, and the answer was that nothing
was missing.** The live bundle already contained the phase-1 and phase-2 work — the eight-fighter
roster, `duelholy`, `blade_throw`, `overrun` — and a local `npm run build` produced
`index-CrQwOc01.js`, the exact hash `mcclevarty.ca` was serving. So there was no undeployed fix
sitting in the tree, and the report was not about a stale deploy: it was about how the fighters
*look*. That made it the second half of the request.

**What the client was comparing against.** `handoff_duel_engine/duel-cycle-v2.html` runs standalone
in a browser and got its costume pass on 2026-08-19: filled masses, each with a dark rim. The
site's roster was eight *stroked* figures. Side by side, the site's are wire diagrams.

### Seeing it at all, which is most of the work

Animation cannot be watched here — the tab reports `document.hidden`, so `rAF` parks and a
screenshot returns a stale frame. `scripts/duel-shot.mjs` is the tool that came out of this and it
is worth keeping: it bundles the **real** `src/fx/duel.ts`, drives it through headless Chrome with
explicit `advanceDuel` calls, pulls the pixels out with `toDataURL` and POSTs them back to a local
server to be written as PNGs. `sheet` draws one guard per fighter side by side at both the desk and
phone slot sizes; `strip` samples an exchange every seven frames.

**The contact sheet is the tool, and one duel is not.** *"Can you tell them apart at a glance, in a
row"* cannot be asked of a single fight, because in a single fight you are never comparing. Every
problem below was found on the sheet, and three rounds of it were needed.

### The rule that was wrong

`fighters.ts` said **stroked, never filled**, and `npm run check` failed a costume hook that called
`fill` at all. It was written from a real failure — the version the client rejected on 2026-08-14
drew a filled torso quad, a filled head block and a filled robe, which composited into one pale
slab as wide as the figure was tall (*"they are holding shields"*) — and it stopped one letter
short of the right rule. Banning the fill banned the slab **and every filled mark**: a hood, a
helmet, a horn, a wing. At the ~61px figure the phone slot renders, a three-unit outline is a pale
thread, so all eight came out as the same stick with something faint on top. The rule was
protecting a lesson that had been learned and costing the thing the lesson was for.

It is now about **where the fill lands**, and the gate measures it: a filled shape covering under
45% of the torso box may be solid; one covering more is cloth and gets at most 35% of the body's
own alpha, so the spine and both limbs read through it. That number is the actual difference
between a cape and a shield. The bounds were **measured, not guessed** — a first attempt used
22×26 box limits, and driving the roster showed those refusing a hood (25×30) and a crown (30×22)
that are obviously not slabs, while allowing nothing that mattered. Coverage is the property that
separates the two cases; box size never was.

Two things fell out of it that are worth carrying anywhere else on this canvas:

- **There is no second colour to rim with.** The reference engine outlines its filled marks in a
  dark edge, which it can do because it owns its arena's background. This canvas is transparent
  over the palette, so a rim would be a literal colour and the site has exactly one of those
  (the blades). Fill and edge are the same ink; marks merge with the body on purpose, and marks
  that must stay apart are held apart by alpha.
- **Interior detail is therefore worthless.** Nothing can draw a face inside a hood or a grille
  inside a helmet, so *the silhouette is the whole character*. A brow line, a chest strap and a
  stole were each drawn, looked at, and deleted: noise at desk size, invisible at phone size. The
  stole was the clearest — two vertical bands next to two robe edges and a spine made five
  parallel verticals, and the saint read as wrapped rather than robed.

### Bodies, not just marks

`prop` gained `head` and `build`, and `FighterKind` gained a `stance` — `settle` (hips lowered, so
the knees bend and the spine shortens), `spread` (half the distance between the feet) and `heel`.
**The old spread was a flat 4 against a hip at 7**: both feet stood *inside* the hips on every
fighter, which is not a guard, and with the knees bent it came out as a duck-footed squat. The
stance moves the hips and the feet and **never the shoulders**, because `bladeLocal` hangs the grip
off the shoulder line — the same containment that keeps `prop` from having a height multiplier, and
for the same reason: a figure whose drawn blade disagreed with `bladeGap` is the "proximity is not
contact" bug class bought for nothing.

`build` draws the two *edges* of a chest from the shoulder bar to the hips. That is the rejected
shape with the fill taken out, which is a ribcage rather than a slab, and it is given to two
fighters out of eight deliberately: the contrast with the six plain sticks is what makes the two
heavies read heavy.

### Four costumes were rebuilt on sight, and two more after that

The sheet is what caught them. The hood was three straight lines making a triangle that floated
above the skull touching nothing — a party hat on a ball; it is a mass seated on the head now. The
wings were four thin strokes from one root and read as a bundle of straw — three heavier feathers
with gaps between them read as a wing, because at this size the *gaps* are what separate the
feathers. The horns rose side by side off the crown and read as a rabbit; they leave the temples
sideways and turn up at shoulder width now. The crown was five spokes radiating out of a skull —
a sun — and is one closed path, a band with points on it. Then, on the next sheet: the crown's
pauldrons ran level from shoulder to shoulder across a thin body and read as one plank laid over
the figure, so they angle down and away with the shoulder bar visible between them; and the devil's
far horn at half alpha and half reach dropped out of the silhouette entirely on a phone, leaving
one scythe, so depth there is worth about 25% of alpha and no more.

### Two gate bugs found while changing the gate

- **`Math.min(...pts)` overflows the call stack.** The reach check spread one argument per recorded
  point, and the hollow's hem is a loop of chevrons: six figures of points across the sweep, and the
  gate died with `RangeError` rather than a verdict. It folds now. This would have arrived the first
  time anybody drew something in a loop, and it reads as the gate being broken rather than as the
  costume being wrong.
- **The synthetic body was nobody's.** It hardcoded `hr: 8`, `shX: 11`, `hipY: 42` while the rig
  scales all three per fighter, so the reach it measured — and therefore the `headroom` the camera
  reserves — was a number about a figure that does not exist. It is built from each fighter's own
  `prop` and `stance` now.

### One VFX change, which is phase 4's first piece

The blade smear was drawn normally: a 13%-alpha red fan over a near-black arena composites to dark
maroon, i.e. a *darker* shape than the background, so every swing dragged what looked like a sheet
of coloured plastic behind it. It and the blade's outer glow pass are **additive** now, which is
the bloom `docs/DUEL-ABSORB.md` signs off on (*"if bloom is wanted, it is a second additive stroke,
not a shadow"* — the reference engine spends ~5,700 shadowed draws a second on the alternative).
Under `lighter` the fan can only add, so it reads as an afterimage of something bright, it cannot
darken the effect behind it in the background presentation, and where it crosses itself at the turn
of a swing it brightens instead of muddying. The composite op is restored immediately; it is the
only one in the file.

**What still wants an eye, and no bench can settle it:** whether the costumes read *while moving*,
which is the only state the site ever shows them in. Stills and seven-frame strips are what this
environment can produce and they are not the same question.

## 2026-08-18 — the duel has a cast, and the costumes are gated

Phase 2 of `docs/DUEL-ABSORB.md`, the same day as phase 1 below. Client: *"make the characters
obvious and instantly identifiable, but do not name them on pages that are not accessible only by
me, to avoid any copyright or legal bullshit."*

**What there was.** Four styles, and the entire costume was four marks drawn on the head — a hood
peak, two horns, a halo, a helmet brow — with a comment explaining that at the size these render,
the head is the only place a silhouette difference survives. That was true when it was written and
has not been true since 2026-08-14, when the ornament gained a camera and roughly doubled the size a
figure renders at (~61px on a phone, ~109px on desk). Each duel id was also pinned to one pair
forever, which is the character-level version of the loop phase 1 had just removed from the
exchanges.

**What there is.** `src/fx/fighters.ts`: eight costumes — four good, four evil — in two pools of
four pairings, with `back` / `head` / `overlay` draw hooks and render-only `shoulder` / `weight` /
`hunch` multipliers. Both duels roll a pairing on mount **and again on every match reset**, so the
fighters change every ~52 seconds.

**Four decisions worth keeping:**

- **No height multiplier**, though the brief asked for one. The blade is drawn inside the same
  transform as the body and its length feeds `bladeGap`, the clash test and every contact frame in
  `MOVES`. A vertically scaled figure holds a sword whose drawn length disagrees with the one the
  simulation is using — the "proximity is not contact" bug class, bought for a cosmetic.
- **Costumes are stroked, never filled, and the gate enforces it.** The rejected 2026-08-14 version
  was filled geometry and read as *"they are holding shields"*. That is a rule about draw calls, so
  it can be checked rather than remembered.
- **Per-costume head clearance.** `duelFocus` reserved a flat 26 units above the torso origin.
  Measured over 320,000 frames across all eight pairings: horns, halo and wings were cropped on
  **0.07%** of frames — roughly one visible clip every 23 seconds — and per-costume clearance takes
  that to **0.00%** for a median camera scale of 2.71 against 2.70 out of a possible 2.9. The gate
  re-derives each declaration from the drawing calls and fails on slack as well as shortfall,
  because over-declaring is not free.
- **No real names and no nametags.** The client permitted names on operator-gated surfaces; none are
  used, so the residue flagged in the plan — real names sitting in the shipped bundle even when
  never rendered — does not exist. Nametags were allowed "if they read at ornament scale" and do
  not: a legible label is a seventh of a 61px figure's height, and deviation 8 already refuses to
  caption the fight.

**The costumes were looked at, not reasoned about, and that is the transferable part.** Animation
cannot be watched in this environment, but a still can: the real `drawDuel` was driven into a canvas
under headless Chrome and screenshotted, eight costumes at one pose, at desk scale and at the phone
slot's true ~61px. **Three of the eight failed on sight** — the wings read as a leaf (any closed
curve at this size is a blob with a highlight round it; they are an open fan of feathers now), the
cape read as a plank down the figure's side (both edges now stay behind the spine and the hem is
wider than the shoulders), and the helmet read as a slightly thicker head (it is drawn wider than
the skull it covers). None of those three would have been found by any bench, and all three took one
screenshot each.

Two gates, seven assertions, each verified by breaking it deliberately; plus a stepped gate that a
pooled fight rotates its fighters and a pinned pairing does not, because the reset branch it touches
is the same one that clears the anti-stall rail and has had two shipped bugs in it.


## 2026-08-18 — the duel's exchanges are generated, not selected

Phase 1 of `docs/DUEL-ABSORB.md`, which is the plan for absorbing the second duel engine the client
had built. The client's ask, verbatim: *"completely random, not a set amount of looping duels."*

**The problem was exactly what that sentence says it was.** `SEQUENCES` was 28 hand-authored arrays
of beats and `chooseSequence` picked one whole, so every exchange after the twenty-eighth was an
exact repeat of an earlier one — same arcs, same frames, same outcome. A match runs ~23 exchanges,
so a visitor watching two matches had seen the entire vocabulary.

### What was built

28 `MODULES`, each a builder `(roll) => { beats, length }`. The director picks one by weight and
band exactly as before, and then **builds** it: two picks of `riposte-chain` are two different
exchanges, not the same one twice.

**Every reaction frame is derived from the move table rather than typed.** This was not in the plan
and is the part that makes the rest safe. A module computes `lands(move, at)` — `at + contact`,
counting a skipped wind-up — and places the block, the flinch and the trailing rest against it, so
rolling a diagonal cut into an overhead moves all three with it. The class of bug that has cost this
effect the most, a reaction scheduled before its own cause, becomes *unrepresentable* rather than
merely checked for. The hand-authored table had that bug at least twice (`trade`'s flinches,
`spin-connects`' knockdown) and both were found by a gate after shipping.

**Modules chain rather than concatenate, and that is the one deliberate change from the plan.** The
plan said compose 1–3 modules up front with beat offsets. That needs each module to declare which
band it *leaves* the pair in, and a wrong declaration schedules a close exchange at 250 units, where
the swords swing through air. Chaining runs one to three modules under a single role coin and
**re-measures the band before each**, so the second module of a phrase is chosen against the
distance the first actually produced. Same phrase-level variety, no guessing, and no cross-module
beat arithmetic to get wrong. `st.dir.chain` carries it; it is rolled at the same moment as the coin
and consults nothing, and it clears on match reset because a run of pressure cannot survive the
fighters teleporting back to their marks.

Phrases are cut to one module under the anti-stall rail, so the closing exchanges of a match each
get a fresh coin.

**Two modules deliberately roll almost nothing**, and both say why in place. `under-the-sweep`'s
sweep/duck pairing is a measured fit between two specific blade curves — the blade runs at y 1–8
while the ducked head sits at 22 — so rolling either arc or sliding the crouch puts the head back in
the sword's path. `riposte-instant`'s five frame numbers are a chain of dependencies ending in a
six-frame window for the attacker's deferred recoil; rolling any of them closes that window on some
runs and not others.

**There is no rejection loop anywhere in the pool.** `cutAfter` picks the next arc by offset rather
than re-rolling until it differs, because a loop whose length depends on a roll is a loop that waits
on a condition, and the match-reset loop has no timeout. Every loop in a module is counted.

### The gate had to change shape, and got stronger

A table can be read; a generator has to be run. The old gate walked 28 arrays. The new one builds
every module 8,000 times from a fixed per-module seed — **224,000 sequences** — and asserts on every
one: beats in ascending order, none at or past `length`, no unknown move, `quick` only where a
`windup` exists, power in range and positive on a scripted hit, no outcome on a move that can never
connect, no damage reaction before every blow that could cause it, no recovery scheduled while a
thrown blade is still in the air, `hits` holding on every roll, and every move reachable. Per-move
properties that no roll can affect — `windup < contact`, contact outside a `hold` plateau — moved to
a single pass over the move table.

Two of those are new invariants rather than ports:

- **The throw guard.** `bladeWorld` returns the flying segment for the whole flight, so a beat that
  gives the thrower another move mid-flight takes the hand to a rest pose while the sword is 200
  units downrange — and the smear, the blade-on-blade spark test and the burst placement all follow
  the blade into the wrong story. `the-throw` floors its recovery against the move's own length;
  this is what keeps that true.
- **Builders must emit beats in order.** `buildSequence` sorts them, so an out-of-order beat cannot
  reach the site — but `runDirector` stops at the first beat not yet due, so one would have stalled
  every beat behind it, and the sort would have hidden the arithmetic mistake that produced it.

**All five new assertions were verified by breaking them deliberately**, per the standing
discipline: reversed `the-overrun`'s beats, dropped `the-throw`'s floor, moved a stagger one frame
early, made a `hits: true` module roll its hit away, and declared `hits` on a module that never
lands one. Each failed with the right message.

### Measurements

Benched identically against the pre-change engine — same bench file, same 600,000 stepped frames,
same starting styles. `git stash` on the two changed files was how the "before" column was taken,
which is worth doing rather than trusting a number written down earlier:

| | before | after |
|---|---|---|
| Exact exchange repeated within its own match | everything past the 28th | **0.03%** (3 of 9,290) |
| Distinct forms of the thinnest module | 1 | 517 |
| Median match | 50.4s | 51.8s |
| Mean match | 49.3s | 50.2s |
| Modules (sequences) per match | 23.3 | 23.3 |
| Picks under the anti-stall rail | 12.0% | 10.8% |
| Close-band occupancy | 62.5% | 60.1% |
| Far-band occupancy | 0.08% | 0.05% |
| Side bias | — | 0.46σ over 119, 1.18σ over 783 |

Module-id reuse within a fight is 35.1%, against **48.4%** measured on the reference engine — but
the number that matters is that reusing an id no longer means reusing the exchange.

**Three modules were thickened after the first bench.** `step-in`, `close-the-gap` and
`the-overrun` came out at 187, 189 and 209 distinct forms, because a three or four beat module with
two rolled numbers has very little to roll. A `guard`/`circle` choice on the first, an optional
give-ground beat on the second, and a recovery lag on the third took the pool's floor to 517. That
lag is also the better image: two figures turning round a frame or two apart read as two people,
where turning in unison reads as two halves of one animation.

### Two numbers in `CLAUDE.md` were stale before this, and are corrected

Found by benching rather than by reading. The file said matches run **~45s** and the anti-stall rail
takes **7.4%** of picks; measured on the pre-change engine they are **50.4s** and **12.0%**. Both
figures predate the 2026-08-18 choreography sheet, which added moves and lengthened exchanges.

It also said roughly a fifth of the pool's weight deals no damage, naming `probe`, `standoff` and
`disengage` — and `disengage` deals damage. The real quiet set is `close-in`, `step-in`, `probe`,
`overhead-denied`, `standoff` and `the-overrun`, and it is **34%** of the weight. The weights have
not changed since the table shipped; only the description of them had drifted. The gate now reports
the share on every run and rails it at 40%, so it cannot drift again silently.

### Not done, and why

Phases 2–5 of `docs/DUEL-ABSORB.md` — character identity, new moves, VFX, audio — are untouched.
Phase 5 carries a product question that is the client's rather than this side's: the site's rule is
*"every voice is fired by a gesture"*, and a duel clash is fired by the animation. The rule's
purpose is satisfied as long as duel audio only sounds when `sound` is explicitly on; its letter is
not.

**What no bench can settle**, and it is the same open question the tempo work left: whether a
chained phrase reads as one fighter pressing an advantage or as two exchanges glued together, and
whether the rolled rests between exchanges land as poise or as a hang. rAF parks in this
environment, so it wants an eye on a real screen.

---

## 2026-08-18 (last) — the duel's remaining choreography, and the defects found building it

`TODO.md`'s section B — the moves designed but never built. Four were outstanding: `duck`,
`overrun`, a riposte with the wind-up skipped, and `blade_throw`; plus the standing note that
**`flip_over` did not flip**. All five are in, along with a sixth that the new checks turned up.

**The somersault now somersaults, and its timing is derived rather than typed.** The move's own
comment described "a still blade under a tumbling body" and there was no tumble — the figure
floated over upright with its legs tucked, and the only `ctx.rotate` in the renderer was the death
tip-over. The rotation window comes out of the move's **own impulse**: a projectile launched at
`vy` under a constant gravity is airborne for `2·vy/g` frames, so the turn starts on the impulse
frame and completes on the frame the feet arrive. Measured over 171 somersaults the landing frame
matched the end of the revolution with a **median offset of 0 frames and a range of 0 to 0**.
Writing `44` there instead would have been correct on the day and wrong the first time anybody
retuned the jump, which is why `scripts/check.ts` now re-derives the same number and fails if a
fighter lands mid-turn.

The turn is exactly one revolution and exactly **linear**. A somersault has constant angular
velocity; the steps at either end are the kick into it and the stop on landing, and easing them
reads as floating — which is the complaint the move started life with.

**The mirror in mid-air was a shipped defect, and it is why the tumble could not simply be added.**
`stepFighter` re-derives `facing` from the two centres every frame, so a fighter crossing the
opponent's centre line mirrored *the entire figure* on one frame near the top of the arc. Measured
across three seeded 300,000-frame runs: **147, 147 and 157 mirror events against ~169 somersaults
flown** — every single one. It had gone unnoticed for the life of the move because a symmetrical
stick figure mirrored about its own centre looks much like itself; put a rotation under it and it is
a flicker. Moves now declare `pass`, and facing is held for their duration, so the turn happens on
the landing frame where a turn belongs. Same seeds after the fix: **0, 0, 0**.

**The separation exemption is a *ground* pass, not any pass, and the first version measured worse.**
Airborne pairs have always been exempt from the body separation — that is what lets the somersault
cross. `overrun` needs the same licence without ever leaving the floor, and the obvious way to say
so is "exempt any `pass` move". That is wrong: `flip_over` is airborne for only 83% of its 54
frames, so exempting it wholesale hands its last nine frames — after it has landed, on top of
somebody — a licence it does not need. Minimum grounded separation fell from **15.79 units to
4.39**. A ground pass is precisely a pass with no vertical impulse, which needs no second flag to
state; with that, the same three seeds give 0.72/0.62/0.64% interpenetration against a baseline of
0.73/0.89/0.74%, and the minimum back at 13.00.

**`overrun`'s sparks were authored against an event that does not exist.** The intent was a shower
as the two blades cross mid-charge. Timing the blade sweep to the middle of the move produced
**3 spark frames in 65 runs**. Two things were wrong, and only measurement separated them: the
bodies pass at mf 14–18 (separation falls 140 → 3 → out again), but the *blades* never meet there,
because a guard puts the tip 77 units forward and the leash holds the pair at ~142 — the two swords
already share 12 units of space on frame one. They are never apart, so there is no crossing to aim
at. The one burst that did fire went off at mf 2 with almost no angular speed behind it and set the
30-frame cooldown, which then swallowed everything else. Sweeping from frame one instead gives
**62 spark frames in 68 runs**, about one burst per charge, where the contact actually is.

A prediction made in that same comment — that a hard opening burst would take the 16-frame cooldown
and throw a second burst at the body crossing — **did not reproduce, and the comment now says so.**
Every burst lands in mf 1–10. Forcing one at the pass would be re-introducing the "proximity is not
contact" bug the force floor exists to kill.

**The riposte is scheduled, not reactive.** `Move.windup` names the frame a strike stops loading
and starts travelling; a beat marked `quick` enters there, so the counter leaves the parry's own
blade angle and lands **four frames** after its beat instead of sixteen. It is a property of the
*beat* and never a runtime test: "enter quick if a parry ended within eight frames" is a condition,
and a condition would move the contact frame, so the reaction beat authored against it would be
right on some runs and early on others. Nothing else in this pool works that way and this does not
either.

**`blade_throw` is routed through `bladeWorld`, and that is the whole reason it was cheap.** While
the blade is out of the hand `bladeWorld` returns the flying segment, so the smear, the
blade-on-blade spark test and `resolveContact`'s burst placement all follow it with no code that
knows a throw exists. Driven through a recording mock 2D context over 400,000 frames: on all 2,758
flight frames the drawn blade is more than 60 units from the thrower's chest, and the only frames it
is within 45 are the launch and the catch, which is the blade leaving and returning to the hand.

Its reach is sized to the gap at release, like `Move.span` and for the same reason. The first value,
`gap + 18`, overshot by about 88 units — it flew clean through the opponent and out the far side,
and since `duelFocus` frames the two bodies and deliberately ignores blade tips, the subject of the
move would have spent its apex outside the ornament's frame. `gap - 40` puts the tip ~15 units past
the opponent's centre: a hit by any reading, and inside the box. Max drawn distance 253.6 → **189.3**.

**Three new gates, each verified by deliberately breaking it**, and two of them found pre-existing
defects on their first run:

- *The move tables are arithmetically sound.* A contact frame may not land inside a `hold` plateau;
  a damage reaction may not precede its cause; a `quick` beat must name a move with a `windup`; and
  every move must be reachable from some sequence. It fired immediately on **`force_hold`**, whose
  contact is inside its blade's hold — correctly, as it turns out, because a force move lands its
  contact with the outstretched *hand* and parks its blade overhead on purpose. The rule was stated
  one notch too wide and is now scoped to blade attacks. It then fired on **`retreat`: a move no
  sequence had ever used.** `backstep` had quietly replaced it everywhere, and an unreachable move
  costs nothing and shows nothing, so it had been dead for the entire life of the director.
- *A pass crosses without mirroring, and lands upright.* The two defects above, gated.
- The reachability check now demands **all** sequences fire rather than all-but-one. Nothing is
  ranged `far` any more, so the old exemption for `close-in` had already been made obsolete by the
  2026-08-17 re-ranging and was quietly excusing a real failure.

`retreat` was given a sequence rather than deleted. It is a 34-frame *walk* backwards at an
uncommitted top speed, where `backstep` is a 26-frame hop with an impulse — one fighter yielding
ground while still facing the person pushing them, which is an image the pool did not have.
`give-ground` ends in a counter rather than in quiet, because the pool's zero-damage share is held
under a third and a withdrawal that draws the attacker onto a thrust is what a withdrawal is *for*.

The pool is **28 sequences and 31 moves**, all reachable, fairness unchanged at 0.09σ over 123
matches.

### The review pass, and four things it caught

Reviewed before committing, on the principle this file already records — *almost every real defect
was found by someone other than the author*. It held again: four findings, all real, all fixed
before the work landed. Two of them were **claims in my own new comments that measurement did not
support**, which is the same failure mode the 2026-08-17 adversarial re-review found.

- **A killing throw teleported the blade back into the winner's fist.** `stepFighter`'s victory
  branch sets `flourish` the moment the opponent dies, and `thrownBlade` is keyed on the move — so a
  blade still in the air vanished from the opponent's chest and reappeared in the thrower's hand,
  ~200 world units, on the death frame. That is the *first* frame of the two-second hold the design
  nominates as the announcement, and it hit **11 of 104 throws (10.6%)** — precisely the throws that
  won a match. The flourish now waits for the catch, which costs 20 frames of a 200-frame hold and
  is also just true: you cannot salute with a sword you have not caught. Measured after: **0 of 140.**
- **The riposte still wound up — downward, on 207 of 207 runs.** `strike_rising` loads by dropping
  the blade to +1.2 and sweeping up through it, so entering at the end of that load handed the
  spring a target 1.3 rad *below* a level parry: median peak dip **0.31 rad**, on the one move whose
  entire purpose is not to have a wind-up. The comment claiming it "rises straight out of the parry"
  was simply false. A riposte needs a strike whose load sits near the parry's own angle, and
  `thrust` does — it loads at −0.35 against `parry_high`'s −0.1. Both are four frames from beat to
  contact, so nothing else in the sequence moved. After: **64.2%** show any dip at all, median
  **0.078 rad**, worst 0.145 — and that residue is not a wind-up, it is the thrust extending to
  −0.05, which is 0.05 below where the parry was holding. `strike_rising` now carries a comment
  saying why it deliberately has no `windup`, so the next person does not re-add one.
- **The thrown blade's tumble was not mirrored by `facing`.** The flight offset was, the spin was
  not, in a renderer built entirely on `scale(facing, 1)`. A left-facing thrower's sword therefore
  turned the wrong way relative to its own travel, and `tx`/`ty` came back as the *trailing* end —
  so `TRAIL_INNER` kept the wrong half of the blade for the smear on one of the two fighters.
- **`CLAUDE.md` still said `close-in` was "deliberately kept far".** The 2026-08-17 re-ranging moved
  it to `mid` and updated `scripts/check.ts` but not the invariants file, so this change corrected
  one copy of a stale claim and left the other contradicting it. Nothing is ranged `far`; the band
  holds 0.07% of frames and zero of 3,232 picks, and a far pick would fall through to the `any` pool
  where `disengage` is the only candidate.

The review also cleared, by measurement rather than by reading: the ground-pass separation rule (156
overrun completions, **zero** grounded overlap at move end), the somersault's derived window against
the discrete Euler integration, the thrown blade's hand-off frames (**0** smear discontinuities),
that the clash test genuinely fires off the flying blade (3,134 of 4,656 flight frames clear the
force floor), that the blade never leaves the arena, and the new sequences' beat arithmetic.

**Still needs an eye, and no bench can settle it:** whether the tumble reads at ornament scale,
whether one burst per charge is enough for the overrun, and whether the thrown blade is legible or
merely brief.


## 2026-08-18 (later still) — the sign-in portal, and the dead end it replaced

**Client:** *"I need a portal to the login page."* Read as a feature request, it is a two-line
change. It was a bug report.

The sign-in link appeared only after **five taps on the hero ornament** (2026-08-13), and
`Ornament.tsx` returns `null` for the five `HIDES_ORNAMENT` layouts — `sidescroll`, `terminal`,
`ledger`, `console`, `sheet`. Two of those, **`console` and `sheet`, are exactly what
`PHONE_LAYOUTS` collapses to**, and the live site publishes `mode: "visit"` and rolls its layout on
every load. So an operator on a phone that rolled either had **no findable way in at all**: what
remained was typing `whoami`/`login`/`admin`, which wants a hardware keyboard, and a 260px leftward
drag. `CLAUDE.md` recorded the five taps as "the phone band's only findable route to sign-in" —
which was true, and was the bug, sitting in the invariants file describing itself.

The link is permanent now for anyone not signed in, and it lives in the **footer** for a structural
reason rather than an aesthetic one: `App.tsx` renders the footer unconditionally and no stylesheet
touches it, so it is the one piece of chrome no layout can hide. That property was incidental and is
now load-bearing, so `npm run check` gained a gate — it fails if the link is re-gated behind a flag,
if `App.tsx` stops rendering the footer unconditionally, or if any stylesheet gives `.v-footer` a
`display: none`. Both halves verified by breaking them.

Measured on the phone band across the layouts that mattered, including the two dead ones: the link
renders on every one, at a **68×44px** target, meeting the documented 44px floor. From a real route,
clicking it lands on `/signin` with the form and password field present.

**The five-tap machinery is deleted, not disabled** (`signinShown`, `revealSignin`, and the tap
counter in `Ornament.tsx`). With the link always visible it revealed something already on screen and
toasted about it — a control that does nothing, which is what this codebase removes rather than
keeps. The **logo's** five taps are untouched: those open the operator door, a different affordance
for a different thing.

This reverses a product decision, and the reversal is the client's own — *"the account pages are
unlinked"* was theirs too. What is not negotiable either way is that the real account system stays
clear of the operator door's theatre: the footer link navigates and never calls `openDoor`, exactly
like every other account route.


## 2026-08-18 (later) — the ornament gets a station, and a doc sweep

**Client:** *"as for first time, visitors always need to see something as the ornament. it can change
location on the page however, right side, left, middle, moving, bouncing, disappearing and
reappearing. submarine sonar ping style, etc etc"*.

**The first half was already true, and saying so mattered more than building anything.** The claim
that a first-time visitor could get an empty hero slot — carried in this session's own notes and in
TODO 11 — was wrong. `ConfigContext`'s roll gate checks `returning` only for the *time-of-day* mode;
`mode: "visit"` rolls on **every** load, first visit included, and the dice draw from
`ROLLABLE_ORNAMENTS`, which excludes `"none"` precisely so this cannot happen. `randomiser.ts` says
it outright: *"a rolled empty ornament is a blank hero slot, and neither is distinguishable from the
site being broken."* The published `ornament: "none"` is overridden on every load, so no republish
was ever needed.

### Station keeping, not decoration

The rest is `src/data/stations.ts` — a new appended catalogue, `Config.station`, a seventh
share-code field, both `PUBLISHED_KEYS` lists, a guardrail, a panel section and two gates.

The framing is the client's own phrase. The slot is a scope, so this is **station keeping**: a
contact holds a bearing, fades, and is re-acquired on the next sweep. "Make it bounce" is the
direction that produced the four circle ornaments the client had pulled three weeks earlier, and the
rule that survived that is deviation 7's — *a shape is allowed to be a circle if it depicts an
instrument*. Three entries: `hold` (index 0, and exactly today's behaviour, so nothing changes for
anyone who never sets it), `opposite`, `roam`.

**Two things were built, measured, and thrown away before they shipped** — both of which looked
right in the stylesheet and did nothing on the page:

- **Auto margins.** Chosen because an auto margin can only consume *free* space and therefore cannot
  produce the horizontal `.v-stage` scrollbar this file has recorded twice. It is also inert here:
  `.v-hero-text` grows into all the free space, so at 1280 on Cinematic the slot measured
  **left:0 / right:789 under `hold`, `port` *and* `starboard`** — three settings, one geometry.
  Replaced with `order`, which relocates the slot within the flex hero and equally cannot overflow.
- **The `port` station.** With `order`, `port` is `order: -1` — and the ornament is already the first
  child on all eight layouts that show the slot, so it measured identically to `hold` **everywhere**.
  A control that does nothing on every layout is worse than no control, so it was deleted from the
  catalogue rather than shipped as a dead chip. Nothing was in circulation yet, so the wire format
  was free to change; a day later it would not have been.

`opposite` is named for what it does rather than for the nicer word. Measured at 1280: on the six row
heroes it carries the slot **left:0 → left:789**; on Magazine and Marginalia, whose heroes are flex
*columns*, it carries it **top:68 → top:498**. "Starboard" would have been false on two of eight.

`roam` is the signature and the thing the client actually asked for: it fades to 0.12, moves while
faded, and returns — visiting centre, −84px and +84px, which is the whole "right side, left, middle,
moving, disappearing and reappearing" list in one behaviour. Its 14.4s cycle is three revolutions of
the sonar beam's 4.8s sweep, so with the sonar in the slot the contact is re-acquired as the beam
comes round. **It never fades to zero and never sets `pointer-events`**: five taps on this element
reveal the footer's sign-in link, which on the phone band is the only findable route to an account.

Verified in a browser rather than asserted — `getAnimations()` seeking, since rAF is parked here:

| case | measured |
|---|---|
| cinematic `hold` | order 0, left 0, `v-drift` only |
| cinematic `opposite` | order 1, **left 789** |
| cinematic `roam` | **`v-drift` + `v-roam`** — the re-list works |
| **radial** `roam` / `opposite` | order 0, left 0, drift only, **7 orbit pills intact** |
| **calm** `roam` | animations **NONE**, back to centre |
| **calm** `opposite` | animations NONE, **order 1, left 745** |

Zero horizontal overflow at 1280/760/420/320, document and `.v-stage`, at all three bearings. That
last table row is the design point: calm strips the motion and keeps the placement, because calm is
a second full aesthetic rather than a degraded one.

A guardrail refuses `roam` with either duel: a duel is the one ornament with a subject, and fading it
twice a revolution loses the exchange. `Combination` gained `station` as a **required** field, per
deviation 1 — which is the thing that makes a rule capable of matching at all.

### The documentation sweep

An audit of every markdown file against the code found the docs had drifted badly. The two worth
naming, because both would have cost somebody real time:

- **`docs/HANDOFF.md` told every fresh agent that "everything in `main` is deployed"** — inside the
  paste-me session-start prompt. `hud-pass` is what production serves and `main` is the Pages
  rollback, far behind. Highest-risk line in the repo.
- **`docs/BREAK-GLASS.md`'s success criterion was the current failure signal.** It said
  `{"ok":true,"tables":6}` means healthy; migration 0004 took the count to eight and the endpoint
  asserts `ok: row?.n === 8`, so a `tables:6` response carries `ok:false`. In a runbook read during
  an incident. It now says to read `ok`, which cannot drift.

Also corrected: `README.md` (claimed "no CSP" — one ships report-only; claimed no webfonts or images
— both are approved deviations; three-quarters of its "Not done" list was done), `CLAUDE.md` (bits 32
and 64 described as free; fifteen routes; "the fifth stylesheet"; "no test suite for rendering", when
six gates are exactly that), `TODO.md`, `docs/SECURITY-AUDIT.md` (also "No CSP", in the security
doc), `design/GUIDE-SUBDOMAINS.md` (its headline open action was done, it cited a symbol that does
not exist, and it still taught the retired verbatim-copy rule), `docs/DUEL.md` (its headline proof of
the bench method was the one measurement from that session that was **retracted** — replaced with the
correction, which is the better lesson), `docs/ACCOUNT-RECOVERY.md`, and the `verify-site` skill's
own description, which advertised four environment traps against the six it documents.

**`FABLE-START.md` was deleted.** It was already banner-marked superseded; everything durable in it
had migrated to `CLAUDE.md`, `docs/AUDIT-BRIEF.md` or this file, and everything unique left in it was
wrong — a stale gate count, a four-deploys-old version id, and a list of work described as
uncommitted that shipped days ago. A superseded briefing at the repo root beside the current one is
the "fresh agent reads the wrong file" failure both documents exist to prevent.


## 2026-08-18 — the interaction audit: five state bugs, four dead rules, two gates

Five defects in things that hold state between renders — focus stacks, timers, refs, a reveal
toggle — plus a class of stylesheet rule that cannot match. None of them threw, none showed in a
typecheck, and the suite was green throughout. That is the pattern this file keeps recording.

- **One Escape closed two layers.** `Dialog` and `CommandPalette` both listen on `document` and
  both call `stopPropagation()`, and each carried a comment claiming that call was what delivered
  the "one Escape, one layer" guarantee. It is not: `stopPropagation` stops the event reaching
  *other nodes* — the `window` listener in `useOperatorRoutes` — but not other listeners on the
  same node. That is `stopImmediatePropagation`, and relying on it would make correctness depend
  on listener registration order, which is render order. So a dialog opened over the palette, and
  one press closed both. `useFocusTrap` now exports `isTopTrap`, the same stack gate `Tab` has
  used since the traps were written, and both handlers consult it before acting. The
  `stopPropagation` calls stay — they are still what shields the `window` half. **This needed no
  browser to establish**: two `document` listeners and the DOM's own propagation rules settle it.
- **The greeting could stack on top of an open modal.** Its 1.2s timer fired unconditionally, so a
  visitor who reached the command palette or a confirmation dialog inside that window got the
  greeting portalled over it — and, before the fix above, one Escape dismissed both. The greeting
  is the worst dialog for that to happen to, because dismissing it *writes*: `vessel.greeted.v1`
  permanently, and on the `calmBySystem` branch a motion preference the visitor never read the
  question for. It now waits, re-checking every 1.5s. Waiting costs nothing — the greeting has no
  deadline — and the guard that makes it ask **regardless** of the greeting flag is untouched, so
  the 2026-08-16 stuck-in-calm fix still holds.
- **The header's edge fade died whenever the nav was conditionally rendered.** `useEdgeFade` took a
  `RefObject` and ran its effect once. Since the 2026-08-17 stand-down the header's `<nav>` is
  absent on Radial for visitors — so on a Radial-published site the effect captured `null`, and
  nothing re-ran it when the window narrowed to tablet and Radial collapsed to Cinematic: the nav
  came back with no observers, no listeners, and the hard-sliced "GUE" symptom the hook exists to
  prevent. It returns a **callback ref** now, which React invokes on every mount and unmount, so
  the observers always hold the live node and detach from a dead one.

  **Verified in a browser, and the first two attempts could not have detected it** — which is the
  question `docs/AUDIT-BRIEF.md` says to ask. Framed at 760px the nav *fits* (`slack: 0`), so the
  absent attribute that proves a dead hook is also the correct answer for a live one. Narrowing to
  600px made it overflow (`slack: 45`) but the attribute stayed absent — post-mount updates route
  through `requestAnimationFrame`, which is parked here (trap 3). The decisive test avoids rAF
  altogether: the hook's `measure()` runs **synchronously** on attach, so mount the nav *late* at
  a width where it already overflows. Framed at 1280 on Radial the `<nav>` is genuinely absent;
  jumping straight to 600 mounts it and it comes up carrying `data-fade="end"` against
  `slack: 45`. Ordinary path re-checked at tablet 600 (`slack: 45`) and phone 420 (`slack: 209`),
  both `"end"`.
- **A revealed password stayed revealed through submit.** `PasswordField`'s `hideSignal` existed
  for exactly this and `SignIn.tsx` was the one page not passing it — the page where rejection is
  routine, so the secret sat on screen in plaintext after a failed attempt on a form people fill
  in public. All three password flows on that page (sign-in, change, set) now bump it.
- **All three presets offered withdrawn ornaments.** Patch Bay named `orrery`, Cold Open
  `aperture`, Standing Wave `lens` — the four circle ornaments the client pulled on 2026-08-17.
  Nothing was invalid, which is why nothing failed: `hidden` means *unlisted*, not *broken*, so
  stored configs and share codes correctly keep resolving to them. But a preset is neither of
  those. It is a button pressed now, so it is a **menu**, and the `PICKABLE_*` rule applies:
  Patch Bay and Cold Open take `sonar`, and Standing Wave takes `none`, because its note promises
  a headline over data rather than an instrument. The share codes are derived, so nothing else
  moved.

### Four stylesheet rules that could never match

`.band-*` and `.layout-*` are on the same element, and `CLAUDE.md`'s first CSS gotcha is the
descendant-combinator version of that trap. This is its twin, and it fails more quietly still: the
selector is written *correctly* and simply names a combination the app cannot produce. `band` and
the adapted `layout` come out of one `useMemo` in one render, so they cannot disagree even
mid-resize — if `adaptLayout(id, band) !== id`, that pair is never written to the wrapper.

Dead: `.band-phone.layout-deck`, `.band-phone.layout-ledger`, `.band-tablet.layout-ledger` and
`.band-phone.layout-sidescroll` (Deck, Ledger and Side-scroll all collapse to Stack on the phone;
Ledger collapses to Cinematic on the tablet). Harmless as CSS — but two of them carried a comment
claiming to "guard against a share code landing mid-resize", a state that is structurally
impossible, so a reader trusting that guard was relying on nothing.

**Three of the four were found by eye and the fourth by the gate**, which is the argument for the
gate. `npm run check` now parses every stylesheet, strips comments (the surviving notes name the
dead pairings in prose, and a gate that trips on its own documentation gets deleted), and refuses
any `.band-X.layout-Y` where `adaptLayout` proves Y is not what X renders. It also rejects a band
or layout name that is not in the catalogue, so a typo'd selector — the failure this whole class
starts from — stops being silent.

### The entrance layer was eating other people's animations

A `/code-review high` over the branch found two defects in the *committed* entrance system
(`fde744d`, same day) that the interaction pass above had walked straight past. Both are the same
shape: `entrances.css` imports after `layouts.css`, and its base arrival rule is the `animation`
**shorthand**, which resets every longhand it does not name.

- **Deck's depth pass was switched off, in production defaults.** `.layout-deck .v-block` declares
  `animation-name: v-rise, v-deck-depth` as longhands — the second is the view-timeline animation
  that stands the card at the snap centre forward, the layout's signature. The base entrance rule
  is `.has-entrances:not(.layout-console) .v-block`, and **`:not()` contributes its argument's
  specificity**, so it lands at 0-3-0 against Deck's 0-2-0 and wins on specificity; import order
  never entered into it. The shorthand then reset `animation-name`, `animation-timeline` and
  `animation-range` together, leaving `v-ent` alone. `entrances` defaults to true and is published,
  so this was every visitor. **It came back the moment you turned entrances off or enabled calm** —
  which is exactly why it survived being looked at. Deck now re-lists both animations as longhands
  at the entrance layer, inside the same `@supports` guard.
- **The termbar's typewriter could not type.** `v-ent-type` is from-only with
  `clip-path: inset(0 100% 0 0)`, and `.v-termbar-title` declared no `clip-path`, so the landing
  value was the initial `none`. An `inset()` does not interpolate *to* `none` — it flips
  **discretely at 50% progress** — so `steps(22, end)` quantised nothing: the title was fully
  clipped, i.e. invisible, for the first half of its 0.85s and then popped in, on every navigation
  in Terminal. The house from-only rule is correct for `translate`, `scale`, `rotate` and
  `opacity`, whose initial values interpolate; `clip-path` is the exception, and the title now
  declares `inset(0 0 0 0)` so both endpoints share a shape family.

The stale comment beside the first one has been corrected rather than deleted: it claimed the
longhands existed to protect `animation-delay` from the shorthand, which was true when written and
stopped being true when the stagger moved to `--i`. It now names the real constraint — and says
that longhands alone are *not* sufficient, because the entrance layer outranks them anyway.

### Five gates, each verified by breaking it

`no band pairs with a layout it never renders`, `no preset offers a withdrawn effect or ornament`,
`the edge fade's truth table holds, dead band included`, `scroll-driven animations survive the
entrance layer`, and `from-only keyframes land on an interpolable value`.

The fourth pairs each `animation-name` with its `animation-timeline` **by index**, so
`v-ent, v-deck-depth` against `auto, view(inline)` flags only the second — the first is the
entrance and is *meant* to be replaced. The fifth encodes the one property in play whose initial
value cannot be interpolated to; widen its `DISCRETE` list if another is ever animated.

The second decodes each preset's share
code rather than reading its spec, so it tests the derivation as well as the choice. The third
closes a gap this file should have caught earlier: `edgeState` was made exported-and-pure with a
doc saying that stepping it in Node "is the only way this logic gets checked rather than assumed",
and then nothing stepped it — the pattern was adopted and the payoff never collected. Eight states,
including both 1px dead bands, which is the part that decides whether the header shows a fade
pointing at nothing.

Each confirmed to fail on the exact bug it was written for — `.band-phone.layout-deck (phone
renders stack)`, `preset patchbay offers withdrawn ornament "lens"`, `edgeState(99, 200, 100) =
both, expected start`, `re-list them in entrances.css: v-deck-depth (layouts.css)`, and
`v-ent-type animates clip-path from-only but .v-termbar-title declares no clip-path` — and to pass
once reverted. **17 checks.**

**What these three cannot reach:** the `useEdgeFade` attachment bug itself. A gate can pin the pure
decision; whether the hook is *wired to a live node* needs a DOM, and this suite has none. That one
was settled in a browser (above) and is recorded here as browser-verified rather than gated.


## 2026-08-17 (audit) — the uncommitted dial/sonar work reviewed, four majors found and fixed

The full-site audit began by putting the previous session's uncommitted work (the Radial dial
rebuild, the nav stand-down, the sonar ornament) through an adversarial review before committing
it — the lesson this file keeps recording is that defects are found by someone other than the
author, and this work had never had another eye on it. Four majors, all real:

- **The share-code decode fell back to the withdrawn Lens.** `decodeShareCode` resolved an
  out-of-range ornament field to `ORNAMENTS[0]` — correct while index 0 was the default, wrong the
  moment the default moved to sonar and index 0 became `hidden` — while the `ornaments.ts` comment
  and a brand-new check both *asserted* the fallback was `DEFAULT_ORNAMENT`. Fixed; the suite
  gained three gates: the ornament wire order pinned as a literal (a reorder passes every count
  check and repoints every code in circulation), hidden-index-decodes, and
  out-of-range-decodes-to-default. Verified by breaking the fallback deliberately.
- **Calm halved the opacity of Radial's only navigation.** `.is-calm .v-ornament { opacity: 0.5 }`
  predates the stand-down and was harmless while the header duplicated the dial; with the
  duplicate gone, calm — the mode every `prefers-reduced-motion` visitor lands in — rendered the
  seven main pages' only route at 50%. A same-element `.is-calm.layout-radial` rule now excepts
  the dial from the dimming (animation stays off). Verified in the live DOM.
- **Two "Primary" landmarks on Radial, one empty.** CSS hid the header's links but left the named
  landmark; screen-reader landmark navigation offered a Primary that led nowhere next to the
  dial's real one. The links now leave the tree on Radial and the header landmark renders only
  with content (operator tabs), labelled Operator.
- **The docs contradicted the code.** CLAUDE.md still said seven ornaments with Lens the default;
  neither it nor this file recorded the dial rebuild or the stand-down. Corrected (deviation 7
  carries the full current state).

Minor, same pass: sonar contact b1's `animation-delay` disagreed with the file's own derivation
(−0.42s vs −0.413s; b2/b3 matched); a superseded tether comment sat above its replacement
asserting the enumerated design the rebuild removed.

**Recorded for the client, not changed** (surfaced by the same review):

- With Lens/Valve/Aperture/Orrery withdrawn, `ROLLABLE_ORNAMENTS` is `{duel, duelholy, sonar}`,
  so on the published `mode: "visit"` roughly **two thirds of re-rolled visits now get a
  lightsword duel in the hero** and sonar — the requested replacement — is the minority outcome.
  If that reads wrong, the lever is weighting or trimming the rollable list, not un-hiding.
- Hiding changes menus, not published state: **if the currently published config names one of the
  withdrawn four, first-time visitors keep getting it until a republish** — hidden means
  unlisted, not invalid, and that is load-bearing for stored codes.

### The dial rebuild and the sonar, for the record (built 2026-08-17, previous session)

The measurements lived only in FABLE-START.md and code comments; this file is their home.
**Radial's dial was never a circle**: positions were enumerated as percentages of each pill's own
box, so the radius varied with label length — measured radii 54/93/113/54/83/113px — and when
`scams` made `NAV` seven entries the seventh pill matched no `:nth-child` rule and sat dead
centre, *Guestbook* overlapping *Contact* by 95×34px. Rebuilt from `--i`/`--n` set inline from
the data: all seven at r=207.9px, bearings 51.4° apart, zero overlaps; an eighth page is a `NAV`
change and nothing else. The header's nav row stands down on Radial (client: the same seven links
twice in one viewport); operator tabs are excluded, Radial exists only on desk, and the ornament
slot survives even at "None" because the navigation lives in it. **Sonar** is appended at
ornament index 7 and is the new default; the four withdrawn circles are `hidden` via
`PICKABLE_ORNAMENTS` — the `FX`/`PICKABLE_FX` mechanism applied to ornaments for the first time —
and each contact's flare is `animation-delay`-matched to the beam's arrival at its bearing
(arithmetic in `chrome.css`; retime the beam and every delay is wrong).


## 2026-08-17 (later) — the signup form was 210px wide on the layout production publishes

Client: *"there is an issue with creating a profile… the current view does not
give a large enough field for passwords. please fix this for each and every
single layout and theme."*

**Measured before touching anything**, across all fourteen layouts at four
viewport widths, via `sitelab.html` (the `_f=1` single-frame mode, one iframe
resized per band — `resize_window` does not work in this environment):

| | `.v-account` width | usable field | characters visible |
|---|---|---|---|
| desk, thirteen layouts | 472px | 391px | ~24 |
| **desk, side-scroll** | **210px** | **129px** | **~8** |
| tablet 600, side-scroll | 248px | 167px | ~10 |
| phone, all layouts | 369px | 288px | 29 |

Side-scroll is what the live site publishes, so the bottom-left cell was
production. **Eight characters of a twelve-character minimum password**, on the
one form in the site that cannot recover from a typo — §9 collects no email, so
a password mistyped at creation is an account nobody can ever open, which is the
exact failure `PasswordField`'s reveal toggle was written for two days earlier.
A field that cannot show eight characters defeats a reveal toggle completely.

**The cause was a container, not the field.** `.v-account` is a direct child of
`.v-stage`, not of `.v-grid` — and `.layout-sidescroll .v-stage` is
`display: flex; overflow-x: auto`, the filmstrip track. So the section became a
flex item and was sized by the track, and `overflow-y: hidden` clipped whatever
did not fit the track's height. `grid-column: 1 / -1` on `.v-account` does
nothing in a flex container, and `max-width: 46ch` cannot help: **a flex item
with only a maximum is still free to shrink to its content.**

Three changes:

1. **The stage opts out of the track when it holds an account form** —
   `.layout-sidescroll .v-stage:has(.v-account)` returns to a block column.
   Terminal already establishes that a layout may opt out of the stage's rules;
   an account form is a task, not content, and nothing about it reads better as
   a filmstrip cell. Keyed on `:has(.v-account)` rather than on a list of page
   ids so a new account page inherits it instead of having to remember to join.
   Verified that `/work`, `/gallery` and `/` keep the track (`scrollWidth` 3049
   against a 1180 client width) while `/signup` and `/signin` do not.
2. **`.v-account` sets an explicit `width: min(100%, 34rem)`**, not a maximum.
   The percentage resolves against whatever container the layout provides, so
   nothing overflows a narrow one; measured horizontal overflow is 0 at every
   band.
3. **`.v-account .v-input` goes to 15px / 13px padding.** 13px mono is where
   `l`/`1` and `0`/`O` stop being separable, and these are the fields whose
   contents have to be proof-read. The small bands already sit at 16px for the
   iOS focus-zoom threshold, so this closes a gap rather than adding a third
   size. Scoped to `.v-account` deliberately: the command palette shares the
   class, has its own rhythm, and holds a command rather than a secret.

After, measured across all fourteen layouts: **51 characters** at desk, 47 at the
top of the tablet band, 46 at its bottom, 29 on the phone, zero horizontal
overflow anywhere. Identical across all five typesets and in calm — the widths
are in `rem` and `%`, so no palette or typeface moves them.

**The phone did not improve and is not a failure.** 29 characters is the
physical ceiling of a 420px viewport once the stage's 18px gutters and the
reveal button's 68px reserve are paid, and it already clears the 12-character
minimum comfortably. Said out loud rather than folded into the improvement.

`scripts/check.ts` gains *the account form owns its width*. The real test needs
a browser and this suite has none, so it is a tripwire on the two declarations
that were missing — an explicit `width` on `.v-account`, and the side-scroll
opt-out — and it was verified by deleting each in turn and confirming the
suite fails with the right message.


## 2026-08-15 (later) — the plain-English pass, and one addition declined

Client: *"make this whole site's text content understandable by the non
tech-savvy. I understand it all but my mum said what the fuck does this all
mean. and my grandma would know even less."*

**Measuring first changed what the job was.** Across all 86 body blocks the mean
Flesch–Kincaid grade is **5.0** and there is not one dictionary jargon word on
the site. It was never a reading-level problem, so "use simpler words" would
have been work with no effect. The copy was *allusive* — short, plain-worded,
and pointing at something it never named. "Built like a flight simulator, used
like a business card." "Assembled in your browser so the scrapers don't get it."
"Two cold joints." "Array resilvering." "/var/www/whatever_you_wanted → exists =
false." The rule that came out of it: **name the thing, then make the joke about
it**, and never sand off the voice — the self-deprecation is the point, so the
flight-simulator line became "This website is far more elaborate than the job
actually needs, which should tell you where the spare time goes." Same joke,
same register, now it lands.

Rewritten: home, about, work, gallery, contact, now, guestbook, the 404 and the
greeting dialog. The pricing block is the load-bearing one — see `CLAUDE.md`.

**The scams page was assessed and deliberately left almost alone**, which is
worth recording so the next session does not churn it. It looked like the worst
page by the numbers (grade 7.6, the highest on the site) and is in fact the best
written for its audience: **zero sentences over thirty words**, and every
technical term explained in place at the moment it is used — "Event Viewer —
every Windows PC on earth is permanently full of red and yellow warnings", "The
netstat command, presented as *look at all these foreign connections*". The
terms cannot be removed because recognising them *is* the defence. Its register
was already set flatter than the house voice on purpose. Two words changed:
`CRA` spelled out to Canada Revenue Agency in both places.

**`/setup`: the warning moved above the software, not merely nearer it** (client:
"list software closer to the disclaimer"). It was the last of seven blocks,
three below the tools it is about. It is now the second, directly above Quick
Assist. The distinction matters: this page teaches somebody to install
remote-access software and hand control of their screen to a voice on the
telephone, which is exactly what a scammer spends a call trying to achieve. A
person being talked through it by a criminal is following steps, not browsing —
so the warning has to be in front of the steps. Anyone who reads to the bottom
of the page was never the one at risk. Also `no drive` → `no driving` in the
lede: on a computer repair site "no drive" reads first as *hard* drive.

**Declined: naming the nationalities of scam callers.** The client offered it
with "if bad idea dont add", so this is the reasoning rather than a refusal.

- **It hands the reader a false test.** The page's whole defence is *who started
  the call*, which is a fact the reader always has. Accent is not: domestic
  call centres and spoofed local numbers exist, voice cloning is cheap, and a
  scammer who sounds local would sail straight through a filter built on
  accent. It would also aim suspicion at the large number of legitimate support
  staff who work from those same countries. A test that produces both false
  passes and false failures is worse than no test, on the one page where being
  wrong costs somebody their savings.
- **The claim is partly wrong as stated.** Jamaica's association is with
  lottery and advance-fee fraud rather than tech support; Chinese-language
  operations targeting diaspora communities are substantial rather than rare.
  Publishing it as fact on a commercial site invites the correction.
- **It changes how everything else on the page reads.** The page works because
  it is specific, calm and practical, and it is the client's own reason for
  building it — "if it helps even one grandparent not get scammed". One line of
  ethnic profiling is the line that gets screenshotted, and it would be
  screenshotted next to their real domain name.

The intent behind it is real and is worth keeping, so it is served in the way
that actually helps: the page already says the tell is who rang whom, and the
*"they will lose their temper"* block gives a behavioural signal that works
regardless of who is on the phone. If the client still wants the overseas
element stated, the useful and true version is that it is a call-centre
industry, frequently overseas, **and that the accent tells you nothing either
way** — which inoculates against the false test rather than teaching it.


## 2026-08-15 — two fights at once, and the guardrail that could not have caught it

Client: *"when in landscape mode on mobile, there are two fights going at the
same time."* Correct, reproducible, and the cause is one missing argument.

**`randomiser.ts` rolled the ornament and never submitted it to the
guardrails.** `roll()` builds a candidate with six dimensions in it and then
called `isAllowed` with five — `palette, layout, fx, type, grain`. The ornament
was absent from the `Combination` type too, so nothing failed to compile and
nothing said so. The consequence is not that a rule was wrong; it is that **no
guardrail constraining an ornament could work however it was written**, so the
one pairing that genuinely does not work had nothing standing in front of it.

The live site publishes `mode: "visit"` with `fx` and `ornament` both in scope,
so every visit re-rolls both. Two of sixteen effects are duels and two of seven
ornaments are, giving 2/16 × 2/7 ≈ **3.6% of visits** — about one in
twenty-eight — showing two independent matches, with different fighters,
different health and different winners, a few inches apart.

**Landscape is where it collides, not where it starts.** Measured in a
same-origin iframe (`resize_window` silently fails here): at 844×420 the phone
is in the *tablet* band — `PHONE_MAX` is 560 — the stage is 269px tall, the
ornament is a 240px slot beginning 55px down, and the background fight's feet
land at 215px, so both occupy the same band of the screen at comparable size.
At 400×700 the ornament ends at 197px, the background fight's feet are at 398px
and its figures are 31px against the ornament's 57px, so it reads as texture and
nobody looks twice. The DOM probe confirms two live canvases in *both*
orientations: same bug, one visible.

**Fixed in two places, deliberately.** `Combination` gains a *required*
`ornament`, `roll` passes it, and a rule blocks any duel effect against any duel
ornament (cross-pairings included — `duel` behind `duelholy` is still two
fights). Verified over 200,000 rolls: **zero two-fight results**, down from
~4,900 expected, with **zero roll failures**, so no visit falls back to leaving
the config alone; duel effects still appear in 9.4% of rolls and duel ornaments
in 25.9%, so both homes remain fully available.

That fixes the roll, which is one of four ways config arrives — publish, share
code and storage are the others, and a share code encodes the effect and the
ornament as independent fields. So `Ornament.tsx` also refuses to render the
second fight, verified in the live DOM in both orientations (two canvases → one)
and confirmed not to touch the ordinary case (a duel ornament over a non-duel
effect still renders).

**The substitution is `DEFAULT_ORNAMENT`, never `null`.** Emptying the slot is
the tidier-looking answer and quietly breaks something else: the five taps that
reveal the footer's sign-in link live on this element, and on the phone band
that is the only findable route to an account. The ornament yields rather than
the background because a missing ornament is already ordinary — five layouts
hide the slot outright — while a missing background effect is not.

**Not changed, and worth knowing:** guardrails still constrain only the
randomiser, so an operator can publish other blocked combinations (Magazine +
rain, say) by hand. That predates this and is what "randomiser guardrails"
means; the duel pair is now the one combination also enforced at render time,
because two fights is incoherent rather than merely ugly.


## 2026-08-14 (later) — the duel, watched at last: four bugs, and the press

**The fight had never been looked at**, and `TODO.md` A said so honestly: it was
tuned through the step-through bench and a statistical run, and what no harness
had judged was whether it *looks* like a duel. Looking at it found four defects,
three of which no amount of reading the choreography would have surfaced,
because in each case the code says what it means and does something else.

**Verification method, since the environment still cannot show animation.** The
tab reports `document.hidden`, `requestAnimationFrame` parks (zero frames in
700ms) — and, measured this session, **timers are throttled to ~1Hz as well**
(two `setInterval(…, 16)` ticks in 1,064ms), so *no* form of live playback is
available here, not just rAF. What works is stepping: a harness driving the real
`src/fx/duel.ts` through the dev server renders N consecutive frames into a grid
of cells, each captioned with the frame number, the live sequence and both
fighters' moves. A filmstrip is not a substitute for watching it, but it answers
"what is the geometry doing on frame 47" exactly, which is what these bugs were.

**1. The anti-stall rail had become the normal mode.** `dir.pressure` counts
sequences and `chooseSequence` strips the pool down to sequences containing a
`hit` above 22 of them. Nothing ever reset it — `createDuel` set it to 0 and the
match reset rebuilt both fighters without touching it — so it was monotonic for
the life of the page. Measured over 55 simulated minutes: **1,504 of 1,526
sequence picks (98.6%) were made under the rail.** The comment above it read "a
normal match never reaches it". About forty seconds after page load, every match
did, permanently. The visible cost: four sequences fired twice an hour between
them, `standoff` never fired again after the opening match, `disengage` — the
only `any`-range entry, so the only one in all three shrunken pools — took
**30.5%** of every exchange, and matches ran ~28s instead of ~50s because
all-hit sequences drain health faster. The declared weights described a fight
nobody had seen since the first match. One line: reset it on match reset. After:
all 23 sequences fire, the rail is 13.6% of picks, the distribution tracks the
weights.

**2. `bladeGap` was solving the wrong equation.** The re-solve of the second
segment against a clamped `s` used `uw` where it needs `vw` — `((w + s·u)·v)/v·v`
is `(vw + uv·s)/vv`. Two segments that provably cross at (42.5, 193.2), checked
against an independent parametric intersection, came back **16 units apart with
the nearest point pinned to a hilt**; every configuration tested returned `r = 0`,
which is the tell. This is the routine behind "the sparks when swords meet"
(client, earlier the same day): the shower tests `near.d < 9`, so overstated
distances meant crossed blades often threw **no sparks at all**, and the bursts
that did fire were placed toward a fist rather than at the crossing. A geometry
bug that presents as an art problem, and unfindable by reading the spark code.

**3. There was no body-to-body constraint** — only the arena walls. The two
30-unit bodies overlapped on **3.9% of live frames**, closing to a minimum
separation of 0.1 units: one frame in twenty-six drew two figures inside each
other. Now a soft positional resolve, a third of the overlap per frame, applied
to **grounded pairs only** — the exemption is what keeps `flip_over` working,
since the somersault's whole job is to pass over the opponent and swap the
sides. Grounded overlap 3.48% → 0.72%, minimum separation 0.1 → 4.8.

**4. The blade lock had no blade contact.** `the-lock` is a `close` sequence and
`close` is anything under 132 units — nowhere near close enough for two 58-unit
blades held a forearm out from the shoulder to meet. Measured over 51 locks the
blades averaged **30.8 units apart** and the worst spent the whole press 61
apart. So the most iconic image in the genre was two people standing a metre
apart holding sticks, and the `TODO.md` B description of it — "just two blades
near each other" — was generous. `stepLock` now closes the pair to `LOCK_SEP`
with a signed exponential ease (signed because arriving from a parry could land
them *inside* the distance, which crosses the blades at the hilts). Settled
blade gap is now **0** in every lock, binding at about the middle of the loser's
blade.

**The press itself** (TODO B's first bullet) is built on top of those: a
sustained 2–3 sparks a frame at the true crossing, spawned with a short life so
they stay small and fall instead of accumulating; the whole X rotating as the
winner drives down and the loser is levered up, which walks the contact point
into the loser and makes the outcome readable about a second before the break;
a two-frequency judder that the loser shakes harder; a grind that moves both
fighters the same way so the lock travels without the separation changing; and
a burst plus two frames of hit-stop as it fails.

**Who wins the press is `beatPower`, set by the beat.** `the-lock`'s two `lock`
beats carry `power: 1` and `power: 0`, so the outcome is fixed at frame 22 by
the same role coin that assigns every other sequence, and the renderer never
reaches into the director to find it. Nothing added here consults a condition or
can extend the move, so the match-reset loop — which has no timeout — is exactly
as safe as before. Cost measured after: **0.02–0.05 ms/frame, not growing with
time**; the shower is free.

**And the ornament got a camera**, approved by the client immediately after the
report above. It drew at `scale = w / WORLD_W` — the whole 700-unit arena across
a square slot that is 340px on desk, 240 tablet, **190 on a phone**, 180 in
Magazine — so a fighter rendered about 42px tall on desk and **~20px on a
phone**, in a box that was overwhelmingly empty air. A fixed crop was not
available: the pair genuinely use the arena's full width (5th–95th percentile of
their centres is 110–571 of 700), so any crop tight enough to help cuts them off
at the walls.

`duelCamera` tracks the midpoint and fits the pair, clamped to 1.45–2.9 and
eased. Median figure height is now **61px at 190px and 109px at 340px**, against
~20px and ~42px before. Three things were needed beyond "track and zoom", and
each was found by measuring rather than by reasoning:

- **Zoom to where a jumper is going.** Fitting the current height looks right
  and fails: the somersault rises ~145 units in ~22 frames and an eased zoom
  cannot cover that from a standing start, so the jumper left through the top of
  the slot on 0.48% of frames — visible as a headless figure hanging from the
  frame edge for 14 frames, 50 times an hour. A jump is a projectile under
  constant gravity, so the apex is `v²/2g` above the current height and known on
  the frame the impulse fires. With that, measured clipping is **zero**.
- **Asymmetric zoom** — out at 0.13, in at 0.03. Pulling back is a correction and
  has to arrive before the thing it corrects for; pushing in is a choice and a
  fast choice reads as a mistake. This is what makes the high cap safe.
- **A match reset is a cut.** Both fighters teleport back to their marks, and
  eased that whipped the camera 43px in a single frame and then coasted for most
  of a second. Nulling the camera on `st.matches` changing makes the next frame
  snap — a scene change gets a cut. In-fight pan now peaks at 44px/frame once,
  during a knockback, and normally sits far below that.

`duelCamera` is exported and pure specifically so the bench drives *it* rather
than a copy of it. That is not tidiness: animation cannot be observed in this
environment at all, so a camera can only be checked by stepping it over
thousands of frames, and a re-implementation in the bench would only ever
confirm the bench.

**Noticed and deliberately not fixed:** `flip_over` does not rotate the figure.
The move's own comment describes "a still blade under a tumbling body", and the
body does not tumble — it floats over upright with its legs tucked. The only
`ctx.rotate` in the renderer is the death tip-over. It reads acceptably and
changing it is animation work rather than a bug fix, so it goes on the backlog.


## 2026-08-14 — the animation audit, the duel's director, and the phone scroll bug

**Every canvas effect was stepped through 1s / 6s / 15s / 30s and judged on what
it looks like *after* thirty seconds**, which is a different question from what
it looks like on arrival and the one nobody had asked. `fxlab.html` gained a
contact-sheet mode to make it possible at all — a backgrounded automation tab
parks `requestAnimationFrame` (measured: zero frames in 700ms), so no amount of
waiting shows you frame 1800.

**Measuring it properly changed the conclusions twice, and both mistakes were
mine.** Averaging a whole run makes every effect look like it gets more
expensive with time, because the longer panel absorbs more garbage collection —
that artefact reads exactly like an unbounded buffer, and I went looking for
growth in effects that hold no state at all. And a quarter-width panel measures
a fraction of the work a real viewport asks for. The bench now reports the
*minimum* of three short windows at full width: frame cost has a hard floor and
everything above it is interference.

On honest numbers the lag was **`rain`** at 3.0ms a frame, three to six times
any other effect — not `scan`, which was what got reported and had already been
fixed that morning. That exposed the more valuable finding: **the adaptive
resolution tier cannot reach a draw-call-bound effect.** It shrinks the buffer,
and `rain`'s cell and `plasma`'s grid are measured in CSS pixels, so the half
tier quartered their fill and left every draw call in place. The tier is now
handed to effects as `quality`.

**The duel's problem was never the artwork.** `decide()` ran once per fighter,
independently, and two independent randomisers cannot produce action and
reaction. Nothing was ever blocked; nothing ever bounced off anything. A
director now owns the exchange. The roles are also the fairness proof — no
sequence names a side — and one real bias was found and removed: `st.a` always
stepped first, so when both fighters were due to land a lethal blow on the same
frame, the left one always won.

Three bugs here were only findable by measurement. The x50 speed and the
"random lag" were one cause: the duel derived its frame count from the effect
clock, which has `boost` folded in, so it ran at ~2× for exactly as long as the
screensaver was up — and stepping in whole frames from a fractional accumulator
at a rate of 1.9 alternates 2,2,1 steps per frame, which is judder on a fixed
cadence. And starting 370 units apart with travel halved meant nothing ever
closed: 34 exchanges drawn from five sequences, all long-range, with the entire
swordplay half of the pool unreachable.

**The phone scroll bug was `scroll-snap-type: y mandatory`.** Reported as "as
soon as you let go it jumps back to the top… only way to scroll is to keep a
finger on the screen to save your place" — and that last detail is what
identified it, because holding a finger down suppresses snapping. Measured at a
real 417×857 viewport: the scrollport is 654px and `.v-hero`, the first snap
area, is 684px. Mandatory snap must come to rest *on* a snap point, and every
position inside an oversized area has that area's own start as its nearest one.
`proximity` was not enough on this band either, so phones get `none`.

A process note worth keeping, because the client made it explicitly: **I called
this fixed after testing the home page only.** It needed all nine content pages
at four scroll positions each. Verifying the case you happened to look at is not
verifying the bug.


## 2026-08-14 — The visual audit begins, finds a real bug, and the fix breaks Terminal

The client asked for "a complete audit of all graphic things … then a gameplan". The blanket version
was argued against and not taken: `design/SPEC.md` is authoritative, its oddities are deliberate —
palettes that fail WCAG AA, copy that mocks its own site, a Guestbook with no form — and a
sweep-and-improve pass sands those off while writing no *why* for any of it. What was taken instead
is a **targeted audit**: look at the rendered site, report only what is genuinely broken, leave what
is deliberate. That distinction earned itself twice inside an hour.

### The technique

The browser's window-resize is unreliable in this environment, so bands were forced from code — a
temporary `localStorage` override inside `bandForWidth`, plus a pinned `DEFAULT_CONFIG.layout`,
both reverted before commit. That gives any band at any window size, deterministically. **It has one
limit worth knowing**: it forces the *band* without narrowing the *window*, so anything that depends
on real width (a nav row overflowing) cannot be reproduced with it — only observed at a genuinely
small size.

### Two real defects

**The phone scrolled two things at once.** `stageHeight: "calc(100dvh - 132px)"` was a hardcoded
guess at the header's height; the real phone header is **147px**, because it wraps to two rows. The
chrome came out 15px taller than the viewport, so the *document* scrolled behind the
already-scrolling `.v-stage` — two nested vertical scroll containers on the band least able to
afford them.

The interesting part is that **the number was correct when it was written and drifted afterwards**:
the header grows whenever a chip is added to it, and one was added the same morning (`sound`). So
the fix is not a better number. `.v-chrome` became a flex column and `.v-stage` `flex: 1` with
`min-height: 0` — which measures instead of guessing. `--stage-height` is deleted from `BandTokens`,
`theme.ts` and the CSS, with a note on `BandTokens` saying why it must not come back.

**The nav hid a page.** The phone pill row overflows by a measured 66px with its scrollbar
deliberately hidden, and the last pill was sliced mid-word — "GUE" — with nothing to say there was
more. Guestbook was, in practice, invisible on a phone. A trailing `mask-image` fixes it: a cut
letter reads as broken, a fading one reads as continuing.

### …and the fix broke Terminal, in production

`height: 100dvh` is right for every layout whose stage scrolls internally and **wrong for the one
whose document scrolls**. Terminal's stage is deliberately `height: auto; overflow: hidden`; clamped
inside a one-viewport column it stopped scrolling and started **clipping** — a measured 1677px of
content in a 531px box, with the document unable to take over. Most of every page became unreachable
by wheel, keyboard or touch, on desk and tablet both. It was live for about an hour.

It was caught by an agent sweep pointed at *the same class of bug* — "find every other place a
hardcoded length guesses another element's measured size" — which is the strongest argument in this
entry for auditing by class rather than by page.

**The first attempt at the fix was worse than the bug**, and that is the part worth keeping.
Softening the clamp to `min-height` let `.v-stage` (flex-basis `auto`) size to its content
*everywhere*, so no layout scrolled internally any more and the document scrolled on all fourteen —
silently discarding the fixed-header/scrolling-stage design, Stack's snap sections and the
scroll-velocity boost. Measured before shipping: phone went from `docOverflow: 0` to `1371`. One
layout needed an exception, so one layout gets one: `.layout-terminal .v-chrome { height: auto;
min-height: 100dvh }` and `flex: 0 0 auto` on its stage.

### Two more the sweep found

- **`.vessel` was `min-height: 100vh` while `.v-chrome` is `100dvh`.** `vh` resolves against the
  *large* viewport, so on any mobile browser showing its URL bar the wrapper stood 60–90px taller
  than the window while the chrome fitted exactly — the same nested-scroll bug by a second route,
  live on every phone visit. The two must use the same unit.
- **The nav fade went on tablet too**, on the reasoning that the row always overflows. True of a
  phone, false of a tablet, where 900px fits the six public pills with room to spare — so every
  tablet visitor got a permanently faded "Guestbook" with nothing behind it. An affordance pointing
  at nothing is worse than none.

### Two process notes, both cheap and both nearly missed

**A scripted edit left an orphaned comment fragment**, and its stray `*/` swallowed the selector
underneath, so the nav rule was silently dead. Nothing in the file *looked* wrong. It surfaced only
because the verification read the **computed style** rather than the source — check what the browser
did, not what the file says.

**An early "16px still overflowing" reading was a broken dev server**, serving without `base.css` at
all (`box-sizing` was `content-box` and the `html, body { margin: 0 }` reset was absent). Confirming
*why* before fixing is the only reason a non-bug did not receive a fix — and a fix to a non-bug is
how the next real regression gets introduced.

---

## 2026-08-14 — The line-by-line review, run six ways at once; eight fixes

`docs/HANDOFF.md` has carried this as "open for a future session, at the client's request — *look over
every single line of code made by the other models*", parked because it wanted fresh context. The
client authorised parallel agents, which is fresh context by construction: six reviewers, one per
area — `worker/`, `src/auth`+`src/share`, `src/config`+hooks, `src/components`, `src/fx`+`src/data`+
`src/styles`, and one on **this session's own new code**, because nobody should review their own.

Each was told to read `CLAUDE.md` in full first and to drop any finding it could not attach a
concrete failure scenario to. That mattered: this codebase is dense with things that look like bugs
and are recorded decisions, and every reviewer returned a "checked and deliberately not reported"
list naming them — the blade literals, `recordSuccess`'s asymmetry, the prf-less slotless passkey,
`dist` as the sole damage authority, the stateless WebAuthn challenges. **Everything below was
verified by hand before it was touched.**

### The one that matters most: an SDP could carry two fingerprints

`src/share/handshake.ts` matched `/^a=fingerprint:(.+)$/m` with `.exec` — the *first* line, with no
constraint on the rest — and the whole unmodified SDP then went to `setRemoteDescription`. RFC 8122
§5 lets a media-level fingerprint override a session-level one.

A hostile signalling service is explicitly in scope (§3, §12 R: the DO relays opaque payloads and is
not trusted). It relays both the SDP and its signature, so it could take a genuine pair, prepend the
owner's real fingerprint at session level to **its own** SDP, and leave its own fingerprint in the
`m=application` section. Verification passes against a value DTLS then ignores; both legs terminate
at the relay; it reads every byte — **without forging a signature**. That is §3's first row ("the
operator cannot read any user's files") made false.

Now: match all of them, normalise, and refuse unless exactly one distinct value remains. Identical
repeats are fine — a bundled SDP legitimately restates the same fingerprint per m-section, and
normalising before comparing is what makes that a repeat rather than a disagreement. Refuse, never
repair, the same rule as `paths.ts`. Three harness checks pin it.

### The signup quota was bypassable by concurrency

`worker/accounts.ts` used `assertAllowed` — the **non-consuming** `/check` — and recorded the
attempt only after the account had been written. That is the exact race the 2026-08-13 audit closed
for sign-in, missed on this one route: 500 concurrent signups from one address all check before any
counts, all see zero, and all 500 accounts are created against an allowance of twelve, at ~23 D1
rows each. A quota of "12 per window" was really "one unbounded burst per hour".

Now `assertAttempt`, which reserves and checks in one round trip. The two trailing `recordFailure`
calls are gone with it, so the cost stays one unit per signup and the harness's eight-per-run still
sits under the allowance — the same trade the credential paths made when they moved. The harness's
rate-limit section passes unchanged, which is the check that mattered.

### The toast was never centred, on any screen, ever

`.v-toast` set `transform: translateX(-50%)` and `animation: v-rise … both`. `v-rise` animates
`transform`, an animated declaration outranks a normal one, and a **forwards** fill outranks it
permanently — so the centring never applied at any point in the toast's life. Its left edge sat on
the viewport's centre line; on a 390px phone a 359px toast ran most of the way off the right edge.
The tell is that calm *fixed* it, because calm kills `animation` with `!important`.

This is the trap `CLAUDE.md` already documents for `.v-block`, in a second place. Fixed with the
rule `interaction.css` already states: **`translate`, not `transform`** — they are separate
properties that compose, so the keyframe keeps `transform` and the rule keeps its centring.

### `constellation` stranded half its field on any window shrink

The note on the `vessels` regression says particle fields "wrap back in within seconds". True of
`stars` (teleports to centre) and `bokeh` (reassigns `x` on wrap) — and not of `constellation`,
which bounced by flipping velocity without repositioning. At the edge that is correct; far outside
the box it flips every frame and oscillates about its old position for ever. Shrink a 1600px window
to 800 and roughly half of the ninety nodes freeze off-canvas for the rest of the visit. Now it
clamps back inside as it flips, which costs nothing at the edge.

### Four defects in this session's own code, found by the sixth reviewer

The reason to run one: all four were mine, from today.

1. **A timer could fire a voice.** The hourly time-of-day palette change called `say`, which chimed
   — so with `mode: "tod"` and `sound` both published, a page nobody had touched would build an
   `AudioContext` and queue a blip into a suspended clock, which then fired late and attached to
   nothing when the visitor finally clicked. That falsifies the engine's headline promise. `say`
   gains `{ silent: true }` for the callers that are not a gesture.
2. **That same call sat inside a `setConfig` updater**, which must be pure — the rule four
   neighbouring call sites carry a comment about. Hoisted out.
3. **The gate read stale config.** `chime` reads `live.current`, which the post-render effect writes,
   so inside one handler it held the *previous* render's values: the sound toggle's "switching off
   stays silent" was false, and turning calm **on** played a tick that the release effect then cut
   off mid-envelope — the click `blip` exists to avoid. `update` now freshens the ref in the same
   tick, which fixes the whole class.
4. **The panel's Sound chip bypassed the gate**, calling `play` directly. The header's chip is
   hidden in calm so its direct call was safe; the panel's is visible in calm, so it made a noise in
   the one mode that promises none. Both now go through `chime`, which is what `CLAUDE.md` already
   claimed was the single gate.

### Two more, from the same reviewers, fixed

**Arrow paging had no modifier guard.** `useAccountRoutes` has always had one; this hook did not, so
**Alt+← / ⌘+← — the browser's Back — also paged the site**. The browser navigated, then the dive's
`commit` ran 300ms later, saw the URL was not the page it had started moving to, and `pushState`d a
third on top. Back landed somewhere nobody chose, and Back again only returned to the start. The
keyboard Back shortcut was unusable on all six NAV pages.

**The door's drag route never got the phone touch guard** its mirror was given on 2026-08-14. A
mostly-horizontal swipe over non-scrollable page produces no `pointercancel`, so ordinary reading
read as a 260px drag — the account side was yanking visitors to `/signin`, and this side opened the
operator door over the page. It survived the audit only because `openDoor` refuses everyone else.
The two directions are one gesture with two meanings, so they now carry the same guards.

### Confirmed and deliberately deferred

Real, verified, and not fixed in this pass — each is a bigger change than the ones above and none is
a security issue:

- **The `/machines` explorer re-lists every minute.** `onStale` is an inline arrow, so it changes
  identity on every parent render; `list`/`listColumns` carry it in their deps and the effect
  re-fires. The parent re-renders once a minute because the context value carries `clock`. Reading a
  large folder, the table blanks to "Listing…" and returns scrolled to the top, once a minute.
- **The explorer's Retry cannot succeed after the channel folds** — `onStale` drops the connection
  from the parent's map, but the Explorer's own prop still points at the dead object, so every
  Retry sends on a closed channel. Each attempt also leaks a pending-map entry.
- **Tablet-band Stack gets neither the shade pool nor a card** — `.band-desk.layout-stack` and
  `.band-phone.layout-stack` between them miss `tablet`, and `adaptLayout` leaves Stack alone there,
  so body copy can sit straight on a live canvas. `:not(.band-phone)` would cover both.
- **Phone Stack restores the card background but not its `backdrop-filter`**, which is the half that
  makes 58% translucency readable over a sharp canvas.
- **`totpConfirm` and `setPassword` are check-then-act** where their siblings moved the guard into
  the write's `WHERE`. Both need concurrent identical requests, and both UIs gate on `busy`, so
  neither is reachable through the browser today.
- **The signalling upgrade has no `Origin` check** — `crossOrigin` returns false for GET and the
  upgrade is special-cased ahead of it anyway. `SameSite=Lax` covers it today; it would stop
  covering it the moment per-account subdomains exist, so it belongs with that decision.
- **The two "pure, before any wire" harness sections run last**, after the reachability gate that
  exits the process — so a developer who appends to a catalogue and runs the harness without
  `dev:worker` gets none of the wire-format checks. The section titles and `CLAUDE.md` both claim
  otherwise; moving them above the health check would make the claim true.

---

## 2026-08-14 — `/setup`, the first new page since the spec

`TODO.md` 9, open since 2026-08-12 as one line — "a setup guide page/download (Tailscale et al.)"
— which did not say who reads it. Asked, and the answer was **remote access before a callout**: the
page the operator sends someone so a fix does not need a drive.

**A page, not a download.** It needs no file asset, works on anything, and a visitor who wants it on
paper can still print it. The brief allowed either.

### What the copy does, and why in that order

**Quick Assist leads, not Tailscale.** For a one-off look, "already on your machine, nothing to
install, nothing to sign up for, and it stops existing when you close the window" beats an account
signup, and it is the honest first recommendation even though it is the least impressive one.
Tailscale is the *standing* option — worth ten minutes only if the operator is in that machine more
than once — and it is described as what it actually is: a private link between two machines, with
screen sharing running **inside** it. Tailscale is not screen sharing, and a guide that implied it
was would send people round in circles.

Then three blocks that exist because of what the page is asking people to do: what the operator can
see (the screen, while you watch, never unattended), how to turn it off (uninstall takes his way in
with it, and you do not have to tell him), and **the scam warning**, which was not in the brief. A
page telling people to install remote-access software is precisely the page a scammer would like
them to have read first, so it says so — *"the difference is that you rang me"* — and ends on gift
cards, which is the tell that costs people the most.

macOS gets a deliberately short block: screen sharing exists but has moved between versions, and
"tell me which one you're on and I'll send the three right steps" is more honest than four wrong
ones written in advance.

### Placement, and the one word it cost

A **footer** page beside Now and Changelog rather than a seventh nav pill. The six pills are a
settled design, and there is a mechanical reason too: `NAV` is what `useOperatorRoutes` cycles with
the arrow keys and what Radial's orbit renders, so a seventh entry there changes two unrelated
behaviours as a side effect. `FOOTER_NAV` changes neither.

**It moved a line of protected copy.** The 404 says "There are eight other pages and all of them are
more interesting than this one" — and `setup` made eight wrong. The counts on the 404 are jokes that
depend on being true, which is *why* the client kept them verbatim, so preserving the word would
have been the change rather than correcting it. One word; the four-item example list beneath it was
not touched. Recorded in `CLAUDE.md` under *Copy changes*, with the note that another content page
moves it again.

Tailscale is named in prose and not linked. The site has no outbound links anywhere and this page
was not the place to start.

---

## 2026-08-14 — Share codes get harness coverage; 263 → 301

The share code is the site's most dangerous wire format and had **no automated coverage at all**,
which is exactly backwards: it is the format whose failures are silent. A code pointing at the wrong
palette still *works*. An entry appended to a catalogue repoints every code in circulation without an
error anywhere. A base-36 slip reads `12` as 38, falls through `FX[38] ?? FX[0]` and applies the
default effect, which looks precisely like a failed deploy — a trap `CLAUDE.md`, `HANDOFF.md` and
`DUEL.md` all warn about, having paid for it once.

Every one of those was caught by a person reading carefully. That is not a control.

Thirty-eight checks, in the pure section beside the path rule (§12 S) so they run before any network
call. They cover: full round-trip field by field; **each toggle bit asserted individually** — a
swapped pair round-trips perfectly and is still wrong for everyone holding an older code; the
bitfield still fitting one base-36 character at maximum; five- and six-field legacy codes still
decoding, still leaving the ornament alone, and still meaning sound-off; effect index 12 encoding as
`C`; the decimal-looking `0-0-12-0-7-0` falling back rather than throwing; hidden effects still
decoding while `PICKABLE_FX` stays a subset of `FX`; out-of-range indices clamping to real catalogue
entries in all five positions; and five distinct malformed inputs refused.

Plus the presets' own guarantee, asserted rather than assumed: each `PRESETS` entry decodes to **real
catalogue entries**, not to a literal string. That is the whole point of deriving the code
structurally — a hardcoded `"N-7-5-3-5-3"` stays correct until something is appended and then becomes
a working code pointing at the wrong palette. And each preset is checked not to switch sound on for
anybody.

The hidden-effect loop is a no-op today, because nothing carries `hidden` since the duels were
re-listed this morning. It is deliberately written as a loop over `FX.filter(e => e.hidden)` so that
it starts asserting the moment something is withdrawn again, which is when the rule matters.

---

## 2026-08-14 — The CSP measured against production; the blocker list goes from four to one

`TODO.md` 12's remaining half was "flip to enforcing once production runs quiet through the surfaces
the harness cannot drive: a passkey ceremony, a phase-2 browse, TOTP enrolment, each canvas effect."
That was written as four things to *wait for*. Measured, it is one, and three of them were never
observable in the first place.

### The reporting pipeline works, and it is slow enough to look broken

Never actually seen working before today. Driven under `wrangler tail`: the browser fires
`securitypolicyviolation`, the Reporting API batches it, `POST /api/csp-report` arrives, and
`worker/index.ts` logs it. End to end, confirmed.

**The report arrived with `age: 55218` — fifty-five seconds late.** The first check, six seconds
after the violation, saw nothing and looked exactly like a broken endpoint. Anyone testing this
needs to wait a minute, and unloading the document helps flush the queue. Worth recording because
"the tail is quiet" is the evidence the whole report-only stage rests on, and quiet-because-nobody-
is-listening and quiet-because-nothing-is-wrong look identical.

`Reporting-Endpoints: csp-endpoint="/api/csp-report"` is present and correct on page responses, which
matters: Chrome prefers `report-to` over `report-uri` when both are named, so a missing
`Reporting-Endpoints` header would have made the whole stage silently collect nothing.

### The public site is quiet, and that part is now measured rather than assumed

Zero violations across all nine content pages plus `/signin`, `/signup`, `/machines`, `/share` and a
genuine unknown URL — with **calm off** so the canvas actually renders, and **sound on** so the
`AudioContext` is constructed. Zero Worker exceptions across the whole run.

### Three of the four surfaces close by inspection

They were on the list as things to observe. They are not observable, because they cannot produce a
violation:

- **Passkeys** — `navigator.credentials.create/get` is not a CSP-governed fetch. There is nothing
  for the policy to have an opinion about.
- **TOTP enrolment** — there is no QR code. §4 is satisfied with the secret as text and an
  `otpauth://` URI, precisely because a QR would have needed a library. No image, no `data:` URI, no
  external request.
- **Every canvas effect** — 2D canvas drawing calls, which fetch nothing. Backed by a sweep of
  `src/`: no `eval`, no `new Function`, no `dangerouslySetInnerHTML`, and **no external origin
  anywhere in the source**.

The phase-2 browse is two-thirds closed the same way: the signalling socket is `wss://mcclevarty.ca`
and is explicitly in `connect-src`, and STUN through `RTCPeerConnection` is not covered by any
fetch directive Chrome has shipped.

### What is actually left is one line, and it is a real unknown

`saveBlob` in `src/components/MachinesPage.tsx` — `URL.createObjectURL`, then
`<a href="blob:…" download>`, then a programmatic click. A deliberate probe confirmed **`blob:` is
not permitted by the current policy**: fetching one reported against `connect-src` and loading one
into an `<img>` reported against `img-src`, both saved only by report-only mode.

A `download` anchor is not governed by fetch directives, so this is *probably* fine. Probably is the
wrong standard here — being wrong means the operator silently loses the ability to download their
own files, which is the entire point of phase 2. **So the flip waits for one real download in the
two-tab test**, which is already owed, rather than for a week of watching.

**`blob:` was deliberately not added to the policy.** It would not protect the anchor path — that
path is not fetch-governed — so adding it buys nothing against the actual risk while widening a
security policy for a feature that does not exist. It *will* be needed in `img-src` when the
deferred "image thumbnails from actual bytes" lands (`TODO.md` 5b); that is the moment to add it,
with something real behind it.

---

## 2026-08-14 — The site gets a voice, and a stored preference stops falling through

`TODO.md` 7 — asked for twice, never built, and correctly flagged as a spec change rather than a
patch: it needs a control, a persisted toggle and a share-code field.

### Synthesised, because the Assets rule already decided it

`SPEC.md`'s *Assets* rule is no third-party libraries, no webfonts, no images. Audio was never named
but the reasoning covers it, so `src/audio/engine.ts` is oscillators and envelopes — there is no
`.mp3` here and the whole feature costs nothing over the wire.

**The pitch comes from the palette.** `src/theme.ts` exists so that no component contains a literal
colour; this is the audible half — no voice contains a literal frequency, they are intervals above a
root the palette picks, from a pentatonic set so no two palettes can land on a tritone mid-bleed.
Changing palette retunes the site, which is worth the twenty lines it costs.

Seven voices, all under 200ms: `nav`, `toggle`, `open`, `close`, `toast`, `shuffle`, `deny`. A site
that chimes at every opportunity is a site people mute.

### Autoplay is satisfied by construction, not by asking

**There is no ambient bed, no loop and no timer.** Every voice is fired by a gesture the visitor
made, so there is nothing that *could* play uninvited, and the `AudioContext` is not constructed
until the first `play()` — a visitor who never turns sound on never allocates one. `releaseAudio()`
gives the device back when sound goes off or calm comes on, because a live context marks the tab as
playing audio and can hold a Bluetooth headset in its high-latency profile.

**Calm silences everything.** Calm is the quiet mode in every other sense — no motion, no shadow, no
canvas — and it would be a strange one that still chimed. The header chip is *hidden* in calm rather
than disabled: a switch that visibly does nothing is worse than no switch.

### The bitfield had a spare bit, so there is no seventh field

Share codes carry sound as **bit 16** of the existing toggle bitfield rather than a new field. Every
code in circulation has that bit clear, which decodes as sound off — the correct default and the one
a visitor would want. The field count does not change, so nothing that counts hyphens breaks, and
base-36 still renders the full bitfield (max 31, `V`) in one character. Verified: legacy five- and
six-field codes decode `sound: false`, both directions round-trip, garbage still returns null.

### It is publishable, and the asymmetry is written down

`sound` joins `PUBLISHED_KEYS` in both halves — the client's `src/config/siteConfig.ts` and the
Worker's `worker/site-config.ts`, which are separate lists and silently drop anything missing from
either. It belongs there because the share code already carries it, and a pasted code being able to
do something publishing cannot would be the odd asymmetry.

But `calm` and `sound` are not equivalent: publishing calm makes the site gentler for everyone and
publishing sound makes it louder for everyone. Two guarantees hold that in check and both must stay
true — nothing plays without a gesture, and **a visitor's stored preference always beats the
published value**, permanently and in both directions. Recommendation to the client: leave it off
when publishing, and let people opt in.

### The stored-preference rule, restated — and the bug that was hiding under it

`CLAUDE.md` said calm was "the one stored field" and warned against extending the carve-out. Sound
extends it, deliberately, and the rule is better stated than the exception was: **the stored fields
are the ones a visitor can set for themselves.** Everything else is appearance and belongs to the
operator. Today exactly two controls are public — the two header chips — and they are these two. The
test for adding a third is not "is this useful to remember" but "can a visitor set it at all".

Calm must survive because a visitor turned it *on*; sound must survive because a visitor turned it
*off*. Being told to be quiet is an instruction, not a session preference.

**Adding the second one exposed a real bug in the first.** `loadConfig` opened with
`if (published is not an object) return { ...DEFAULT_CONFIG }` — an early return that never reached
the stored-calm lookup. So calm silently stopped persisting whenever nothing was injected: before
the first publish, and, the case that matters, **whenever D1 is unreachable and
`worker/site-config.ts` correctly injects nothing.** The accessibility escape hatch switched itself
off in exactly the degraded state where someone is least able to go hunting for it. Production hid
it because a config *is* published, so the early return was never taken there.

That branch now applies both stored preferences before returning. Verified with nothing published:
stored-on gives on, stored-off gives off, and no preference still falls through to the defaults.

---

## 2026-08-14 — The duel gets an attract mode, and the screensaver turns out to be older than the idea

The client asked whether the screensaver should run the lightsword fight, and the matrix rain when
the theme is matrix rain — *"or is that dumb?"*

**It is not dumb, and it is what the screensaver has always done.** `Screensaver.tsx`: sixty seconds
without a click fades the whole interface to `opacity: 0` and leaves only the canvas, which speeds
up (`FxCanvas` adds `0.9` to the boost while sleeping). The screensaver has never had a rendering of
its own — it *is* the configured effect, alone, faster. So with the duels re-listed earlier today
the client's idea was already live; picking either duel gives a full-screen lightsword fight after a
minute idle, and picking rain gives rain. Worth writing down because the question will be asked
again: the screensaver has no content of its own to give it.

### What was actually missing, and is now built

The duel was still drawn with **background** settings while asleep — `0.62` of the viewport width,
bodies at `dim: 0.55`, health bars off — all three of which exist to keep it out of the way of body
copy that, once the chrome has faded, is not there. It was being polite to nobody.

`Frame` gains a `sleeping` flag and `duelling` an attract blend:

- **Its own flag, not something read back out of `boost`.** Scroll velocity is folded into the same
  number, so a hard scroll is indistinguishable from a sleeping interface there.
- **Eased, never switched.** The chrome takes 1.6s to fade, and a figure that doubled in size on one
  frame would beat it there and read as a glitch. The blend closes 1.6% of the remaining distance
  per fight frame, which lands with the fade at the boost the screensaver runs at. Measured on the
  bench: `0.34 → 0.56 → 0.71 → 0.80 → 0.87 → 0.91 → 0.94 → 0.96` going to sleep and a clean
  exponential decay back, no discontinuity at either end.
- **The rate is expressed in fight frames**, which run boosted asleep and unboosted awake, so the
  settle back takes roughly twice as long as the growth. That asymmetry is deliberate: waking is the
  moment you want the page back, not a second animation competing with it.
- **`approach()` raises the retained fraction to the frame count** rather than doing a naive
  `x += (target - x) * rate`. `frames` here is delta-corrected and clamped to 4, never 1, so the
  naive form would travel a different distance per unit time on every display.
- **Health bars needed a numeric fade.** `DuelView.bars` is a boolean and can only pop, so `barAlpha`
  joins it — optional, defaulting to 1, which leaves the ornament untouched. The judgement that made
  bars ornament-only is unchanged: they are wrong behind body copy and right once the copy has gone.

At full attract the pair runs about 1.4× linear with feet 4% lower, and `dim` reaches 1.

**Only the duel reads `sleeping`.** Every other effect is a field that already fills the viewport and
gains nothing from the extra room; adding the flag to the frame does not oblige anyone to use it.

### Verified on the bench, not on the site, and that is a real limit

`fxlab.html` gained a **screensaver** checkbox and drove the whole ease. What could not be checked
here is the sixty-second path on the real site: the screensaver timer runs in a hidden tab but the
render loop correctly parks, so the blend would advance one or two frames per screenshot and never
visibly grow. The effect logic is the same code either way and the wiring is a one-line pass-through
that typechecks — but the sentence "it looks right easing in on the live site" is the client's to
say, not this session's.

### The placement question, answered rather than acted on

Attract mode does **not** fix the fighters standing behind the hero's CTA, because that is the
non-attract state. Recommendation: **leave it.** The effect is operator-opt-in, the screensaver is
now the showcase so the in-page state can afford to stay recessive, and the collision is a function
of viewport height *and* where the fighters happen to be in the match — a fixed offset would trade
Cinematic's collision for another layout's. It wants the client's eye in motion rather than more
stills.

---

## 2026-08-14 — The four open design calls, decided

The client handed over the four judgement calls the HUD pass and the duel rebuild had left
open — *"I'll let you make them, do what is graphically the best"*. Each was looked at in a
browser before it was decided, and one of the four turned out to be resting on a fact nobody
had measured.

### 1. The contact sheet's duotone in calm — kept, and raised to full strength

Shipped as a halved `0.1` on the grounds that a photograph is not body copy but calm should
still be quieter. Measured on the real page: **at 10% the tint is indistinguishable from no
tint at all.** The tile image is itself `opacity: 0.8` over a dark card, so the backdrop the
`color` blend has to work against is already dark and low-luma; the isolated swatch that made
22% look strong was a full-opacity image at four times the size. Set the blend to `1` on the
live page and the teal is unmistakable, so the mechanism is fine — 10% is simply below the
threshold of visibility.

That made the shipped position the worst of the three: a special case in CSS and a paragraph
of documentation defending an effect nobody can see. So the `.is-calm` override is **deleted**
and calm tints at the same 22% as every other mode.

The reasoning that ruled out stripping it is unchanged and is what rules out stripping it now:
calm exists so body copy holds up on the low-contrast palettes, the caption sits above the
blend so no text is ever blended, and calm is not a colour mode — it changes no palette value
anywhere else, so a photograph that changed colour on toggling it would be the one thing that
did. Checked at 22% against all twenty-five palettes' `--a1`: every one reads as a deliberate
duotone, including Datamosh's hot pink and Toxic Bloom's acid yellow-green.

### 2. Presets stay operator-only — reaffirmed, and a lying comment removed

Kept as they are, and the reasoning is stronger than the proposal's rather than weaker.

The check that decided it: **what appearance control does a visitor actually have today?**
Exactly one — the calm toggle. The shuffle is reachable only from the panel and the command
palette's operator block; every palette, layout, background, type and ornament entry sits
behind the same gate; `.v-paste` is in the operator-only panel. "Show me something weird" on
the home page is not a shuffle at all — it navigates to the gallery. So making presets public
would not be loosening one control among many, it would be the site's **first** public
appearance control, and the site shows one published look on purpose. A preset switcher does
not make that look better, only negotiable.

What *was* wrong is now fixed: the comment above the loop claimed the block was "the route a
visitor has to them, since the siteconfig panel is operator-only and the palette is not" —
while sitting inside `if (isOperator)`. It was leftover proposal wording, and a comment that
contradicts its own gate is an invitation to resolve the contradiction by moving the loop out
of the gate.

### 3. The two duel backgrounds are re-listed

`hidden: true` deleted from `FX` 12 and 13, which was the whole of "re-list them" exactly as
promised. They render correctly and read as intended — the hooded/blue vs domed-helmet/red
pairing and the haloed/green vs horned-and-tailed/red pairing are both unmistakable at
background scale.

The reason this is a small change and not a product risk: **every surface that reads
`PICKABLE_FX` is operator-gated** — the panel, the palette's appearance block, the shuffle.
No visitor gains an effect. The operator gains two entries in their own menu, and a visitor
sees a duel only if the operator publishes one. (An earlier read of this note assumed the home
page's "something weird" button rolled the dice and would therefore hand visitors a duel; it
does not, and that was checked rather than assumed.)

One honest observation recorded against the effect rather than acted on: the fighters are
centred with their feet at 80% height, which on Cinematic at a short viewport puts them
directly behind the hero's CTA row. Nothing becomes unreadable — `dim: 0.55` holds and the
button stays crisp — but it is the one thing that reads as placement rather than design.
Moving it is a composition change to a tuned effect, not part of this decision, so it is
flagged in `src/fx/effects.ts` for the client's eye.

`PICKABLE_FX` now equals `FX`, and both stay. Collapsing them into one array is the tidy-up
that would force the next withdrawal to delete an index instead of flagging one.

### 4. `fxlab.html` is kept; the `?site=` override is not

Split, because the two temporary tools were not the same kind of thing.

**`fxlab.html` is committed at the project root.** Three sessions in a row failed to verify the
canvas by eye, and this session spent a fourth round rebuilding an ad-hoc version of the same
bench from the browser console before it could judge decision 3. The obstacle is structural and
correct on both sides: an automated or occluded browser reports `document.hidden`, so
`requestAnimationFrame` parks, *and* `prefers-reduced-motion: reduce`, which becomes calm, which
hides the canvas. The bench sidesteps both by advancing the clock from an explicit Step button
rather than from rAF, so it renders identical frames in a buried tab — verified: all sixteen
effects, 400 frames each, with `document.hidden === true`.

It is safe to commit because it **cannot ship**: `vite.config.ts` declares no
`rollupOptions.input`, so the build has exactly one entry, `index.html`. Confirmed by building
— `dist/` contains no `fxlab.html`. The file's own header says so, and says that anyone adding
a multi-page input map must leave it out.

**The `?site=<base64>` parameter is not kept.** A URL that overrides the operator's published
appearance is a public surface and a product decision, it bypasses the published-only
discipline `loadConfig` exists to enforce, and — unlike the bench — nothing needed it: the same
verification is reachable by editing `DEFAULT_CONFIG` in dev, which is a local edit rather than
a permanent route.

---

## 2026-08-14 — The canvas effects, finally looked at; and the duel gets a skeleton

Two things, both downstream of the same fact: the HUD pass shipped with its canvas work
**unverified by eye**, because the verification browser reported `document.hidden` and the render
loop correctly parks. `TODO.md` 2d recorded that honestly. This entry closes it.

### Why nothing was visible last time, and it was two things, not one

`document.hidden` was the half that got written down. The other half only showed up on the real
site: the verification browser also reports **`prefers-reduced-motion: reduce`**, which
`ConfigContext` turns into calm, and **calm hides the canvas**. So even with a visible tab, the
front page renders no effect at all until calm is toggled off. Anyone repeating this check needs
both: a visible tab *and* calm off. It is not a bug — both behaviours are correct — but it is the
reason two sessions in a row could not see a canvas.

All sixteen effects were then rendered at 1568×778 and at 1026×832, against Nebula Drift and Cold
Open, plus `hud`+`scan`, `hud`+`telemetry` and `terminal`+`rain` on the real site. The circles are
round, `plasma`'s grid comes out at ~58 columns across 1526 CSS pixels (i.e. the 26px cell is
receiving CSS pixels, not device pixels — the load-bearing `setTransform` is doing its job), and
`scan` and `telemetry` read as intended.

### `vessels` was stranded by the buffer resize — a real regression

**The one bug the pass introduced, and it was in the default effect.** `buildTree` grows the tree
against `w`/`h` once and `FxCanvas` drops the effect cache only when the *effect id* changes, on the
documented grounds that a resize is absorbed by the effects themselves. Every particle field wraps
back in and `rain` compares its column count, but the tree does neither — so after a window resize
the trunk, rooted at `w * 0.5`, sits off-centre and the two side branches, rooted at `-10` and
`w + 10`, **detach from the edges and float in the middle of the page**.

This could not happen before the HUD pass: `w` and `h` were the constant 1600×1000 and CSS did the
stretching, so there was nothing for the tree to go stale against. Widening the window from 1050 to
1600 on the live site reproduces it every time.

The fix is `rain`'s own pattern — the cache carries the box it was built for — plus one addition:
it also carries the **pool of random numbers** the tree was grown from. Rebuilding from the pool
re-fits *the same tree*. Without it the two options are both visibly wrong: keep the old geometry
and the branches stay detached, or re-roll and the whole tree reshuffles on every frame of a
drag-resize. Depth can still shift with the box because the `len < 14` floor bites at a different
level on a short canvas; the pool keeps that to a local difference instead of a new tree.

### The duel gets a skeleton, at the client's request

"Make the characters look better, and the fight sequences more realistic." What was actually there:
a fighter was **two rectangles and a line** — one `fillRect` torso, one `fillRect` head, no arms, no
legs, no hands. The sword hand was a pair of constants welded to the torso, so a swing could only
*pivot*; the blade never travelled through space. There was no wind-up (the blade jumped 0.95rad in
a single frame on the opening frame of an attack), no follow-through, and `force`, `kicking` and the
victory pose were bare constants that snapped in and out. The only thing on the whole figure with
idle motion was the horned fighter's tail.

What changed:

- **A local transform.** `drawFighter` now works in body-local units with `scale(facing, 1)`, which
  deletes every mirror term. This is why limbs became affordable at all — the old version inlined
  `cx` and `facing` into every coordinate, so every part had to be written twice in the author's
  head.
- **Articulated limbs**, two arms and two legs, from one ~10-line law-of-cosines `joint()` helper.
  Bone lengths are deliberately only slightly longer than the reach they cover: a chain much longer
  than its target distance puts the slack in a joint sticking out sideways, which is exactly what
  the first attempt looked like.
- **The sword hand orbits its shoulder on a shorter, phase-shifted arc than the blade**, so the arm
  does not collapse into a straight line with it and the tip travels rather than pivots.
- **Anticipation and follow-through.** `SLASH_FRAMES` 15 → 20, split three ways, damage moved from
  frame 5 to frame 11 so the hit lands at the bottom of the swing. `KICK_FRAMES` 20 → 16 pays the
  frames back. Measured over ten simulated minutes, the average match went 9.6s → 10.5s.
- **A damped spring on the blade angle**, in the fixed step so it cannot depend on frame rate. Every
  action now sets a *target*; the spring is what removes all four snaps at once.
- **A blade smear**, keyed to how fast the blade is *turning*, not how fast it is moving — the
  samples are world positions, so a fighter sliding sideways with a still blade first swept out a
  clean filled rectangle. Correct, and it read as a slab of colour. It also starts halfway down the
  blade, because a fan drawn all the way to the fist reads as a cape.
- **Ground contact**: both shadows drawn before either body (or the second fighter's shadow paints
  over the first one's legs), shrinking and fading with height, plus a landing squash about the feet.
- **Sparks come off the blade's actual tip**, clamped into the body it struck, biased along the
  swing, and drawn as streaks rather than discs. They used to spawn at the midpoint between the two
  fighters, which had nothing to do with where the visible blade was — that is why a clash never
  looked like contact. **`dist` remains the sole authority on whether damage lands**: gate that on
  the tip actually reaching and misses become routine, health stops draining, and the match-reset
  loop has no timeout.
- **Death keeps its identity.** The death branch ran its own transform and re-drew only the two
  rectangles, so the halo, horns, cape and tail vanished on the frame of death — for the two seconds
  anyone actually looks at the loser, the two pairings were indistinguishable.
- **Idle motion for all four costumes**: the cape trails against travel, the aura breathes, the halo
  bobs clear of the head, the chest panel's cells blink out of phase, the bat wing flares on a leap.

The blocking/parry state from the same review was **not** taken. It is the only proposed change that
can alter match outcomes — a mutual block lock would leave `over` never firing — and it is not worth
that risk for a background ornament. Recorded here so it is a decision rather than an oversight.

### One thing deliberately not left behind

The verification used a temporary `fxlab.html` (all sixteen effects on one page, driven through
`FxCanvas`'s exact frame maths) and a temporary `?site=<base64>` parameter in `index.html` standing
in for the Worker's injection. Both were removed. Committing either is a product decision — a
permanent dev-only page and a URL that overrides published config — not a tidy-up, so neither was
taken unilaterally. They are three minutes to rebuild if the client wants them.

---

## 2026-08-14 — The HUD pass: thirteen layouts upgraded, a fourteenth added

From a written proposal the client approved in full ("I'll trust you for everything"). Two halves:
an upgrade pass over the existing layouts, and three named presets, one of which needed new
machinery. The proposal itself is an artifact; what follows is what actually shipped and the
places where building it changed the plan.

### The canvas was drawing ellipses

`FxCanvas` rendered into a fixed 1600×1000 buffer that CSS stretched to fill. The stretch is
anisotropic, so **every circle in `orbits`, `constellation`, `bokeh` and the tunnel's spokes
rendered as an ellipse** whose eccentricity was whatever the viewport's aspect happened to be, and
anything wider than 1600px was an upscale of a smaller image. The buffer now follows the element
via `ResizeObserver`, capped at `min(devicePixelRatio, 2)` and a 2600px long edge.

The context carries a base `setTransform(scale, …)` so every effect keeps working in **CSS pixels**.
That part is load-bearing and easy to undo: `rain` sizes its columns off `w` at a 16px cell and
`plasma` its grid at 26px, so handing them device pixels would silently double their density on a
retina display. The per-frame `setTransform` also means a missed `ctx.restore()` — `rain` flips the
world with `scale(-1, 1)` inside a save/restore pair — can no longer mirror the site permanently.

### Two theme tokens, and one that is not a palette token

`--panel` (translucency) and `--elev` (a unitless shadow multiplier) join `--radius` in `theme.ts`.
Panel translucency was a literal `70%` inside `.v-block`, so every layout wanting something else
restated the whole background.

**Nothing in this pass needed a tenth colour on the palettes.** Every glass tint, lit edge and glow
derives from `--surface`, `--line` and `--a1` through `color-mix`, which kept `palettes.ts` a pure
data file and left share codes alone.

Two floors on `--panel`, both deliberate:

- **Calm goes to 92%.** Calm also hides the canvas, so there is nothing left to see through the
  glass and a translucent panel with no backdrop is just a weaker edge — on exactly the palettes
  calm exists for.
- **`LOW_CONTRAST` palettes go to 80%.** On Peat, `--surface` and `--bg` are about four points of
  luminance apart; halving that difference deletes the panel edge.

Mosaic and the HUD therefore shift translucency with `--panel-shift` rather than setting `--panel`
outright — an absolute value would drive straight through both floors. `.v-block` clamps the sum.

### Glass turned out to be calm-safe by construction

The expected accessibility problem — a translucent panel over a moving canvas — does not exist
here, because calm sets `.v-canvas { opacity: 0 }`. A blur over a flat field is a flat field. Calm
also strips `box-shadow` and `animation` globally with `!important`, so every glow added in this
pass dies there on its own, and the parallax rigs are disabled in JS by the existing `config.calm`
checks. The whole calm bill for Part A came to two decisions: the `--panel` floor above, and the
contact sheet's duotone (below).

### Three things that only showed up in a browser

1. **A floated `::first-letter` is invisible inside a multi-column container.** Magazine's drop cap
   reserved its box — the text wrapped around a two-line notch — and never painted the glyph.
   Verified with the identical rule: visible at `columns: auto`, invisible at `columns: 3`. Since
   Magazine is the only layout with columns, the obvious implementation could not work in the one
   place it was wanted. It uses `initial-letter: 3 3` behind `@supports`, which does work there.
2. **`.v-stage` scrolls vertically, which forces its `overflow-x` from `visible` to `auto`.** The
   hero's stage-wash pseudo-element bled 14% past the hero on each side and gave the whole stage a
   horizontal scrollbar — measured at exactly 91px. Every ambient-light pseudo-element in this pass
   is now pinned to `0` horizontally and widened instead of moved outward.
3. **The verification tab was `document.hidden`,** so the render loop was correctly parked and the
   canvas never drew. The new effects were checked instead by running all fifteen against a
   recording 2D context at three viewport shapes over forty frames — no NaN or Infinity
   coordinates, no out-of-range alpha.

### Guardrails

Terminal's window gained a `backdrop-filter`, which is the change the layout was waiting for: a
55%-opaque box over a *sharp* canvas is why its allowlist was only `rain`, `tunnel`, `off`. Blurred,
the background arrives as diffused light, so `constellation`, `stars`, `aurora` and `scan` joined
it. Two new blocks were added with the translucency drop — `plasma` on Deck, `plasma` and `rain` on
Mosaic — because at 54–58% those fields read *through* body copy where at 70% they did not.

Note what a guardrail is and is not: `isAllowed` is consulted by the randomiser only, and a
hand-picked config or an applied share code goes straight past it. So anything that could make copy
genuinely unreadable is handled in CSS — the translucency floors, Stack's shade pool — and never by
adding a row to the table.

### `hud`, and why it needed to be a new archetype

Appended at index 13. Blocks sit on three z-planes and physically overlap, and the near plane's
`backdrop-filter` blurs the plane behind it. That is genuine occlusion, and none of the thirteen
existing layouts can express it — every one is a grid, a column or a track.

The chamfered corners are a `clip-path`, and **`clip-path` clips `box-shadow` away**, so elevation
here is a `drop-shadow` filter instead: a filter follows the clipped silhouette. `filter` makes an
element a containing block for `position: fixed` descendants, which is safe on a content block and
would not be on the grid or the stage.

`TABLET_LAYOUTS` maps `hud → cinematic`, not `→ mosaic`. `adaptLayout` is a single lookup and does
not chain, so mapping to a layout that itself collapses on that band would have rendered real
six-column Mosaic at 700px — the thing the mapping exists to prevent. Phones fall through to Stack
already.

### The duels keep indices 12 and 13, as a hidden entry

`FX` gained a `hidden?: boolean` and the two lightsword duels are back in the array at the two
indices `catalog.ts` had promised them, flagged hidden. The decision that withdrew them is
unchanged — they return to the picker when the client's eye has passed the ornament, and lifting
the flag is the whole of "re-list them".

They are in the array because **the array is a wire format**. Appending `scan` and `telemetry` to an
eleven-entry list would have taken 12 and 13 and broken that promise, or worse, been "fixed" later
by inserting the duels ahead of them and silently repointing every share code minted in between.
`PICKABLE_FX` is what the panel, the command palette and the shuffle read; `FX` is what persistence
and `decodeShareCode` read, because a hidden effect is unlisted, not invalid.

**The 404's "12 background modes" line does not exist.** Two code comments claimed a copy
correction would be needed here; the string is in neither `pages.ts` nor anywhere else, having gone
with the vitals strip. No copy changed in this pass.

### The contact sheet's duotone — the one judgement call left open

Full greyscale plus an `--a1` field at `mix-blend-mode: color`, capped at 22%. The placeholder
photographs were the one element on the site that did not recolour with the palette.

`mix-blend-mode` is not something calm strips, so its behaviour there is a decision rather than a
default: **it stays, at 10%.** Calm exists so body copy stays readable on the low-contrast palettes,
and a photograph is not body copy; removing the tint outright would make calm the one mode where the
images visibly disagree with the palette around them. Reversible in one line if the client disagrees.

### Presets are operator-gated, which is a smaller claim than the proposal made

`PRESETS` (`src/data/presets.ts`) defines each preset **structurally and derives its share code**,
never as a typed string — a hardcoded `"N-7-5-3-5-3"` would be correct until something is appended
to a catalogue and then silently wrong, and the wrongness would be a *working* code pointing at the
wrong palette.

They appear in the siteconfig panel and in the command palette's operator block. The proposal
described them as something "a visitor can select or reach via share code"; that is not true of this
codebase as it stands, and was not made true here. Every appearance control in the command palette
is already behind `isOperator`, and `.v-paste` — the only place a share code can be applied — lives
in the operator-only panel. Making presets public would be a product decision about who controls the
site's look, not an implementation detail. Flagged, not taken.

---

## 2026-08-14 — Deployed to production; TODO 2 proven in a real browser

The overnight commits (`bf292e1` slot-endpoint password gate, `db9cb43` report-only CSP) went
live once wrangler was re-authenticated (OAuth, approved by the client in-session). Full
`HANDOFF.md` verification block passed: bundle hashes match, one HTTPS redirect, six headers,
the report-only CSP riding pages, www→apex 301, `/api/health` 8 tables, SPA routes 200, assets
`nosniff`.

**TODO 2 — recovery-code redemption — is done**, driven end to end in a real Chromium against
production with a throwaway non-operator account (`fable-check`), so the operator's ten codes
are untouched: signup showed the codes once; sign-out; redeem code #1; the set-password ticket
screen; signed in with `9 of 10` left; sign-out; sign-in with the new password succeeded. The
account row is left in D1 deliberately (removing it is an `/admin` or break-glass write the
client may prefer to do, or ask for); its password is known only from this session.

`wrangler tail` ran through the entire browse — signup, redemption, set-password, two
sign-ins, sign-outs — and logged **zero CSP reports**, the first production evidence toward
the flip to enforcing. Still unexercised: passkey ceremony, phase-2 browse, TOTP enrolment,
the other canvas effects.

GitHub remote `https://github.com/zazathebird/vessel.git` is configured, but pushing needs
credentials this machine does not have (no PAT, no SSH key, no `gh`); `git push` also needs
`GIT_EXEC_PATH=/home/user/.local/git-root/usr/lib/git-core` because the local git's default
exec-path is an empty directory.

---

## 2026-08-14 — TODO 12 lands as far as it safely can: a nonced CSP, report-only

The blocker was always the inlined site-config script; the nonce now exists (`cspNonce` per
request in `worker/index.ts`, stamped by `withSiteConfig`, named by `cspPolicy`). The policy
ships **report-only**: it cannot blank anything — the documented failure mode of doing this
badly — while every violation it would have blocked posts to `/api/csp-report`, which logs a
truncated line for `wrangler tail` and stores nothing (§9's inventory deliberately gains no
field; do not add a report table). `style-src` keeps `'unsafe-inline'` because the theming is
style attributes and `style-src-attr` would blank pre-15.4 Safari; `connect-src` names
`ws(s)://<host>` beside `'self'` for old WebKit's sake; `frame-ancestors 'none'` restates
`x-frame-options` on purpose. Verified: harness 260 → **263** (header present, injected script
carries the header's own nonce, report endpoint answers 204), and a six-page browse in a real
Chromium produced zero violation reports. **The flip to enforcing is one header rename in
`harden`**, once production has run quiet through a passkey ceremony, a phase-2 browse, TOTP
enrolment and the effects — the surfaces the harness cannot drive.

## 2026-08-14 — TODO 15 lands: `/api/account/slot` demands the password, and the TOTP half moves

The slot endpoint was the last place a session cookie alone bought the wrapped grant key — the
input to an offline password grind that ends in grant authority, which is the escalation §5
exists to prevent. It is now `POST` and the body carries the derived `authSecret`, checked by
`assertPassword` — so the rate limiting lives inside the check, per the invariant, and a wrong
password at any slot-fetching flow now counts against the buckets instead of failing silently at
AES-KW. Callers updated: `changePassword` and `openGrantKey` (`src/auth/flows.ts`),
`unlockForConnect` (`src/share/unlock.ts`, which maps the endpoint's credential-change 401
wording back to the ceremony's own "That is not your password." while letting §4's rate-limit
wording through), and `addPasskey` (`src/auth/passkeys.ts`), where the slot fetch **moved before
the authenticator ceremony** — the server's password check now fires before the user is asked to
touch anything, keeping "wrong password fails before the registration is sent" true.

**The TODO's TOTP half deliberately did not land on this endpoint, and should not.** The
response is the same ciphertext whatever the caller intends, so a TOTP requirement here could
not distinguish §12 K's password-only connect ceremony from §3's password-plus-TOTP sign
gesture — an attacker would simply claim the weaker purpose, and honest §12 K users would pay a
per-connect TOTP prompt §12 K explicitly decided against. The enforceable home for the fresh-TOTP
check is the **phase-3 grant-submission endpoint**, which sees the guarded action (the signed
grant) rather than an intention. `openGrantKey`'s comment now says so; build that check before
anything accepts a real grant. Harness 258 → **260** (session-only fetch refused; wrong proof
refused).

## 2026-08-14 — The §10 explorer completes: Grid and Column modes

List shipped with phase 2 as the floor; the other two §10 view modes now exist
(`src/components/MachinesPage.tsx`). What §10 fixed, built as fixed: a toolbar switcher
remembered **per drive** (`vessel.explorer.v1`, validated on read like all storage); **Grid** as
tiles over drawn file-type icons — `src/components/FileIcon.tsx`, ~14 categories, a stroked page
in `--line` with a type-coloured fold and glyph in `--a1`/`--a2` via CSS class, never a literal,
so icons recolour with the bleed; **Column** as Miller columns, pane *d* listing
`path.slice(0, d)`, panes cached against their path prefix and guarded by a token so a superseded
load cannot paint over a live one, sliding in on the house 0.34s easing (`translate`, never
`transform`); the **progress wash** in `--a1` as a `background-image` gradient so it cannot fight
the 0.9s `background-color` bleed; **List gained sortable headers** (`aria-sort`, directories
always first) and its Kind column now names the drawn category. Calm collapses everything to List
and drops the wash — §10 calls that the correct behaviour, not a degradation. The explorer is
keyed by drive id so state cannot leak between drives. **Deliberately deferred from §10: image
thumbnails from actual bytes** — decorating a grid by reading whole files belongs after the
phase-3 read-cap conversation (`TODO.md` 5b). Unseen by any eye, like the rest of phase 2.

## 2026-08-14 — SPEC-ACCOUNTS phase 2: machines, signalling, brokered browsing; docs condensed

**Spec first, per §7.** `design/SPEC-ACCOUNTS.md` gained §13 (the concrete pairing, signalling,
connect-ceremony and file-protocol design) and §12 K–S — nine logged decisions, each with what it
was chosen over and a "revisit if". All five of §12's formerly-blocking open questions are
answered in place. The load-bearing ones: **K** (the browsing peer authenticates with the grant
key — the agent never trusts the introduction, in either phase), **L** (pairing is a password
ceremony), **M** (a "machine" is a browser profile; one agent socket, newest wins), **P** (STUN
only; TURN specified but a client spend decision), **S** (paths are arrays of components — no
string parser exists to have a traversal bug).

**Then plumbing, harness before interface.** Migration `0004` (machines + drives; grants and
invites stay absent — phase 3). `worker/machines.ts` (pair/re-key password-gated via
`assertPassword`, so the route rate-limits and cannot be a password oracle; CRUD session-gated;
caps 10 machines / 16 drives). `worker/signal.ts` — the `MachineSignal` DO, hibernation API, one
per machine, authenticated entirely in `worker/index.ts`'s `signalUpgrade` gate (which bypasses
`harden()` deliberately: copying a 101 drops its `webSocket`). `src/share/` — `handshake.ts`
(context-bound signed DTLS fingerprints, `vessel/p2p/<role>-fp/v1`), `paths.ts`, `protocol.ts`
(v1: list/stat/read, 64 KiB chunks, `bufferedAmount` pacing), `agent.ts`, `browse.ts`,
`store.ts`, `unlock.ts`. Health check now expects 8 tables.

**Harness: 178 → 258.** Three new sections drive the path rule, every machine/drive route
(negatives: no session, wrong password, malformed key, duplicate names, foreign-account 404s),
and the signalling DO end to end over real WebSockets — including both directions of the
ceremony's crypto with the real `src/share` modules, tampered/wrong-machine/wrong-role signature
refusals, presence, replacement, frame hygiene and removal hangup. `ws` joined the
devDependencies (Node's WebSocket cannot send a cookie); it is `--external` in the esbuild step.
**One local-dev quirk recorded:** workerd delivers a server-initiated close on a hibernated
socket lazily, so the harness asserts the `replaced` *frame* and the relay behaviour, not the
close code reaching the replaced client.

**Interface last**, account-form conventions throughout: `/share` (pair/re-key/take-over forms,
drive pick/re-attach/allow-access, glanceable status with peers + bytes served, beforeunload only
while a peer is connected) and `/machines` (presence-aware list, §12 K unlock form, List-mode
explorer with breadcrumbs, folder descent, per-file fetch with progress and Blob download). Both
unlinked pages: typed routes `machines` / `share`, linked from the `/signin` summary. The
signed-in summary's "still being built behind it" note retired with the pages it promised.

**Docs condensed at the client's request.** `FABLE-FINDINGS.md` (the 2026-08-13 full review's
64 KB session-survival file) is deleted: every finding in it was fixed and recorded here at the
time; its adversarially-verified "safe — do not re-litigate" list moved to
`docs/SECURITY-AUDIT.md`'s appendix, and its three still-unanswered client questions (the
Contact-page mailbox, per-account subdomains, Pages retirement) moved onto `TODO.md`'s sign-off
list. `TODO.md`'s done items compressed to one-liners, numbering kept for cross-references.
`docs/pi-sharing-host.md` updated: its final step now has a real `/share` to point at.

Four client requests landed in one session, plus the review that
`docs/REVIEW-CONTINUATION.md` had been holding open (that file is now deleted,
per its own instruction — this entry is the durable record).

**Client requests, all shipped:**

- **"Remove the word vessel from the site."** Every user-visible occurrence is
  gone: wordmark, `<title>`/document titles, Terminal's termbar, the TOTP
  issuer, the passkey rp name — all now `mcclevarty.ca` — and the "Vessels"
  effect label is "Branches". Internal identifiers (`.vessel` class, storage
  keys, session cookie, HKDF info strings, Worker/D1 names, effect id) keep
  the old name deliberately: renaming them breaks live sessions, stored
  config, key derivation or share codes for zero visible change. CLAUDE.md
  deviation 10. `mcclevarty` joined the reserved handles.
- **The favicon** is no longer the empty `data:` icon: an inline SVG (still no
  file) of the client's chosen drawing — the finger, offered to a small
  four-pane window. No trademarked mark anywhere near it.
- **Duel likeness + alignment colours.** The four silhouettes now carry their
  characters (haloed: hair, floating halo, aura, fuller robe; horned: curved
  horns, scalloped bat wing, swaying spade tail; hooded: deeper hood, belt,
  tunic skirt; caped: domed helmet, lit chest panel, floor-length cape), and
  the blades hold fixed colours in every palette — blue/green for good, red
  for evil (`BLADE_COLORS`, the site's one literal-colour carve-out, CLAUDE.md
  deviation 9). Motion and likeness still need the client's eye.
- **Placeholder photos** fill all eight photo-slot tiles: Wikimedia Commons
  PD/CC0 only, re-encoded to strip EXIF (the gallery copy promises it),
  desaturated under the tile chrome so the palettes keep authority
  (`.v-tile-img`). `docs/PHOTOS.md` is the source/license ledger. CLAUDE.md
  deviation 11.

**The app-shell/UI review** (the slice the second round's third agent never
returned) ran over App/theme/config/hooks/components/data/fx/styles. Eight
findings, all verified and fixed:

1. Radial's orbit rendered six pills on seven enumerated positions — a
   regression from the 404 pill leaving `NAV` — leaving a visible hole in the
   ring. Recomputed for six.
2. "Leave operator mode" never reset `leaving`, so the button stayed disabled
   as "leaving…" for the next sign-in (the panel stays mounted while closed).
   Now reset in a `finally`.
3. `shuffle`, `setMode("visit")` and the boot roll ran `roll()`/`say()`
   *inside* `setConfig` updaters — the exact impurity `go()` was fixed for;
   StrictMode double-invokes updaters, so the toast could announce a different
   combination than the one applied. Rolls moved out, updaters pure.
4. The three deliberate calm toggles disagreed, and the header/panel pair
   overwrote the *published* grain/breathe values on every calm round-trip
   (`update({ calm, breathe: !calm, grain: !calm })`). `themeClasses` already
   suppresses both under calm, so all three toggles now flip `calm` alone.
5. Two clipboard writes still toasted success unconditionally (`copyCode`,
   `revealMail`) against the honest-clipboard convention; both now await the
   write and say what actually happened.
6. Scroll velocity was dead in Terminal — the listener bound to `.v-stage`,
   but Terminal scrolls the document. A `window` scroll listener joins it.
7. `.v-setup-row` was referenced and styled nowhere; the saved-setups row now
   has its flex rule.
8. The logo's five-tap countdown toasted "2 more"/"1 more" at visitors whose
   fifth tap would be refused (`openDoor` is operator-gated). The countdown is
   now gated on `isOperator` too.

A ninth, product-level finding — the findable sign-in affordance does not
exist on phones (the ornament is `null` there) — went to TODO's *Awaiting
client sign-off* rather than being "fixed" unasked.

Also closed from the continuation file: the three raw-fetch signup fixtures
now send `slotAlg`, so signup recording the algorithm is proven on the raw
path too. Harness after all of the above: **178/178**.

**Mobile parity (same session, client request: "add all the features of the
desktop site to the mobile site").** The phone band's two real feature gaps
closed; everything else phones "lack" is deliberate adaptation (layout
collapse) or input modality (hover, keyboard idioms) and was left alone:

- **The ornament renders on phones** — it was hidden three ways (band token
  `0px`, `display: none`, a component `null`), which also hid the duels and
  the five-tap sign-in reveal there. Phone `valveSize` is `min(44vw, 190px)`;
  only Stack can show the slot on phones (console/sheet hide it by layout),
  where the column hero puts it above the title.
- **The command palette gets a touch route in**: a `cmd` chip in the header on
  non-desk bands, raising an event the palette listens for. Desk keeps the
  typed idiom — a standing button everywhere would advertise what §10 shipped
  as a shortcut. The door needed nothing: five taps on the logo and the
  footer `·` are already taps, and both drags are PointerEvents.

---

## 2026-08-13 — Second review round: 14 findings fixed, guards move into the writes

Two fresh end-to-end review agents (Worker + client auth) ran after the morning audits; every
confirmed finding is fixed and `npm run test:auth` passes 178/178 (two new checks — see below).
Highlights, newest lessons first:

- **`checkIterations`** (`src/auth/derive.ts`): the browser now refuses a `challenge` response
  whose iteration count is below the credential kind's constant or above 10M. Closes an active
  KDF-downgrade path (`iterations: 1` from a forged response silently stripped the stretch).
- **NFKC before PBKDF2**: composed/decomposed non-ASCII passwords now derive identically. Caveat
  flagged to the client: a pre-existing non-ASCII password could stop matching (recovery codes
  are the way back; the operator's is believed ASCII).
- **The last-way-in guards moved into the writes' `WHERE` clauses** — passkey removal, operator
  password reset, operator demotion, TOTP re-enrolment. Check-then-act let two concurrent
  requests each count the other as "another way in": two removals could seal a grant key, two
  demotions could leave zero operators, an enrol racing a confirm could replace a confirmed
  secret. Zero `meta.changes` is now the refusal, and audit rows write only after it.
- **The harness proves the UV refusal** instead of trusting it: `webauthn-sim` grew
  `userVerification` and `rpIdOverride` knobs, and two new negative checks (UV-less assertion,
  wrong RP ID hash) — the no-TOTP/no-rate-limit passkey decisions rest on exactly that refusal.
- **`crossOrigin` now compares scheme as well as host**; `SessionContext.refresh` discards stale
  settlements by serial; `api.ts` refuses a 200 with a non-JSON body instead of returning `{}`
  (signup could otherwise succeed server-side and never show the recovery codes); `addPasskey`
  no longer reports a corrupt slot as a wrong password; signup's 201 and the admin roster joined
  `no-store`; `slotAlg` is capped at 64; the body limit measures real bytes; two overclaiming
  comments (`openGrantKey` revocation, passkey sign-in prf) were made honest.

Still open from the round, deliberately: the app-shell/UI review never completed (session limit)
and is queued for the next session; the raw signup fixtures still omit `slotAlg`
(`docs/REVIEW-CONTINUATION.md`).

## 2026-08-13 — Operator chrome: tabs in the header, and a way to leave

Client request, same day as the ornament unlock: the operator surfaces should be *visible tabs*
once signed in — and closeable when done.

- **`OPERATOR_NAV`** (404 / Account / Admin) plus a Config tab (toggles the panel) render in the
  header for a signed-in operator and for nobody else. Not part of `NAV`, so arrow-key cycling
  and Radial's orbit are unchanged for everyone.
- **The 404 pill left the public nav.** "404 genuinely in the nav" was the spec's joke; the
  client pulled it behind sign-in. The page itself still serves every unknown URL — the joke
  copy survives for whoever lands there; only the pill is operator-only now. Public arrow-key
  cycling no longer visits it, which is the unlisting doing its job.
- **Leave operator mode** sits at the bottom of the siteconfig panel, after Publish: it signs
  out (`api.signout` + session refresh), which collapses tabs, panel and door through the
  existing `isOperator` effect, and clears `unlocked` so the header button retires too. The ✕
  closes the drawer and leaves you operator; this ends the session. Offline, it refuses loudly
  rather than pretending.

## 2026-08-13 — Sign-in gets a findable link: five taps on the ornament

The client asked for a way in to sign-in/sign-up that could be told to someone — hidden or not,
their call, creativity requested. Chosen over an always-visible footer link (least on-brand for a
site built on hidden doors) and a custom pass-phrase (typing `login` already is one): **five taps
on the hero ornament reveal a quiet `sign in` link in the footer for the rest of the visit.**

- The shape follows the house precedent twice over: the logo's five taps open the door, the
  ornament's five taps reveal the account link — the same mirror as the rightward/leftward drag.
  Same count, same 1400ms rhythm, same ">2 taps" countdown toasts.
- `revealSignin`/`signinShown` live in `ConfigContext`'s ephemeral block beside `mailShown`, but
  unlike the mail reveal it does **not** reset on navigation — found is found, until reload.
- The footer link renders for non-operators only (operators already have `account`/`admin`),
  labels itself `sign in` signed out and `account` signed in, and rises in with `v-rise` using
  fill-mode `backwards` — the `.v-block` trap applies verbatim.
- The ornament stays a decorative element, not a button: keyboard users already have the typed
  routes, and a tab stop would advertise what is meant to be found. Radial's orbit pills share
  the slot, so pill clicks (`closest("button")`) are excluded from the count.
- Nothing here touches `openDoor`; the two five-tap gestures target different elements and
  different worlds, per SPEC-ACCOUNTS.md's rule that real auth never reuses the theatre.

Same day, the client also decided: **the 404 page stays** (it is a designed page, not a default),
and **per-account subdomains stay parked** per `design/GUIDE-SUBDOMAINS.md`'s recommendation —
the enumeration decision it requires remains untaken.

## 2026-08-13 — Frontend review: nine findings fixed, overlays learn to stack

A full review pass over `src/` (the counterpart to the same day's Worker audit) surfaced nine
findings; all are fixed. The three worth remembering:

- **The calm/404 `filter` moved off the `.vessel` wrapper and onto its children** (`base.css`).
  A non-none filter makes an element the containing block for every `position: fixed`
  descendant — and all six overlays are fixed children of the wrapper. In Terminal, the one
  layout where the document scrolls, calm or the 404 page re-anchored them to the *document*:
  toasts rendered off-screen, the door centred at document mid-height. The look is identical
  with the filter applied per child; the cursor glow keeps its own blur combined in.
- **Overlays now layer instead of fighting.** `useFocusTrap` keeps a stack — only the top trap
  handles Tab, so a dialog over the panel no longer snaps focus back to its first control on
  every press. Dialogs and the palette register as *modal* (`isModalOpen()`), which stands the
  global key routes down while one is open: no arrow-paging under a confirmation, no `sudo`/
  `cmd`/`⌘K` opening things beneath a scrim, and Escape closes exactly one layer (the modal's
  own `document`-level handler stops propagation before the routes' `window` handler runs).
  The panel and door are deliberately not modal — typing `sudo` with the panel open has always
  opened the door and still does.
- **Calm survives reload, for everyone.** `loadConfig` reads published config only, on the
  stated ground that a visitor "has no way to set these" — but calm is visitor-settable from
  the header and is the accessibility escape hatch for the low-contrast palettes. It now has
  its own storage key (`vessel.calm.v1`), written **only** by the three deliberate toggles
  (header, panel, palette) — not read back from the full-config echo `saveConfig` writes,
  which would freeze whatever was published on the first visit. Absent key means no
  preference; OS-level reduced-motion still forces calm on top. Everything else stays
  published-only, so "the operator sees exactly what a visitor sees" still holds for the
  published look.

The rest, briefly: `TotpEnrol`'s backup-codes screen now takes the same `holdSaver` hold as
signup's (ten codes, transcribed by hand, screensaver at sixty seconds); the palette's sign-out
gained the `.catch` + honest toast `SignIn` already had; and the dead `.v-admin .chip.is-danger`
rule (pre-dialog armed-delete) is deleted.

---

## 2026-08-13 — Full security audit: six fixes shipped, four dashboard items logged

Client-requested audit of the Worker, both halves of the auth stack, headers, cookies, the client
bundle and live DNS. `docs/SECURITY-AUDIT.md` is the full log — findings, fixes, the
dashboard-only DNS work (DNSSEC, CAA, DMARC/SPF), and the list of deliberate decisions the audit
checked and left standing so the next one does not re-litigate them.

Shipped: `harden()` now covers the API error path and adds `Permissions-Policy` + COOP; the four
responses carrying secrets that lacked `no-store` (TOTP secret, backup codes, sign-in ticket, KDF
challenge) have it; the session cookie is `__Host-`-prefixed (subdomain cookie-planting defence —
everyone signed in at deploy is signed out once); `www.mcclevarty.ca` — previously a proxied DNS
record with nothing behind it, serving a bare Cloudflare 522 — is now routed to the Worker and
301s to the apex; and GUIDE-SUBDOMAINS' 2026-08-12 reserved-handles recommendation (`mail`,
`mailroot8`, `www`, plus the standard infrastructure and mail-convention names) is finally
actioned. TODO #16 carries the DNS work.

## 2026-08-13 — The command palette, opened by typing `cmd` — `⌘K` stays unbound

`TODO.md` item 5's last piece (`src/components/CommandPalette.tsx`, z-index 85 in §11's
ladder). **`⌘K` is not bound**, and that is the point of this note: the shortcut is
claimed twice — `SPEC.md` gives it to the door, §10 gives it to the palette — and the
contradiction sits on the client's sign-off list. Binding it would have settled the
question by accident. Until the client picks, the palette opens by typing `cmd` anywhere,
the same idiom as `whoami`/`login`, with the same `isEditable` and modifier guards;
when the decision lands the binding is two lines in the palette's key listener.

The command set is deliberately **what the caller could already do, gated as it already
is**: navigation and the account pages for everyone; saved setups and sign-out signed in;
the full siteconfig vocabulary — 24 palettes, 13 layouts, 12 backgrounds, 5 type systems,
7 ornaments, 4 toggles, the dice, the panel — for the operator only, mirroring the
panel's gate. Calm mode is *not* offered to visitors even though it is the accessibility
remedy, because today it is panel-only and widening it is a product decision, not a
shortcut. If the client wants visitor-facing calm, that is one line here plus the
conversation it deserves.

**Unverified by eye**, entrance motion included, like the rest of this session's UI.

## 2026-08-13 — The dialog primitive, and /admin's destructive actions moved onto it

`TODO.md` item 5's third piece, to §10's letter: `src/components/Dialog.tsx` exports
`Dialog` (focus-trapped via the existing `useFocusTrap`, Escape to dismiss, focus returned
by the trap's cleanup, 22px backdrop blur, 340ms entrance on the standard curve, z-index
**75** in §11's ladder, palette-driven throughout) and `ConfirmDialog` (the destructive
shape: consequence in specific terms, optional type-to-confirm, one `<form>` per the form
convention). It does not reuse the operator door, which stays theatre.

**Dialogs portal into the themed wrapper, not `document.body`** — every colour is a custom
property on that wrapper, so a body portal renders in no palette at all. The portal also
delivers §11's "one more sibling at the overlay level" for a dialog owned by a component
deep in `.v-stage`, whose entrance animation holds a `transform` — and a transformed
ancestor becomes the containing block for `position: fixed`, which would pin a
"fullscreen" scrim to the stage. The wrapper element travels by React context
(`OverlayHostContext`), set once in `App`.

First consumer: `/admin`. Reset-password and delete-account now confirm through the
dialog — reset states the consequence with the account's live recovery-code count (§4's
second requirement on reset), delete requires typing the handle (§10's rule). The
ask-twice chip pattern they used is retired *there*; `Setups` keeps it deliberately, a
saved setup being two clicks to recreate. `reset 2FA` stays one click, as before.

**Unverified by eye**, like every account surface — and the dialog's entrance motion is
in the category nothing on this side can check.

## 2026-08-13 — Saved setups, on the signed-in summary

`TODO.md` item 5's second piece, and §11's "nearly free" half delivered as such:
`worker/setups.ts` (list/save/delete, session-gated — saving a look is not a credential
change), `src/components/Setups.tsx` on the `/signin` summary. A setup is a name and
`encodeShareCode(config)`; applying goes through `decodeShareCode`, so it behaves exactly
like pasting a code, randomiser pinned to Static included. The Worker validates the code's
*shape* only — the catalogue lives in the browser and `decodeShareCode` already clamps
out-of-range fields, so a server-side copy would be a second thing to keep in step with no
second opinion. Saving over an existing name replaces it, **case-insensitively** (the
unique index collates binary, so the handler resolves the name first; two rows differing
by case would be a list that looks like a bug). Fifty setups per account, bounded because
an unbounded user-writable table invites a script. Deletion asks twice on the button, the
`/admin` convention — the dialog primitive is the next backlog item, and a setup is the
mildest destruction on the site.

Two things deliberately *not* done, so they are chosen rather than drifted into:

- **`/account` stays reserved and the summary stays on `/signin`** — §10's shipped-routes
  note calls the split "a change worth making deliberately rather than incidentally", and
  nothing in setups forces it.
- **The signed-in *current* config still does not sync** — §11's "server copy wins on
  conflict" sentence describes a mechanism phase 1's definition (§7: "named setups saved
  and applied") does not include. Building it means conflict rules and another write path
  through `ConfigContext`; if wanted, it is its own item, not a rider on this one.

**Unverified by eye:** the Setups section, like every account screen.

## 2026-08-13 — Passkeys, as another key slot on the same grant key

`TODO.md` item 5's first piece, built exactly as SPEC-ACCOUNTS §4/§5 specify: hand-rolled
WebAuthn (`worker/webauthn.ts` — the ~120-line CBOR subset §1 budgeted, ES256 only,
attestation `none`), a `passkey` credential row per registration, and — when the
authenticator supports the `prf` extension — one more key slot wrapping the **same** grant
key, re-wrapped in the browser ciphertext-to-ciphertext through `rewrapSlot`. No `prf`
means **no slot**, said honestly on the screen (§5: "the fallback is a missing slot rather
than a different design"). The e2e harness drives the real `src/auth/passkeys.ts` flows
through an `Authenticator` seam, with a software authenticator
(`scripts/webauthn-sim.ts`) that *encodes* the CBOR/DER the Worker *decodes* — a second
opinion, like the harness's RFC 6238 TOTP.

Two decisions made here, neither a spec change but both worth a record:

- **A passkey sign-in has no TOTP stage.** §3's stolen-laptop row makes user verification
  the passkey's second factor ("passkeys require user verification on every sign-in" — and
  `verifyAssertion` refuses an assertion without the UV flag, so this is enforced, not
  assumed). TOTP is §4's answer to a problem passkeys do not have ("new with passwords,
  absent with passkeys"), and the original approved design was passkey-only with no TOTP at
  all. Requiring a phone code after a biometric would be the site asking for a weaker
  factor to back a stronger one.
- **No rate limiting on the assertion path**, per §4's "passkeys needed none": a failed
  attempt requires forging a P-256 signature, which attempts do not help with. The
  challenge routes mint stateless five-minute HMAC tokens (two new `TokenPurpose`s), so
  the Worker keeps no challenge table; a replayed registration is refused by the
  credential-id uniqueness index instead of by session state.

Also settled: register and remove both demand the password (`assertPassword`, which owns
the rate limiting — adding a credential is a credential change), and removing a passkey is
refused when its slot is the account's last openable one, the same line
`adminResetPassword` refuses to cross. Sign-count monotonicity is checked but not
enforced; synced passkeys commonly report 0 for ever.

**Unverified by eye, like every account screen**: the Passkeys section of the summary and
the "sign in with a passkey" link — and a passkey against the *live* site needs a real
authenticator, which only the client has. The harness proves the bytes; the browser
ceremony (platform prompt, `prf` support on real authenticators) is the client's walk.

## 2026-08-13 — The lightsword duel returns, as little matches in the ornament slot

`TODO.md` item 6, built to `docs/DUEL.md`. The engine is new (`src/fx/duel.ts`): blocky
30×70 fighters, the reference's frame-count timers, physics and damage table kept in its own
700×350 world units behind a fixed 60Hz timestep, and — the idea the stick-figure version
missed — **discrete matches with winners**. Attacks land at a specific frame of their
animation so the damage, the sparks and the visible strike are one instant; a death tips the
loser over, the winner holds a raised blade for two seconds, and both reset with re-rolled
powers. A headless 90-second simulation showed nine completed matches using the full move
vocabulary (slash, kick, force push, leap, retreat).

**It ships in the hero-ornament slot only** — the client's original request — as ornaments
6 and 7, `Lightswords: light & dark` and `Lightswords: saint & serpent`, appended after
"None" because the ornament share-code field is an index, the same wire rule as `FX`. The
ornament is the first that is a canvas (`src/components/DuelOrnament.tsx`), run the way
`FxCanvas` runs: fixed internal resolution, palette read live each frame, delta clamped.
Calm freezes the simulation but keeps drawing, so the palette bleed still recolours the
stilled scene.

**The background `FX` entries stay withdrawn.** Two background versions have been rejected
from this side, motion cannot be verified in this environment, and re-listing would date the
404's "12 background modes" line — a copy correction needing sign-off. When the client's eye
passes the ornament, re-adding is three lines (append at `FX` 12/13; `EFFECTS.duel` /
`EFFECTS.duelholy` already point at the new engine).

**No winner text and no match counter**, in either home: the vitals strip was removed for
captioning state instead of showing it, and the same reasoning applies harder in a 180px
slot. The fallen fighter, the spark burst and the raised blade are the announcement. Health
bars are ornament-only (`DuelView.bars`), per the split `docs/DUEL.md` flags.

## 2026-08-13 — The second factor can finally be turned on

`TODO.md` item 4. The endpoints existed and were tested; nobody could reach them. The screen is
`src/components/TotpEnrol.tsx`, inside the signed-in summary, and the sequence is
`beginTotpEnrolment` in `flows.ts` — an object with a `confirm` method, the `RecoverySignIn`
shape, because the derived auth secret must live between the enrol and confirm calls (both demand
the password; a credential change demands the credential) and a closure is where it lives without
sitting in component state. The password is asked for once.

No QR code, deliberately: §4 requires the secret as a manual string and as an `otpauth://` URI,
both come back from the Worker, and both render as selectable text (`user-select: all`).
Rendering a QR needs a library and the no-third-party rule outranks the convenience. Backup codes
render above every other state in the component — they are shown once, the server keeps hashes,
and a re-render that swapped them for a summary would eat the only copy. The copy button reuses
SignUp's honest-clipboard shape: it never says "copied" unless the write settled.

`api.totpEnrol`/`api.totpConfirm` had hardcoded bodies that could only 401 (fixed with the
harness work, same day); the harness now drives `beginTotpEnrolment` itself, wrong password and
wrong code included.

## 2026-08-13 — Operator password reset ships, with two refusals

`TODO.md` item 3, unblocked since `setPassword` grew its insert branch and `challenge` its salt
fallback. `POST /api/admin/reset-password` deletes the password credential and its key slot,
stamps `reset_at`, and returns `{status, handle}` — **never key material**, which is the §5 line
`worker/admin.ts` exists to hold: reset deletes a slot and cannot open one, so grant authority
never passes through the operator.

The two refusals are against permanence, not malice:

- **Self-reset is refused.** An operator with a working session has change-password; a reset of
  their own row can only be a slip, and it deletes their own key slot.
- **An account with no unspent recovery codes cannot be reset**, only deleted. Its password slot
  is the last openable copy of its grant key, so "reset" there is deletion under a milder name —
  refusing makes the operator choose the honest button. The count includes `passkey` rows so the
  guard stays correct when passkeys arrive.

The `/admin` button uses the same two-press confirm as delete, hides for self, and disables at
zero codes — mirrors of the Worker's refusals, not the enforcement. The harness drives the whole
loop: reset → old password 401s → recovery code signs in (leaning on the challenge salt fallback)
→ insert branch → the original grant key reopens under the new password.

## 2026-08-13 — The harness now drives the real browser modules

`TODO.md` item 1, closed. The suite grew from 89 to 131 checks, and the growth is in kind, not
just count.

### `flows.ts` and `api.ts` are imported, not re-implemented

The harness's whole argument is "it fails when browser and Worker disagree about a byte" — and it
was re-implementing every flow with raw `fetch`, which reopens exactly that gap. It now imports
`signUp`, `signIn`, `signInWithRecoveryCode`, `changePassword` and `openGrantKey` from
`src/auth/flows.ts` and the `api` object itself, driven through a **fetch shim** that maps
relative URLs onto the local Worker and plays cookie jar. The shim intercepts *only* relative
URLs, so the raw `Client` (absolute URLs) keeps its own cookie isolation; `asBrowser()` swaps
jars between scenarios.

### Recovery-with-2FA finally has coverage

The stranded-wrapping-key bug lived in `flows.ts` on exactly one path: an account **with** TOTP,
where the key slot arrives only after the second factor, by which time an earlier version had let
the wrapping key go out of scope. Both existing recovery fixtures had no TOTP, so that regression
had zero coverage. There is now a fixture that goes signup → change-password → TOTP enrolment
(through `api.totpEnrol`/`api.totpConfirm`) → recovery redemption → `completeSecondFactor` →
`setPassword`, asserting `canSetPassword()` flips true only after the second factor and that the
original grant key survives the whole chain.

### The untested endpoints are tested

Change-password, `GET`/`POST /api/site-config` (including HTML injection of
`window.__VESSEL_SITE__` and key-stripping), and all four `/api/admin/*` routes, including both
guards. The operator fixture is made by flipping `is_operator` in local D1 — `docs/BREAK-GLASS.md`
step 1, locally — because no API can do it, by design. Each run also deletes previous runs'
`harness-*` fixtures through the delete route, so local D1 stops accumulating a fixture set per
run (35 had built up) and the last-operator guard stays deterministic. The guard check skips,
loudly, if a non-`harness-` operator exists locally; `signintest` — pre-`/admin` dev debris — was
holding an operator flag and was demoted locally for exactly that reason.

### Two things learned the hard way

- **`execSync` kills the harness's own connections.** Shelling out to `wrangler d1 execute`
  synchronously blocks the event loop for seconds; undici cannot service the dev server closing
  its idle keep-alive socket, and the next fetch dies with "could not reach the server" while the
  Worker is fine. The `d1()` helper is async and its comment says why.
- **`api.totpEnrol`/`api.totpConfirm` hardcoded empty-ish bodies** and could never have worked —
  the Worker demands the password's `authSecret` on both (a credential change demands a
  credential). They now pass a caller-supplied body through, which is the transport half of
  `TODO.md` item 4; the enrolment screen still owes the derivation.

## 2026-08-13 — CSRF, asset headers, and the recovery dead end

`561e067`, closing three items the review had left open.

### An `Origin` that is present and wrong now refuses a state-changing request

**Defence in depth, not the defence.** `SameSite=Lax` on the session cookie is still what stops a
cross-site POST — the cookie is simply not sent, so the handler 401s. `crossOrigin` in
`worker/index.ts` covers the two places Lax does not reach:

1. **The Lax+POST grace window.** Chromium sends a freshly set cookie on a top-level cross-site
   POST for its first two minutes — the two minutes right after signing in.
2. **Same-site subdomains.** SameSite is *site*, not *origin*. If per-account subdomains
   (`design/GUIDE-SUBDOMAINS.md`) are ever built, `anything.mcclevarty.ca` becomes same-site with
   the apex and its POSTs carry the cookie. This check is what stops that silently becoming account
   takeover through `/api/admin/*`.

**A missing `Origin` is allowed**, deliberately: same-origin GETs and non-browser clients omit it,
and `scripts/auth-e2e.ts` is one of those. Refusing only a *present and wrong* origin is the
standard shape and costs nothing. The comparison is against the request's own host rather than a
literal, so it stays correct on loopback and on `workers.dev` without a list to maintain.

Verified four ways: absent, matching, foreign, and foreign-on-GET.

### `public/_headers` gives `/assets/*` the headers the Worker never applies

`run_worker_first = ["/*", "!/assets/*"]` keeps the hashed bundles on the asset server's fast path,
deliberately — they are immutable, never HTML, and there is nothing to inject into them. The cost
was that they also skipped `harden()`, so `nosniff` was absent from exactly the JavaScript and CSS
where it matters most.

**Unlike `_redirects`, this file is valid for both hosts and needs no stripping at deploy.** Pages
applies it too, and Pages is still the rollback. It carries `immutable` caching, which is safe only
because the filenames contain a content hash: a changed file is a changed URL.

### The recovery second factor no longer dead-ends

A non-`signed-in` result was silently ignored and an expired ticket left the user typing correct
codes into a wall — on the one path where the code that got them there is **already spent**, so
escaping costs another of ten.

### The handle-rule error message matches the pattern again

It promised `.` and `_`, which the DNS-safe tightening removed, so the rule the person was told and
the rule they were held to disagreed and the refusal read as a bug in the site. It now says
"letters, numbers, and hyphens after the first".

---

## 2026-08-13 — Five auth weaknesses closed, and a drag that ate recovery codes

`1729dfd`. Found by two independent adversarial passes over `worker/` and `src/auth/`, plus a
frontend pass. No critical or high finding: the cryptographic design, authorisation gating and
injection handling held up.

### `challenge`'s decoy iteration count is now the real constant

`challenge` exists so an unknown handle gets parameters indistinguishable from a real account's.
The *salt* decoy did that. The *iterations* decoy did the opposite: it returned
`600000 + (hmac(handle) % 200) * 1000`, uniformly spread over `{600000 … 799000}`, while every
real account returns exactly `DEFAULT_ITERATIONS` — 600000, hardcoded in `src/auth/derive.ts`,
written by signup, `changePassword` and `setPassword` alike, and the fallback for an
operator-reset account with no password row. No code path produces any other value.

So one unauthenticated POST classified any handle: above 600000 meant "certainly does not exist",
exactly 600000 meant "exists" at 199/200. Zero false negatives, ~99.5% confidence, one request —
and `challenge` deliberately never records a failure, so probing it was unthrottled.

The old comment reasoned about a future where the browser scales iterations to the device. That
reasoning is right about the future and backwards about the present: while the real distribution
is a point mass, the only safe decoy is that constant. **When real counts start varying, sample
the decoy from the same distribution** — the comment in `worker/accounts.ts` says so at the site.

`recoveryIterations` was left alone; real and decoy both report 100000, so it is not an oracle.
The salt decoy was left alone; it was already correct.

### Rate limiting is atomic

`/check` (non-consuming) then `/fail` was two Durable Object round-trips. N concurrent sign-ins
all read the bucket and all saw `allowed: true` before any failure landed — 500 concurrent POSTs
to `/api/auth/signin` ran 500 password guesses against an allowance of 5. The object serialises
its writes but cannot retroactively reject a request that already passed.

`RateLimiter` gained `/attempt`, which reads, decides and increments in one handler invocation:
the attempt is counted as a failure up front and `/succeed` refunds it, so the Nth concurrent
attempt sees N-1 already recorded. `worker/accounts.ts` gained `assertAttempt` alongside
`assertAllowed`, and every call site guarding a credential check uses it.

**`challenge` deliberately stays on `/check`.** Asking for a salt is not a failable attempt, and
counting it would let anyone lock an owner out of their own account by requesting it repeatedly.

### The password check counts itself

Rate limiting moved *inside* `assertPassword`. `totpEnrol` called it with no bucket at all, and
`totpConfirm` called it *above* the bucket it later set up for the TOTP code, so a wrong password
in either place was never recorded. `signin` and `changePassword` were the only ones that counted.

That left an unthrottled online password oracle, and the caller who benefits from it is precisely
the one who should not exist: somebody holding a session obtained *without* the password, via a
recovery code or a stolen cookie. The password opens the key slot, so grinding it there is an
escalation from session access to grant authority — the thing §5 exists to prevent.

Putting the counting inside the check means a future caller cannot forget it.

### The set-password ticket is single-use in fact, not only in comment

`worker/session.ts` called the ticket "a one-shot capability for the next request" and
`src/auth/flows.ts` cleared it — **client-side only**. Nothing on the server enforced it, so the
same ticket set the password repeatedly for its full fifteen minutes.

The ticket's subject now carries the redeemed recovery credential, and `setPassword` requires that
credential's key slot to still exist; the write batch deletes it. Presenting the ticket a second
time finds no slot and is refused. The harness already tested this property and had been failing.

### `wrangler dev` needed `upstream_protocol = "https"`

The `routes` entry makes `wrangler dev` simulate the request as arriving at
`http://mcclevarty.ca/…`. The loopback exemption in `httpsRedirect` checks `url.hostname`, which
is `mcclevarty.ca` and not `127.0.0.1`, so the exemption never matched and the Worker 301'd every
local request to itself. `npm run test:auth` could not run at all.

`[dev] upstream_protocol = "https"` in `wrangler.toml` makes the simulated request https, which is
also what the Worker sees in production after edge TLS termination.

### Frontend, in the same pass

- **A leftward drag no longer navigates while the user is selecting text.** The pointer routes had
  no equivalent of the `isEditable` guard the keyboard routes got, so any 260px horizontal drag
  fired — including ordinary text selection. On `/signup`'s recovery-codes screen, which renders
  **once** because the server keeps only hashes, selecting the codes right-to-left unmounted the
  screen and lost all ten. The same guard is on the operator's drag-right route.
- **`.v-code` was declared for two different components** and the later import won, so recovery
  codes rendered at the share row's 12px accent size rather than the size chosen to survive being
  photographed.
- **`go()` no longer runs effects inside a `setState` updater.** React requires updaters to be
  pure; under StrictMode they are double-invoked, so calm navigation ran `commit` twice per click
  and the iris A/B alternation never alternated in dev.
- The Konami code no longer pages the site four times mid-entry; `Ctrl+K` is only intercepted when
  the door will actually open; `.v-btn`, `.v-shuffle` and `.v-panel-close` got the interaction
  states `interaction.css` exists to provide; the 404 mutes `--a3` along with the other accents; a
  denied clipboard write no longer reports success.
- **A `data:` favicon.** Without one, `/favicon.ico` fell through `run_worker_first` to the Worker
  and was answered with the app shell — a Worker invocation and a D1-cache hit per visitor, for
  nothing. `href="data:,"` keeps the no-assets rule intact.
- **`unlocked` is a session-only field.** `loadConfig` sources the published config, which does not
  carry it, so it is false after every reload. Nothing is gated on it — the door and the panel check
  `is_operator`. The comments claiming "sticky once true" and "per-browser" were false from the
  published-config migration onward and are corrected.

### Tooling

**`predeploy` now typechecks.** `wrangler deploy` bundles `worker/index.ts` with esbuild, which
strips types without checking them, so a type error in `worker/` could reach production while
`npm run build` — which only compiles the app tsconfig — passed.

---

## 2026-08-13 — Documentation restructured

`CLAUDE.md` had grown by accretion into ten places where an older paragraph argued with a newer
one — "there is no sign-in UI" three sections above "sign-in exists", and so on. It is now cut to
currently-true invariants, and this file exists to hold the dated narrative that was removed. No
decision was dropped in the move; the entries below are that narrative.

`TODO.md` and `docs/HANDOFF.md` are the only two files that say "do X next".

---

## 2026-08-12 — `piratelife` is the operator, and `/admin` got its first real test

Created through `/signup` by the client and promoted with step 1 of `docs/BREAK-GLASS.md` — one
`UPDATE accounts SET is_operator = 1`. That made `/admin` reachable on the live site for the first
time.

The old test account `erwerwerwer` was then deleted **through `/admin`**, which is how that page
got its first end-to-end test. `piratelife` is the only account.

**This closed the window on schema and handle changes being free.** Notes written before this
saying "the account count is zero, so `HANDLE_PATTERN` and the schema are still free to change
without a migration" are obsolete from this point on.

### The footer carries `account` and `admin`, but only for a signed-in operator

The account pages stay unlinked for visitors, which is what the client asked for. But an operator
having to remember a typed word to reach their own administration is a trapdoor that locks from
the inside, not privacy. Signed out, `useSession().isOperator` is false and the links do not
render.

---

## 2026-08-12 — Recovery-code sign-in, and setting a password afterwards

`8669ed3`. The whole path, browser and Worker: `/api/account/set-password`,
`signInWithRecoveryCode` returning a `RecoverySignIn`, and three new stages in `SignIn.tsx`.

Three latent bugs were fixed on the way, and all three are the kind that typecheck.

**`signInWithRecoveryCode` returns an object with methods, not a result.** The old shape returned
`{ result, grantKey }`, so on an account **with a second factor** the wrapping key derived from
the code went out of scope at the `return` — and the key slot that arrives after TOTP could never
be opened. Recovery worked for accounts without 2FA and stranded the grant key of every account
with it. The closure now holds the key and `completeSecondFactor` finishes the sign-in through it.

**Set-password re-wraps, it does not unwrap.** `unwrapSlot` returns a deliberately
**non-extractable** key, which cannot then be wrapped into a new slot, so the flow goes
ciphertext-to-ciphertext through `rewrapSlot` exactly as `changePassword` does. Calling
`unwrapSlot` here typechecks and fails at runtime.

**`challenge` now takes the salt from any credential that has one**, preferring the password row
for its iteration count. Keyed on `kind = 'password'` it dropped an account whose password the
operator had reset through to the decoy branch and handed back a *fabricated* salt — turning a
working recovery code into a wrong one, and looking exactly like user error. This is what makes
operator password reset safe to build.

**Authorisation for set-password is a ticket, not the session.** A session says who you are, never
how you proved it. Gated on the session alone, a stolen cookie — a bounded thirty-minute exposure
today — would become permanent takeover. `TokenPurpose` gained `set-password`, minted only inside
`completeSignIn`, only on the recovery path, only after the last factor.

Verified live after deploy: `/api/health` returned six tables, `challenge` returned the real salt
for `piratelife`, `/signin` and `/admin` both 200.

**Still not verified by a human**: no recovery code has actually been redeemed on the live site.
Doing so spends one of ten, which is why it was not done casually. `TODO.md` item 2.

---

## 2026-08-12 — Sign-in, operator-published config, and administration

`92a9f5c`, `d305f98`, `200c887`. All deployed and verified live.

- **Sign-in** (`src/components/SignIn.tsx`, `/signin`). Handle + password, the TOTP second factor,
  the account summary, sign-out and change-password. One page for both states — `api.me()` on
  mount decides form or summary.
- **Change password** (`changePassword` in `flows.ts` + `worker/accounts.ts`). Re-wraps the key
  slot rather than regenerating the grant key, via `rewrapSlot`, where the scalar never becomes
  bytes in JS. **The salt is reused deliberately** — recovery codes derive against the password's
  salt, so rolling it would silently kill all ten. Verified: old password rejected, new one works.
- **The operator's config is now the site's** (`worker/site-config.ts`, migration `0003`).
  Published to D1 and **inlined into the app shell by the Worker** rather than fetched, so there is
  no palette flash and no network dependency on boot. This is what needed `run_worker_first` in
  `wrangler.toml`: by default a request matching a real file never invokes the Worker, so `/`
  (which *is* index.html) silently got no injection while `/contact` did. The site looked right on
  every URL except the front page.
- **The panel and door became operator-only.** Gated once at `openDoor` / `togglePanel` in
  `ConfigContext`, not at each of the six unlock routes. `loadConfig` no longer reads visitor
  localStorage.
- **`/admin`** (`src/components/Admin.tsx`, `worker/admin.ts`): list accounts, grant/revoke
  operator, reset 2FA, delete. Guards against removing your own last operator flag and against
  deleting yourself.
- **The account pages are unlinked**, at the client's request. Reached by typing `whoami`, `login`
  or `admin`, or by dragging **left** — mirroring the door's rightward drag. These never call
  `openDoor`; the door stays theatre.

This superseded the note that opened the same day: *"Not built, and asked for on 2026-08-12: an
operator-only siteconfig whose saved settings apply to every visitor."* The precedence question it
raised — whether a visitor's own choices override the operator's defaults or are replaced by them —
was answered by **replaced**: `loadConfig` sources the published config and no longer reads
visitor localStorage at all.

**Two real bugs fixed with it**: the screensaver faded out the recovery-codes screen mid-
transcription (`holdSaver`, reference-counted), and `useOperatorRoutes` paged the site on arrow
keys and opened the door on `sudo` from inside the new text inputs (`isEditable` guard).

---

## 2026-08-12 — Email recovery proposed, and rejected

Rejected on three counts, in favour of `docs/BREAK-GLASS.md`:

- it would put personal data into a design whose central claim (§9) is that it holds none;
- it would add an outbound mail dependency the site otherwise does not have;
- it would make a mailbox the master key to the account that administers every other account, so a
  compromised inbox would silently become full operator control.

The break-glass procedure is strictly stronger: it needs no third party, cannot be phished, and
already exists — the operator holds `wrangler` and the production D1 database, and operator status
is one integer in one row.

`SPEC-ACCOUNTS.md` §12 C carries the standing "revisit if": user numbers making manual operator
resets a burden. Read `docs/BREAK-GLASS.md` before re-proposing it.

---

## 2026-08-12 — The lightsword duel, withdrawn from the picker

`06dcb86`, `758d094`. The client saw the shipped stick-figure version and rejected it: *"that is
terrible"*, *"WAY too slow"*. They want a fast, obviously readable 8/32-bit pixel fight with
discrete matches and winners, and supplied a working reference implementation that is the
authoritative statement of it.

The code survives in `src/fx/effects.ts` (`EFFECTS.duel`, `EFFECTS.duelholy`) and in `FxId`; only
the two `FX` catalogue entries were removed, so nothing else had to change and putting them back
is two lines. The blade rendering and clash sparks are worth keeping; the stance machine is not.

`docs/DUEL.md` is the full spec — the reference's design table, why the first version failed, the
four changes needed to port it here, and the base-36 share-code trap. Read that rather than
re-deriving any of it.

---

## 2026-08-12 — Security headers, and the redirect that would have taken the site down

`758d094`. `http://mcclevarty.ca/` used to answer **200 over cleartext** — the browser's "not
secure" warning — because a Workers route matches both schemes.

**The first fix would have taken the site down**, and the failure is not obvious from reading it:

```js
const secure = new URL(url.toString());
secure.protocol = "https:";      // silently does nothing in workerd
```

The setter did not take, so `Location` came back equal to the request URL — an infinite redirect
loop, caught locally as `redirect count exceeded`. **The URL is now built by concatenation and
compared against the request before being sent**, so the worst case is "no redirect happens"
rather than "site down". Keep that guard. Loopback is exempt or `wrangler dev` and
`npm run test:auth` break.

Verified live: `http://` → exactly one 301 → `https://` → 200, with `Strict-Transport-Security`,
`x-content-type-options`, `referrer-policy` and `x-frame-options` on page responses.

Cloudflare's **SSL/TLS → Edge Certificates → Always Use HTTPS** does the same redirect at the edge
without costing a Worker invocation. Turning it on as well is free and is recommended — `TODO.md`
item 13.

---

## 2026-08-12 — The hero vitals strip removed

`fa95fba`, at the client's request. The palette name, layout name, effect name and pulse were a
readout of state nobody asked to see. The client's point, in their framing: **show the layout, do
not caption it.**

The `· adapted` suffix went with it. The stored layout is still never overwritten when a small
screen collapses it, so nothing is wrong in the data — but **that state is now surfaced nowhere**,
and that is deliberate rather than an oversight. If it needs to return it wants its own affordance
rather than the whole readout coming back.

The dead `.v-vitals` rule and the then-unused catalog imports went with it. This is a deviation
from `SPEC.md`, which specifies the strip in *Hero* and its `pressure lost` variant on the 404
page; it is recorded in `CLAUDE.md` under *Known deviations from the prototype*.

---

## 2026-08-12 — Handles restricted to DNS-safe characters

`e65cbe5`. `HANDLE_PATTERN` went from `/^[a-z0-9][a-z0-9._-]{2,23}$/i` to
`/^[a-z0-9][a-z0-9-]{2,23}$/i`.

Done **while the account count was still zero and the change was therefore free.** Neither `.` nor
`_` survives a hostname: a dot makes `ada.smith.mcclevarty.ca` a two-level name that Cloudflare
Universal SSL does not cover, and an underscore is invalid in the hostname position outright.
Keeping handles DNS-safe leaves per-account subdomains possible later
(`design/GUIDE-SUBDOMAINS.md`) instead of foreclosing them for whichever accounts happened to use
those characters. After the first real signup this would have been a breaking migration.

This is the decision `GUIDE-SUBDOMAINS.md` asks to "be made now", and it was made the same day the
guide was written — but the guide was not updated, so it went on describing the old pattern as a
live blocker. Corrected 2026-08-13.

**Still not actioned from that guide**: its recommendation that a handle named `mail` be blocked,
because the zone's MX records live there. `mail` is not in `RESERVED_HANDLES`. `account`,
`machines` and `share` are.

**The user-facing error message was not updated with the pattern** and went on promising `. _ -`
for a day, so the rule the person was told and the rule they were held to disagreed. Corrected
2026-08-13 (`561e067`).

---

## 2026-08-12 — Signup shipped, and the test account was deleted

`18aaa8d`, `d20eb99`. `src/components/SignUp.tsx` at `/signup`, the first real-auth surface.
Verified in a browser against production: an account was created end to end and ten recovery codes
rendered.

The test account was deleted afterwards — `accounts`, `credentials` and `key_slots` all cascade to
zero — because its password had been written down in a transcript.

The note that followed, *"the account count is zero again, so `HANDLE_PATTERN` and the schema are
still free to change without a migration"*, was true when written and is **superseded by the
`piratelife` entry above**.

The same commit left `/signup` linked from `FOOTER_NAV` as "Account". That was reversed later the
same day when the client asked for the account pages to be unlinked; `FOOTER_NAV` now holds only
Now and Changelog, and the operator's links are rendered separately in `Footer.tsx`.

---

## 2026-08-12 — Cutover: `mcclevarty.ca` is served by the Worker

`29b8f89`. The site moved from Cloudflare Pages to a Worker with static assets, because **Pages
cannot define Durable Object classes** and this stack needs them twice — rate limiting now, one
signalling object per paired machine in phase 2.

It was done by **adding a `routes` entry to `wrangler.toml` rather than deleting the Pages custom
domain**, because a Workers route is evaluated ahead of a Pages custom domain. `wrangler pages
domain` is not a command in wrangler 4.122, so removing it via CLI was not available anyway — but
the route approach is better regardless: the Pages project is untouched and still holds the domain
underneath, so **rollback is deleting the `routes` block and running `npm run deploy`**, not
rebuilding infrastructure under pressure.

Verified live: `/api/health` returned `{"ok":true,"tables":6}` — decisive, because Pages has no
`/api` and could not answer it at all. `/`, `/contact`, `/work`, `/404` and an unrouted path all
200, the served bundle hash matched a local build, and `mcclevarty.com` still 301s to `.ca`.

**Adding `routes` silently disabled the `workers.dev` URL**, since `workers_dev` defaults to false
once a route exists. `vessel.patrickmcclevarty.workers.dev` — which earlier notes cite as the
verification target — no longer resolves. That is wanted here, because it closes the public signup
endpoint that was reachable before cutover, but it means there is no non-production URL to test
against. Set `workers_dev = true` if you want one back, knowing it reopens that endpoint.

### The infrastructure it landed on

- `npx wrangler login` — done by the client. Account `760b80a637d2ffe755b09da3f4a339ff`.
- **The real D1 database.** `vessel`, region ENAM, id in `wrangler.toml`. Migrations applied
  `--remote`; `d1 list` was empty beforehand, so nothing was overwritten.
- **All four secrets set**, by the client. `AUTH_PEPPER` is backed up in their password manager.
  That backup matters: Cloudflare secrets are write-only and cannot be read back, so losing the
  pepper invalidates every stored auth hash — every password on the site — unrecoverably. It was
  free to regenerate while the account count was zero and is a data-loss event now. The other
  three are cheaper: `SESSION_SECRET` only signs everyone out, `RATE_SALT_SEED` only resets
  counters, `TOTP_ENC_KEY` breaks enrolled second factors.

---

## 2026-08-12 — `public/_redirects` breaks the Worker deploy, and stays anyway

`22fbc79`. An earlier note called the file "dead under Workers". That was wrong.

Workers static assets treats `_redirects` as **configuration, not as an asset**: it parses and
validates the file, and rejects `/*  /index.html  200` with
`Invalid _redirects configuration — Line 3: Infinite loop detected` (the rule strips `/index` and
re-triggers itself). The deploy fails outright at the API call.

Because it is configuration rather than an asset, **`.assetsignore` does not help** — that only
filters the upload list, and validation has already happened. This was tried and does not work.

It cannot simply be deleted either: `main` still auto-deploys to Pages, which is the rollback, and
removing it would break client-side routing there on the next push. So the file stays in `public/`
and is stripped from `dist/` at deploy time only:

```
"predeploy": "npm run build && node -e \"...rmSync('dist/_redirects')...\"",
"deploy": "wrangler deploy"
```

**Deploy with `npm run deploy`, never bare `wrangler deploy`** — the bare command fails on a fresh
build. Pages is unaffected: Cloudflare runs its own `npm run build` and never sees the removal.

The original plan said *"at cutover, delete `public/_redirects` and both scripts together."*
**That is superseded.** The cutover happened and the file is deliberately kept, because Pages
continues to auto-deploy from `main` and is the rollback. Delete both when the Pages project is
deliberately retired, not before.

The SPA fallback for the Worker is `not_found_handling = "single-page-application"` in
`wrangler.toml`, not `_redirects`. `SPEC-ACCOUNTS.md` §11 predates this.

**It breaks local development too.** `dist/_redirects` is copied in by a bare `npm run build`, and
`npm run dev:worker` then hits the same validation. Run `npm run predeploy` instead, or delete
`dist/_redirects` first.

---

## 2026-08-12 — `design/SPEC-ACCOUNTS.md` approved

Approved by the client and no longer a proposal. §12 is its decision log and is kept deliberately:
every rejected option keeps its reasoning and carries a *"revisit if"* condition, so an idea that
comes back starts from "here is why we didn't" rather than being re-derived. Add to it rather than
relitigating.

Phase 1 grew roughly threefold with the second round of decisions (§12 H) and stays one phase,
with one non-negotiable internal order: **authentication works end to end before any interface
work starts.**
