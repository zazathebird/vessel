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

**Attract mode** (2026-08-14, client request): the screensaver has no rendering
of its own — it is the configured effect, alone and boosted, which is why "make
the screensaver run the fight" needed nothing built. What did need building is
that the duel stayed at *background* settings once the chrome had faded, with no
copy left to stay out of the way of. `Frame.sleeping` now eases the fight to
~1.4× scale, `dim` 1 and health bars over the same 1.6s the chrome takes to
fade. Eased and not switched, `DuelView.barAlpha` added because `bars` is a
boolean and can only pop, and the ease is asymmetric on purpose — roughly twice
as slow settling back, because waking is when you want the page, not a second
animation. The ornament passes neither and is unaffected.

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

The code is still in `src/fx/effects.ts` as `EFFECTS.duel` / `EFFECTS.duelholy`.
The reusable parts are the clash-detection geometry, the spark field and the
three-pass blade rendering (wide faint glow → mid → bright `fg` core), which the
client liked. **The stance machine is not reusable** and should be replaced.

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

### Where the shipped version now departs from the reference (2026-08-14)

The table above is the reference, and stays as written. The client then asked for
better-looking characters and fights, so three of its rows no longer describe
what ships. Everything else — the match loop, the decision function, the damage
numbers, the per-match power roll — is unchanged.

- **Bodies** are no longer plain rectangles. The torso stops at the hips and the
  figures have two articulated arms and two legs, solved as two-bone chains.
- **Timing**: the slash is 20 frames, not 15, split into anticipation, strike and
  follow-through, with the damage frame moved from 5 to 11 so the blow lands at
  the bottom of the swing. The kick drops 20 → 16 to pay the frames back; the
  measured effect on match length was 9.6s → 10.5s.
- **Feedback**: sparks spawn at the blade's real tip rather than the midpoint
  between the two fighters, biased along the swing, and draw as streaks.

Still deliberately absent, and it is the reference's own gap: **there is no block
or parry state**. A miss is a coin flip rolled before the swing starts, and the
defender does nothing about it. Adding one is the only change that can alter
match outcomes — a mutual block lock would leave a match never ending — so it
was declined rather than forgotten.

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
asking which.

## Sound

Asked for twice and **not built**. The site has no audio at all today. WebAudio
synthesis fits the *Assets* rule (no files), but autoplay does not: it needs an
explicit control, a persisted toggle, and a share-code field. That is a spec
change, not a patch — see `SPEC.md` *Assets* and the share-code note below.

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

## Verification note

An occluded Chrome window freezes `requestAnimationFrame`, so **animation cannot
be verified from a screenshot** in this environment. Static rendering and layout
can be. The motion has to be checked by the client, and their two rejections are
the only motion feedback that exists so far.
