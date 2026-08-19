# Duel Engine — implementation brief for Claude Code

Target: `duel-cycle-v2.html` (in this folder). Self-contained: one HTML file, one canvas,
procedural everything, no external assets, no build step. Ships to mcclevarty.ca as an
**embedded panel inside a page** (not full-screen), running an endless random background duel.

Keep it one file unless there's a real reason not to. It currently works — do not rewrite it
from scratch. Every task below is an extension of existing systems.

> ## DO NOT CHANGE THE RANDOM GENERATION ENGINE
>
> The procedural choreography generator is the point of this thing. Fights must stay randomly
> generated on every run, forever. **Off limits:**
> `makeBuilder`, `rolePush`, `push`'s separation/clamping logic, `weightedPick`, `generateDuel`'s
> planner loop and its weighted pool structure, `buildFight`'s matchup/arena/length randomisation,
> the beat-array model, and the `style` weights that bias module selection.
>
> The only legal change to that layer is **additive**: register new `m*` modules into the existing
> weighted pool with their own weights, exactly like the fifteen already there. No hand-authored
> fight sequences, no fixed move order, no scripted duels, no replacing weighted selection with
> anything deterministic.
>
> Everything else in this brief — rendering, characters, audio, VFX — sits downstream of the
> generator and does not touch it.

---

## What's wrong today

1. **Sound is a stub.** One filtered noise burst per clash, a two-voice hum, no reverb, no
   whoosh, no sizzle, no weight.
2. **Every fighter is the same stick figure in a different colour.** The viewer must be able to
   tell who's fighting. Fix this with silhouette detail, backed by a tiny always-on nametag over
   each fighter.
3. **The fights don't read like the movies.** Not enough flips, spins, rolls, force work, and
   nothing but sabres — no blasters, no thrown props.

---

## Architecture map (read this before touching anything)

All inside one IIFE. Sections are comment-banner delimited.

| Section | Contents | Notes |
|---|---|---|
| `UTIL` | lerp, easing, `weightedPick`, `pt(origin, angleDeg, len, dir)` | `pt` is the whole rig's coordinate primitive. Angle convention: **0 = up, 90 = forward, 180 = down**; `dir` mirrors horizontally (+1 faces right). |
| `RIG` | segment lengths | `spine`, `headR`, `upperArm`, `thigh`, `hipHeight`… |
| `POSES` | ~45 named poses built through `P()` | Each pose = `{lean, headTilt, rot, hipBob, weaponExtend, weaponAngle, armR:{shoulder,elbow}, armL, legR, legL}`. `P()` fills defaults so no pose is half-defined. |
| `lerpPose` | angle-aware pose blend | Angles go through `lerpAngle` (shortest arc), linear keys through `lerp`. |
| `FIGHTERS` | 29 entries via `F()` | `{name, color, glow, scale, cape, bladeLen, weapon: 'blade'\|'staff'\|'dual'\|'blunt', speed, jitter, comedic, style:{agg,def,acro,force,flair}}`. The `style` weights bias which choreography modules get picked. |
| `ARENAS` | 13 arenas | `{label, bg:[top,bottom], ambient, ambientColor, scenery}` |
| `MATCHUPS` | 22 curated pairs + 34% chance of a fully random pairing | |
| `CANVAS` | `resize()`, `rigScale`, `spaceScale`, `groundY`, `worldX(offset)` | World X is an offset from centre, scaled by viewport. |
| `Sound` | Web Audio module — **workstream 1** | |
| `PARTICLES` | `emitSpark/emitRing/emitDust`, ambient weather, `updateParticles`, `drawParticles(filter)` | Capped at 460. `filterType` splits ambient (drawn behind fighters) from action (in front). |
| `SHAKE/FLASH/CAMERA` | `triggerShake`, `triggerFlash`, `cam{x,y,z,tx,ty,tz}` | Camera eases exponentially toward targets in `frame()`. |
| `FIGURE DRAWING` | `computeJoints` → `drawFigure` — **workstream 2** | `computeJoints` returns `{hip,neck,head,shR,shL,elR,haR,elL,haL,knR,ftR,knL,ftL,S}` where `S` is the composite scale. `drawFigure` draws shadow → cape → edge pass → back limbs → torso → front leg → head → front arm → rim light → blade. |
| `CHOREOGRAPHY GENERATOR` | `makeBuilder`, `rolePush`, and the `m*` modules — **workstream 3** | |
| `FIGHT ASSEMBLY` | `buildFight()` picks matchup, arena, target length, generates beats | |
| `PLAYER STATE` / `MAIN LOOP` | `frame()` advances `beatT`, blends poses, drives camera; `render()` draws | Hitstop zeroes `dt`; `beat.slow` scales it. |

### The beat model
`generateDuel()` emits a flat array of beats. Each beat is a pose-to-pose transition:

```
{ poseA, poseB, dur, dxA, dxB, arcA, arcB, spinA, spinB, turnA, turnB,
  ease, contact, spark, shake:[mag,dur], flash:{color,a}, hitstop, slow,
  sfx, cam:{z,focus}, swap, noSep, resolve, ignite }
```

`makeBuilder` maintains live positions `S.xA/S.xB` and a `S.side` facing flag, clamps to
`ARENA_HALF`, and enforces `MIN_SEP`/`MAX_SEP` iteratively so fighters never overlap or drift
off-stage. `rolePush(g, atk, def, atkPose, defPose, opts)` writes attacker/defender roles into
A/B slots — **always add beats through it**, never by pushing raw objects, or separation and
facing break. `contactAt(g, def)` gives the impact point biased toward the defender.

Effects fire in `fireBeatEffects(beat)` at the **end** of a beat. That's a real limitation for
workstream 1 — see below.

---

## Workstream 1 — Audio

Current `Sound` module: `burst()` (noise → biquad → gain envelope), `tone()` (osc → gain), two
sawtooth+sine hum voices, and `clash/ignite/boom/thud/zap`. Master starts at gain 0; the context
is only built on the user's first gesture (`Sound.toggle()`), which must stay true — autoplay
policy.

Build it out to:

- **Clash impact** (highest priority). Layer three things instead of one burst: a 3–6 ms metallic
  transient (short ring-mod or a few detuned square blips through a high-Q bandpass), a
  bandpassed noise body sweeping down, and a sub thump (sine 90→40 Hz). Vary pitch and filter
  centre per hit by ±15% so repeated clashes don't sound identical — repetition is the tell.
  Scale all three off `beat.spark` (already the engine's proxy for impact power).
- **Spark sizzle.** After each clash, schedule 15–40 short noise grains over 250–500 ms with
  randomised start times, a high bandpass, and fast decays. Tie the grain count to the spark
  count so a 34-spark finisher sizzles longer than a 9-spark flurry hit.
- **Swing whoosh + doppler.** `render()` already computes `state.speedA/speedB` from blade-tip
  displacement per frame. Feed that into a per-fighter continuous noise voice: bandpass centre
  and gain both driven by tip speed, plus a small `StereoPannerNode` offset driven by the
  fighter's screen X. That gives you doppler-ish movement for free.
- **Hum presence.** Keep the existing tip-speed-driven hum but add: slight per-fighter pitch
  offset from `char.scale` (already done crudely — Yoda gets +120 Hz), an LFO wobble on the
  filter, and a second harmonic. `Sound.silenceHums()` on pause / tab hide already exists.
- **Body hits, falls, kicks.** `thud` needs more differentiation: a kick connecting, a body
  hitting the ground, and a knockback landing should not be the same sample. Add
  `bodyHit(power)`, `landing(power)`, `kneel()`.
- **Force / energy.** `zap` is a single high burst. Force push wants a low pressure whoomph with
  a rising pitch and a wide filter sweep; lightning wants crackle grains.
- **Low-end weight on big hits.** Add a sidechained sub bus: sine 60→30 Hz, 400–700 ms, gain
  driven by `beat.spark`/`beat.shake[0]`, only on beats over a threshold. This is most of what
  makes hits feel heavy.
- **Room reverb** (optional but cheap): one `ConvolverNode` with a procedurally generated
  impulse (decaying filtered noise, ~1.2 s), on a send bus. Per-arena decay length —
  the throne room and temple long, open desert short.

**Structural fix worth doing first:** effects currently fire when a beat *completes*, so the
clash sound lands after the swing has finished. Add a per-beat `fired` flag and trigger effects
when `rawT` crosses `beat.contact` instead of at `rawT >= 1`. Everything in this workstream
sounds better once impacts are on frame.

**On recorded SFX:** synthesis will get you most of the way with zero hosting. If you later want
real clash/hum recordings, keep the `Sound` module's public API (`clash`, `boom`, `thud`, `zap`,
`hum`, `ignite`) and swap the internals for `AudioBufferSourceNode`s — that's the only reason to
introduce hosted assets, and the API is already the right seam for it.

---

## Workstream 2 — Character identity

**Requirement: recognisable at embedded-panel size, mid-motion.** Assume the figure is 200–320 px
tall and moving. That rules out faces and fine detail — recognition has to come from
**silhouette, mass, and one or two signature shapes**.

A **tiny persistent nametag per fighter** is fine and wanted — a small monospace label (8–9 px,
letterspaced, low-opacity, drawn in the existing `JetBrains Mono`) floating just above each
fighter's head and tracking `j.head` every frame. It replaces the current behaviour, where the
`#titleCard` shows both names for 2.4 s at the start and then fades — useless for someone who
lands on the page mid-duel. Fade the label out during heavy camera zooms if it gets in the way,
and hide it below ~500 px panel width. Note the tags are a safety net, not a substitute: the
silhouettes still have to carry it, since the fighters are usually in motion and the viewer is
reading the page, not the labels.

### Tiny health bars (ornament)
A small bar paired with each nametag — same scale, same restraint. **This is decoration, not a
game mechanic**, and it must not become one.

The critical constraint: the generator already decided who wins (`buildFight` sets `winA`, from
the curated matchup or a coin flip) and already emitted the full beat list. So health is **read
out of the plan, never simulated** — nothing about the bar may feed back into fight logic, or it
turns the choreography into a simulation and breaks the ask above.

Implementation: after `generateDuel()` returns, walk the beat array once and score damage per
fighter from the poses already there — `stagger`, `knockback`, `wounded`, `exhausted`,
`disarmLose`, `finishLose` on a fighter's slot means that fighter took a hit, weighted by the
beat's `spark`/`shake` magnitude. Normalise so the loser's total lands at 0 on the finisher and
the winner ends somewhere in the 20–45% range (a duel where the winner walks away untouched
reads wrong). Then, at playback, each bar just eases toward the value precomputed for the current
beat index — a damped lerp so it drains visibly rather than stepping.

Styling: ~46×3 px at 1×, sitting directly under the nametag, tinted with the fighter's `glow`
colour over a low-opacity dark track, no border, no numbers, no icons. A brief white flash on the
bar at the moment of drain is worth it. Hide with the nametag below ~500 px width, and fade both
out during finisher zooms so they never sit on top of the climax.

Draw original stylized geometry, not reproductions — a horned head, a domed helmet with a
flared skirt, a hooded robe. At this scale that reads better anyway, and it keeps the site clear
of anyone's character art.

### How to build it
Add an optional `char.draw` hook set consumed by `drawFigure`, with these slots, all receiving
the joint object `j` (so they can attach to real anatomy) plus `dir` and `S`:

- `head(j, dir, S)` — replaces the plain `arc()` head. **This carries 70% of recognition.**
- `torso(j, dir, S)` — robe skirt, chest box, cape variant, tunic mass.
- `overlay(j, dir, S)` — a signature accessory drawn last (mask lines, hair mass, cowl ears).
- `proportion` — per-fighter multipliers on `RIG` values (Grievous long-limbed, Homer wide and
  short-legged, Yoda already scale 0.62).

Keep the existing edge-stroke pass (`edgeColor()` picks a rim by luminance so near-black bodies
stay visible on dark arenas) and run it over the new shapes too, or Vader and Batman disappear.

### Cue sheet — one distinguishing read per fighter

| Fighter | Silhouette cue |
|---|---|
| Vader | Domed helmet with flared bottom flange, high square shoulders, long cape to floor, heavy proportions |
| Luke | Bare head, small hair mass, plain tunic, no cape |
| Obi-Wan | Hood down + beard wedge, layered robe with sleeve flare |
| Anakin | Hood-less, shoulder-length hair mass, robe skirt split |
| Yoda | Already tiny — add wide swept ear triangles and a wide sleeve robe puddling at the feet |
| Dooku | Tall, thin, swept-back cape, **curved-hilt blade held angled** (its own read) |
| Maul | Ring of short horns around the crown, bare torso (no robe mass), double blade already differentiates |
| Palpatine | Deep pointed hood with no visible head, hunched spine, wide sleeves |
| Ahsoka | Two long lekku falling forward past the shoulders + short head-tail; dual blades already set |
| Grievous | Extra-long limbs, narrow head with a beak profile, hunched shoulder cowl, four arms if the rig can take it |
| Rey | High triple-bun profile, wrapped-arm bands, short tunic |
| Kylo | Slim helmet with a vertical face slit, ragged cape hem, crossguard blade (three-way blade draw) |
| Jesus | Long hair + beard mass, full-length simple robe, faint halo ring above the head |
| The Devil | Two long backswept horns, pointed tail as a drawn curve from the hip, cape |
| Rick | Spiked upswept hair mass, lab coat (long open coat panels), unibrow line |
| Morty | Round head, small tuft, short-sleeve tee silhouette, hunched |
| Homer | Wide egg body, two head hairs, no neck |
| Ned | Moustache bar, sweater with visible collar, glasses as two small rings |
| Bart | Spiked crown (a zigzag head outline), small, shorts |
| Neo | Long straight coat to the ankles, small round shades, slick head |
| Smith | Suit lapels as a V on the chest, earpiece dot + wire, short spike hair |
| Naruto | Spiked star hair mass, headband bar across the forehead, jacket |
| Sasuke | Sharp back-swept hair wedge, high collar, one arm out of sleeve |
| Goku | Tall multi-spike hair crown, gi with belt band |
| Vegeta | Flat-top widow's-peak hair, armour shoulder pads, gloves |
| Batman | Two pointed cowl ears, scalloped cape, chest emblem shape |
| Joker | Wide grin arc, long green hair mass, tailcoat |
| Gandalf | Pointed wide-brim hat, long beard to the chest, staff in the off hand |
| Sauron | Spiked crown/helm, oversized proportions, mace already set |

**Off-hand props are worth adding to the rig** (Gandalf's staff, Vader's cape volume): the `armL`
chain is fully solved and currently unused for anything but `dual` weapons.

### Two-handed grip (required)
Single-blade fighters must grip the hilt with **both hands**, as in the films. Right now `armL`
hangs at a neutral 200°/205° through most poses while the blade is held one-handed off `armR` —
that alone makes every duel read as amateur.

The clean fix is not to hand-author `armL` angles in 45 poses. Instead, add a per-pose
`grip: 'two' | 'one' | 'free'` flag and solve the off-hand analytically in `computeJoints`:

- For `grip:'two'`, take the hilt position `haR` as the IK target for the left arm and solve
  `armL.shoulder` / `armL.elbow` with a standard two-bone IK from `shL` (lengths `upperArm`,
  `forearm`). Pick the elbow-out solution (elbow away from the body) so the arms form the
  correct triangle rather than folding through the chest.
- Clamp: if the target is out of reach (`dist(shL, haR) > upperArm + forearm`), fall back to
  fully extended pointing at the hilt — the hand will float slightly short, which reads fine and
  is better than an unsolvable pop.
- `grip:'one'` for reaching thrusts, force-casting poses (`forceCast`, `forcePull` — off hand is
  busy), disarms, taunts, and the `dual`/`staff` weapon types, which must stay as they are.
- `grip:'free'` for `disarmLose`, `deathFall`, `kneel`, reactions.

Because `lerpPose` blends poses before drawing, solve the IK **after** the blend on the final
pose, not per keyframe — otherwise the hands separate mid-transition. Blend the flag as a scalar
0..1 and lerp between the solved two-hand angles and the pose's authored one-hand angles, so
releasing and re-taking the grip is a smooth motion rather than a snap.

Also worth it once the grip is real: a small hilt drawn as an actual oriented rectangle (it's a
3.2px circle today) with both hands as filled dots on it, and the blade origin moved to the
hilt's emitter end rather than the hand centre.

---

## Workstream 3 — Choreography (additive only)

Read the box at the top of this file first. The generator itself is not to be modified. What
follows is a list of **new modules to add to the existing weighted pool**, each written the same
way the current fifteen are — take `(g, atk, def)`, emit beats through `rolePush`, get a weight
derived from the fighters' `style` values. Adding modules makes the random output richer without
touching how it's randomised.

Modules today: probe, exchange, flurry, bind-riposte, saber lock, sweep-leap, duck-counter,
leap-over, spin attack, kick, force push, force pull, deflect, near-miss, taunt, breather + six
finishers.

Add:

- **Rolls.** A ground roll needs a pose sequence (`rollTuck` → `rollOver` → `rollUp`) with `rot`
  driven a full 360 and `hipBob` deep. Note the existing constraint in the code comments: `rot`
  is a hip-pivot rotation, so genuine prone/rolling poses need hip height dropped in the pose,
  not just rotation — see how `deathFall` is handled and extend the same way.
- **More aerials.** `mLeapOver` exists and uses `g.hasVaultRoom()` / `g.landingFor()` to check
  the far side is clear — reuse those guards for: a back handspring away from pressure, a
  wall-kick reversal, a somersault over a low sweep, a downward air strike into a landing.
- **Spins.** `turnFactor(t)` sweeps `dir` through a cosine so the body foreshortens edge-on at
  the quarter points — a real grounded turn. Use it more: spinning parries, double spin combos,
  a spin into a thrown prop.
- **Blasters.** New weapon behaviour, not a new rig or a new generator path: a `blasterShot` beat
  spawns a fast bolt entity travelling between world X positions, and the defender's beat is
  `deflect`. The particle system can carry bolts as a new `type` with a streak draw (see the
  `p.streak` rain branch in `drawParticles`). Deflected bolts should bounce off at a new angle.
  Add a `style.blaster` weight to the `F()` defaults so only some fighters draw the module.
- **Thrown objects.** User is explicitly fine with props appearing from nowhere. Add a small
  prop table (rock, crate, pillar chunk, tree, console) drawn as simple filled polygons, then a
  three-beat module: `forcePull`-style raise (prop lifts and hovers, wobbling), hurl (prop
  travels on an arc), and resolve (defender cuts it — two halves fly apart with sparks — or is
  hit and knocked back). Weight by `style.force`. This is the single most cinematic addition.
- **Environmental interaction** if there's appetite: sabres scorching the ground, a fighter
  knocked into arena scenery.

Constraint to respect: everything is generated at runtime and must never deadlock. `generateDuel`
has a `guard++ < 90` loop bound and every module must leave positions valid — always route
through `rolePush`/`g.push` so separation clamping runs. New modules that move fighters a long
way (a hurled prop knockback, a wall-kick) must use `g.hasVaultRoom()` / `g.landingFor()` /
`g.sep()` to gate themselves, and return a weight of `0` when the geometry doesn't allow them —
that's how `mLeapOver` already stays safe.

---

## Workstream 4 — VFX

- **Sparks on clash** — exists (`emitSpark` + `emitRing`). Needs directionality: sparks should
  spray along the blade-contact normal, not radially, and a few should bounce off the ground.
- **Scorch marks / lingering glow** — new: a decal list holding `{x, y, angle, heat, born}`,
  drawn under the fighters, cooling from white → orange → dark over ~2 s. Emit on ground
  impacts and heavy clashes. Cap the list.
- **Blade light spilling on bodies** — a weak version exists (`rim light` pass in `drawFigure`,
  alpha 0.16, fixed offset). Make it real: compute the offset direction from the blade midpoint
  to each limb and scale intensity by inverse distance. Big visual payoff for little code.
- **Impact frames / screen shake** — `triggerShake` and `state.hitstop` exist. Add a 1–2 frame
  white silhouette flash on the struck fighter at contact, and make shake directional rather
  than random jitter on both axes.

---

## Constraints

- **One file, no dependencies, no build.** Fonts come from Google Fonts via `@import`; the rest
  is procedural.
- **Embedded panel.** It currently assumes `position:fixed` full-viewport (`#stage`, `#vignette`,
  `#controls` are all fixed). Convert to a container-relative layout so it can sit in a page at
  arbitrary size — `resize()` should read the container box, not `window.innerWidth/Height`.
  `rigScale`/`spaceScale` are already derived from viewport size, so they just need repointing.
  Use a `ResizeObserver`.
- **Perf.** Particle cap 460, DPR capped at 2. New systems (bolts, props, decals) need their own
  caps. It's a background element on someone's homepage — it must not eat a laptop battery.
  Pause the loop when the panel is off-screen (`IntersectionObserver`) and on tab hide.
- **`prefersReducedMotion`** is respected throughout (shake, flash, hitstop, camera). Keep it.
- **Mobile.** Controls already collapse under 560 px.
- **Audio starts muted** and only builds the context on a gesture. Never change this — and on an
  embedded background panel, muted-by-default is the correct default anyway.

---

## Suggested order

1. Fire effects at `beat.contact` instead of beat end (small, unblocks all audio work).
2. Container-relative sizing + `IntersectionObserver` pause (needed for the real embed).
3. Two-handed grip IK — small, and it upgrades every single pose at once.
4. Character `draw` hooks + the cue sheet — the biggest visible win, and the main ask.
5. Nametags + health bars (small, self-contained, read-only against the beat plan).
6. Scorch decals, directional sparks, real blade lighting.
7. Clash layering, sizzle, sub bus, whoosh.
8. New choreography modules — rolls, aerials, spins, thrown props, blasters — added to the
   existing weighted pool, generator untouched.

---

## Files

- `duel-cycle-v2.html` — the current working engine, 1906 lines. This is production code, not a
  mock. Extend it. The random generation engine inside it is not to be modified — see the box at
  the top.
