import { useEffect, useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { PALETTES } from "../data/palettes";
import {
  BLADE_COLORS,
  FEET_Y,
  WORLD_W,
  advanceDuel,
  createDuel,
  drawDuel,
  duelFocus,
} from "../fx/duel";
import type { DuelState, FighterStyle } from "../fx/duel";

/**
 * The lightsword duel in the hero-ornament slot — the client's original
 * request (`docs/DUEL.md`), and the forgiving home: a square that layouts
 * already size and hide without knowing what is in it.
 *
 * Unlike the CSS ornaments this one is a canvas with its own loop, run the way
 * `FxCanvas` runs: fixed internal resolution stretched by CSS, palette and calm
 * read from a live ref each frame so a palette change recolours the running
 * fight, and the frame delta clamped so a stall cannot teleport a match.
 *
 * **Calm stops the simulation, not the rendering.** The ornaments' contract is
 * that they fall still in calm — so the fight freezes mid-frame but keeps being
 * drawn, which lets the palette bleed recolour the stilled scene instead of
 * leaving a stale canvas behind. The screensaver pauses the simulation the same
 * way: the chrome is faded to nothing, so advancing matches there would only
 * mean the fight a visitor was watching vanishes mid-swing when the site sleeps.
 *
 * Health bars are on — `docs/DUEL.md` calls them right for this slot and wrong
 * behind body copy. There is no winner text and no match counter: the fallen
 * fighter, the spark burst and the winner's raised blade are the announcement,
 * for the same reason the vitals strip was removed (show, don't caption).
 */

const PAIRINGS: Record<"duel" | "duelholy", [FighterStyle, FighterStyle]> = {
  duel: ["hooded", "caped"],
  duelholy: ["haloed", "horned"],
};

/*
 * The camera, and why the slot needed one.
 *
 * This used to draw at `scale = w / WORLD_W` — the **whole** 700-unit arena
 * mapped across the square. The fighters are 30 units wide and ~87 tall inside
 * that, and the slot is 340px on desk, 240 on tablet, **190 on a phone** and
 * 180 in Magazine. So a fighter rendered about 42px tall on desk and ~20px on a
 * phone, in a box that was overwhelmingly empty air. The arena is a 2.8:1 stage
 * and the slot is a 1:1 hole; something has to give, and at 190px what was
 * giving was the fight.
 *
 * A fixed crop cannot fix it — the pair genuinely use the full width (5th to
 * 95th percentile of their centres is 110 to 571 of 700), so any crop tight
 * enough to help would cut them off at the walls. So: track them.
 *
 * The zoom range is deliberately narrow. A true fit-to-content camera ranges
 * about 1.5× to 4.8× here, and a picture that rescales by three is a camera
 * being a character. Clamped to this range it mostly sits near the top of it,
 * pulls back when they separate, and pulls back again when one of them leaves
 * the ground — which is the one time the vertical fit binds rather than the
 * horizontal one.
 */
/** World units of clear air kept either side of the pair. */
const CAM_MARGIN = 32;
/** Where the feet line sits in the square, as a fraction of its height. */
const CAM_FEET = 0.82;
/**
 * **The floor is what decides whether you can see both fighters at all, and at
 * 1.45 you could not** (2026-08-16, client: the fight "seems a little off").
 *
 * `want` is clamped up to this, so a floor above the scale that fits the pair
 * does not zoom out politely — it crops. Stepped over 90,000 frames at the
 * three slot sizes the site actually uses, with the old 1.45 and a 46-unit
 * margin:
 *
 * | slot | both bodies in frame | both blades too |
 * |---|---|---|
 * | 190px (phone) | **31%** | **12%** |
 * | 240px | 57% | 46% |
 * | 340px (desk) | 96% | 86% |
 *
 * On a phone the camera wanted a scale of 0.73 to fit the pair and was held at
 * 1.45 on **100%** of frames — exactly twice too close — so two thirds of the
 * time one of the two fighters was outside the box. A duel with one fighter in
 * shot is not a duel; it is a figure swinging at nothing, with a blade arriving
 * from off-screen. That is the single most likely thing behind the report.
 *
 * At 0.7 it is 99% / 84% on the phone and ~85% at every size, so the framing
 * finally behaves the same on a phone as on a desk. The wider clamp does *not*
 * make the camera a character: within any one slot the measured 5th-to-95th
 * percentile swing is 1.9–2.1×, the same as before — 0.7 to 2.9 is the range
 * across *all* slot sizes, not the range any one viewer sees. Median figure
 * height lands at 57px in a 190px slot and 103px in a 340px one, which is what
 * this file's own docs always claimed it did.
 */
const CAM_MIN = 0.7;
const CAM_MAX = 2.9;
/** Per-60Hz-frame approach rates. Zoom is slower than pan, because a zoom that
 *  keeps up with a lunge reads as the picture breathing. */
const CAM_PAN = 0.075;
/**
 * Zoom is asymmetric, and the asymmetry is the whole reason the cap can sit as
 * high as it does.
 *
 * Pulling back is a correction — something has left the frame or is about to —
 * and it has to arrive before the thing does. Pushing in is a choice, and a
 * choice made quickly looks like a mistake. Symmetric at the slow rate, a
 * somersault out-ran the zoom and clipped a head on ~1 frame in 230; symmetric
 * at the fast rate, the picture surged in and out on every exchange.
 */
const CAM_ZOOM_IN = 0.03;
const CAM_ZOOM_OUT = 0.13;

/** Frame-rate independent approach: `k` per 60Hz frame over `frames` of them. */
function approach(from: number, to: number, k: number, frames: number): number {
  return from + (to - from) * (1 - Math.pow(1 - k, frames));
}

/** Where the camera is. Carried between frames by whoever is running the loop. */
export interface DuelCam {
  x: number;
  scale: number;
}

/**
 * Advance the camera one frame and place the world inside a `w × h` box.
 *
 * Pure, and exported rather than inlined into the render loop for one specific
 * reason: this environment cannot show animation — the tab reports
 * `document.hidden`, so `requestAnimationFrame` parks and timers throttle to
 * ~1Hz — so the only way to see what a camera does is to step it. Exported, a
 * bench can drive *this* function over thousands of frames at every slot size
 * the site uses. Re-implemented in the bench instead, the bench would only ever
 * confirm the bench.
 *
 * Pass `cam: null` on the first frame to snap rather than ease in.
 */
export function duelCamera(
  st: DuelState,
  w: number,
  h: number,
  cam: DuelCam | null,
  frames: number,
): { cam: DuelCam; x: number; y: number; scale: number } {
  const focus = duelFocus(st);
  const feet = h * CAM_FEET;
  // Fit the pair across, and whatever is highest down. The tighter wins, so a
  // somersault pulls back rather than leaving through the top of the slot.
  const want = Math.max(
    CAM_MIN,
    Math.min(CAM_MAX, Math.min(w / (focus.width + CAM_MARGIN * 2), feet / (FEET_Y - focus.top))),
  );
  const next: DuelCam = cam
    ? {
        x: approach(cam.x, focus.cx, CAM_PAN, frames),
        scale: approach(
          cam.scale,
          want,
          want < cam.scale ? CAM_ZOOM_OUT : CAM_ZOOM_IN,
          frames,
        ),
      }
    : { x: focus.cx, scale: want };

  /*
   * Keep the view on the stage. The ground line runs from 50 to WORLD_W−50 and
   * there is nothing beyond it, so a camera that panned past a wall would show
   * void on one side while the fight was pressed against the other. When the
   * view is wider than the arena the clamp would invert; that case centres.
   */
  const half = w / (2 * next.scale);
  const x = half * 2 >= WORLD_W ? WORLD_W / 2 : Math.max(half, Math.min(WORLD_W - half, next.x));

  return { cam: next, x: w / 2 - x * next.scale, y: feet - FEET_Y * next.scale, scale: next.scale };
}

export function DuelOrnament({ pairing }: { pairing: "duel" | "duelholy" }) {
  const { config, saver } = useConfig();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const live = useRef({ pal: config.pal, calm: config.calm, saver });
  useEffect(() => {
    live.current = { pal: config.pal, calm: config.calm, saver };
  });

  useEffect(() => {
    const st = createDuel(...PAIRINGS[pairing]);
    let raf = 0;
    let last = performance.now();
    // Null until the first drawn frame, which snaps rather than eases — a
    // camera easing in from a default on mount is an entrance the ornament
    // has not earned.
    let cam: DuelCam | null = null;
    /*
     * A new match teleports both fighters back to their marks, which is a jump
     * of a couple of hundred world units — eased, the camera whipped 43px in a
     * single frame and then coasted for most of a second. A match boundary is a
     * scene change, so it gets a cut: null the camera and let the next frame
     * snap, exactly as the first frame after mount does.
     */
    let seenMatches = st.matches;

    const step = () => {
      raf = requestAnimationFrame(step);

      const now = performance.now();
      // Elapsed 60Hz frames, clamped exactly as FxCanvas clamps its delta.
      const frames = Math.min(3, Math.max(0.2, (now - last) / (1000 / 60)));
      last = now;

      const canvas = canvasRef.current;
      if (!canvas || !canvas.isConnected || document.hidden) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { pal, calm, saver: sleeping } = live.current;
      if (!calm && !sleeping) advanceDuel(st, frames);

      const p = PALETTES[pal] ?? PALETTES[0];
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (st.matches !== seenMatches) {
        seenMatches = st.matches;
        cam = null;
      }
      const shot = duelCamera(st, w, h, cam, frames);
      cam = shot.cam;
      drawDuel(ctx, st, {
        x: shot.x,
        y: shot.y,
        scale: shot.scale,
        ink: p.fg,
        // Blades are the site's one literal-colour carve-out (see BLADE_COLORS):
        // good is blue/green, evil is red, whatever the palette says.
        bladeA: BLADE_COLORS[PAIRINGS[pairing][0]],
        bladeB: BLADE_COLORS[PAIRINGS[pairing][1]],
        core: p.fg,
        spark: p.a2,
        line: p.line,
        bars: true,
        dim: 1,
      });
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pairing]);

  return (
    <canvas
      ref={canvasRef}
      width={700}
      height={700}
      className="v-duelfight"
      aria-hidden="true"
    />
  );
}
