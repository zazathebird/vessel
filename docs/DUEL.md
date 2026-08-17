# The lightsword duel

> **Superseded in part, 2026-08-14.** This document describes the *reference*
> implementation and the porting rules, both of which still stand. It no longer
> describes how the fight is built. Two things changed and the code is now the
> authority on both:
>
> - **Fighters are stick figures.** The blocky filled-block bodies this document
>   argues for composited into one pale slab that the client read, correctly, as
>   a shield. The client's call: "im fine with stick figures as long as the
>   fights are decent." All the investment went into the fighting.
> - **Fighters decide nothing.** The per-fighter `decide()` this document
>   describes is gone. A director picks a scripted `Sequence`, assigns roles by a
>   coin flip, and hands out moves on scripted frames — because two independent
>   randomisers cannot produce action and reaction. See the long note above
>   `MOVES` in `src/fx/duel.ts`, and deviation 9 in `CLAUDE.md`.
>
> What is still true and still worth reading here: the four porting rules (no
> literal colours, no fixed pixel geometry, state on the caller's cache, the
> caller clamps the delta), the health-bar split between ornament and
> background, and the naming/likeness constraint.
>
> **Revised again 2026-08-16.** Ten more shipped bugs, found by measurement
> rather than by eye after the client said the fight "seems a little off" — the
> headline being that no fighter had ever actually been knocked down and that
> blocked strikes never drew their downstroke. The sections below are corrected
> where they had gone false (attract mode, the "no parry" note, sound, the
> health-bar question), and *Verification note* at the end now describes the
> method, which is the part worth carrying to any other effect. `CLAUDE.md`
> deviation 9 has the full list with the numbers.

**Update 2026-08-13, later the same day:** two client requests landed on top of
the rebuild. (1) The four silhouettes were upgraded so each pairing reads
unmistakably — the haloed figure gained shoulder-length hair, a floating
two-pass halo, a light aura and a fuller robe; the horned one curved horns, a
scalloped bat wing and a swaying spade-tipped tail; the hooded one a deeper
hood, a belt in its blade colour and a tunic skirt; the caped one a domed
helmet, a lit chest panel with belt boxes and a floor-length cape. (2) **Blades
are now literal colours** — good fights in blue/green, evil in red, in every
palette (`BLADE_COLORS` in `src/fx/duel.ts`). That is the site's one deliberate
literal-colour carve-out; everything else in the scene still recolours with the
palette bleed. CLAUDE.md *Known deviations* 9 records both.

**Status: rebuilt 2026-08-13, live in the hero-ornament slot.** The match
engine is `src/fx/duel.ts`, the ornament host is
`src/components/DuelOrnament.tsx`, and both pairings are pickable in
siteconfig's Ornament section (`Lightswords: light & dark`,
`Lightswords: saint & serpent` — ornament share-code indices 5 and 6). **The
background-effect home is live again as of 2026-08-14**, at `FX` indices 12 and
13 (`0-0-C-…`, `0-0-D-…`), which the entries held throughout — they spent a day
flagged `hidden: true` because the HUD pass appended `scan` and `telemetry` and
needed those indices held concretely rather than by comment, so re-listing was
deleting two flags exactly as promised. So the fight now has both homes the
client originally asked for. (The old note here about re-listing dating the
404's "12 background modes" copy was wrong: no such string exists.)
`docs/DECISIONS.md` 2026-08-13 has the build note and 2026-08-14 the re-listing;
the sections below remain the spec the rebuild was built to.

**~~Attract mode~~ — built 2026-08-14 and removed the same week**, at the
client's word: *"make sure the screensaver battles are the same graphics as the
nonscreensaver ones."* The screensaver has no rendering of its own — it is the
configured effect, alone and boosted — and the version described here gave the
sleeping fight its own scale, `dim` and health bars, i.e. a second presentation
nobody asked for. What survived is the *background* presentation, because that
is the direction with a hard constraint: body copy has to read through it.
`Frame.sleeping` remains on the contract with no consumer (see the note on it in
`src/fx/effects.ts`) and **health bars are ornament-only**. `DuelView.barAlpha`
survives because `bars` is a boolean and can only pop; it defaults to 1.

**Open against the background home**: the fighters are centred with their feet
at 80% viewport height, so on Cinematic at a short viewport they sit behind the
hero's CTA row. `dim: 0.55` keeps everything readable, but it reads as placement
rather than design. Attract mode does not touch this — that is the non-attract
state — and the 2026-08-14 recommendation was to leave it: a fixed offset trades
Cinematic's collision for another layout's, since it depends on viewport height
and on where the fighters are in the match. `fxlab.html` at the project root
renders both duels — and the other fourteen effects, and the attract ease —
without needing a visible tab.

## What the client asked for

An endless lightsword fight as a background effect — and, first and separately,
as a **tiny animation replacing the hero ornament** (the "pulsing wye/radar
looking thing", i.e. the Lens/Valve in `.v-ornament`). Both homes are acceptable;
the ornament one was the original request. **Both are built** — the ornament on
2026-08-13, the background re-listed on 2026-08-14 (see the status block above).
This paragraph is what was asked for, kept as written; it is no longer a to-do.

"Lightswords" is the client's own word, chosen by them on 2026-08-12, and is the
name to use. The pairings asked for are **Jesus vs Devil** and **Luke vs Darth**.

### The naming and likeness constraint

Vader, Luke and "lightsaber" are Lucasfilm marks and this is a **commercial**
site. The client renamed the weapon themselves, which settles that half. The
figures should read *unmistakably* as the intended pairing through silhouette and
colour — hood/robe versus cape/helmet, halo versus horns, blue versus red — while
not being traced likenesses. At 8/32-bit resolution this distinction is close to
free: a blocky caped figure with a red blade reads as exactly what it reads as,
without being a copy of anything.

## Why the first attempt failed

The shipped version drew two **stick figures** from joint angles and eased them
between nine static stances. The client's verdict, verbatim: *"if you are keeping
the lightsabre fight that is between those two stick figures, remove it — that is
terrible"*, and earlier *"it is just WAY too slow, and needs to be animated a LOT
better."*

Both complaints have the same root cause, and it is a design error rather than a
tuning error:

- **Interpolating between static poses is a drift, not a fight.** Every stance
  transition ran `0.35 + rand*0.8` per second — 1.2 to 2.9 seconds per change —
  with one smoothstep across the whole move. A real strike is fast and its
  recovery is slow; a single easing curve for both halves is precisely what makes
  it float.
- **There were no events.** No hits, no damage, no winner, no reset. Nothing ever
  *happened*, so there was nothing to animate toward.
- Line-art stick figures read as a diagram at background opacity.

**Both were done.** The stance machine is gone; `EFFECTS.duel` and
`EFFECTS.duelholy` in `src/fx/effects.ts` are now thin hosts that call into
`src/fx/duel.ts`. The three parts named here as worth keeping were kept: the
clash-detection geometry, the spark field, and the three-pass blade rendering
(wide faint glow → mid → bright core). Two of the three have since been found
wrong in ways that presented as art problems rather than as bugs — `bladeGap`
solved its second segment against the wrong vector and reported crossing blades
as 16 units apart, and the clash test had no force floor so it fired on proximity
rather than on contact. Both are fixed; the note stands as a warning that
"liked the look of it" is not the same as "verified".

## The design the client supplied

On 2026-08-12 the client provided a working reference implementation
(`Endless Automated Saber Duel`, a single-file canvas prototype). It is the
authoritative statement of what "animated a LOT better" means. Its decisions:

| Element | Reference behaviour |
|---|---|
| Bodies | Plain filled rectangles, `30 × 70`. Blocky, not line art |
| Timing | Frame counts, **not** seconds — `stateTimer` of 15 (slash), 20 (kick), 30 (force) |
| States | `neutral`, `attacking`, `kicking`, `force`, `dead` |
| Decision | Re-rolled whenever `stateTimer` hits 0; branches on distance (`>120` far, else close) |
| Far moves | Advance (`vx ±2.5`), force push (damage + self-pushback), tactical leap (`vy = -10`) |
| Close moves | Slash (70% hit chance), kick (damage + knock opponent back), retreat |
| Physics | Gravity `vy += 0.6` toward a floor at `y = 200`; `vx *= 0.9` decay |
| Damage | Slash `8–13`, force `12–19`, kick `6`. Health 100 |
| Feedback | 15 spark particles at the hit point; floating health bars above each fighter |
| Loop | On death: announce a winner, wait 2s, `reset()` both, increment match counter |
| Variety | `attackPower` and `forcePower` re-randomised **per match**, so rounds differ |

**The single most important idea in it** is that the fight is made of discrete
*matches with winners*, not a continuous exchange. That is what the earlier
version lacked and why it had nothing to build tension toward.

### Where the shipped version now departs from the reference

The table above is the reference and stays as written. Almost none of it now
describes what ships, and the two survivors are the ones that mattered: **the
match loop with winners**, and **per-match `attackPower` / `forcePower`**.

- **Bodies** are stick figures — see the banner at the top of this file.
- **Decision** is gone. A director picks a scripted `Sequence` and assigns the
  two roles on a coin flip; fighters choose nothing.
- **Timing** is keyframe tables per move, 26–56 frames, with a dead hold at the
  top of every wind-up. Strikes are 4–6 frames for the whole arc; the tempo
  comes from the contrast with 20–40 frames of stillness between exchanges.
- **Feedback**: sparks come off the true blade-to-blade crossing as well as off
  landed blows, and draw as streaks.

**The block and parry state this section used to say was declined now exists**
(`parry_high`, `parry_low`, `parry_cross`, `lock`, and `blocked` as a scripted
outcome). The reasoning for declining it was sound and is worth keeping, because
it is exactly what makes the current design safe: a *reactive* block can extend a
move indefinitely and the match-reset loop has no timeout, so a mutual block lock
would hang the effect. The way in was to make blocks **scripted rather than
reactive** — sequences have fixed lengths, the director advances unconditionally,
and the blade lock's duration is rolled when it starts. Nothing waits on a
condition. Do not add a block that does.

## Porting it into this codebase

The reference is a standalone page and cannot be dropped in as-is. Four things
must change:

1. **No literal colours.** The reference hardcodes `#00ffff`, `#ff0000`,
   `#ffffaa`, `#00ff00`. Every effect in `src/fx/effects.ts` reads the live
   palette off the `Frame` so the canvas recolours during the 0.9s palette bleed.
   Blades take `p.a1` / `p.a3`, bodies `p.fg`, sparks `p.a2`, cores `p.fg` —
   the same reason the Matrix rain's leading glyph is `fg` rather than white.
2. **No fixed pixel geometry.** `width: 30`, `y = 200`, `x = 150/520` assume a
   700×350 canvas. This canvas is the viewport. Everything must derive from a
   scale `s` computed from `w`/`h`, as the current `duelling()` already does.
3. **State lives in `FxCache`, not module scope.** The reference keeps fighters
   and particles in globals. Here they belong on `cache.duel` so the loop can
   drop them when the effect changes. The `DuelState` interface already exists.
4. **Clamp the frame delta.** `t` arrives pre-multiplied by `boost`, so a scroll
   surge or the screensaver would otherwise advance the fight by a whole second
   in one frame. The existing code clamps to 0.05 — keep that.

Health bars and a match counter are fine in the ornament slot but are probably
wrong at full-page background opacity, where text has to stay readable. Worth
asking which. **Answered: bars are ornament-only, and there is no match counter
or winner text anywhere** — the fallen fighter, the spark burst and the winner's
raised blade are the announcement, for the same reason the hero vitals strip was
removed (show, do not caption).

## ~~Sound~~ — built 2026-08-14

This section said the site had no audio. It does now: `src/audio/engine.ts`,
synthesised so `SPEC.md`'s *Assets* rule still holds, with the pitch derived from
the palette so no voice contains a literal frequency. Every requirement listed
here was met — an explicit control, a persisted toggle under its own key
(`vessel.sound.v1`), and a share-code field (toggle bit 16). **There is no
ambient bed, no loop and no timer**: every voice is fired by a gesture, which is
how autoplay policy is satisfied, and the `AudioContext` is not constructed until
the first voice. The duel does not currently make any sound of its own.

## Share-code trap, already paid for once

`src/config/shareCode.ts` encodes the effect as the **index into `FX`**, in
**base 36**. Two consequences:

- New effects are **appended** to `FX`, never inserted, or every share code in
  circulation silently repoints to a different effect.
- Effect index 12 is `C`, not `12`. A test code of `0-0-12-0-7-0` parses `12` as
  base-36 38, falls through `FX[38] ?? FX[0]`, and applies **Vessels** — which
  looks exactly like the new effect having failed to deploy. This cost a debugging
  cycle. When the duels return at indices 12 and 13, their codes are
  `0-0-C-0-7-0` and `0-0-D-0-7-0`.

## Verification note — and the method that actually works

An occluded Chrome window freezes `requestAnimationFrame`, so **animation cannot
be verified from a screenshot** in this environment. Static rendering and layout
can be. That much has always been true and still is.

**What was wrong was the conclusion drawn from it** — that motion could only be
checked by the client. On 2026-08-16 the client reported the fight "seemed a
little off" with no further detail, and ten bugs were found without watching a
single frame, by **bundling the real module with esbuild and stepping
`advanceDuel` in Node over 90,000–400,000 frames**, measuring the state directly.
Some of them were not subtle: `impulse: { at: 0 }` could never fire, so across
13,591 frames of `knockdown` **0.0% were airborne** — nobody had ever been
knocked down. Blocked strikes never drew their downstroke. The ornament camera
showed both fighters on 31% of frames at the phone slot. None of that needed an
eye; all of it needed a number.

The technique generalises, and it is why `duelCamera` and `duelFocus` are
exported and pure:

- **Step the real module, never a re-implementation.** A bench that re-implements
  the logic only ever confirms the bench.
- **Measure the thing the complaint is about.** "Looks off" is not measurable;
  *blade-to-body distance on the frame damage is dealt* is, and it was 42.8 units.
- **Drive a mock 2D context** when the question is about what is drawn rather
  than what is simulated — that is how the off arm was caught over-extending on
  98.6% of frames.
- **Sweep constants rather than arguing about them.** The leash, the camera floor
  and the body-separation strength were all chosen from a table of measurements,
  and in two of the three cases the value that looked obviously right was worst.

Numbers in this file and in `CLAUDE.md`'s deviation 9 are from those runs. The
client's eye is still the authority on whether it *reads* well — but "we cannot
check it here" is no longer a true statement about correctness.
