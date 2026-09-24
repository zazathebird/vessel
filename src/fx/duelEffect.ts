/**
 * The two duel effects — the full-bleed background half of the duel. The hero
 * ornament half is `DuelOrnament.tsx`.
 *
 * **Its own module so the engine can be a lazy chunk** (2026-09-24). Duels are
 * operator-only, enforced where they are drawn, so no visitor's canvas ever
 * runs one — and yet `effects.ts` imported `./duel` statically, which put
 * `duel.ts` and every costume in `fighters.ts` (~60 kB minified) into the entry
 * bundle every visitor downloads. `effects.ts` now reaches this file only
 * through `loadDuelEngine`'s dynamic `import()`, and only when a duel is the
 * effect actually being drawn. `npm run check` fails if the built entry chunk
 * contains engine code again.
 */

import { allowFor } from "../data/duelSettings";
import {
  BLADE_COLORS,
  FEET_Y as DUEL_FEET_Y,
  WORLD_H as DUEL_WORLD_H,
  WORLD_W as DUEL_WORLD_W,
  advanceDuel,
  createDuel,
  createDuelFrom,
  drawDuel,
} from "./duel";
import type { DuelPool } from "./duel";
import type { Effect } from "./effects";

// Duelling figures ------------------------------------------------------------

/**
 * The lightsword duels, rebuilt to `docs/DUEL.md` after the client rejected the
 * stick-figure version twice. The match engine and renderer live in
 * `src/fx/duel.ts` and are shared with the hero-ornament slot; this wrapper
 * only adapts the effect clock to 60Hz frames and lays the fight out as a
 * background — modest scale, no health bars, bodies dimmed so the blades carry
 * it behind body copy.
 *
 * **Listed again since 2026-08-14** (client's call), at the indices 12 and 13
 * they have held throughout (`0-0-C-…`, `0-0-D-…`). They spent a day in `FX`
 * flagged `hidden` rather than absent from it — the array is the share-code wire
 * format, and leaving a gap invited the next appended effect to take those two
 * slots. Re-listing was deleting the two flags, as promised.
 *
 * Composition note, from looking at it on the real site: the fighters land
 * centred with their feet at 80% height, which on Cinematic at a short viewport
 * puts them behind the hero's CTA row. They stay legible and so does the button
 * — `dim: 0.55` is doing its job — but it is the one thing about this effect
 * that reads as placement rather than design, and it is the first thing to look
 * at if the client wants it moved.
 *
 * The note that once stood here about the 404's "12 background modes" line was
 * wrong: no such string exists in `pages.ts` or anywhere else. It went with the
 * hero vitals strip. No copy correction is owed.
 */

function duelling(pool: DuelPool): Effect {
  return ({ ctx, w, h, p, dt, duel: v }, cache) => {
    let st = cache.duel;
    /*
     * The pairing is rolled from the pool rather than pinned, here and again on
     * every match reset inside `advanceDuel` — phase 2 of `docs/DUEL-ABSORB.md`.
     * The blade colours therefore have to be read off the fighters who actually
     * walked on, not off the ids this factory was built with.
     */
    /*
     * Pinned, or rolled from what the operator has left in the pool. Cached, so
     * this runs once per effect mount — and `FxCanvas` drops the cache when the
     * effect *id* changes, which a settings change is not. Rebuilding on every
     * settings change would restart the match under whoever is watching, and a
     * background fight that resets when a slider moves is worse than one that
     * takes until the next match to honour a new restriction.
     */
    if (!st) {
      st = cache.duel = v.pin
        ? createDuel(v.pin[0], v.pin[1])
        : createDuelFrom(pool, Math.random, allowFor(v, pool));
    }
    /*
     * **And the restriction is re-read every frame, which is the other half of
     * the sentence above** (2026-09-14). "Takes until the next match" was what
     * the comment claimed and not what the code did: `st.allow` was written
     * once, inside the `if (!st)` that runs on the mount, so a roster
     * restriction changed afterwards reached the background fight *never* — not
     * at the next match, not at the tenth — while `DuelOrnament`, whose effect
     * depends on `duel.good` / `duel.evil`, honoured it immediately. The
     * ornament and the full-bleed background then disagreed about the same
     * published setting on the same page, which is the documented "it ignores
     * my settings after a minute" shape one surface over.
     *
     * Assigned per frame rather than watched, exactly as `DuelOrnament` assigns
     * `st.tuning`: this is a rAF loop with no dependency list, and the
     * re-roll it feeds happens inside `advanceDuel` on a match boundary, which
     * is where `DuelState.allow` exists to be read. So the new restriction
     * lands on the next match and nothing restarts under the viewer.
     *
     * **The pin rides the same way, and it had the same bug** (2026-09-14,
     * second pass). It used to be expressed by picking a different constructor
     * on the mount — `createDuel`, which leaves `pool` null so the pair
     * survives every boundary — and that says "these two, for ever" exactly
     * once. Changing the pin, or lifting it, reached a running fight never.
     * `DuelState.pin` and `DuelState.pool` are both assigned here now, so the
     * operator's pairing control is read at the boundary like the restriction:
     * pin two fighters and the next match is those two; lift it and the next
     * match rolls from the pool again. Neither restarts the match in flight.
     *
     * `st.pool` has to be assigned too, and that is the half a pin-only fix
     * would miss: a fight built pinned has no pool, so lifting the pin would
     * leave the boundary with nothing to roll from and the pinned pair would
     * outlive the pin that named it.
     *
     * Guarded on the settings object's *identity* rather than recomputed, the
     * same trick `bokeh` uses against `partsBox`: `resolveDuel` is a `useMemo`,
     * so `v` is a new object only when the settings actually move, and
     * `allowFor` filters two arrays — which at 60Hz is the per-frame allocation
     * every other hot loop in this file goes out of its way to avoid.
     */
    st.pin = v.pin;
    st.pool = pool;
    /*
     * The pacing knobs ride on the fight's own state, exactly as `DuelOrnament`
     * assigns them (2026-09-24). They used to reach this fight through the
     * engine's module global, written by `FxCanvas` calling `applyDuelTuning` —
     * which was also the reason `FxCanvas` statically imported the engine and
     * put it in every visitor's entry bundle. Per frame, so a slider dragged on
     * `/admin` is live here with no dependency list, and a write to this
     * fight's object rather than to a global the other hosts share.
     */
    st.tuning = v.tuning;
    if (cache.duelAllowFor !== v) {
      cache.duelAllowFor = v;
      st.allow = allowFor(v, pool);
    }

    /*
     * The fight runs on real time, not on the boosted effect clock (client,
     * 2026-08-14: "they speed up at like x50 speed", "it lags hard randomly,
     * especially when on screensaver").
     *
     * It used to derive its frame count from `t`, which has `boost` folded in —
     * and `boost` carries both scroll velocity and the screensaver's +0.9. So
     * the duel ran at roughly double speed for the entire time the screensaver
     * was up, which is exactly when the client was watching it, and a hard
     * scroll could push it to the 4× clamp.
     *
     * That also produced the "random lag", which was never dropped frames.
     * `advanceDuel` steps in whole frames from a fractional accumulator, so at
     * a rate of ~1.9 the number of steps per rendered frame alternates 2,2,1,
     * 2,2,1 — motion that stutters on a fixed cadence. At a rate of ~1.0 it
     * steps once per frame and the judder has nowhere to come from.
     *
     * Every other effect is an ambient field and should surge when the page
     * does. A duel is a performance: it keeps its own tempo.
     */
    /*
     * `st.prev = t` stood here and nothing ever read it. Its declaration
     * claimed it was "kept for the background effect's delta" and the delta is
     * `dt`, handed in by `FxCanvas` — the field was left behind by the fix the
     * paragraph above describes, when the duel stopped deriving its own
     * timestep from the effect clock. Removed 2026-08-31 rather than left as a
     * second, stale copy of a number the fight no longer runs on.
     */
    advanceDuel(st, dt);

    /*
     * **Attract mode no longer changes how the fight is drawn** (client,
     * 2026-08-14: "make sure the screensaver battles are the same graphics as
     * the nonscreensaver ones pls").
     *
     * It used to grow the figures about 1.4× linear, drop the feet line, raise
     * body alpha from 0.55 to 1 and fade health bars in — all eased over 1.6s to
     * land with the chrome's fade. The reasoning was sound (the screensaver
     * vacates the copy the fight was being polite about) and the client does not
     * want it: the same scene, in both states.
     *
     * Kept at the *background* presentation rather than the screensaver one,
     * because that direction is the one with a hard constraint on it. Behind
     * body copy the figures have to stay quiet enough to read through, and
     * several palettes already fail AA on body text. Making both ends bright
     * would have traded a real legibility problem for a cosmetic gain.
     *
     * `sleeping` and the `approach` easing helper went with it. The frame
     * contract still carries `sleeping`; this was its only reader, and a future
     * attract idea starts by reading this note.
     */
    const scale = Math.min((w * 0.62) / DUEL_WORLD_W, (h * 0.55) / DUEL_WORLD_H);
    drawDuel(ctx, st, {
      x: (w - DUEL_WORLD_W * scale) / 2,
      y: h * 0.8 - DUEL_FEET_Y * scale,
      scale,
      ink: p.fg,
      // The carve's second tone — see `DuelView.paper`. Here the duel *is* the
      // page background, so `bg` is exactly what is behind every fighter.
      paper: p.bg,
      // The blades keep their alignment colours in every palette — the one
      // literal-colour carve-out on the site (see BLADE_COLORS in fx/duel.ts).
      bladeA: BLADE_COLORS[st.a.style],
      bladeB: BLADE_COLORS[st.b.style],
      core: p.fg,
      spark: p.a2,
      line: p.line,
      /*
       * Health bars stay off *here*, and on in the ornament (client, 2026-08-14:
       * "i love the idea of the health bar. genius. pls keep that", then "is
       * health bars a bad idea? ill leave it up to you actually… it is just a
       * random animation, not a focal point of the site").
       *
       * The split is by *slot*, not by taste. In `DuelOrnament` the fight is the
       * subject, contained in its own square, and a HUD frame around a subject
       * is exactly where a readout belongs. Here it is a full-bleed background
       * with body copy over it, and two bars pinned above two heads are a
       * readout the reader has to look past — the same objection that removed
       * the hero vitals strip. The client's own framing settles it: something
       * that is not a focal point should not be carrying instrumentation.
       *
       * So the feature is kept, in the one place it reads.
       */
      bars: false,
      // The carve's width is the operator's, here as in the ornament. `bars`
      // and `kick` are deliberately *not* — they are settled by the slot rather
      // than by taste, and the reasoning is the block comment above: this is a
      // full-bleed background with body copy over it, so a readout pinned above
      // two heads is something the reader has to look past, and a contact that
      // moves the page moves it under what they are reading.
      rim: v.rim,
      dim: 0.55,
    });
  };
}

/** The two duel effects, keyed as `drawFx` keys them. */
export const DUEL_EFFECTS: Record<DuelPool, Effect> = {
  duel: duelling("duel"),
  duelholy: duelling("duelholy"),
};
