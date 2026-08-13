# The lightsword duel — specification and state

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
`Lightswords: saint & serpent` — ornament share-code indices 5 and 6). The
**background-effect home is still withdrawn from `FX`**: two background
versions were rejected, motion cannot be verified from this side, and
re-listing dates the 404's "12 background modes" copy. When the client's eye
passes the ornament, re-adding is an append at `FX` indices 12/13 — the
`EFFECTS` record already points at the new engine. `docs/DECISIONS.md`
2026-08-13 has the build note; the sections below remain the spec the rebuild
was built to.

## What the client asked for

An endless lightsword fight as a background effect — and, first and separately,
as a **tiny animation replacing the hero ornament** (the "pulsing wye/radar
looking thing", i.e. the Lens/Valve in `.v-ornament`). Both homes are acceptable;
the ornament one was the original request and is still unbuilt.

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
