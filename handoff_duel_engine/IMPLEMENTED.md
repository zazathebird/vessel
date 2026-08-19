# Duel engine — what was built, and what is measured

Companion to `BRIEF.md`, which stays as written. This is the record of what happened to
`duel-cycle-v2.html` on 2026-08-19, what is verified, and what is not.

**The random generation engine was not modified.** `makeBuilder`, `push`'s separation and
clamping, `weightedPick`, `generateDuel`'s planner loop and weighted pool structure, `buildFight`'s
randomisation and the beat-array model are all untouched. Twelve new `m*` modules were registered
into the existing pool with weights derived from `style`, exactly as the brief specifies, and one
new finisher.

Two exceptions, both deliberate and both explained below: `rolePush` gained a pass-through
(it was dropping every beat field added after it was written), and the Homer/Ned pairing resolves
to a fixed winner (its ending only works one way round).

---

## Everything below is measured, not asserted

Animation cannot be watched in this environment — the tab reports `document.hidden`, so `rAF`
parks *and the page never composites*. A screenshot returns a stale frame; this was verified by
drawing a solid red rectangle onto the canvas and watching it not appear. So the engine gained
`window.__DUEL` (`step`, `seek`, `setFight`, `metrics`, `resize`, plus `impactPoint`/`segPair`
exported for measurement), and everything here was produced by stepping real fights.

| | before | after |
|---|---|---|
| Clash sparks: distance to the nearest blade, median | 63.7px | **0px** |
| Clash sparks landing on a blade (<12px) | 20.6% | **93.8%** |
| Fight time genuinely still (nothing moving) | ~0% | **20.3%** |
| Strikes that follow from the previous cut | random | **85.7%** |
| Beats claiming a hit where the blades can physically meet | 57.3% | **86.6%** |
| Separation at contact, median | 219 units | **164 units** |
| Fight time within blade reach | — | **67.4%** |
| Cost per frame at 900×420 | — | **0.42ms** (2.5% of a frame) |

Regression: **150 generated fights**, 66 distinct pairings — zero errors, no unknown poses, no
beat outside the arena bounds, no zero-length beat. **17 fights played end to end through the
full render path** across nine pairings including every exotic one — zero errors.

---

## Four bugs found by measuring, that all looked correct in the source

1. **`grip` was never blended.** `lerpPose` copies a fixed list of keys and `grip` was not on it,
   so the blended pose had no `grip` at all, `clamp(undefined)` gave `NaN`, every comparison
   against it was false, and **the two-handed grip IK never ran once**. It typechecked, it drew,
   and every fighter held the sword one-handed.

2. **`rolePush` whitelisted thirteen field names.** Every beat property added after it was
   written — `bolts`, `prop`, `propColor`, `gag`, `cocoa` — was silently dropped on the floor.
   The blaster volley, the thrown prop and the cocoa ending all ran, emitted their beats, and did
   nothing. Now the role translation is the special case and the payload passes through, so this
   class of bug cannot recur.

3. **Costume marks had no edge pass.** The skeleton always had one; the costumes did not, so
   every mark on Vader, Batman, Neo and Sauron was invisible on a dark arena. The brief warned
   about exactly this. Each primitive now lays its own rim, scaled to how dark the body is.

4. **`resize()` wiped the canvas with nothing to repaint it.** Assigning `canvas.width`
   reallocates the buffer, and the loop parks when the panel scrolls off-screen, when the tab is
   hidden, and in any automated browser. Resizing in any of those states left a blank panel. It
   repaints inline now. (The first attempt guarded with `typeof state !== 'undefined'`, which does
   **not** dodge a temporal dead zone on a `const` — it threw during load and killed the engine.
   A hoisted flag does.)

---

## Workstream 1 — audio

Built out per the brief: three-layer clash (metallic transient, bandpassed body, sub thump, all
detuned ±15% per hit), spark sizzle whose grain count follows the spark count, a per-fighter
continuous whoosh voice driven by blade-tip speed and panned by screen X, hum with a second
harmonic and an LFO on the filter and a pitch derived from the fighter's own scale, a sidechained
sub bus, differentiated `bodyHit` / `landing` / `kneel`, a rising pressure `force` whoomph, crackle
grains for lightning, and a `ConvolverNode` with a procedurally generated impulse whose decay is
per-arena (throne room and temple long, desert short).

Effects now fire when `rawT` crosses `beat.contact` instead of at beat end — the structural fix
the brief asks for first. Everything else in this workstream depends on it.

**Not verified: none of it has been heard.** There is no audio in this environment. The signal
graph is correct by construction and the module builds without error, but whether it *sounds*
right is unreviewed. Turn sound on and listen before trusting any of it.

Autoplay is untouched: starts muted, context is not constructed until `Sound.toggle()`.

## Workstream 2 — character identity

All 29 fighters have their own `COSTUMES` entry, built from six primitives so they read as one
set. `.claude/skills/duel-costumes/SKILL.md` is the authoring procedure.

- **Two-handed grip**, solved analytically in `computeJoints` by two-bone IK on the blended pose,
  elbow-down so the forearm can never fold through the chest. Staff users grip the shaft at an
  offset, which is most of what a saberstaff looks like. `grip` is a 0..1 scalar so releasing it
  is a motion rather than a snap. Gandalf never solves it — his off hand has a staff in it.
- **A real hilt**, drawn as an oriented rectangle with both hands on it, and the blade starting at
  the emitter rather than the hand centre. Dooku's is canted.
- **Signature guards** — Soresu, Djem So, Ataru, Makashi, Juyo, Whirl, Brawl — substituted per
  fighter at playback by `poseFor`. The generator still only ever says `'guard'`. This is most of
  what makes a duelist recognisable while nothing is happening.
- **A second tone** (`D.mark`) for head-region marks. Anakin and Obi-Wan were the same beige and
  merged into one shape; they separate instantly now.
- **Per-fighter proportions** — Grievous long-limbed, Homer wide and short-legged, Vader
  heavy-shouldered, Sauron oversized.
- **Nametags and health bars**, drawn outside the camera transform so they never scale with the
  zoom, hidden below 500px panel width (verified: 0 name draws at 420 and 380, 1078 at 760 and
  1100), and faded out during finisher zooms. Health is **read out of the finished beat plan and
  never simulated** — nothing about the bar can feed back into fight logic.
- **Unstable blades** for Kylo and Homer, and Kylo's crossguard.

## Workstream 3 — choreography (additive)

Twelve modules added to the pool: `mPress`, `mStandoff`, `mSpinCombo`, `mSpinParry`, `mRoll`,
`mSomersault`, `mHandspring`, `mWallKick`, `mAirStrike`, `mDisarmRecall`, `mBlasterVolley`,
`mThrownProp`. Plus `mFinishCocoa`. Every one is reachable and fires in normal play.

Three changes address "it looks like they're swinging a stick randomly", which was three separate
causes:

- **Cuts chain.** `choice(STRIKES)` picked uniformly with no memory, so every exchange was
  unrelated swings that each reset to neutral first. `STRIKE_CHAIN` means a blade continues from
  where it ended. A chained strike also skips its wind-up, which is what makes a flurry flow.
- **They hold distance.** Every strike carried a 20–26 unit step, so the pair marched the arena
  and the separation clamp shoved them back. Ground is taken deliberately now, by modules whose
  job is taking it. `closeTo()` closes a lock to a real locking distance instead of hoping a fixed
  step lands there — a sabre lock was being played at arm's length.
- **There is a beat where nothing happens.** `settle()` returns to guard and then *stays*;
  wind-ups hold at the top; `mStandoff` is nothing but two people looking at each other.

`wounded` and `guardLow` were in the pose table from the start with nothing able to reach them.

### The fifth bug: they were swinging at air

Found last, and the largest realism problem of all. A blade tip sits about 118 world units
forward of the hip, so two facing fighters cross blades at roughly 236 and reach a body at
roughly 118. Measured over 1,262 beats that claimed a blade connected, the median separation
was **219** and **43% were scheduled further apart than the two blades could physically meet**.
The swing went through empty air, and the impact — correctly placed on the attacker's blade —
had nowhere to be but the end of a sword pointing at nobody.

Fixed steps cannot solve this, because where a strike lands depends entirely on how far apart the
previous module happened to leave the pair. `closeStep()` computes the approach from the live
separation, and it happens on the **wind-up**, because that is when a fighter steps in.

## Workstream 4 — VFX

Directional sparks along the contact normal with ground bounce; scorch decals that cool
white → orange → dark, drawn additively (painted normally they darkened the floor into what read
as a second ground shadow); real blade lighting whose direction comes from the blade's midpoint
and falls off with distance; a one-frame white silhouette flash on the struck fighter; directional
screen shake that oscillates along the blow's own axis and decays.

The blade trail now only samples when the tip has actually travelled — sampled every frame it
stacked into a solid fan that read as a cape hanging off the shoulder.

## Embedding

Container-relative throughout: `#duelPanel` with `ResizeObserver`, `IntersectionObserver` pausing
when off-screen, container queries rather than media queries, and controls that fade in on hover.
Verified at 420×240, 760×300, 380×520 and 1100×340 — all four correct.

---

## Known limitations

- **The audio is unheard** (above). This is the biggest gap.
- **A disarmed blade retracts rather than flying.** `disarmLose` sets `weaponExtend: 0`, so the
  sword switches off over ~0.26s and `recoverBlade` switches it back on. It reads as defeat and it
  is honest, but the "called back out of the air" gag does not fully land. A flying-blade entity
  would fix it and the prop system could carry it; it was not built because it risks a lit sword
  lying on the ground, and that is a judgement that wants an eye rather than a measurement.
- **Whether the fight *reads* well** is still unreviewed in motion. Every number above says the
  geometry and the pacing are right. Nobody has watched it.
- `mWallKick` needs a fighter genuinely backed against the arena edge, so it is rare by design
  (20 uses in 120 fights) — that is the guard working, not a bug.
