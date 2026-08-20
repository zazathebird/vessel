# Absorbing the duel-cycle engine

**Status: phases 1 and 2 shipped 2026-08-18, phase 3 on 2026-08-20. Phases 4–5 planned.** Client decisions
taken; see *Decisions* below. Phase 5 still has one product question for the client, marked in
place; phase 2's question closed itself — no real name is used anywhere, so none ships.

`handoff_duel_engine/` holds a second, independently written duel engine
(`duel-cycle-v2.html`, 1,905 lines) and a implementation brief (`BRIEF.md`, 350 lines). The client
had it built to make the fights **procedurally generated rather than a fixed pool of sequences**,
and to reimagine the VFX.

This document is the plan for taking what is good in it into `src/fx/duel.ts` — the engine that
ships — and the record of what was measured while deciding. It exists because the decision was
*not* to adopt the file.

---

## Decisions (client, 2026-08-18)

1. **Absorb the ideas into `src/fx/duel.ts`.** Not an embed, not a second engine, not a standalone
   page.
2. **Characters must be instantly identifiable, and unnamed anywhere a visitor can reach.** The
   client's words: *"make the characters obvious and instantly identifiable, but do not name them on
   pages that are not accessible only by me, to avoid any copyright or legal bullshit."* Names are
   permitted **only on operator-gated surfaces**. See *The naming rule* below.
3. **The site's audio rule wins.** No ambient bed, no loop, no timer; pitch from the palette; one
   mute switch. The engine's six free-running oscillators are not coming.

---

## Why not adopt the file

Three independent audits ran against it. The generator came out well and everything around it did
not.

**The generator is sound and is the thing worth having.** Stepped over 200,000 duels / 3.5M beats in
Node:

| Property | Result |
|---|---|
| `guard++ < 90` planner bound | Never binds. Max observed **42**, 2.1× headroom |
| Deadlock / infinite loop | Not reachable — no conditional waits, every loop counted |
| Invalid beats | **0** of 3,506,217 |
| Fighter off-stage | **0**. Max \|x\| exactly `ARENA_HALF` |
| Facing wrong at a beat boundary | **0** of 3,506,217 |
| Unreachable modules | **None.** All 15 body modules + 6 finishers picked |

**What blocks the file itself**, none of it fixable by tweaking:

- **No seam.** One IIFE, zero exports, `document.getElementById` for 13 ids at module scope, its own
  `window` resize listener, its own `requestAnimationFrame`. Not importable.
- **Not steppable in Node**, which is the only method that has ever found a duel bug here — all
  fourteen. It would inherit **zero** of the three duel gates in `scripts/check.ts`, and gate #1
  (typecheck) cannot see an untyped JS blob inside HTML at all.
- **Cannot be iframed.** `worker/index.ts` sends `frame-ancestors 'none'` *and*
  `x-frame-options: DENY`. Same-origin framing is refused today.
- **Global CSS reset** — `* { margin:0;padding:0 }`, `html, body { overflow:hidden }`, and a bare
  `canvas { width:100%;height:100% }` that restyles every canvas on the page. Dropping its `<style>`
  onto the homepage stops the homepage scrolling.
- **`document` keydown on Space/s/m with no `isEditable` guard.** A visitor typing symptoms into
  Contact would restart the fight on every `s` and **switch the audio on** at the first `m`. This is
  the exact bug class `CLAUDE.md` already documents a guard for.
- **Google Fonts `@import`** (line 8) against `default-src 'self'` with no `font-src` — and against
  the *"no trackers · no cookies"* claim the footer makes.
- **125 literal hex + 27 rgba**, against a rule with exactly one four-value carve-out
  (`BLADE_COLORS`). The 13 arenas paint their own gradients, so the panel would not participate in
  the palette bleed at all.
- **Six oscillators running from context build**, a second mute switch that does not know about
  `config.sound`, master gain 0.5 against the site's deliberate 0.09, and `ac.close()` never called.
- **Calm.** `animation: none` does not stop a rAF loop. In calm the whole site goes still and this
  would be the only moving thing on the page. Its own `prefers-reduced-motion` is read **once** at
  load with no `change` listener, gates only shake/flash/hitstop, and line 1728 *disables*
  `beat.slow` — so slow-motion beats play **faster** under reduced motion.
- **Three simultaneous fights.** The one-fight-at-a-time guardrail keys on `fx`/`ornament` ids and
  cannot see a third engine. The client has already reported that symptom once (2026-08-15).

---

## Measurements worth keeping

Recorded here because they cost three agent-hours and would otherwise be lost.

**On "completely random".** True at whole-fight scale, softer at phrase scale. Over 20,000 generated
fights: zero repeated beat sequences, all 812 pairings reachable, mean 116.8 beats and 29.5s per
fight. But the vocabulary is **96 beat atoms from 45 poses**, via 15 modules + 6 finishers, and
**48.4% of module picks repeat within a single fight**. `mFlurry` — the most-picked module at 14% —
**never randomises its strike order at all**: `STRIKES[i % STRIKES.length]` from `i=0`, so it is
always down → across → up → thrust. The single most common 4-beat phrase is 1.33% of all windows.

*Implication for our generator: randomising the module pool is not enough on its own. The strike
order inside a module has to roll too, or the phrase-level repetition is audible even when no two
fights are identical.*

**Winner bias.** 54.3%, not 50% — three curated matchups pin `winner:"A"`. Our engine's fairness
guarantee is measured at 0.09σ and the role coin consults nothing. Keep ours.

**Two dead poses.** `guardLow` and `wounded` are defined and never emitted. This matters because
`BRIEF.md`'s health-bar spec tells you to score damage from `wounded` — that rule would never match.

**`MIN_SEP` is approximate.** The four-iteration relaxation closes half the gap per pass, so with a
fighter pinned at the wall it converges to ~1/16 of the error, not zero: 108 of 20,000 fights dip
under 138, worst 135.22. Cosmetically invisible; do not write a module that *asserts* the invariant.

**Scale collapse on portrait.** `rigScale` is driven by height and `spaceScale` by width, from
independent inputs, and `MIN_SEP` is in world units. Replaying 92,560 real pose/separation triples:

| viewport | bodies overlapping |
|---|---|
| 1440×900 (design target) | 41% (mostly lunges — expected) |
| 1100×480 | 11% |
| 768×1024 tablet portrait | **88%** |
| 390×844 phone portrait | **99.7%** |

At 390×844 the fighters stand 46px apart while each is ~214px tall. *Our engine derives everything
from one scale and does not have this, but any port of `spaceScale` would import it.*

**Render cost.** Driven through a recording mock 2D context for 200,000 frames at 1440×900 DPR 2:
**136.3 draw calls per frame, of which 94.9 carry a non-zero `shadowBlur`** (~5,700 shadowed draws a
second). Canvas2D shadow is a separate blur pass and the most expensive primitive available. Sources
are one shadowed fill *per particle per frame* — and the particle array is walked twice, once per
filter pass — plus two shadowed strokes per blade. Particle count peaked at **137** against a cap of
460, so the caps are effectively dead code; particles are not a count problem, each one is just
expensive.

*Implication: our blade already does three passes without shadow blur. Do not adopt shadow-blur
glow. If bloom is wanted, it is a second additive stroke, not a shadow.*

**Pause is inert.** `frame()` zeroes `dt` but always calls `render()`. A paused frame measured 124
draw calls, 94 shadowed — identical to a playing frame.

---

## The naming rule

The client's decision creates a clean, mechanical rule:

> **A fighter has a public archetype name and an operator-only real name. The real name is rendered
> only where `isOperator` is already true.**

- **Public surfaces** — hero ornament, background effect, everything a visitor reaches — show the
  archetype (`THE MASK`, `THE HERMIT`, `THE APPRENTICE`, `THE NEIGHBOUR`) or nothing at all.
- **Operator surfaces** — the siteconfig panel's ornament picker, `/admin` — may show the real name,
  because `isOperator` gates them and they are not public.
- **The silhouettes are unchanged by this.** "Instantly identifiable" is the client's explicit
  requirement and the cue sheet in `BRIEF.md` is the right approach; it is the *marks in text* that
  are being withheld, which is the same trade the site already made when it renamed the weapon to
  "lightsword" (`docs/DUEL.md`, *The naming and likeness constraint*).

**That question is closed, and it closed by not needing an answer** (2026-08-18). It was: the real
names would still exist as strings in the public JS bundle even when never rendered, because the
site ships one bundle. Phase 2 shipped without using real names *at all* — the operator surfaces
show the ornament picker's two entries, not a cast list, so the permission was never spent. There is
no proper noun in `src/fx/fighters.ts`, and recognition comes from the silhouette, which is what the
client asked for in the first place. If real names are ever wanted on an operator screen, this
paragraph is the reasoning to re-read first.

---

## Plan

Ordered by dependency, then payoff. Each phase ships with its own gate, per the standing discipline
in `CLAUDE.md` (*Checks — run them, and add to them*).

### Phase 1 — the procedural generator — **shipped 2026-08-18**

The headline ask: *"completely random, not a set amount of looping duels."*

`SEQUENCES` was 28 hand-authored entries. It is `MODULES` now — 28 builders,
`(roll) => { beats, length }` — and `chooseSequence` picks one by weight and band and then
**builds** it. `Sequence`/`Beat` survive as the unit, so the director and every existing gate kept
working.

What shipped, against what was planned:

- **Each sequence became a module that rolls its own internals** — arcs, counts, intervals, power,
  trailing rest. As planned, and it is the fix for the `mFlurry` finding above.
- **Every reaction frame is derived from the move table** (`lands(move, at)`), not typed. This was
  *not* in the plan and turned out to be the load-bearing part: it is what makes the rolls safe,
  because the class of bug that has cost this effect the most — a reaction scheduled before its own
  cause — becomes unrepresentable rather than merely checked for.
- **Modules chain rather than concatenate**, which is the one plan change worth arguing.
  Concatenating 1–3 modules up front needs each module to declare where it *leaves* the pair, and a
  wrong declaration schedules a close exchange at 250 units where the swords swing through air.
  Chaining runs them under a single role coin and **re-measures the band before each one**, so the
  second module of a phrase is chosen against the distance the first actually produced. Same
  phrase-level variety, no guessing. Under the anti-stall rail phrases are cut to one module.
- **The static gate was replaced by a stronger dynamic one**, as planned: every module built 8,000
  times from a fixed seed — **224,000 sequences** — asserting beat ordering, bounds, contact
  arithmetic, reaction causality, a new throw-recovery guard, `hits` holding on every roll, and move
  reachability. All five new assertions were verified by breaking them deliberately.
- **The fairness guarantee is untouched.** Modules name roles, never sides; the role coin consults
  nothing. Measured 0.46σ over 119 matches in the suite, 1.18σ over 783 in the bench.

Measured, benched identically against the pre-change engine:

| | before | after |
|---|---|---|
| Exact exchange repeated within its own match | 100% past the 28th | **0.03%** (3 of 9,290) |
| Median match | 50.4s | 51.8s |
| Modules (sequences) per match | 23.3 | 23.3 |
| Picks under the anti-stall rail | 12.0% | 10.8% |
| Close-band occupancy | 62.5% | 60.1% |

Two numbers in `CLAUDE.md` were found stale while benching and are corrected there: matches run
~50s, not "~45s", and the rail takes 10.8% of picks, not "7.4%" — both were measured before the
2026-08-18 choreography sheet landed. The zero-damage share is 34%, not "roughly a fifth"; the
weights did not change, the description of them had drifted.

**What still wants an eye**, and no bench can settle it: whether a chained phrase reads as one
fighter pressing an advantage or as two exchanges glued together, and whether the rolled rests
between exchanges land as poise or as a hang. That is the same open tempo question as before,
asked of a slightly different fight.

### Phase 2 — character identity — **shipped 2026-08-18**

The client's requirement: *"make the characters obvious and instantly identifiable."*
`frontend-design` was loaded for it, per the standing instruction.

The roster is `src/fx/fighters.ts`: **eight costumes**, four good and four evil, in two pools of
four pairings each. `duel` fights The Hermit / The Apprentice against The Mask / The Hollow;
`duelholy` fights The Saint / The Seraph against The Devil / The Crown. Both duels roll a pairing
on mount **and again on every match reset**, so the fighters change every ~52 seconds — the
character-level half of *"not a set amount of looping duels"*, since two fighters who never change
are still a loop at the scale anybody watches at.

What shipped, against what was planned:

- **`back` / `head` / `overlay` hooks and per-fighter proportions**, as planned, except that the
  brief's `torso` slot became `back` — drawn *before* the legs. A costume drawn last swallows the
  limbs it hangs off, which is most of how the filled version turned two swordsmen into two slabs.
- **`proportion` is `shoulder` / `weight` / `hunch`, and deliberately has no height multiplier.**
  The blade is drawn inside the same transform as the body and its length feeds `bladeGap`, the
  clash test and every contact frame in `MOVES` — a vertically scaled figure holds a sword whose
  drawn length disagrees with the one the simulation is using. That is the "proximity is not
  contact" bug class, bought for nothing.
- **No edge pass was needed.** The brief wants one because its bodies are filled in near-black; ours
  are stroked in the palette's `--fg` over the palette's background, so they cannot disappear into a
  dark arena. Noted rather than skipped silently.
- **Every costume declares its `headroom` and `duelFocus` frames on it.** Clearance above the head
  was a flat 26 units, which is fine for four marks that all sat on a skull and wrong for horns, a
  halo and a pair of wings. Measured over 320,000 frames across all eight pairings: at the flat
  value the tall costumes were cropped on **0.07%** of frames — about one visible clip every
  23 seconds — and the per-costume clearance takes that to **0.00%** while the median camera scale
  moves 2.70→2.71 of a possible 2.9, which is nothing.
- **Nametags: declined.** The plan allowed them "only if they read at ornament scale", and they do
  not: at the 190px slot a figure is ~61px and a legible label is a seventh of its height, hung over
  a fight it would be competing with. *Not taking* already refuses fight labels and title cards
  under deviation 8 (*show the layout, do not caption it*), and a nametag is a fight label. The
  archetype names exist in the roster and are rendered nowhere.
- **The naming rule closed itself.** The plan permitted real names on operator-gated surfaces; none
  are used anywhere, so the residue flagged for the client — real names sitting in the public bundle
  even when never rendered — does not exist. There is no proper noun in `src/fx/fighters.ts`.
- **Already done, not rebuilt:** the two-handed grip (`CLAUDE.md` deviation 9). The brief's
  workstream 2 IK section solves a problem this engine does not have.
- Health bars stay **ornament-only** (`docs/DUEL.md`). Not reopened.

**The costumes were looked at, not reasoned about.** Animation cannot be watched here, but a *still*
can be: `drawDuel` was driven into a real canvas under headless Chrome and screenshotted, eight
costumes at one pose, at both desk scale and the phone slot's ~61px figure. Three of the eight
failed on sight and were rebuilt — the wings read as a leaf (any closed curve at this size is a blob
with a highlight round it; they are an open fan of feathers now), the cape read as a plank down the
figure's side (both edges stay behind the spine and the hem is wider than the shoulders now), and
the helmet read as a slightly thicker head (it is drawn wider than the skull it covers). **That
method is worth keeping for any future costume work**, and it is cheap: bundle the real module,
draw one frame, screenshot.

**Gated.** Two new checks, seven assertions between them, each verified by breaking it: every
costume is stroked and never filled, draws something, declares its reach tightly (over-declaring is
not free — it pulls the camera back), and stays inside what the camera frames; every pool is one
alignment against the other, no costume is in two pools, none is unreachable, and every fighter's
`side` agrees with its blade colour. Plus a stepped gate for the runtime half: a pooled fight really
does rotate its fighters, always mixed, while a pinned pairing (what every bench drives) is left
alone.

**What still wants an eye:** whether the costumes read *while moving*, which is the only state the
site ever shows them in. Stills are what this environment can produce and they are not the same
question.

### Phase 2b — the costumes get bodies — **shipped 2026-08-19**

Client, on the live site: *"the swordfights still arent the fixed ones… keep going with the engine
and the grpahical overhaul of all the charcters."* The deploy was checked first and was current to
the byte, so this was about how the fighters look, not about what had shipped.

Phase 2 delivered the hooks and the pools and left the roster reading as one drawing eight times,
because it inherited two constraints that were each half right:

- **"Stroked, never filled" was replaced with a rule about where the fill lands.** The ban was
  written from the 2026-08-14 slab and also banned every filled *mark* — a hood, a helmet, a horn,
  a wing — which at the phone slot's 61px figure is the whole of a costume. Now: under 45% torso
  coverage may be solid, more than that is cloth at ≤35% of body alpha. Bounds measured, not
  guessed; a first attempt at box limits refused a hood and a crown that are plainly not slabs.
- **A fighter had no stance.** `settle` / `spread` / `heel` on `FighterKind`, moving the hips and
  the feet and never the shoulders. The old foot spread put both feet inside the hips on all eight.

`scripts/duel-shot.mjs` is the tool this needed and the reason it got done: the real module through
headless Chrome, pixels out via `toDataURL`, a **contact sheet** of all eight side by side at desk
and phone size. Six costumes were rebuilt on sight across three rounds. `docs/DECISIONS.md`
2026-08-19 has the full list, the two gate bugs found while changing the gate, and the reasoning
about why interior detail is worthless on this canvas.

**Still open, unchanged from phase 2:** whether they read *while moving*.

### Phase 3 — new moves — **shipped 2026-08-20**

**Five moves and seven modules: 36 moves, 35 modules, all reachable and gated.** `sweep_low` + `hop`
(a low sweep and the jump that is the only answer to it), `roll_through`, `handspring`, `parry_spin`,
and `throw-deflected` — a thrown blade knocked out of the air. `docs/DECISIONS.md` 2026-08-20 has
the measurements; `CLAUDE.md` deviation 9 has the four load-bearing rules.

Two of them are worth repeating here because they are about the rig rather than about this phase.
**A low sweep cannot descend** — a falling blade travels through everything between the guard and
the floor, so the blade drops to the low line before the distance closes and the lunge carries it
through. And **the camera had been cutting rotating fighters out of frame since the somersault
landed**: `duelFocus` reported a standing width for a body drawn on its side. Fixing that took
clipping from 8.61% of turning frames to 5.29%, and yielding the arena clamp to the subject took it
to **zero, death holds included**.

**Not taken, and it is a scope decision rather than a deferral:** *thrown props* and *blasters with
deflection*. Both need a new entity in an arena that has nothing in it — props would be set dressing
this world does not have, and none of the eight fighters carries a gun, which is a character
decision and not an engine one. The deflection image is built out of what already exists.

The remaining ideas from the brief that would still fit: a wall-kick reversal (the arena has walls in
name only, so this wants a decision about whether they are visible), and a downward air strike, which
is close enough to `leap_strike` that it needs a reason to exist.

### Phase 4 — VFX — **shipped 2026-08-20**

**The blade's bloom shipped 2026-08-19**, ahead of the rest of this phase, because it was one line
of composite state and the smear was actively reading wrong: drawn normally, a 13%-alpha fan over a
near-black arena is *darker* than the background, so a swing dragged a translucent sheet behind it.
The smear and the blade's outer pass are additive now — the second-additive-stroke bloom this
section already specifies, not a shadow.

**The other five landed 2026-08-20.** `docs/DECISIONS.md` has each one with its measurements;
`CLAUDE.md` deviation 9 has the rules. In short:

- **Directional sparks** — `contactSpray`, the grinder model: the swing decomposed against whatever
  was struck, keeping the component along the surface and reflecting the one driving into it back out
  at 45%. One function serves a blade, a torso and the floor. It also turned up a second bug that
  would have hidden the first: `spawnSparks` added a hardcoded upward kick of 2 to every spark ever
  spawned, against a mean bias of about 2.5. Circular spread of burst directions **0.327 → 0.902**.
- **A silhouette flash**, in `spark` rather than `core` (the ornament passes `p.fg` for both, so the
  obvious version was invisible), lasting exactly the frames the hit-stop freezes — derived, not
  chosen.
- **A directional kick**, along the blow, inverting and shrinking each frame. Ornament-only on the
  same split as the health bars, its own flag, defaulting off. `duelCamera` had to be taught about it.
- **Scorch marks** where a blade or a body hits the ground, cooling `core` → `spark` → `line` — the
  palette's version of the plan's white → orange → dark, since three literal colours are not
  available here.
- **Blade lighting**, per bone, from the blade *segment*, inverse-square. Two things flagged for the
  client: it washes bodies in the blade's colour, which widens a carve-out granted for blades; and a
  fighter is lit by their own blade only, because cross-lighting wants a transform chain that cannot
  be verified in a still.

**No shadow-blur glow** — see the render-cost measurement above. Still true, and the five above cost
one extra stroke each at most.

**What no bench can settle**, and it is the same open question the earlier phases left: whether any
of it reads *while moving*. Stills are what this environment produces.

### Phase 5 — audio

Layered clash (metallic transient + bandpassed noise body + sub thump), spark sizzle grains,
differentiated body hits / landings / kicks, force whoomph.

All of it inside `src/audio/engine.ts`, **pitch derived from the palette** so no voice holds a
literal frequency, behind the single `chime` gate and the one `sound` toggle.

**One question to settle before starting this phase, deliberately not assumed:** the site's rule is
*"every voice is fired by a gesture."* A duel clash is fired by the *animation*. The rule's purpose
— nothing plays uninvited, no `AudioContext` until a deliberate toggle — is satisfied as long as
duel audio only sounds when `sound` is explicitly on. Its letter is not. That is a product decision
and it is the client's, not this side's.

---

## Not taking

The arenas and their 13 background gradients (the panel would leave the palette system); the
visitor-facing PAUSE / SOUND / SKIP controls (*"visitors get the calm toggle and nothing else"*);
on-screen winner text, title cards and fight labels (deviation 8 — *show the layout, do not caption
it*); health bars behind body copy; Bebas Neue; the global CSS reset; the document keydown; the
shadow-blur glow; predetermined winners.
